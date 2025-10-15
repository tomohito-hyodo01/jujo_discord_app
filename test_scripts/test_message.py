#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Discord Bot - 簡単なメッセージ送信テスト

このスクリプトは一度だけメッセージを送信して終了します。
"""

import os
import asyncio
import discord
from dotenv import load_dotenv

# 環境変数を読み込む
load_dotenv()

# 環境変数から設定を取得
BOT_TOKEN = os.getenv('DISCORD_BOT_TOKEN')
CHANNEL_ID = int(os.getenv('DISCORD_CHANNEL_ID'))


async def send_message():
    """メッセージを送信して終了"""
    # Botクライアントの作成
    intents = discord.Intents.default()
    client = discord.Client(intents=intents)
    
    @client.event
    async def on_ready():
        """Botが起動したときに実行される"""
        print(f'✅ Botがログインしました: {client.user.name} (ID: {client.user.id})')
        print(f'📡 接続中のサーバー数: {len(client.guilds)}')
        print('-' * 50)
        
        # 指定されたチャンネルにメッセージを送信
        try:
            channel = client.get_channel(CHANNEL_ID)
            if channel:
                print(f'📤 チャンネル「{channel.name}」にメッセージを送信中...')
                await channel.send('🤖 テストメッセージ: Botが正常に動作しています！')
                print('✅ メッセージの送信に成功しました！')
            else:
                print(f'❌ エラー: チャンネルID {CHANNEL_ID} が見つかりません')
                print('   チャンネルIDが正しいか、Botに適切な権限があるか確認してください')
        except discord.errors.Forbidden:
            print('❌ エラー: メッセージを送信する権限がありません')
            print('   Botに「メッセージを送信」権限があるか確認してください')
        except Exception as e:
            print(f'❌ エラーが発生しました: {e}')
        finally:
            print('-' * 50)
            print('✅ テスト完了！Botを終了します...')
            await client.close()
    
    # Botを起動
    try:
        await client.start(BOT_TOKEN)
    except discord.LoginFailure:
        print('❌ エラー: ログインに失敗しました')
        print('   BOT_TOKENが正しいか確認してください')
    except Exception as e:
        print(f'❌ エラーが発生しました: {e}')


def main():
    """メイン関数"""
    # トークンの確認
    if not BOT_TOKEN:
        print('❌ エラー: DISCORD_BOT_TOKEN が設定されていません')
        print('   .envファイルを確認してください')
        return
    
    if not CHANNEL_ID:
        print('❌ エラー: DISCORD_CHANNEL_ID が設定されていません')
        print('   .envファイルを確認してください')
        return
    
    print('🚀 メッセージ送信テストを開始します...')
    print(f'📝 対象チャンネルID: {CHANNEL_ID}')
    print('-' * 50)
    
    # 非同期実行
    asyncio.run(send_message())


if __name__ == '__main__':
    main()


