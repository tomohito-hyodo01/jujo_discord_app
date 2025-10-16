#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
古いコマンドをクリアするスクリプト
"""

import os
import discord
from discord.ext import commands
from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN = os.getenv('DISCORD_BOT_TOKEN')

intents = discord.Intents.default()
bot = commands.Bot(command_prefix='!', intents=intents)

@bot.event
async def on_ready():
    print(f'✅ {bot.user.name} でログインしました')
    print('古いコマンドをクリアしています...')
    
    # 全てのコマンドをクリア
    bot.tree.clear_commands(guild=None)
    await bot.tree.sync()
    
    print('✅ コマンドクリア完了')
    print('Botを終了します...')
    await bot.close()

if __name__ == '__main__':
    bot.run(BOT_TOKEN)

