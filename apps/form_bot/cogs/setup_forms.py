#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
フォームセットアップCog

特定のチャンネルにフォームボタンを設置するコマンドを提供します。
"""

import discord
from discord.ext import commands
from discord import app_commands
import sys
import os

# モジュールのインポートパスを追加
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from views.form_buttons import FormButtonsView, create_form_menu_embed


class SetupFormsCog(commands.Cog):
    """フォームセットアップ機能"""
    
    def __init__(self, bot: commands.Bot):
        self.bot = bot
    
    @app_commands.command(
        name='setup_forms',
        description='このチャンネルにフォームボタンを設置します'
    )
    @app_commands.default_permissions(administrator=True)
    async def setup_forms(self, interaction: discord.Interaction):
        """
        フォームボタンを現在のチャンネルに設置
        
        管理者権限が必要です。
        """
        print(f'⚙️  /setup_forms コマンドが実行されました: {interaction.user.name}')
        
        # Embedとボタンを作成
        embed = create_form_menu_embed()
        view = FormButtonsView()
        
        # チャンネルにメッセージを送信
        await interaction.response.send_message(
            '✅ フォームボタンを設置しました！',
            ephemeral=True
        )
        
        # ボタン付きメッセージを送信
        await interaction.channel.send(embed=embed, view=view)
        print(f'📌 フォームボタンを設置しました: チャンネル {interaction.channel.name}')


async def setup(bot: commands.Bot):
    """Cogをセットアップ"""
    await bot.add_cog(SetupFormsCog(bot))

