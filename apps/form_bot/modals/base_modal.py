#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
基底モーダルクラス

各フォームモーダルの基底となるクラスです。
共通の処理をここに実装します。
"""

import discord
from typing import Optional


class BaseModal(discord.ui.Modal):
    """
    フォームモーダルの基底クラス
    
    各フォームモーダルはこのクラスを継承して実装します。
    """
    
    def __init__(self, title: str, timeout: Optional[float] = None):
        """
        初期化
        
        Args:
            title: モーダルのタイトル
            timeout: タイムアウト時間（秒）
        """
        super().__init__(title=title, timeout=timeout)
    
    async def on_submit(self, interaction: discord.Interaction):
        """
        モーダル送信時の処理
        
        サブクラスでオーバーライドして使用します。
        """
        await interaction.response.send_message(
            '✅ フォームを受け付けました！',
            ephemeral=True
        )
    
    async def on_error(self, interaction: discord.Interaction, error: Exception):
        """
        エラー発生時の処理
        
        Args:
            interaction: インタラクション
            error: 発生したエラー
        """
        print(f'❌ モーダルエラー: {error}')
        await interaction.response.send_message(
            '❌ エラーが発生しました。もう一度お試しください。',
            ephemeral=True
        )

