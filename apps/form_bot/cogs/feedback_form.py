#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
フィードバックフォームCog

/feedback コマンドを提供します。
"""

import discord
from discord.ext import commands
from discord import app_commands
import sys
import os

# モジュールのインポートパスを追加
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from modals.feedback_modal import FeedbackModal


class FeedbackFormCog(commands.Cog):
    """フィードバックフォーム機能"""
    
    def __init__(self, bot: commands.Bot):
        self.bot = bot
    
    @app_commands.command(
        name='feedback',
        description='フィードバックを送信します'
    )
    async def feedback(self, interaction: discord.Interaction):
        """フィードバックフォームを表示"""
        modal = FeedbackModal()
        await interaction.response.send_modal(modal)


async def setup(bot: commands.Bot):
    """Cogをセットアップ"""
    await bot.add_cog(FeedbackFormCog(bot))

