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

    # チャンネルIDとward_idのマッピング
    # 必要に応じて追加・編集してください
    CHANNEL_WARD_MAPPING = {
        # 例: チャンネルIDをここに追加
        # 1427859106219430011: 1,  # 荒川区チャンネル → ward_id=1
        # 1427859106219430012: 2,  # 新宿区チャンネル → ward_id=2
    }

    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @app_commands.command(
        name='setup_web_form',
        description='大会申込ボタンを設置します'
    )
    @app_commands.default_permissions(administrator=True)
    async def setup_web_form(self, interaction: discord.Interaction):
        """大会申込ボタンを設置（ward_id付き）"""
        import os

        form_url = os.getenv('FORM_URL', 'http://localhost:3000')

        print(f'⚙️  /setup_web_form 実行: {interaction.user.name}')

        # チャンネルIDからward_idを取得
        channel_id = interaction.channel.id
        ward_id = self.CHANNEL_WARD_MAPPING.get(channel_id, 0)

        # URLパラメータを構築
        if ward_id > 0:
            url = f'{form_url}?view=tournament&ward={ward_id}'
            ward_info = f'（対象区: ward_id={ward_id}）'
        else:
            url = f'{form_url}?view=tournament'
            ward_info = '（全区対象）'

        # Embed
        embed = discord.Embed(
            title='大会申込',
            description='下のボタンから大会に申し込めます',
            color=0x3b82f6
        )

        # リンクボタンを作成
        view = discord.ui.View(timeout=None)
        view.add_item(discord.ui.Button(
            label='大会申込',
            style=discord.ButtonStyle.link,
            url=url
        ))

        await interaction.response.send_message(
            f'✅ 大会申込ボタンを設置しました {ward_info}',
            ephemeral=True
        )

        await interaction.channel.send(embed=embed, view=view)
        print(f'📌 大会申込ボタン設置: {interaction.channel.name} (ward_id={ward_id})')


async def setup(bot: commands.Bot):
    """Cogをセットアップ"""
    await bot.add_cog(WebFormSetupCog(bot))

