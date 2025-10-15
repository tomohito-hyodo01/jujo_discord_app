#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
テストフォームCog

/test コマンドを提供します。
"""

import discord
from discord.ext import commands
from discord import app_commands
import sys
import os

# モジュールのインポートパスを追加
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from modals.test_modal import TestModal


class TestFormCog(commands.Cog):
    """テストフォーム機能"""
    
    def __init__(self, bot: commands.Bot):
        self.bot = bot
    
    @app_commands.command(
        name='test',
        description='テストフォームを表示します'
    )
    async def test(self, interaction: discord.Interaction):
        """テストフォームを表示"""
        print(f'📋 /test コマンドが実行されました: {interaction.user.name}')
        modal = TestModal()
        await interaction.response.send_modal(modal)


async def setup(bot: commands.Bot):
    """Cogをセットアップ"""
    await bot.add_cog(TestFormCog(bot))

