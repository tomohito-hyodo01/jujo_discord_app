#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
選手ルーター

選手マスタの操作
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from api.database import db

router = APIRouter()


class PlayerCreate(BaseModel):
    discord_id: Optional[str] = None  # 大会申込からの追加時はnull
    player_name: str
    jsta_number: Optional[str] = None
    post_number: str
    address: str
    phone_number: str
    birth_date: str
    sex: int


@router.get("/players")
async def get_players():
    """全選手を取得"""
    try:
        result = db.client.table('player_mst').select('*').execute()
        return result.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/players/{player_id}")
async def get_player(player_id: int):
    """選手IDで選手を取得"""
    try:
        result = db.client.table('player_mst')\
            .select('*')\
            .eq('player_id', player_id)\
            .execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Player not found")
        
        return result.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/players")
async def create_player(player: PlayerCreate):
    """新規選手を登録"""
    try:
        result = db.client.table('player_mst')\
            .insert(player.model_dump())\
            .execute()
        
        return result.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/players/discord/{discord_id}")
async def get_player_by_discord_id(discord_id: str):
    """Discord IDで選手を取得"""
    try:
        result = db.client.table('player_mst')\
            .select('*')\
            .eq('discord_id', discord_id)\
            .execute()
        
        if not result.data:
            return None
        
        return result.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

