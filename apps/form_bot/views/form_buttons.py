#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
フォームボタンView

各フォームを起動するためのボタンを提供します。
"""

import discord
import sys
import os

# モジュールのインポートパスを追加
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from modals.test_modal import TestModal
from modals.feedback_modal import FeedbackModal


class FormButtonsView(discord.ui.View):
    """
    フォーム起動ボタンのView
    
    このViewには複数のボタンが含まれており、
    各ボタンをクリックすると対応するフォームが表示されます。
    """
    
    def __init__(self):
        # timeout=Noneで永続的なボタンにする
        super().__init__(timeout=None)
    
    @discord.ui.button(
        label='テストフォーム',
        style=discord.ButtonStyle.primary,
        emoji='📝',
        custom_id='test_form_button'
    )
    async def test_form_button(
        self, 
        interaction: discord.Interaction, 
        button: discord.ui.Button
    ):
        """テストフォームボタンがクリックされた時の処理"""
        print(f'📝 テストフォームボタンがクリックされました: {interaction.user.name}')
        modal = TestModal()
        await interaction.response.send_modal(modal)
    
    @discord.ui.button(
        label='フィードバック',
        style=discord.ButtonStyle.success,
        emoji='💬',
        custom_id='feedback_form_button'
    )
    async def feedback_form_button(
        self, 
        interaction: discord.Interaction, 
        button: discord.ui.Button
    ):
        """フィードバックフォームボタンがクリックされた時の処理"""
        print(f'💬 フィードバックボタンがクリックされました: {interaction.user.name}')
        modal = FeedbackModal()
        await interaction.response.send_modal(modal)


def create_form_menu_embed() -> discord.Embed:
    """
    フォームメニュー用のEmbedを作成
    
    Returns:
        フォームメニューのEmbed
    """
    embed = discord.Embed(
        title='📋 フォームメニュー',
        description='利用したいフォームのボタンをクリックしてください',
        color=discord.Color.blue()
    )
    
    embed.add_field(
        name='📝 テストフォーム',
        value='テスト用のフォームです。名前、メール、メッセージを入力できます。',
        inline=False
    )
    
    embed.add_field(
        name='💬 フィードバック',
        value='ご意見・ご要望をお聞かせください。件名と内容を入力できます。',
        inline=False
    )
    
    embed.set_footer(text='ボタンは何度でもクリックできます')
    embed.timestamp = discord.utils.utcnow()
    
    return embed

