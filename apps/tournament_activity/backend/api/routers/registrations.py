#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
申込ルーター

大会申込の操作
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from api.database import db

router = APIRouter()


class RegistrationCreate(BaseModel):
    discord_id: str
    tournament_id: str
    type: str
    sex: int
    pair1: int
    pair2: Optional[List[int]] = None


@router.post("/registrations")
async def create_registration(registration: RegistrationCreate):
    """新規申込を登録"""
    try:
        data = registration.model_dump()
        result = db.client.table('tournament_registration')\
            .insert(data)\
            .execute()
        
        return result.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/registrations/user/{discord_id}")
async def get_user_registrations(discord_id: str):
    """ユーザーの申込一覧を取得"""
    try:
        result = db.client.table('tournament_registration')\
            .select('*')\
            .eq('discord_id', discord_id)\
            .execute()
        
        return result.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

