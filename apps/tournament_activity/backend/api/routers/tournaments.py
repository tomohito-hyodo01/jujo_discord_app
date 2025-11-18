#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
大会ルーター

大会マスタの操作
"""

from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import List, Optional
from datetime import date
from api.database import db

router = APIRouter()


class TournamentRegisterRequest(BaseModel):
    """大会登録リクエスト"""
    tournament_id: str
    tournament_name: str
    registrated_ward: int
    deadline_date: str  # YYYY-MM-DD
    tournament_date: str  # YYYY-MM-DD
    classification: int  # 0=個人戦, 1=団体戦など
    mix_flg: bool
    type: List[str]  # ["一般", "45"]など


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
        # 既存の大会を確認
        existing = db.client.table('tournament_mst')\
            .select('tournament_id')\
            .eq('tournament_id', request.tournament_id)\
            .execute()

        tournament_data = request.model_dump()

        if existing.data:
            # 更新
            result = db.client.table('tournament_mst')\
                .update(tournament_data)\
                .eq('tournament_id', request.tournament_id)\
                .execute()
            message = "Tournament updated successfully"
        else:
            # 新規登録
            result = db.client.table('tournament_mst')\
                .insert(tournament_data)\
                .execute()
            message = "Tournament registered successfully"

        return {
            "success": True,
            "message": message,
            "tournament": result.data[0]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tournaments/parse-pdf")
async def parse_pdf(file: UploadFile = File(...)):
    """
    PDFから大会情報を抽出（Azure Document Intelligence使用）
    """
    try:
        from services.pdf_parser import PDFParserService

        # PDFファイルを読み込む
        pdf_content = await file.read()

        # PDF解析サービスを使用
        parser = PDFParserService()
        tournament_data = await parser.parse_tournament_pdf(pdf_content)

        return {
            "success": True,
            "data": tournament_data
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

