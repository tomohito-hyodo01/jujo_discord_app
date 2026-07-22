#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Excel生成ルーター

大会申込Excelファイルの生成とGoogle Driveアップロード
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List, Dict
from api.database import db
from api.ward_webhooks import get_ward_webhook_url
from datetime import datetime, timedelta, date
import httpx
import os
import sys
from pathlib import Path

# servicesディレクトリをパスに追加
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from services.excel_service_factory import ExcelServiceFactory
from services.discord_file_service import DiscordFileService
from services.wards.sumida_text_service import SumidaTextService

router = APIRouter()

# テキスト申込書で運用する区（Excelではなくテキストを生成してDiscordへ送信）
SUMIDA_WARD_ID = 7


def _split_for_discord(content: str, limit: int = 1900) -> list:
    """Discordのメッセージ長制限(2000文字)に収まるよう行単位で分割"""
    if len(content) <= limit:
        return [content]

    chunks = []
    current = ""
    for line in content.split("\n"):
        if len(current) + len(line) + 1 > limit:
            if current:
                chunks.append(current.rstrip("\n"))
            current = ""
        current += line + "\n"
    if current.strip():
        chunks.append(current.rstrip("\n"))
    return chunks


async def _build_team_members(registration: dict) -> list:
    """
    団体戦の申込1件から出場メンバーの選手情報リストを構築

    メンバー = 申込者本人(discord_id) + pair1 + pair2。
    申込者は出場者(pair1/pair2)に含まれないため先頭に追加する。
    player_id で重複を除外し、申込者→pair1→pair2 の順を維持する。
    """
    members = []
    seen = set()

    # 申込者本人（discord_id）を先頭に追加
    if registration.get("discord_id"):
        result = await db.execute_query(
            "player_mst", operation="select", filters={"discord_id": registration["discord_id"]}
        )
        if not result.get("error") and result.get("data"):
            player = result["data"][0]
            members.append(player)
            seen.add(player.get("player_id"))

    # 出場者（pair1 + pair2）を追加
    member_ids = []
    if registration.get("pair1"):
        member_ids.append(registration["pair1"])
    member_ids.extend(registration.get("pair2") or [])

    for pid in member_ids:
        if not pid or pid in seen:
            continue
        result = await db.execute_query(
            "player_mst", operation="select", filters={"player_id": pid}
        )
        if not result.get("error") and result.get("data"):
            members.append(result["data"][0])
            seen.add(pid)

    return members


def _date_str(value) -> str:
    """DATE/DATETIME/文字列をISO日付文字列(YYYY-MM-DD)に正規化"""
    return str(value or '')[:10]


async def _get_tournament_group(tournament: dict) -> tuple:
    """同一大会グループ（同区・同名・同区分）の大会レコードと申込データを統合して取得

    同じ大会が種別ごとに別レコードで登録される運用（例: 一般と35/45で締切が別）でも、
    申込書は大会単位で1つに統合して生成する。年度違いの同名大会を誤って統合しないよう、
    締切日（なければ開催日）が90日を超えて離れたレコードは別大会とみなす。

    Returns:
        (siblings, registrations):
            siblings: グループに属する大会レコードのリスト（最低でも自身を含む）
            registrations: グループ全体の申込データリスト
                （各行に source_tournament_date = 属するレコードの開催日 を付与）
    """
    filters = {
        'registrated_ward': tournament.get('registrated_ward'),
        'tournament_name': tournament.get('tournament_name'),
    }
    # classification が未設定のレコードは "= NULL" で照合できないため条件から外す
    if tournament.get('classification') is not None:
        filters['classification'] = tournament['classification']

    siblings_result = await db.execute_query(
        'tournament_mst',
        operation='select',
        filters=filters,
        json_fields=['type']
    )
    if siblings_result.get('error'):
        # ここで縮退して自レコードのみで続行すると、統合されていない不完全な
        # 申込書が「成功」として配布されてしまうため、必ずエラーで停止する
        raise HTTPException(status_code=500, detail=siblings_result['error'])
    siblings = siblings_result.get('data') or [tournament]

    # 年度違いの同名大会を除外（基準日から90日を超えて離れたレコードは別大会）
    base = _date_str(tournament.get('deadline_date')) or _date_str(tournament.get('tournament_date'))
    if base:
        def _is_near(record):
            d = _date_str(record.get('deadline_date')) or _date_str(record.get('tournament_date'))
            if not d:
                return True
            try:
                return abs((date.fromisoformat(d) - date.fromisoformat(base)).days) <= 90
            except ValueError:
                return True
        siblings = [s for s in siblings if _is_near(s)] or [tournament]

    if len(siblings) > 1:
        print(f"ℹ️ 同一大会グループを統合: {tournament.get('tournament_name')} -> "
              f"{[s.get('tournament_id') for s in siblings]}")

    registrations = []
    seen = set()
    for sibling in siblings:
        reg_result = await db.execute_query(
            'tournament_registration',
            operation='select',
            filters={'tournament_id': sibling['tournament_id']},
            json_fields=['pair2']
        )
        if reg_result.get('error'):
            raise HTTPException(status_code=500, detail=reg_result['error'])
        for reg in (reg_result.get('data') or []):
            # 兄弟レコード間で同一内容の申込が重複していても申込書には1行だけ載せる
            key = (reg.get('discord_id'), reg.get('type'), reg.get('pair1'), str(reg.get('pair2')))
            if key in seen:
                continue
            seen.add(key)
            # 種別ごとに開催日が異なる場合の年齢計算等のため、属するレコードの開催日を保持
            registrations.append({**reg, 'source_tournament_date': sibling.get('tournament_date')})

    return siblings, registrations


