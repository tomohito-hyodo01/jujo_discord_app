#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Discord Bot - メッセージ自動返信Bot

メッセージに反応して自動返信するBotです。
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

# Botの設定（メッセージ内容を読み取るためにmessage_contentを有効化）
intents = discord.Intents.default()
intents.message_content = True  # メッセージ内容を読み取る
intents.guilds = True
intents.messages = True

bot = commands.Bot(command_prefix='!', intents=intents)


@bot.event
async def on_ready():
    """Botが起動したときに実行される"""
    print(f'✅ Botがログインしました: {bot.user.name} (ID: {bot.user.id})')
    print(f'📡 接続中のサーバー数: {len(bot.guilds)}')
    print('-' * 50)
    
    # 起動メッセージを送信
    try:
        channel = bot.get_channel(CHANNEL_ID)
        if channel:
            print(f'📤 チャンネル「{channel.name}」にメッセージを送信中...')
            await channel.send('🤖 自動返信Botが起動しました！\n\n使い方：\n• Botをメンション（@testbot）すると返信します\n• 「こんにちは」「おはよう」などに反応します\n• DMでメッセージを送ると返信します\n• `!help` でコマンド一覧を表示')
            print('✅ メッセージの送信に成功しました！')
    except Exception as e:
        print(f'❌ エラーが発生しました: {e}')
    
    print('-' * 50)
    print('ℹ️  Botは起動したままです。終了するには Ctrl+C を押してください')
    print('📨 メッセージの受信を待っています...')


@bot.event
async def on_message(message):
    """メッセージが送信されたときに実行される"""
    
    # Bot自身のメッセージには反応しない
    if message.author == bot.user:
        return
    
    # メッセージのログを表示
    print(f'📩 受信: [{message.author.name}] {message.content[:50]}...')
    
    # DMへの返信
    if isinstance(message.channel, discord.DMChannel):
        print(f'💬 DM受信: {message.author.name}から')
        await message.channel.send(f'こんにちは、{message.author.name}さん！\nDMありがとうございます。何かお手伝いできることはありますか？ 😊')
        return
    
    # Botへのメンションに反応
    if bot.user.mentioned_in(message):
        print(f'📣 メンション検知: {message.author.name}から')
        await message.reply(f'呼びましたか、{message.author.mention}さん？\n何かお手伝いできることがあればお知らせください！ 🤖')
        return
    
    # キーワード反応（小文字に変換して判定）
    content_lower = message.content.lower()
    
    # 挨拶に反応
    if 'こんにちは' in content_lower or 'こんにちわ' in content_lower:
        print(f'👋 挨拶検知: こんにちは')
        await message.reply('こんにちは！ 😊')
    
    elif 'おはよう' in content_lower or 'おはよ' in content_lower:
        print(f'🌅 挨拶検知: おはよう')
        await message.reply('おはようございます！ 🌞')
    
    elif 'こんばんは' in content_lower or 'こんばんわ' in content_lower:
        print(f'🌙 挨拶検知: こんばんは')
        await message.reply('こんばんは！ 🌙')
    
    elif 'おやすみ' in content_lower:
        print(f'😴 挨拶検知: おやすみ')
        await message.reply('おやすみなさい！良い夢を 😴')
    
    # 感謝に反応
    elif 'ありがとう' in content_lower or 'あざす' in content_lower or 'サンキュー' in content_lower:
        print(f'🙏 感謝検知')
        await message.reply('どういたしまして！ 😊')
    
    # 質問に反応
    elif '元気' in content_lower and '?' in message.content or '？' in message.content:
        print(f'💪 質問検知: 元気')
        await message.reply('元気です！ありがとうございます！ 💪')
    
    elif 'help' in content_lower or 'ヘルプ' in content_lower:
        print(f'❓ ヘルプ検知')
        await message.reply('コマンド一覧は `!help` を入力してください！')
    
    # Bot名が含まれている場合
    elif 'testbot' in content_lower or 'bot' in content_lower:
        print(f'🤖 Bot名検知')
        await message.reply('はい、何でしょうか？ 🤖')
    
    # コマンド処理も実行
    await bot.process_commands(message)


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


@bot.command(name='echo')
async def echo_command(ctx, *, text: str):
    """!echo [テキスト] - 入力されたテキストをそのまま返す"""
    await ctx.send(f'🔊 {text}')


@bot.command(name='おみくじ')
async def omikuji_command(ctx):
    """!おみくじ - おみくじを引く"""
    import random
    results = ['大吉 🎉', '中吉 😊', '小吉 🙂', '吉 😐', '末吉 😅', '凶 😢', '大凶 😱']
    result = random.choice(results)
    await ctx.send(f'{ctx.author.mention}さんの運勢は... **{result}**')


@bot.command(name='ping')
async def ping_command(ctx):
    """!ping - Botの応答速度を確認"""
    latency = round(bot.latency * 1000)
    await ctx.send(f'🏓 Pong! レイテンシ: {latency}ms')


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
    
    print('🚀 自動返信Botを起動しています...')
    print(f'📝 対象チャンネルID: {CHANNEL_ID}')
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


