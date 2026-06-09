#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
大会ルーター

大会マスタの操作
"""

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional
from datetime import date, datetime
from api.database import db
import json
import os
import re
import unicodedata

# PDF保存ディレクトリ
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'uploads', 'guidelines')
os.makedirs(UPLOAD_DIR, exist_ok=True)

router = APIRouter()


def to_romaji(text: str) -> str:
    """
    日本語をローマ字に変換（簡易版）
    完全な変換ではなく、大会名から適切な識別子を生成することを目的とする
    """
    # ひらがな・カタカナのローマ字変換テーブル（簡易版）
    romaji_map = {
        'あ': 'a', 'い': 'i', 'う': 'u', 'え': 'e', 'お': 'o',
        'か': 'ka', 'き': 'ki', 'く': 'ku', 'け': 'ke', 'こ': 'ko',
        'さ': 'sa', 'し': 'shi', 'す': 'su', 'せ': 'se', 'そ': 'so',
        'た': 'ta', 'ち': 'chi', 'つ': 'tsu', 'て': 'te', 'と': 'to',
        'な': 'na', 'に': 'ni', 'ぬ': 'nu', 'ね': 'ne', 'の': 'no',
        'は': 'ha', 'ひ': 'hi', 'ふ': 'fu', 'へ': 'he', 'ほ': 'ho',
        'ま': 'ma', 'み': 'mi', 'む': 'mu', 'め': 'me', 'も': 'mo',
        'や': 'ya', 'ゆ': 'yu', 'よ': 'yo',
        'ら': 'ra', 'り': 'ri', 'る': 'ru', 'れ': 're', 'ろ': 'ro',
        'わ': 'wa', 'を': 'wo', 'ん': 'n',
        'が': 'ga', 'ぎ': 'gi', 'ぐ': 'gu', 'げ': 'ge', 'ご': 'go',
        'ざ': 'za', 'じ': 'ji', 'ず': 'zu', 'ぜ': 'ze', 'ぞ': 'zo',
        'だ': 'da', 'ぢ': 'ji', 'づ': 'zu', 'で': 'de', 'ど': 'do',
        'ば': 'ba', 'び': 'bi', 'ぶ': 'bu', 'べ': 'be', 'ぼ': 'bo',
        'ぱ': 'pa', 'ぴ': 'pi', 'ぷ': 'pu', 'ぺ': 'pe', 'ぽ': 'po',
        # カタカナ
        'ア': 'a', 'イ': 'i', 'ウ': 'u', 'エ': 'e', 'オ': 'o',
        'カ': 'ka', 'キ': 'ki', 'ク': 'ku', 'ケ': 'ke', 'コ': 'ko',
        'サ': 'sa', 'シ': 'shi', 'ス': 'su', 'セ': 'se', 'ソ': 'so',
        'タ': 'ta', 'チ': 'chi', 'ツ': 'tsu', 'テ': 'te', 'ト': 'to',
        'ナ': 'na', 'ニ': 'ni', 'ヌ': 'nu', 'ネ': 'ne', 'ノ': 'no',
        'ハ': 'ha', 'ヒ': 'hi', 'フ': 'fu', 'ヘ': 'he', 'ホ': 'ho',
        'マ': 'ma', 'ミ': 'mi', 'ム': 'mu', 'メ': 'me', 'モ': 'mo',
        'ヤ': 'ya', 'ユ': 'yu', 'ヨ': 'yo',
        'ラ': 'ra', 'リ': 'ri', 'ル': 'ru', 'レ': 're', 'ロ': 'ro',
        'ワ': 'wa', 'ヲ': 'wo', 'ン': 'n',
        'ガ': 'ga', 'ギ': 'gi', 'グ': 'gu', 'ゲ': 'ge', 'ゴ': 'go',
        'ザ': 'za', 'ジ': 'ji', 'ズ': 'zu', 'ゼ': 'ze', 'ゾ': 'zo',
        'ダ': 'da', 'ヂ': 'ji', 'ヅ': 'zu', 'デ': 'de', 'ド': 'do',
        'バ': 'ba', 'ビ': 'bi', 'ブ': 'bu', 'ベ': 'be', 'ボ': 'bo',
        'パ': 'pa', 'ピ': 'pi', 'プ': 'pu', 'ペ': 'pe', 'ポ': 'po',
    }

    result = []
    for char in text:
        if char in romaji_map:
            result.append(romaji_map[char])
        elif char.isalnum() or char == '_':
            result.append(char.lower())

    return ''.join(result)


async def generate_tournament_id(tournament_name: str, tournament_date: str, registrated_ward: int) -> str:
    """
    大会IDを自動生成
    形式: 区＋年月＋大会名のローマ字＋連番
    例: edogawa_202511_haru_1

    Args:
        tournament_name: 大会名
        tournament_date: 大会日（YYYY-MM-DD）
        registrated_ward: 主催区ID

    Returns:
        生成された大会ID
    """
    # 区名マッピング
    ward_map = {
        1: 'chuo',
        5: 'bunkyo',
        13: 'koto',
        17: 'kita',
        18: 'arakawa',
        22: 'sumida',
        23: 'edogawa',
        99: 'wide',
        100: 'urayasu',
        101: 'nagareyama'
    }

    ward_name = ward_map.get(registrated_ward, 'other')

    # 年月を抽出（YYYY-MM-DD → YYYYMM）
    try:
        dt = datetime.strptime(tournament_date, '%Y-%m-%d')
        year_month = dt.strftime('%Y%m')
    except:
        year_month = '000000'

    # 大会名をローマ字に変換
    # 不要な文字（「大会」「オープン」など）を削除してから変換
    cleaned_name = tournament_name.replace('大会', '').replace('オープン', '').replace('テニス', '').strip()
    romaji_name = to_romaji(cleaned_name)

    # 既存の大会IDから連番を取得
    prefix = f"{ward_name}_{year_month}_{romaji_name}"

    try:
        # 同じプレフィックスで始まる大会IDを検索
        # MariaDBではLIKEクエリを直接実行
        existing = await db.execute_query(
            'tournament_mst',
            operation='select',
            columns='tournament_id'
        )

        # プレフィックスでフィルタリング
        filtered_data = [item for item in (existing.get('data') or []) if item['tournament_id'].startswith(f'{prefix}_')]

        # 連番を決定
        if filtered_data:
            # 既存のIDから最大の連番を取得
            max_seq = 0
            for item in filtered_data:
                tid = item['tournament_id']
                # 最後の_以降が数字ならそれを取得
                parts = tid.split('_')
                if parts and parts[-1].isdigit():
                    max_seq = max(max_seq, int(parts[-1]))
            seq = max_seq + 1
        else:
            seq = 1
    except:
        seq = 1

    return f"{prefix}_{seq}"


class TournamentRegisterRequest(BaseModel):
    """大会登録リクエスト"""
    tournament_id: Optional[str] = None  # 省略可能（自動生成される）
    tournament_name: str
    registrated_ward: int
    deadline_date: str  # YYYY-MM-DD
    tournament_date: str  # YYYY-MM-DD
    classification: int  # 0=個人戦, 1=団体戦など
    mix_flg: bool
    type: List[str]  # ["一般", "35", "45"]など
    venue: Optional[str] = None  # 会場
    reception_time: Optional[str] = None  # 受付時刻
    opening_time: Optional[str] = None  # 開会式時刻
    match_start_time: Optional[str] = None  # 試合開始時刻
    entry_fee: Optional[str] = None  # 参加費
    max_entries: Optional[int] = None  # 申込数上限(NULL=無制限)
    sex_restriction: Optional[int] = None  # 性別制限(NULL=共通,0=男子,1=女子)
    guideline_pdf_path: Optional[str] = None  # 要項PDFパス


@router.get("/tournaments")
async def get_tournaments():
    """全大会を取得（申込数付き）"""
    try:
        result = await db.execute_query('tournament_mst', operation='select', json_fields=['type'])
        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        tournaments = result.get('data', [])

        # 各大会の申込数を取得
        reg_result = await db.execute_query('tournament_registration', operation='select')
        reg_data = reg_result.get('data', [])

        # tournament_idごとの申込数をカウント
        count_map: dict = {}
        for r in reg_data:
            tid = r.get('tournament_id')
            if tid:
                count_map[tid] = count_map.get(tid, 0) + 1

        for t in tournaments:
            t['entry_count'] = count_map.get(t['tournament_id'], 0)
            # 要項ファイルの実在チェック
            t['has_guideline'] = _guideline_exists(t['tournament_id'])

        return tournaments
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _guideline_exists(tournament_id: str) -> bool:
    """要項ファイルが実際に存在するかチェック"""
    if not tournament_id:
        return False
    safe_id = re.sub(r'[^\w\-]', '_', tournament_id)
    for ext in ('.pdf', '.jpg', '.jpeg', '.png', '.xlsx', '.xls'):
        if os.path.exists(os.path.join(UPLOAD_DIR, f"{safe_id}{ext}")):
            return True
    return False


@router.get("/tournaments/{tournament_id}")
async def get_tournament(tournament_id: str):
    """大会IDで大会を取得"""
    try:
        result = await db.execute_query(
            'tournament_mst',
            operation='select',
            filters={'tournament_id': tournament_id},
            json_fields=['type']
        )

        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        data = result.get('data', [])
        if not data:
            raise HTTPException(status_code=404, detail="Tournament not found")

        return data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tournaments/register")
async def register_tournament(request: TournamentRegisterRequest):
    """大会を登録"""
    try:
        # 締切日と開催日のバリデーション
        try:
            deadline = datetime.strptime(request.deadline_date, '%Y-%m-%d').date()
            tournament = datetime.strptime(request.tournament_date, '%Y-%m-%d').date()
            if deadline >= tournament:
                raise HTTPException(status_code=400, detail="締切日は開催日より前の日付を指定してください")
        except ValueError:
            raise HTTPException(status_code=400, detail="日付の形式が不正です（YYYY-MM-DD）")

        # tournament_idが指定されていない場合は自動生成
        if not request.tournament_id:
            tournament_id = await generate_tournament_id(
                request.tournament_name,
                request.tournament_date,
                request.registrated_ward
            )
        else:
            tournament_id = request.tournament_id

        # 既存の大会を確認
        existing = await db.execute_query(
            'tournament_mst',
            operation='select',
            filters={'tournament_id': tournament_id},
            columns='tournament_id'
        )

        tournament_data = request.model_dump()
        tournament_data['tournament_id'] = tournament_id

        if existing.get('data'):
            # 更新
            result = await db.execute_query(
                'tournament_mst',
                operation='update',
                filters={'tournament_id': tournament_id},
                data=tournament_data
            )
            message = "大会情報を更新しました"
        else:
            # 新規登録
            result = await db.execute_query(
                'tournament_mst',
                operation='insert',
                data=tournament_data
            )
            message = "大会を登録しました"

        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        return {
            "success": True,
            "message": message,
            "tournament": result.get('data', [{}])[0]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tournaments/parse-pdf")
async def parse_pdf(
    file: UploadFile = File(...),
    model: str = "claude"  # "claude" or "gemini"
):
    """
    ファイルから大会情報を抽出（multipart/form-data版、PDF/画像/Excel対応）
    """
    try:
        from services.pdf_parser import PDFParserService
        content = await file.read()
        parser = PDFParserService(model=model)
        tournament_data = await parser.parse_tournament_pdf(content, filename=file.filename)
        return {"success": True, "data": tournament_data, "model_used": model}
    except ValueError as e:
        if str(e) == "INVALID_WARD":
            raise HTTPException(status_code=400, detail="登録可能な地域の大会要項を選択してください。")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class PdfBase64Request(BaseModel):
    file_base64: str
    model: str = "claude"
    filename: Optional[str] = None


@router.post("/tournaments/parse-pdf-base64")
async def parse_pdf_base64(request: PdfBase64Request):
    """
    ファイルから大会情報を抽出（Base64 JSON版 — X-Server WAF回避用、PDF/画像/Excel対応）
    """
    try:
        import base64
        from services.pdf_parser import PDFParserService
        content = base64.b64decode(request.file_base64)
        parser = PDFParserService(model=request.model)
        tournament_data = await parser.parse_tournament_pdf(content, filename=request.filename)
        return {"success": True, "data": tournament_data, "model_used": request.model}
    except ValueError as e:
        if str(e) == "INVALID_WARD":
            raise HTTPException(status_code=400, detail="登録可能な地域の大会要項を選択してください。")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class TournamentUpdate(BaseModel):
    """大会更新リクエスト"""
    tournament_name: Optional[str] = None
    registrated_ward: Optional[int] = None
    deadline_date: Optional[str] = None
    tournament_date: Optional[str] = None
    classification: Optional[int] = None
    mix_flg: Optional[bool] = None
    type: Optional[List[str]] = None
    venue: Optional[str] = None
    reception_time: Optional[str] = None
    opening_time: Optional[str] = None
    match_start_time: Optional[str] = None
    entry_fee: Optional[str] = None
    max_entries: Optional[int] = None
    sex_restriction: Optional[int] = None
    guideline_pdf_path: Optional[str] = None


@router.put("/tournaments/{tournament_id}")
async def update_tournament(tournament_id: str, request: TournamentUpdate):
    """大会情報を更新"""
    try:
        # 大会の存在確認
        existing = await db.execute_query(
            'tournament_mst',
            operation='select',
            filters={'tournament_id': tournament_id},
            json_fields=['type']
        )

        if existing.get('error'):
            raise HTTPException(status_code=500, detail=existing['error'])

        if not existing.get('data'):
            raise HTTPException(status_code=404, detail="大会が見つかりません")

        # None値を除外
        update_data = request.model_dump(exclude_none=True)

        if not update_data:
            return existing['data'][0]

        # 締切日と開催日のバリデーション
        new_deadline = update_data.get('deadline_date')
        new_tournament = update_data.get('tournament_date')
        existing_data = existing['data'][0]
        deadline_str = new_deadline or existing_data.get('deadline_date')
        tournament_str = new_tournament or existing_data.get('tournament_date')
        if deadline_str and tournament_str:
            try:
                d = datetime.strptime(str(deadline_str), '%Y-%m-%d').date()
                t = datetime.strptime(str(tournament_str), '%Y-%m-%d').date()
                if d >= t:
                    raise HTTPException(status_code=400, detail="締切日は開催日より前の日付を指定してください")
            except ValueError:
                raise HTTPException(status_code=400, detail="日付の形式が不正です（YYYY-MM-DD）")

        # typeフィールドはJSON文字列に変換
        if 'type' in update_data:
            update_data['type'] = json.dumps(update_data['type'])

        result = await db.execute_query(
            'tournament_mst',
            operation='update',
            filters={'tournament_id': tournament_id},
            data=update_data
        )

        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        # 更新後のデータを取得して返す
        updated = await db.execute_query(
            'tournament_mst',
            operation='select',
            filters={'tournament_id': tournament_id},
            json_fields=['type']
        )

        return updated.get('data', [{}])[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/tournaments/{tournament_id}")
async def delete_tournament(tournament_id: str):
    """大会を削除"""
    try:
        # 大会の存在確認
        existing = await db.execute_query(
            'tournament_mst',
            operation='select',
            filters={'tournament_id': tournament_id},
            columns='tournament_id'
        )

        if existing.get('error'):
            raise HTTPException(status_code=500, detail=existing['error'])

        if not existing.get('data'):
            raise HTTPException(status_code=404, detail="大会が見つかりません")

        # 削除
        result = await db.execute_query(
            'tournament_mst',
            operation='delete',
            filters={'tournament_id': tournament_id}
        )

        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        return {"success": True, "message": "大会を削除しました"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class GuidelineBase64Request(BaseModel):
    file_base64: str
    filename: Optional[str] = None


def _save_guideline(tournament_id: str, content: bytes, original_filename: Optional[str] = None) -> str:
    """要項ファイルを保存して相対パスを返す"""
    safe_id = re.sub(r'[^\w\-]', '_', tournament_id)
    ext = '.pdf'
    if original_filename:
        _, file_ext = os.path.splitext(original_filename.lower())
        if file_ext in ('.pdf', '.jpg', '.jpeg', '.png', '.xlsx', '.xls'):
            ext = file_ext
    filename = f"{safe_id}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    with open(filepath, 'wb') as f:
        f.write(content)
    return f"uploads/guidelines/{filename}"


@router.post("/tournaments/upload-guideline/{tournament_id}")
async def upload_guideline(tournament_id: str, file: UploadFile = File(...)):
    """大会要項をアップロード・保存（multipart版）"""
    try:
        content = await file.read()
        relative_path = _save_guideline(tournament_id, content, file.filename)
        await db.execute_query(
            'tournament_mst', operation='update',
            filters={'tournament_id': tournament_id},
            data={'guideline_pdf_path': relative_path}
        )
        return {"success": True, "path": relative_path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tournaments/upload-guideline-base64/{tournament_id}")
async def upload_guideline_base64(tournament_id: str, request: GuidelineBase64Request):
    """大会要項をアップロード・保存（Base64版 — WAF回避用）"""
    try:
        import base64
        content = base64.b64decode(request.file_base64)
        relative_path = _save_guideline(tournament_id, content, request.filename)
        await db.execute_query(
            'tournament_mst', operation='update',
            filters={'tournament_id': tournament_id},
            data={'guideline_pdf_path': relative_path}
        )
        return {"success": True, "path": relative_path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tournaments/guideline/{tournament_id}")
async def get_guideline(tournament_id: str):
    """大会要項ファイルを取得"""
    try:
        safe_id = re.sub(r'[^\w\-]', '_', tournament_id)
        # 拡張子を探す
        filepath = None
        for ext in ('.pdf', '.jpg', '.jpeg', '.png', '.xlsx', '.xls'):
            candidate = os.path.join(UPLOAD_DIR, f"{safe_id}{ext}")
            if os.path.exists(candidate):
                filepath = candidate
                break

        if not filepath:
            raise HTTPException(status_code=404, detail="要項ファイルが見つかりません")

        import mimetypes
        mime = mimetypes.guess_type(filepath)[0] or 'application/octet-stream'
        dl_filename = os.path.basename(filepath)
        # ブラウザでインライン表示できる形式はinline、それ以外はダウンロード
        inline_types = {'application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'}
        disposition = 'inline' if mime in inline_types else 'attachment'
        return FileResponse(
            filepath,
            media_type=mime,
            headers={'Content-Disposition': f'{disposition}; filename="{dl_filename}"'},
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/wards")
async def get_wards():
    """地域マスタを取得"""
    try:
        result = await db.execute_query('ward_mst', operation='select')
        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])
        return result.get('data', [])
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

