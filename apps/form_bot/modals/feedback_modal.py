#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
フィードバックフォームモーダル

ユーザーからのフィードバックを受け取るモーダルです。
"""

import discord
from .base_modal import BaseModal


class FeedbackModal(BaseModal):
    """フィードバック入力モーダル"""
    
    # フォームフィールドの定義
    subject = discord.ui.TextInput(
        label='件名',
        placeholder='フィードバックの件名を入力してください',
        required=True,
        max_length=100
    )
    
    content = discord.ui.TextInput(
        label='内容',
        placeholder='フィードバックの詳細を入力してください',
        style=discord.TextStyle.paragraph,
        required=True,
        max_length=1000
    )
    
    def __init__(self):
        super().__init__(title='📝 フィードバックフォーム')
    
    async def on_submit(self, interaction: discord.Interaction):
        """フォーム送信時の処理"""
        # フォームデータを取得
        subject = self.subject.value
        content = self.content.value
        
        # ログに出力（後でデータベースなどに保存する実装に変更可能）
        print(f'📝 フィードバック受信:')
        print(f'   送信者: {interaction.user.name} (ID: {interaction.user.id})')
        print(f'   件名: {subject}')
        print(f'   内容: {content}')
        
        # 確認メッセージを送信
        embed = discord.Embed(
            title='✅ フィードバックを受け付けました',
            description='貴重なご意見ありがとうございます！',
            color=discord.Color.green()
        )
        embed.add_field(name='件名', value=subject, inline=False)
        embed.add_field(name='内容', value=content, inline=False)
        
        await interaction.response.send_message(embed=embed, ephemeral=True)

