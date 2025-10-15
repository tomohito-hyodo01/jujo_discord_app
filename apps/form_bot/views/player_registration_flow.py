#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
選手登録フロー

「選手登録」選択時の性別選択から登録完了までのフロー
"""

import discord
from typing import Dict, Any
import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), '..'))


class SexSelectView(discord.ui.View):
    """性別選択のView"""
    
    def __init__(self, discord_id: str, context_data: Dict[str, Any]):
        super().__init__(timeout=300)
        self.discord_id = discord_id
        self.context_data = context_data
        self.add_item(SexSelect(discord_id, context_data))
        
        # キャンセルボタンを追加
        from views.tournament_application_view import CancelButton
        self.add_item(CancelButton())


class SexSelect(discord.ui.Select):
    """性別選択のSelect Menu"""
    
    def __init__(self, discord_id: str, context_data: Dict[str, Any]):
        self.discord_id = discord_id
        self.context_data = context_data
        
        options = [
            discord.SelectOption(
                label='男子',
                value='0',
                emoji='👨'
            ),
            discord.SelectOption(
                label='女子',
                value='1',
                emoji='👩'
            )
        ]
        
        super().__init__(
            placeholder='性別を選択してください',
            options=options,
            custom_id='sex_select'
        )
    
    async def callback(self, interaction: discord.Interaction):
        """性別が選択された時"""
        sex_value = int(self.values[0])
        sex_label = '男子' if sex_value == 0 else '女子'
        
        print(f'👤 性別選択: {sex_label} by {interaction.user.name}')
        
        # 性別をcontext_dataに追加
        self.context_data['sex'] = sex_value
        
        # 選手登録フォーム1枚目を表示
        from modals.player_registration_modal import PlayerRegistrationModal1
        
        modal = PlayerRegistrationModal1(
            self.discord_id,
            self.context_data
        )
        
        await interaction.response.send_modal(modal)

