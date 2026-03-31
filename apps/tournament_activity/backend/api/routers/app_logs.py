#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
アプリログルーター

アプリケーションログの記録・取得
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from api.database import db

router = APIRouter()


class LogEntry(BaseModel):
    level: str
    discord_id: Optional[str] = None
    username: Optional[str] = None
    event: str
    detail: Optional[str] = None


@router.post("/logs")
async def create_log(entry: LogEntry):
    """ログエントリを記録"""
    result = await db.execute_query(
        'app_logs',
        operation='insert',
        data={
            'level': entry.level,
            'discord_id': entry.discord_id,
            'username': entry.username,
            'event': entry.event,
            'detail': entry.detail,
        }
    )

    if result.get('error'):
        raise HTTPException(status_code=500, detail=result['error'])

    return {'success': True}


@router.get("/logs")
async def get_logs():
    """最新200件のログを取得（timestamp降順）"""
    result = await db.execute_query(
        'app_logs',
        operation='select',
    )

    if result.get('error'):
        raise HTTPException(status_code=500, detail=result['error'])

    logs = result.get('data') or []
    logs.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
    return logs[:200]


@router.get("/logs/search")
async def search_logs(discord_id: str):
    """discord_idでログを検索"""
    result = await db.execute_query(
        'app_logs',
        operation='select',
        filters={'discord_id': discord_id},
    )

    if result.get('error'):
        raise HTTPException(status_code=500, detail=result['error'])

    logs = result.get('data') or []
    logs.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
    return logs
