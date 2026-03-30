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
from datetime import datetime, timedelta
import httpx
import os
import sys
from pathlib import Path

# servicesディレクトリをパスに追加
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from services.excel_service_factory import ExcelServiceFactory
from services.discord_file_service import DiscordFileService

router = APIRouter()

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

        # 2. 申込データを取得
        registration_result = await db.execute_query(
            'tournament_registration',
            operation='select',
            filters={'tournament_id': request.tournament_id},
            json_fields=['pair2']
        )

        if registration_result.get('error'):
            raise HTTPException(status_code=500, detail=registration_result['error'])

        registrations = registration_result.get('data', [])
        if not registrations:
            return ExcelGenerationResponse(
                success=False,
                tournament_id=request.tournament_id,
                tournament_name=tournament_name,
                error="No registrations found for this tournament"
            )

        # 3. 選手情報を取得して申込データに結合
        enriched_registrations = []

        for reg in registrations:
            # 1行目: discord_idと一致する選手（申込者本人）
            applicant_result = await db.execute_query(
                'player_mst',
                operation='select',
                filters={'discord_id': reg['discord_id']}
            )

            if applicant_result.get('error'):
                continue

            applicant_data = applicant_result.get('data', [])
            if not applicant_data:
                continue

            applicant_player = applicant_data[0]
            applicant = {
                'player_id': applicant_player.get('player_id'),
                'player_name': applicant_player.get('player_name'),
                'birth_date': applicant_player.get('birth_date'),
                'sex': applicant_player.get('sex'),
                'post_number': applicant_player.get('post_number'),
                'address': applicant_player.get('address'),
                'phone_number': applicant_player.get('phone_number'),
                'jsta_number': applicant_player.get('jsta_number'),
                'edogawa_flg': applicant_player.get('edogawa_flg', False),
                'affiliated_club': applicant_player.get('affiliated_club', ''),
            }

            # 2行目: pair1と一致する選手（ペア相手）
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
                        partner_player = partner_data[0]
                    partner = {
                        'player_id': partner_player.get('player_id'),
                        'player_name': partner_player.get('player_name'),
                        'birth_date': partner_player.get('birth_date'),
                        'sex': partner_player.get('sex'),
                        'post_number': partner_player.get('post_number'),
                        'address': partner_player.get('address'),
                        'phone_number': partner_player.get('phone_number'),
                        'jsta_number': partner_player.get('jsta_number'),
                        'edogawa_flg': partner_player.get('edogawa_flg', False),
                        'affiliated_club': partner_player.get('affiliated_club', ''),
                    }

            # 申込情報とapplicant/partnerを統合
            enriched_reg = {
                **reg,
                'applicant': applicant,
                'partner': partner
            }

            enriched_registrations.append(enriched_reg)

        if not enriched_registrations:
            return ExcelGenerationResponse(
                success=False,
                tournament_id=request.tournament_id,
                tournament_name=tournament_name,
                error="No valid player data found for registrations"
            )

        # 4. Excelファイルを生成
        excel_service = ExcelServiceFactory.create(ward_id)
        file_paths = excel_service.generate_tournament_files(tournament, enriched_registrations)

        if not file_paths:
            return ExcelGenerationResponse(
                success=False,
                tournament_id=request.tournament_id,
                tournament_name=tournament_name,
                error="Failed to generate Excel files"
            )

        # 5. Discordチャンネルにファイルを送信
        discord_service = DiscordFileService()
        file_urls = await discord_service.upload_tournament_files(
            ward_id=ward_id,
            tournament_name=tournament_name,
            file_paths=file_paths
        )

        # file_pathsからファイル名を抽出
        generated_files = {key: Path(path).name for key, path in file_paths.items()}

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

        # 各大会のExcelを生成
        for tournament in tournaments:
            tournament_id = tournament['tournament_id']
            tournament_name = tournament['tournament_name']
            ward_id = tournament.get('registrated_ward')

            try:
                # 申込データを取得
                registration_result = await db.execute_query(
                    'tournament_registration',
                    operation='select',
                    filters={'tournament_id': tournament_id},
                    json_fields=['pair2']
                )

                if registration_result.get('error') or not registration_result.get('data'):
                    results.append({
                        "tournament_id": tournament_id,
                        "tournament_name": tournament_name,
                        "status": "skipped",
                        "reason": "No registrations"
                    })
                    continue

                registrations = registration_result.get('data', [])

                # 選手情報を取得して申込データに結合
                enriched_registrations = []
                for reg in registrations:
                    # 1行目: discord_idと一致する選手（申込者本人）
                    applicant_result = await db.execute_query(
                        'player_mst',
                        operation='select',
                        filters={'discord_id': reg['discord_id']}
                    )

                    if applicant_result.get('error'):
                        continue

                    applicant_data = applicant_result.get('data', [])
                    if not applicant_data:
                        continue

                    applicant_player = applicant_data[0]

                    # applicantオブジェクトを作成
                    applicant = {
                        'player_id': applicant_player.get('player_id'),
                        'player_name': applicant_player.get('player_name'),
                        'birth_date': applicant_player.get('birth_date'),
                        'sex': applicant_player.get('sex'),
                        'post_number': applicant_player.get('post_number'),
                        'address': applicant_player.get('address'),
                        'phone_number': applicant_player.get('phone_number'),
                        'jsta_number': applicant_player.get('jsta_number'),
                        'edogawa_flg': applicant_player.get('edogawa_flg', False),
                        'affiliated_club': applicant_player.get('affiliated_club', ''),
                    }

                    # 2行目: pair1と一致する選手（ペア相手）
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
                                partner_player = partner_data[0]
                            partner = {
                                'player_id': partner_player.get('player_id'),
                                'player_name': partner_player.get('player_name'),
                                'birth_date': partner_player.get('birth_date'),
                                'sex': partner_player.get('sex'),
                                'post_number': partner_player.get('post_number'),
                                'address': partner_player.get('address'),
                                'phone_number': partner_player.get('phone_number'),
                                'jsta_number': partner_player.get('jsta_number'),
                                'edogawa_flg': partner_player.get('edogawa_flg', False),
                                'affiliated_club': partner_player.get('affiliated_club', ''),
                            }

                    enriched_reg = {
                        **reg,
                        'applicant': applicant,
                        'partner': partner
                    }

                    enriched_registrations.append(enriched_reg)

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

            except Exception as e:
                errors.append({
                    "tournament_id": tournament_id,
                    "tournament_name": tournament_name,
                    "error": str(e)
                })

        return {
            "processed_count": len(tournaments),
            "success_count": len([r for r in results if r.get("status") == "success"]),
            "results": results,
            "errors": errors,
            "deadline_date": tomorrow
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process deadlines: {str(e)}")
