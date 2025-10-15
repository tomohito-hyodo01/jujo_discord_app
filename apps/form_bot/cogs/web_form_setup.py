#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
外部Webフォーム設置Cog

テキストチャンネルでWebフォームリンクを設置
"""

import discord
from discord.ext import commands
from discord import app_commands
import os


class WebFormSetupCog(commands.Cog):
    """外部Webフォーム設置機能"""
    
    def __init__(self, bot: commands.Bot):
        self.bot = bot
    
    @app_commands.command(
        name='setup_web_form',
        description='大会申込ボタンを設置します（共通リンク）'
    )
    @app_commands.default_permissions(administrator=True)
    async def setup_web_form(self, interaction: discord.Interaction):
        """大会申込ボタンを設置（共通リンク・OAuth2方式）"""
        import os
        
        form_url = os.getenv('FORM_URL', 'http://localhost:3000')
        
        print(f'⚙️  /setup_web_form 実行: {interaction.user.name}')
        
        # 共通リンクのEmbed
        embed = discord.Embed(
            title='大会申込',
            description='下のボタンから大会に申し込めます',
            color=0x3b82f6
        )
        
        # リンクボタンを作成（共通リンク）
        view = discord.ui.View(timeout=None)
        view.add_item(discord.ui.Button(
            label='大会申込',
            style=discord.ButtonStyle.link,
            url=f'{form_url}?view=tournament'
        ))
        
        await interaction.response.send_message(
            '✅ 大会申込ボタンを設置しました',
            ephemeral=True
        )
        
        await interaction.channel.send(embed=embed, view=view)
        print(f'📌 大会申込ボタン設置: {interaction.channel.name}')


async def setup(bot: commands.Bot):
    """Cogをセットアップ"""
    await bot.add_cog(WebFormSetupCog(bot))

