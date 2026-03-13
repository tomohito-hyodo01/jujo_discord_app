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
        result = await db.execute_query('player_mst', operation='select')
        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])
        return result.get('data', [])
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/players/{player_id}")
async def get_player(player_id: int):
    """選手IDで選手を取得"""
    try:
        result = await db.execute_query(
            'player_mst',
            operation='select',
            filters={'player_id': player_id}
        )

        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        data = result.get('data', [])
        if not data:
            raise HTTPException(status_code=404, detail="Player not found")

        return data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/players")
async def create_player(player: PlayerCreate):
    """新規選手を登録"""
    try:
        result = await db.execute_query(
            'player_mst',
            operation='insert',
            data=player.model_dump()
        )

        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        return result.get('data', [{}])[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/players/discord/{discord_id}")
async def get_player_by_discord_id(discord_id: str):
    """Discord IDで選手を取得"""
    try:
        result = await db.execute_query(
            'player_mst',
            operation='select',
            filters={'discord_id': discord_id}
        )

        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        data = result.get('data', [])
        if not data:
            return None

        return data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