def _player_fields(player: dict) -> dict:
    """player_mst の行から申込書生成に必要な項目を抽出"""
    return {
        'player_id': player.get('player_id'),
        'player_name': player.get('player_name'),
        'birth_date': player.get('birth_date'),
        'sex': player.get('sex'),
        'post_number': player.get('post_number'),
        'address': player.get('address'),
        'phone_number': player.get('phone_number'),
        'jsta_number': player.get('jsta_number'),
        'edogawa_flg': player.get('edogawa_flg', False),
        'affiliated_club': player.get('affiliated_club', ''),
    }


async def _enrich_registrations(registrations: list) -> list:
    """申込データに申込者(applicant)・ペア相手(partner)の選手情報を付与

    ペア相手が player_mst に見つからない場合は partner=None のまま進める
    （他の申込の選手情報を誤って流用しない）。
    """
    enriched = []
    for reg in registrations:
        applicant_result = await db.execute_query(
            'player_mst',
            operation='select',
            filters={'discord_id': reg['discord_id']}
        )
        if applicant_result.get('error') or not applicant_result.get('data'):
            continue
        applicant = _player_fields(applicant_result['data'][0])

        partner = None
        if reg.get('pair1'):
            partner_result = await db.execute_query(
                'player_mst',
                operation='select',
                filters={'player_id': reg['pair1']}
            )
            if not partner_result.get('error'):
                partner_data = partner_result.get('data', [])
                if partner_data:
                    partner = _player_fields(partner_data[0])

        enriched.append({**reg, 'applicant': applicant, 'partner': partner})

    return enriched


async def _generate_sumida_text(tournament: dict, registrations: list) -> "ExcelGenerationResponse":
    """墨田区: 申込書テキストを生成してDiscordチャンネルへ送信"""
    tournament_name = tournament.get("tournament_name")

    enriched = []
    for reg in registrations:
        members = await _build_team_members(reg)
        if members:
            enriched.append({**reg, "members": members})

    if not enriched:
        return ExcelGenerationResponse(
            success=False,
            tournament_id=tournament.get("tournament_id"),
            tournament_name=tournament_name,
            error="No valid player data found for registrations",
        )

    service = SumidaTextService()
    texts = service.build_texts(tournament, enriched)

    # 墨田区のWebhookへ送信（申込通知と同じチャンネル）。未設定時はデフォルトWebhookにフォールバック
    webhook_url = os.getenv("DISCORD_WEBHOOK_URL_SUMIDA") or os.getenv("DISCORD_WEBHOOK_URL")
    if not webhook_url:
        return ExcelGenerationResponse(
            success=False,
            tournament_id=tournament.get("tournament_id"),
            tournament_name=tournament_name,
            error="墨田区のDiscord Webhook（DISCORD_WEBHOOK_URL_SUMIDA）が設定されていません",
        )

    sent = 0
    async with httpx.AsyncClient() as client:
        for text in texts:
            for chunk in _split_for_discord(text):
                resp = await client.post(webhook_url, json={"content": chunk}, timeout=10.0)
                if resp.status_code in (200, 204):
                    sent += 1
                else:
                    raise HTTPException(
                        status_code=502,
                        detail=f"Discord Webhook error: {resp.status_code} - {resp.text}",
                    )

    if tournament.get("classification") == 1:
        summary = f"{len(texts)}チーム分の申込テキストをDiscordに送信しました（{sent}メッセージ）"
    else:
        summary = f"{len(enriched)}ペア分の申込テキストをDiscordに送信しました（{sent}メッセージ）"

    return ExcelGenerationResponse(
        success=True,
        tournament_id=tournament.get("tournament_id"),
        tournament_name=tournament_name,
        generated_files={"sumida_text": summary},
    )

