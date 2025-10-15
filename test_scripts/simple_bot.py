#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Discord Bot - メッセージ投稿テストアプリ

このBotは指定されたチャンネルにメッセージを投稿するシンプルなテストアプリです。
"""

import os
import discord
from discord.ext import commands
from dotenv import load_dotenv

# 環境変数を読み込む
load_dotenv()

# 環境変数から設定を取得
BOT_TOKEN = os.getenv('DISCORD_BOT_TOKEN')
CHANNEL_ID = int(os.getenv('DISCORD_CHANNEL_ID'))

# Botの設定
# 基本的なインテントのみを使用（特権インテント不要）
intents = discord.Intents.default()
# 必要に応じてDeveloper Portalで有効化してください
# intents.message_content = True  # コマンド機能を使う場合は有効化が必要

bot = commands.Bot(command_prefix='!', intents=intents)


@bot.event
async def on_ready():
    """Botが起動したときに実行される"""
    print(f'✅ Botがログインしました: {bot.user.name} (ID: {bot.user.id})')
    print(f'📡 接続中のサーバー数: {len(bot.guilds)}')
    print('-' * 50)
    
    # 指定されたチャンネルにメッセージを送信
    try:
        channel = bot.get_channel(CHANNEL_ID)
        if channel:
            print(f'📤 チャンネル「{channel.name}」にメッセージを送信中...')
            await channel.send('🤖 こんにちは！Botが正常に起動しました！')
            print('✅ メッセージの送信に成功しました！')
        else:
            print(f'❌ エラー: チャンネルID {CHANNEL_ID} が見つかりません')
            print('   チャンネルIDが正しいか、Botに適切な権限があるか確認してください')
    except Exception as e:
        print(f'❌ エラーが発生しました: {e}')
    
    print('-' * 50)
    print('ℹ️  Botは起動したままです。終了するには Ctrl+C を押してください')


@bot.command(name='test')
async def test_command(ctx):
    """!test コマンドでテストメッセージを送信"""
    await ctx.send('✅ テストメッセージです！コマンドが正常に動作しています。')


@bot.command(name='hello')
async def hello_command(ctx):
    """!hello コマンドで挨拶"""
    await ctx.send(f'👋 こんにちは、{ctx.author.mention}さん！')


@bot.command(name='info')
async def info_command(ctx):
    """!info コマンドでBot情報を表示"""
    embed = discord.Embed(
        title='🤖 Bot情報',
        description='このBotの情報です',
        color=discord.Color.blue()
    )
    embed.add_field(name='Bot名', value=bot.user.name, inline=True)
    embed.add_field(name='Bot ID', value=bot.user.id, inline=True)
    embed.add_field(name='サーバー数', value=len(bot.guilds), inline=True)
    embed.add_field(name='Ping', value=f'{round(bot.latency * 1000)}ms', inline=True)
    
    await ctx.send(embed=embed)


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
    
    print('🚀 Botを起動しています...')
    print(f'📝 対象チャンネルID: {CHANNEL_ID}')
    print('-' * 50)
    
    try:
        # Botを起動
        bot.run(BOT_TOKEN)
    except discord.LoginFailure:
        print('❌ エラー: ログインに失敗しました')
        print('   BOT_TOKENが正しいか確認してください')
    except Exception as e:
        print(f'❌ エラーが発生しました: {e}')


if __name__ == '__main__':
    main()

