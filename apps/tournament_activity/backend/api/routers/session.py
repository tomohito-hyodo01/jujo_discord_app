#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
セッション管理ルーター

Discord IDをSupabaseに保存
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import uuid
from datetime import datetime
from api.database import db

router = APIRouter()


class SessionCreate(BaseModel):
    discord_id: str
    username: str


@router.post("/session")
async def create_session(session: SessionCreate):
    """
    セッションを作成（Supabaseに保存）
    
    Returns:
        session_id: セッションID
    """
    session_id = str(uuid.uuid4())
    
    # MariaDBに保存
    try:
        result = await db.execute_query(
            'sessions',
            operation='insert',
            data={
                'session_id': session_id,
                'discord_id': session.discord_id,
                'username': session.username,
                'created_at': datetime.now().isoformat()
            }
        )

        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        print(f'セッション作成: {session_id} for {session.discord_id}')

        return {'session_id': session_id}
    except HTTPException:
        raise
    except Exception as e:
        print(f'セッション作成エラー: {e}')
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/session/{session_id}")
async def get_session(session_id: str):
    """
    セッション情報を取得
    
    Returns:
        discord_id, username
    """
    try:
        result = await db.execute_query(
            'sessions',
            operation='select',
            filters={'session_id': session_id}
        )

        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        data = result.get('data', [])
        if not data:
            print(f'セッション未発見: {session_id}')
            raise HTTPException(status_code=404, detail="Session not found")

        session_data = data[0]

        print(f'セッション取得成功: {session_id}')

        return {
            'discord_id': session_data['discord_id'],
            'username': session_data['username']
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f'セッション取得エラー: {e}')
        raise HTTPException(status_code=500, detail=str(e))

