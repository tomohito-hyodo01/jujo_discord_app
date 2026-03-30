#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
申込書作成Cog

Discordボタンから大会を選択してExcel申込書を手動生成
"""

import discord
from discord.ext import commands
from discord import app_commands
import aiohttp
import os


API_URL = os.getenv('API_URL', 'http://localhost:8000')

# デモ用: 表示する大会IDのリスト
DEMO_TOURNAMENT_IDS = [
    'edogawa_202605_令和8年度江戸川区春季_1',
]


class TournamentSelect(discord.ui.Select):
    """大会選択プルダウン"""

    def __init__(self, tournaments: list):
        options = []
        for t in tournaments[:25]:  # Discord上限25件
            # 日付と種別を表示
            date_str = t.get('tournament_date', '')[:10] if t.get('tournament_date') else ''
            types = t.get('type', [])
            type_str = '・'.join(types) if isinstance(types, list) else str(types)
            description = f"{date_str} {type_str}"[:100]

            options.append(discord.SelectOption(
                label=t['tournament_name'][:100],
                value=t['tournament_id'],
                description=description
            ))

        super().__init__(
            placeholder='大会を選択してください',
            options=options,
            min_values=1,
            max_values=1
        )

    async def callback(self, interaction: discord.Interaction):
        tournament_id = self.values[0]
        await interaction.response.defer(thinking=True)

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{API_URL}/api/excel/generate",
                    json={"tournament_id": tournament_id},
                    timeout=aiohttp.ClientTimeout(total=120)
                ) as resp:
                    result = await resp.json()

                    if resp.status == 200 and result.get('success'):
                        tournament_name = result.get('tournament_name', '')
                        file_urls = result.get('file_urls', {})

                        msg = f"**申込書を作成しました**\n"
                        msg += f"大会名: {tournament_name}\n\n"

                        if file_urls.get('member_registration'):
                            msg += f"会員登録表: {file_urls['member_registration']}\n"
                        if file_urls.get('individual_application'):
                            msg += f"個人戦申込書: {file_urls['individual_application']}\n"

                        await interaction.followup.send(msg)
                    else:
                        error = result.get('detail') or result.get('error') or '不明なエラー'
                        await interaction.followup.send(f"申込書の作成に失敗しました: {error}")

        except Exception as e:
            await interaction.followup.send(f"エラーが発生しました: {str(e)}")


class TournamentSelectView(discord.ui.View):
    """大会選択ビュー"""

    def __init__(self, tournaments: list):
        super().__init__(timeout=120)
        self.add_item(TournamentSelect(tournaments))


class ExcelGenerationButton(discord.ui.View):
    """申込書作成ボタン（永続）"""

    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(
        label='申込書を作成',
        style=discord.ButtonStyle.green,
        custom_id='excel_generation_button',
        emoji='📊'
    )
    async def generate_button(self, interaction: discord.Interaction, button: discord.ui.Button):
        """ボタン押下時: 大会一覧を取得してプルダウン表示"""
        await interaction.response.defer(ephemeral=True)

        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{API_URL}/api/tournaments",
                    timeout=aiohttp.ClientTimeout(total=30)
                ) as resp:
                    if resp.status != 200:
                        await interaction.followup.send("大会一覧の取得に失敗しました", ephemeral=True)
                        return

                    tournaments = await resp.json()

            # デモ用: 指定した大会のみ表示
            tournaments = [t for t in tournaments if t['tournament_id'] in DEMO_TOURNAMENT_IDS]

            if not tournaments:
                await interaction.followup.send("登録されている大会がありません", ephemeral=True)
                return

            view = TournamentSelectView(tournaments)
            await interaction.followup.send(
                "申込書を作成する大会を選択してください:",
                view=view,
                ephemeral=True
            )

        except Exception as e:
            await interaction.followup.send(f"エラーが発生しました: {str(e)}", ephemeral=True)


class ExcelGenerationCog(commands.Cog):
    """申込書作成機能"""

    def __init__(self, bot: commands.Bot):
        self.bot = bot
        # 永続ビューを登録
        self.bot.add_view(ExcelGenerationButton())

    @app_commands.command(
        name='set_excel_button',
        description='申込書作成ボタンを設置します'
    )
    @app_commands.default_permissions(administrator=True)
    async def set_excel_button(self, interaction: discord.Interaction):
        """申込書作成ボタンを設置"""
        print(f'⚙️  /set_excel_button 実行: {interaction.user.name}')

        embed = discord.Embed(
            title='申込書作成',
            description='下のボタンから大会を選択して申込書（Excel）を作成できます',
            color=0x10b981
        )

        view = ExcelGenerationButton()

        await interaction.response.send_message(
            '✅ 申込書作成ボタンを設置しました',
            ephemeral=True
        )

        await interaction.channel.send(embed=embed, view=view)
        print(f'📌 申込書作成ボタン設置: {interaction.channel.name}')


async def setup(bot: commands.Bot):
    """Cogをセットアップ"""
    await bot.add_cog(ExcelGenerationCog(bot))
