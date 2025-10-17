#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
通知用HTTPサーバー

バックエンドAPIからのリクエストを受け取り、Discordにメッセージを送信
"""

from aiohttp import web
import asyncio


class NotificationServer:
    """通知サーバー"""
    
    def __init__(self, bot, port=8001):
        self.bot = bot
        self.port = port
        self.app = web.Application()
        self.setup_routes()
    
    def setup_routes(self):
        """ルートを設定"""
        self.app.router.add_get('/', self.handle_health_check)
        self.app.router.add_post('/notify/registration', self.handle_registration_notification)
    
    async def handle_health_check(self, request):
        """ヘルスチェック"""
        return web.json_response({'status': 'healthy'})
    
    async def handle_registration_notification(self, request):
        """大会申込通知を処理"""
        try:
            print(f'📨 通知リクエスト受信')
            data = await request.json()
            print(f'   データ: {data}')
            
            channel_id = int(data.get('channel_id'))
            tournament_name = data.get('tournament_name')
            type_name = data.get('type')
            sex_label = data.get('sex_label')
            player1_name = data.get('player1_name')
            player2_name = data.get('player2_name', '')
            
            print(f'   チャンネルID: {channel_id}')
            
            # Discordチャンネルを取得
            channel = self.bot.get_channel(channel_id)
            
            if not channel:
                print(f'❌ チャンネルが見つかりません: {channel_id}')
                return web.json_response(
                    {'error': 'Channel not found'},
                    status=404
                )
            
            # メッセージを作成
            if player2_name:
                message = f"【大会申込完了】\n{tournament_name}\n{type_name}{sex_label}\n{player1_name}・{player2_name}"
            else:
                message = f"【大会申込完了】\n{tournament_name}\n{type_name}{sex_label}\n{player1_name}"
            
            print(f'   メッセージ: {message}')
            
            # チャンネルにメッセージを送信
            await channel.send(message)
            
            print(f'✅ 通知送信完了: {tournament_name}')
            
            return web.json_response({'status': 'success'})
        
        except Exception as e:
            print(f'❌ 通知送信エラー: {e}')
            return web.json_response(
                {'error': str(e)},
                status=500
            )
    
    async def start(self):
        """サーバーを起動"""
        runner = web.AppRunner(self.app)
        await runner.setup()
        site = web.TCPSite(runner, '0.0.0.0', self.port)
        await site.start()
        print(f'✅ 通知サーバー起動: http://0.0.0.0:{self.port}')
    
    async def run_in_background(self):
        """バックグラウンドでサーバーを起動"""
        await self.start()

