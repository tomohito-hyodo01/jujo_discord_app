#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
大会ルーター

大会マスタの操作
"""

from fastapi import APIRouter, HTTPException
from api.database import db

router = APIRouter()


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

