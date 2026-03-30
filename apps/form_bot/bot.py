#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Discord Form Bot - メインアプリケーション

複数のフォーム機能を提供するDiscord Botです。
スラッシュコマンドでモーダルを表示し、ユーザー入力を受け取ります。
"""

import os
import asyncio
import discord
from discord.ext import commands
from dotenv import load_dotenv
import sys

# モジュールのインポートパスを追加
sys.path.append(os.path.dirname(__file__))

# 環境変数を読み込む
load_dotenv()

# 環境変数から設定を取得
BOT_TOKEN = os.getenv('DISCORD_BOT_TOKEN')

# Botの設定
intents = discord.Intents.default()
intents.message_content = True
intents.guilds = True

bot = commands.Bot(command_prefix='!', intents=intents)


async def load_cogs():
    """Cogsを読み込む"""
    try:
        await bot.load_extension('cogs.web_form_setup')
        print('✅ web_form_setup Cogを読み込みました')
    except Exception as e:
        print(f'❌ web_form_setup Cog読み込みエラー: {e}')

    try:
        await bot.load_extension('cogs.tournament_form_setup')
        print('✅ tournament_form_setup Cogを読み込みました')
    except Exception as e:
        print(f'❌ tournament_form_setup Cog読み込みエラー: {e}')

    try:
        await bot.load_extension('cogs.excel_generation')
        print('✅ excel_generation Cogを読み込みました')
    except Exception as e:
        print(f'❌ excel_generation Cog読み込みエラー: {e}')


@bot.event
async def on_ready():
    """Botが起動したときに実行される"""
    print(f'✅ {bot.user.name} (ID: {bot.user.id}) が起動しました')
    print(f'📡 接続中のサーバー数: {len(bot.guilds)}')
    print('-' * 50)

    # データベース初期化（MariaDB）
    try:
        from services.database import db
        await db.initialize()
        print('✅ データベース接続を初期化しました')
    except Exception as e:
        print(f'❌ データベース初期化エラー: {e}')

    # Cogsを読み込む
    await load_cogs()
    
    # 永続的なViewの登録は不要（共通リンク方式）
    print('✅ 初期化完了')
    
    # 通知サーバーを起動（バックグラウンドで）
    import asyncio
    from api.notification_server import NotificationServer
    
    async def start_notification_server():
        notification_server = NotificationServer(bot, port=8001)
        await notification_server.run_in_background()
    
    asyncio.create_task(start_notification_server())
    
    # スラッシュコマンドを同期（テストサーバー専用）
    try:
        # 環境変数から対象ギルドIDを取得
        guild_id = os.getenv('DISCORD_GUILD_ID')
        
        if guild_id:
            # ギルド固有のコマンドとして同期（即座に反映）
            guild = discord.Object(id=int(guild_id))
            
            # 現在のグローバルコマンドをギルドにコピー
            bot.tree.copy_global_to(guild=guild)
            synced = await bot.tree.sync(guild=guild)
            print(f'✅ {len(synced)}個のギルドコマンドを同期しました（Guild ID: {guild_id}）')
            
            # その後、グローバルコマンドをクリア
            bot.tree.clear_commands(guild=None)
            await bot.tree.sync()
            print('✅ グローバルコマンドをクリアしました')
        else:
            # グローバルコマンドとして同期（最大1時間かかる）
            synced = await bot.tree.sync()
            print(f'✅ {len(synced)}個のグローバルコマンドを同期しました')
    except Exception as e:
        print(f'❌ コマンド同期エラー: {e}')
    
    print('-' * 50)
    print('🤖 Form Botが起動中です')
    print('💡 /setup_web_form コマンドで大会申込ボタンを設置できます')
    print('ℹ️  終了するには Ctrl+C を押してください')


@bot.event
async def on_interaction(interaction: discord.Interaction):
    """インタラクションのデバッグログ"""
    if interaction.type == discord.InteractionType.modal_submit:
        print(f'📝 モーダル送信: {interaction.user.name}')


def main():
    """メイン関数"""
    # トークンの確認
    if not BOT_TOKEN:
        print('❌ エラー: DISCORD_BOT_TOKEN が設定されていません')
        print('   .envファイルを確認してください')
        return
    
    print('🚀 Form Botを起動しています...')
    print('-' * 50)
    
    try:
        # Botを起動
        bot.run(BOT_TOKEN)
    except discord.LoginFailure:
        print('❌ エラー: ログインに失敗しました')
        print('   BOT_TOKENが正しいか確認してください')
    except KeyboardInterrupt:
        print('\n⏹️  Botを終了しています...')
    except Exception as e:
        print(f'❌ エラーが発生しました: {e}')


if __name__ == '__main__':
    main()

