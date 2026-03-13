#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
大会登録フォーム設置Cog

大会申込担当者向けの大会登録フォームボタンを設置
"""

import discord
from discord.ext import commands
from discord import app_commands
import os


class TournamentFormSetupCog(commands.Cog):
    """大会登録フォーム設置機能"""

    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @app_commands.command(
        name='set_tournament_form',
        description='大会登録ボタンを設置します'
    )
    @app_commands.default_permissions(administrator=True)
    async def set_tournament_form(self, interaction: discord.Interaction):
        """大会登録ボタンを設置"""
        form_url = os.getenv('FORM_URL', 'http://localhost:3000')
        url = f'{form_url}#/tournament-register'

        print(f'⚙️  /set_tournament_form 実行: {interaction.user.name}')

        # Embed
        embed = discord.Embed(
            title='大会登録',
            description='下のボタンから新しい大会を登録できます',
            color=0x10b981
        )

        # リンクボタンを作成
        view = discord.ui.View(timeout=None)
        view.add_item(discord.ui.Button(
            label='大会を登録する',
            style=discord.ButtonStyle.link,
            url=url
        ))

        await interaction.response.send_message(
            '✅ 大会登録ボタンを設置しました',
            ephemeral=True
        )

        await interaction.channel.send(embed=embed, view=view)
        print(f'📌 大会登録ボタン設置: {interaction.channel.name}')


async def setup(bot: commands.Bot):
    """Cogをセットアップ"""
    await bot.add_cog(TournamentFormSetupCog(bot))
