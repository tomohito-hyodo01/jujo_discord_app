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


async def _attach_player_names(logs: list) -> list:
    """ログにplayer_mst.player_nameを付与"""
    p_res = await db.execute_query('player_mst', operation='select')
    name_map: dict = {}
    for p in (p_res.get('data') or []):
        did = p.get('discord_id')
        if did:
            name_map[did] = p.get('player_name')
    for log in logs:
        did = log.get('discord_id')
        log['player_name'] = name_map.get(did) if did else None
    return logs


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
    logs = logs[:200]
    await _attach_player_names(logs)
    return logs


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
    await _attach_player_names(logs)
    return logs
