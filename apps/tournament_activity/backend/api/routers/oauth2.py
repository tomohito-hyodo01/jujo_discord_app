#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Discord OAuth2認証ルーター
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import httpx
import os

router = APIRouter()


class OAuth2Callback(BaseModel):
    code: str


@router.post("/oauth2/callback")
async def oauth2_callback(callback: OAuth2Callback):
    """
    Discord OAuth2コールバック
    
    Args:
        callback: 認証コード
    
    Returns:
        user_id: Discord User ID
    """
    client_id = os.getenv('DISCORD_CLIENT_ID')
    client_secret = os.getenv('DISCORD_CLIENT_SECRET')
    redirect_uri = os.getenv('OAUTH_REDIRECT_URI', 'https://tournament-form-jujo.fly.dev/auth/callback')
    
    if not client_id or not client_secret:
        raise HTTPException(status_code=500, detail='OAuth2設定エラー')
    
    try:
        # トークン交換
        async with httpx.AsyncClient() as client:
            token_response = await client.post(
                'https://discord.com/api/oauth2/token',
                data={
                    'client_id': client_id,
                    'client_secret': client_secret,
                    'grant_type': 'authorization_code',
                    'code': callback.code,
                    'redirect_uri': redirect_uri,
                },
                headers={
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                timeout=10.0
            )
            
            if token_response.status_code != 200:
                print(f'トークン交換失敗: {token_response.status_code}')
                raise HTTPException(status_code=400, detail='トークン交換失敗')
            
            token_data = token_response.json()
            access_token = token_data['access_token']
            
            # ユーザー情報を取得
            user_response = await client.get(
                'https://discord.com/api/users/@me',
                headers={
                    'Authorization': f'Bearer {access_token}'
                },
                timeout=10.0
            )
            
            if user_response.status_code != 200:
                raise HTTPException(status_code=400, detail='ユーザー情報取得失敗')
            
            user_data = user_response.json()
            
            print(f'OAuth2認証成功: {user_data["id"]} ({user_data["username"]})')
            
            return {
                'user_id': user_data['id'],
                'username': user_data['username']
            }
    
    except HTTPException:
        raise
    except Exception as e:
        print(f'OAuth2エラー: {e}')
        raise HTTPException(status_code=500, detail=str(e))

