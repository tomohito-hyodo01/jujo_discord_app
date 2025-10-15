#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
認証ルーター

Discord OAuth2トークン交換
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import httpx
import os

router = APIRouter()


class TokenRequest(BaseModel):
    code: str


@router.post("/token")
async def exchange_token(request: TokenRequest):
    """
    Discord OAuth2コードをアクセストークンに交換
    """
    client_id = os.getenv('DISCORD_CLIENT_ID')
    client_secret = os.getenv('DISCORD_CLIENT_SECRET')
    
    data = {
        'client_id': client_id,
        'client_secret': client_secret,
        'grant_type': 'authorization_code',
        'code': request.code,
    }
    
    headers = {
        'Content-Type': 'application/x-www-form-urlencoded'
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            'https://discord.com/api/oauth2/token',
            data=data,
            headers=headers
        )
        
        if response.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to exchange token")
        
        return response.json()