# Discord Webhook URL（環境変数から取得）
DISCORD_WEBHOOK_URL = os.getenv('DISCORD_WEBHOOK_URL', '')


async def send_discord_notification(tournament_name: str, file_urls: Dict[str, str], registration_count: int):
    """
    Excel生成完了をDiscord Webhookで通知

    Args:
        tournament_name: 大会名
        file_urls: アップロードされたファイルのURL辞書
        registration_count: 申込件数
    """
    if not DISCORD_WEBHOOK_URL:
        print('Discord Webhook URLが設定されていません')
        return

    try:
        # メッセージを作成
        content = f"【大会申込Excel生成完了】\n"
        content += f"大会名: {tournament_name}\n"
        content += f"申込件数: {registration_count}件\n\n"

        if 'member_registration' in file_urls:
            content += f"会員登録表: {file_urls['member_registration']}\n"

        if 'individual_application' in file_urls:
            content += f"個人戦申込書: {file_urls['individual_application']}\n"

        # Discord Webhookに送信
        async with httpx.AsyncClient() as client:
            response = await client.post(
                DISCORD_WEBHOOK_URL,
                json={'content': content},
                timeout=5.0
            )

            if response.status_code in [200, 204]:
                print(f'✅ Discord通知送信成功: {tournament_name}')
            else:
                print(f'❌ Discord通知送信失敗: {response.status_code}')

    except Exception as e:
        print(f'❌ Discord通知送信エラー: {e}')
        # 通知失敗してもExcel生成自体は成功しているので例外を投げない


class ExcelGenerationRequest(BaseModel):
    tournament_id: str


class ExcelGenerationResponse(BaseModel):
    success: bool
    tournament_id: str
    tournament_name: str
    file_urls: Optional[Dict[str, str]] = None
    generated_files: Optional[Dict[str, str]] = None
    error: Optional[str] = None


