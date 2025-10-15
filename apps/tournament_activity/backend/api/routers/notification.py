#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Discord通知ルーター

大会申込完了時にDiscord Webhookで通知を送信
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import httpx
import os

router = APIRouter()

# Discord Webhook URL（環境変数から取得）
DISCORD_WEBHOOK_URL = os.getenv('DISCORD_WEBHOOK_URL', '')


class RegistrationNotification(BaseModel):
    tournament_name: str
    type: str
    sex: int
    player1_name: str
    player2_name: str = None


@router.post("/notify/registration")
async def notify_registration(notification: RegistrationNotification):
    """
    大会申込完了をDiscord Webhookで通知
    
    Args:
        notification: 通知データ
    """
    if not DISCORD_WEBHOOK_URL:
        print('Webhook URLが設定されていません')
        return {'status': 'skipped', 'message': 'Webhook URL not configured'}
    
    try:
        # 性別ラベル
        sex_label = '男子' if notification.sex == 0 else '女子'
        
        # メッセージを作成
        if notification.player2_name:
            content = f"【大会申込完了】\n{notification.tournament_name}\n{notification.type}{sex_label}\n{notification.player1_name}・{notification.player2_name}"
        else:
            content = f"【大会申込完了】\n{notification.tournament_name}\n{notification.type}{sex_label}\n{notification.player1_name}"
        
        # Discord Webhookに送信
        async with httpx.AsyncClient() as client:
            response = await client.post(
                DISCORD_WEBHOOK_URL,
                json={'content': content},
                timeout=5.0
            )
            
            if response.status_code in [200, 204]:
                print(f'✅ Webhook通知送信成功: {notification.tournament_name}')
                return {'status': 'success', 'message': 'Notification sent'}
            else:
                print(f'❌ Webhook送信失敗: {response.status_code}')
                raise HTTPException(status_code=500, detail='Failed to send webhook')
    
    except Exception as e:
        print(f'❌ 通知送信エラー: {e}')
        raise HTTPException(status_code=500, detail=str(e))

