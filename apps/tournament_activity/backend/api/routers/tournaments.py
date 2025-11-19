#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
大会ルーター

大会マスタの操作
"""

from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import List, Optional
from datetime import date, datetime
from api.database import db
import re
import unicodedata

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


def generate_tournament_id(tournament_name: str, tournament_date: str, registrated_ward: int) -> str:
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
        13: 'koto',
        17: 'kita',
        18: 'arakawa',
        22: 'sumida',
        23: 'edogawa',
        99: 'wide'
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
        existing = db.client.table('tournament_mst')\
            .select('tournament_id')\
            .like('tournament_id', f'{prefix}_%')\
            .execute()

        # 連番を決定
        if existing.data:
            # 既存のIDから最大の連番を取得
            max_seq = 0
            for item in existing.data:
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


@router.get("/tournaments")
async def get_tournaments():
    """全大会を取得"""
    try:
        result = db.client.table('tournament_mst').select('*').execute()
        return result.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tournaments/{tournament_id}")
async def get_tournament(tournament_id: str):
    """大会IDで大会を取得"""
    try:
        result = db.client.table('tournament_mst')\
            .select('*')\
            .eq('tournament_id', tournament_id)\
            .execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Tournament not found")

        return result.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tournaments/register")
async def register_tournament(request: TournamentRegisterRequest):
    """大会を登録"""
    try:
        # tournament_idが指定されていない場合は自動生成
        if not request.tournament_id:
            tournament_id = generate_tournament_id(
                request.tournament_name,
                request.tournament_date,
                request.registrated_ward
            )
        else:
            tournament_id = request.tournament_id

        # 既存の大会を確認
        existing = db.client.table('tournament_mst')\
            .select('tournament_id')\
            .eq('tournament_id', tournament_id)\
            .execute()

        tournament_data = request.model_dump()
        tournament_data['tournament_id'] = tournament_id

        if existing.data:
            # 更新
            result = db.client.table('tournament_mst')\
                .update(tournament_data)\
                .eq('tournament_id', tournament_id)\
                .execute()
            message = "大会情報を更新しました"
        else:
            # 新規登録
            result = db.client.table('tournament_mst')\
                .insert(tournament_data)\
                .execute()
            message = "大会を登録しました"

        return {
            "success": True,
            "message": message,
            "tournament": result.data[0]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tournaments/parse-pdf")
async def parse_pdf(
    file: UploadFile = File(...),
    model: str = "claude"  # "claude" or "gemini"
):
    """
    PDFから大会情報を抽出（Claude または Gemini 使用）

    Args:
        file: PDFファイル
        model: 使用するモデル（"claude" または "gemini"）
    """
    try:
        from services.pdf_parser import PDFParserService

        # PDFファイルを読み込む
        pdf_content = await file.read()

        # PDF解析サービスを使用
        parser = PDFParserService(model=model)
        tournament_data = await parser.parse_tournament_pdf(pdf_content)

        return {
            "success": True,
            "data": tournament_data,
            "model_used": model
        }
    except ValueError as e:
        if str(e) == "INVALID_WARD":
            raise HTTPException(
                status_code=400,
                detail="登録可能な地域の大会要項を選択してください。"
            )
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