async def _send_excel_to_ward_webhook(ward_id: int, tournament_name: str, file_paths: Dict[str, str]):
    """生成した申込書Excelを、主催区の管理者チャンネル（区別webhook）へ添付送信する。
    未設定の区はデフォルト(広域)webhookにフォールバック。戻り値は添付CDN URLの辞書（取得できれば）。"""
    import json as _json

    webhook_url = get_ward_webhook_url(ward_id)
    if not webhook_url:
        print(f"⚠️ 区別webhook未設定のためExcel送信スキップ (ward_id={ward_id})")
        return None

    # 添付ファイルを組み立て
    multipart = []
    keys = []
    for i, (key, path) in enumerate(file_paths.items()):
        p = Path(path)
        if not p.exists():
            continue
        with open(p, 'rb') as fh:
            multipart.append((
                f'files[{len(keys)}]',
                (p.name, fh.read(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
            ))
        keys.append(key)
    if not multipart:
        return None

    content = f"📄 **{tournament_name} の申込書を生成しました**"
    data = {'payload_json': _json.dumps({'content': content})}
    sep = '&' if '?' in webhook_url else '?'
    async with httpx.AsyncClient() as client:
        resp = await client.post(f"{webhook_url}{sep}wait=true", files=multipart, data=data, timeout=30.0)
        if resp.status_code not in (200, 204):
            raise Exception(f"webhook error {resp.status_code}: {resp.text[:200]}")
        # 添付のCDN URLを対応付け（取得できれば）
        urls = {}
        try:
            atts = resp.json().get('attachments', [])
            for k, att in zip(keys, atts):
                if att.get('url'):
                    urls[k] = att['url']
        except Exception:
            pass
        return urls or None


@router.post("/excel/generate", response_model=ExcelGenerationResponse)
async def generate_excel(request: ExcelGenerationRequest):
    """
    大会申込Excelファイルを生成してGoogle Driveにアップロード

    Args:
        request: ExcelGenerationRequest
            - tournament_id: 大会ID

    Returns:
        ExcelGenerationResponse:
            - success: 成功フラグ
            - tournament_id: 大会ID
            - tournament_name: 大会名
            - file_urls: アップロードされたファイルのURL辞書
            - error: エラーメッセージ（失敗時）
    """
    try:
        # 1. 大会情報を取得
        tournament_result = await db.execute_query(
            'tournament_mst',
            operation='select',
            filters={'tournament_id': request.tournament_id},
            json_fields=['type']
        )

        if tournament_result.get('error'):
            raise HTTPException(status_code=500, detail=tournament_result['error'])

        tournament_data = tournament_result.get('data', [])
        if not tournament_data:
            raise HTTPException(status_code=404, detail=f"Tournament not found: {request.tournament_id}")

        tournament = tournament_data[0]
        ward_id = tournament.get('registrated_ward')
        tournament_name = tournament.get('tournament_name')

        if not ward_id:
            raise HTTPException(status_code=400, detail="Tournament does not have registrated_ward")

        # 2. 申込データを取得（同一大会グループの全種別レコードを統合）
        _, registrations = await _get_tournament_group(tournament)

        if not registrations:
            return ExcelGenerationResponse(
                success=False,
                tournament_id=request.tournament_id,
                tournament_name=tournament_name,
                error="No registrations found for this tournament"
            )

        # 墨田区はExcelではなくテキスト申込書を生成してDiscordへ送信
        if ward_id == SUMIDA_WARD_ID:
            return await _generate_sumida_text(tournament, registrations)

        # 3. 選手情報を取得して申込データに結合
        enriched_registrations = await _enrich_registrations(registrations)

        if not enriched_registrations:
            return ExcelGenerationResponse(
                success=False,
                tournament_id=request.tournament_id,
                tournament_name=tournament_name,
                error="No valid player data found for registrations"
            )

        # 4. 同一大会の既存ファイルを削除（再生成時の自動クリーンアップ）
        try:
            if OUTPUT_DIR.exists() and tournament_name:
                for f in OUTPUT_DIR.glob("*.xlsx"):
                    if tournament_name in f.name:
                        try:
                            f.unlink()
                        except Exception as e:
                            print(f"⚠️ 旧ファイル削除失敗: {f.name} / {e}")
                # 旧仕様の固定名の会員登録表（大会名を含まないため上の対象外）も残さない
                legacy_member_file = OUTPUT_DIR / "会員登録表.xlsx"
                if legacy_member_file.exists():
                    legacy_member_file.unlink()
        except Exception as e:
            print(f"⚠️ 旧ファイルクリーンアップ失敗: {e}")

        # 5. Excelファイルを生成
        excel_service = ExcelServiceFactory.create(ward_id)
        file_paths = excel_service.generate_tournament_files(tournament, enriched_registrations)

        if not file_paths:
            return ExcelGenerationResponse(
                success=False,
                tournament_id=request.tournament_id,
                tournament_name=tournament_name,
                error="Failed to generate Excel files"
            )

        # file_pathsからファイル名を抽出
        generated_files = {key: Path(path).name for key, path in file_paths.items()}

        # 5. Discordの「各区の管理者チャンネル」にファイルを送信（ベストエフォート）。
        #    申込通知・締切通知と同じ区別webhookを流用して主催区のチャンネルへ送る。
        #    主目的は「その場で生成→ダウンロード」なので、送信失敗でも生成は成功扱いにし
        #    ダウンロードをブロックしない。
        file_urls = None
        try:
            file_urls = await _send_excel_to_ward_webhook(ward_id, tournament_name, file_paths)
        except Exception as e:
            print(f"⚠️ Discord送信失敗（Excel生成は成功・ダウンロード可能）: {e}")

        return ExcelGenerationResponse(
            success=True,
            tournament_id=request.tournament_id,
            tournament_name=tournament_name,
            file_urls=file_urls,
            generated_files=generated_files
        )

    except ValueError as e:
        # Ward not supported など
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


# outputディレクトリのパス
OUTPUT_DIR = Path(__file__).parent.parent.parent / "output"


@router.get("/excel/files/{tournament_id}")
async def list_excel_files(tournament_id: str):
    """
    大会の生成済みExcelファイル一覧を取得

    Args:
        tournament_id: 大会ID

    Returns:
        ファイル情報のリスト
    """
    try:
        if not OUTPUT_DIR.exists():
            return {"files": []}

        # 大会情報を取得して大会名を得る
        tournament_result = await db.execute_query(
            'tournament_mst',
            operation='select',
            filters={'tournament_id': tournament_id},
            json_fields=['type']
        )

        if tournament_result.get('error'):
            raise HTTPException(status_code=500, detail=tournament_result['error'])

        tournament_data = tournament_result.get('data', [])
        if not tournament_data:
            raise HTTPException(status_code=404, detail=f"Tournament not found: {tournament_id}")

        tournament_name = tournament_data[0].get('tournament_name', '')

        # outputディレクトリ内で大会名を含むxlsxファイルを検索
        files = []
        for f in OUTPUT_DIR.glob("*.xlsx"):
            if tournament_name and tournament_name in f.name:
                files.append({
                    "filename": f.name,
                    "path": str(f),
                })

        return {"files": files}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/excel/download/{filename}")
async def download_excel_file(filename: str):
    """
    生成済みExcelファイルをダウンロード

    Args:
        filename: ファイル名

    Returns:
        Excelファイル
    """
    file_path = OUTPUT_DIR / filename

    # パストラバーサル対策
    if not file_path.resolve().parent == OUTPUT_DIR.resolve():
        raise HTTPException(status_code=400, detail="Invalid filename")

    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {filename}")

    return FileResponse(
        path=str(file_path),
        filename=filename,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@router.delete("/excel/files/{filename}")
async def delete_excel_file(filename: str):
    """生成済みExcelファイルを削除"""
    file_path = OUTPUT_DIR / filename

    # パストラバーサル対策
    if not file_path.resolve().parent == OUTPUT_DIR.resolve():
        raise HTTPException(status_code=400, detail="Invalid filename")

    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {filename}")

    try:
        file_path.unlink()
        return {"success": True, "message": f"削除しました: {filename}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"削除失敗: {str(e)}")


@router.get("/excel/test/{tournament_id}")
async def test_tournament_data(tournament_id: str):
    """
    大会の申込データを確認（デバッグ用）

    Args:
        tournament_id: 大会ID

    Returns:
        大会情報と申込データ
    """
    try:
        # 大会情報
        tournament_result = await db.execute_query(
            'tournament_mst',
            operation='select',
            filters={'tournament_id': tournament_id},
            json_fields=['type']
        )

        if tournament_result.get('error'):
            raise HTTPException(status_code=500, detail=tournament_result['error'])

        tournament_data = tournament_result.get('data', [])
        if not tournament_data:
            raise HTTPException(status_code=404, detail="Tournament not found")

        tournament = tournament_data[0]

        # 申込データ
        registration_result = await db.execute_query(
            'tournament_registration',
            operation='select',
            filters={'tournament_id': tournament_id},
            json_fields=['pair2']
        )

        if registration_result.get('error'):
            raise HTTPException(status_code=500, detail=registration_result['error'])

        registrations = registration_result.get('data', [])

        # 選手情報を付与
        enriched_registrations = []
        for reg in registrations:
            player_result = await db.execute_query(
                'player_mst',
                operation='select',
                filters={'player_id': reg['pair1']}
            )

            if not player_result.get('error'):
                player_data = player_result.get('data', [])
                if player_data:
                    enriched_reg = {**reg, 'player1_info': player_data[0]}
                    enriched_registrations.append(enriched_reg)

        return {
            "tournament": tournament,
            "registrations_count": len(registrations),
            "registrations": enriched_registrations
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/excel/process-deadlines")
async def process_tournament_deadlines():
    """
    明日締切の大会のExcelファイルを自動生成（CRON用）

    Returns:
        処理結果の辞書
        {
            "processed_count": 処理した大会数,
            "results": [各大会の処理結果],
            "errors": [エラーが発生した大会]
        }
    """
    try:
        # 明日の日付を取得
        tomorrow = (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')

        # 明日締切の大会を検索
        tournaments_result = await db.execute_query(
            'tournament_mst',
            operation='select',
            filters={'deadline_date': tomorrow},
            json_fields=['type']
        )

        if tournaments_result.get('error'):
            raise HTTPException(status_code=500, detail=tournaments_result['error'])

        tournaments = tournaments_result.get('data', [])

        if not tournaments:
            return {
                "processed_count": 0,
                "results": [],
                "errors": [],
                "message": f"No tournaments with deadline on {tomorrow}"
            }

        results = []
        errors = []
        processed_groups = set()

        # 各大会のExcelを生成
        for tournament in tournaments:
            tournament_id = tournament['tournament_id']
            tournament_name = tournament['tournament_name']
            ward_id = tournament.get('registrated_ward')

            try:
                # 申込データを取得（同一大会グループの全種別レコードを統合）
                siblings, registrations = await _get_tournament_group(tournament)

                # 同一大会グループは1つの申込書に統合するため、
                # 同日締切のレコードが複数あっても生成は1回だけ行う
                group_key = frozenset(s.get('tournament_id') for s in siblings)
                if group_key in processed_groups:
                    results.append({
                        "tournament_id": tournament_id,
                        "tournament_name": tournament_name,
                        "status": "skipped",
                        "reason": "Same tournament group already processed"
                    })
                    continue

                # グループ内により遅い締切がある場合は、全種別の申込が揃うその締切時に生成する
                deadline = _date_str(tournament.get('deadline_date'))
                latest_deadline = max(_date_str(s.get('deadline_date')) for s in siblings)
                if deadline < latest_deadline:
                    results.append({
                        "tournament_id": tournament_id,
                        "tournament_name": tournament_name,
                        "status": "skipped",
                        "reason": f"Deferred to group's latest deadline ({latest_deadline})"
                    })
                    continue

                if not registrations:
                    results.append({
                        "tournament_id": tournament_id,
                        "tournament_name": tournament_name,
                        "status": "skipped",
                        "reason": "No registrations"
                    })
                    continue

                # 選手情報を取得して申込データに結合
                enriched_registrations = await _enrich_registrations(registrations)

                if not enriched_registrations:
                    results.append({
                        "tournament_id": tournament_id,
                        "tournament_name": tournament_name,
                        "status": "skipped",
                        "reason": "No valid player data"
                    })
                    continue

                # Excelファイルを生成
                excel_service = ExcelServiceFactory.create(ward_id)
                file_paths = excel_service.generate_tournament_files(tournament, enriched_registrations)

                # Discordチャンネルにファイルを送信
                discord_service = DiscordFileService()
                file_urls = await discord_service.upload_tournament_files(
                    ward_id=ward_id,
                    tournament_name=tournament_name,
                    file_paths=file_paths
                )

                results.append({
                    "tournament_id": tournament_id,
                    "tournament_name": tournament_name,
                    "status": "success",
                    "file_urls": file_urls
                })

                # 生成に成功してから処理済み扱いにする（失敗時は同日締切の兄弟レコードで再試行できる）
                processed_groups.add(group_key)

            except Exception as e:
                errors.append({
                    "tournament_id": tournament_id,
                    "tournament_name": tournament_name,
                    "error": str(e)
                })

        skipped = [r for r in results if r.get("status") == "skipped"]
        return {
            "processed_count": len(tournaments),
            "success_count": len([r for r in results if r.get("status") == "success"]),
            "skipped_count": len(skipped),
            "deferred_count": len([r for r in skipped if str(r.get("reason", "")).startswith("Deferred")]),
            "results": results,
            "errors": errors,
            "deadline_date": tomorrow
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process deadlines: {str(e)}")
