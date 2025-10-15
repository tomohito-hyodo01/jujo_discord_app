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
    
    # Supabaseに保存
    try:
        # セッション用テーブルがない場合は作成（初回のみ）
        result = db.client.table('sessions').insert({
            'session_id': session_id,
            'discord_id': session.discord_id,
            'username': session.username,
            'created_at': datetime.now().isoformat()
        }).execute()
        
        print(f'セッション作成: {session_id} for {session.discord_id}')
        
        return {'session_id': session_id}
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
        result = db.client.table('sessions')\
            .select('*')\
            .eq('session_id', session_id)\
            .execute()
        
        if not result.data or len(result.data) == 0:
            print(f'セッション未発見: {session_id}')
            raise HTTPException(status_code=404, detail="Session not found")
        
        session_data = result.data[0]
        
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

