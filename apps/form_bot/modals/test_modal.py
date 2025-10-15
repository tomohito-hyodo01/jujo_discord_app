#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
テストフォームモーダル

/test コマンドで表示されるテスト用のフォームです。
"""

import discord
from .base_modal import BaseModal


class TestModal(BaseModal):
    """テスト入力モーダル"""
    
    # フォームフィールドの定義
    name = discord.ui.TextInput(
        label='名前',
        placeholder='あなたの名前を入力してください',
        required=True,
        max_length=50
    )
    
    email = discord.ui.TextInput(
        label='メールアドレス',
        placeholder='example@example.com',
        required=False,
        max_length=100
    )
    
    message = discord.ui.TextInput(
        label='メッセージ',
        placeholder='何でも自由に入力してください',
        style=discord.TextStyle.paragraph,  # 複数行入力
        required=True,
        min_length=10,
        max_length=500
    )
    
    def __init__(self):
        super().__init__(title='📝 テストフォーム')
    
    async def on_submit(self, interaction: discord.Interaction):
        """フォーム送信時の処理"""
        # フォームデータを取得
        name = self.name.value
        email = self.email.value or '未入力'
        message = self.message.value
        
        # ログに出力
        print('=' * 50)
        print('📝 テストフォーム受信:')
        print(f'   送信者: {interaction.user.name} (ID: {interaction.user.id})')
        print(f'   名前: {name}')
        print(f'   メール: {email}')
        print(f'   メッセージ: {message}')
        print('=' * 50)
        
        # 確認メッセージをEmbedで作成
        embed = discord.Embed(
            title='✅ テストフォームを受け付けました',
            description='入力ありがとうございます！',
            color=discord.Color.green()
        )
        embed.add_field(name='👤 名前', value=name, inline=True)
        embed.add_field(name='📧 メールアドレス', value=email, inline=True)
        embed.add_field(name='💬 メッセージ', value=message, inline=False)
        embed.set_footer(text=f'送信者: {interaction.user.name}')
        embed.timestamp = discord.utils.utcnow()
        
        # 送信者にのみ表示（ephemeral=True）
        await interaction.response.send_message(embed=embed, ephemeral=True)

