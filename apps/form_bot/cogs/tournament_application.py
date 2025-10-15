#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
大会申込機能Cog

/setup_application コマンドで申込ボタンを設置
"""

import discord
from discord.ext import commands
from discord import app_commands
import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from views.tournament_application_view import TournamentApplicationView


class TournamentApplicationCog(commands.Cog):
    """大会申込機能"""
    
    def __init__(self, bot: commands.Bot):
        self.bot = bot
    
    @app_commands.command(
        name='setup_application',
        description='大会申込ボタンを設置します'
    )
    @app_commands.default_permissions(administrator=True)
    async def setup_application(self, interaction: discord.Interaction):
        """大会申込ボタンを設置（管理者のみ）"""
        print(f'⚙️  /setup_application 実行: {interaction.user.name}')
        
        embed = discord.Embed(
            title='📋 大会申込',
            description='下のボタンをクリックして大会に申し込んでください',
            color=discord.Color.blue()
        )
        embed.add_field(
            name='📝 申込方法',
            value='1. 「大会に申し込む」ボタンをクリック\n'
                  '2. 大会を選択\n'
                  '3. 種別を選択\n'
                  '4. ペアを選択\n'
                  '5. 確認して申込',
            inline=False
        )
        embed.set_footer(text='何度でも申し込み可能です')
        
        view = TournamentApplicationView()
        
        await interaction.response.send_message(
            '✅ 申込ボタンを設置しました！',
            ephemeral=True
        )
        
        await interaction.channel.send(embed=embed, view=view)
        print(f'📌 申込ボタン設置完了: {interaction.channel.name}')


async def setup(bot: commands.Bot):
    """Cogをセットアップ"""
    await bot.add_cog(TournamentApplicationCog(bot))

