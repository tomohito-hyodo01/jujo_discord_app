#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
選手登録モーダル（2段階フォーム）

「その他」選択時に表示される新規選手登録フォーム
"""

import discord
from typing import Dict, Any
import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from services.postal_service import PostalService
from services.player_service import PlayerService
from utils.validators import Validators


class ContinueToModal2View(discord.ui.View):
    """フォーム1枚目とフォーム2枚目の間のView"""
    
    def __init__(self, discord_id: str, temp_data: Dict[str, Any], context_data: Dict[str, Any]):
        super().__init__(timeout=300)
        self.discord_id = discord_id
        self.temp_data = temp_data
        self.context_data = context_data
    
    @discord.ui.button(
        label='次へ',
        style=discord.ButtonStyle.primary,
        emoji='➡️'
    )
    async def next_button(
        self,
        interaction: discord.Interaction,
        button: discord.ui.Button
    ):
        """次へボタンがクリックされた時"""
        # 2枚目のモーダルを表示
        modal2 = PlayerRegistrationModal2(
            self.discord_id,
            self.temp_data,
            self.context_data
        )
        await interaction.response.send_modal(modal2)
    
    @discord.ui.button(
        label='キャンセル',
        style=discord.ButtonStyle.secondary,
        emoji='❌'
    )
    async def cancel_button(
        self,
        interaction: discord.Interaction,
        button: discord.ui.Button
    ):
        """キャンセルボタン"""
        embed = discord.Embed(
            title='❌ キャンセルしました',
            description='選手登録をキャンセルしました',
            color=discord.Color.red()
        )
        await interaction.response.edit_message(embed=embed, view=None)


class PlayerRegistrationModal1(discord.ui.Modal):
    """選手登録フォーム（1枚目：基本情報）"""
    
    last_name = discord.ui.TextInput(
        label='姓',
        placeholder='例：山田',
        required=True,
        max_length=20
    )
    
    first_name = discord.ui.TextInput(
        label='名',
        placeholder='例：太郎',
        required=True,
        max_length=20
    )
    
    jsta_number = discord.ui.TextInput(
        label='日本連盟登録番号',
        placeholder='例：JSTA12345（任意）',
        required=False,
        max_length=20
    )
    
    birth_date = discord.ui.TextInput(
        label='生年月日',
        placeholder='YYYY-MM-DD形式（例：1990-01-15）',
        required=True,
        max_length=10
    )
    
    def __init__(self, discord_id: str, context_data: Dict[str, Any]):
        """
        Args:
            discord_id: Discord User ID
            context_data: 申込コンテキスト（sex含む）
        """
        super().__init__(title='新規選手登録（1/2）')
        self.discord_id = discord_id
        self.context_data = context_data
        self.sex_value = context_data.get('sex', 0)  # 性別は既に選択済み
    
    async def on_submit(self, interaction: discord.Interaction):
        """1枚目のフォーム送信時"""
        
        # 生年月日のバリデーション
        birth_date_value = self.birth_date.value.strip()
        is_valid, error_msg = Validators.validate_date(birth_date_value)
        if not is_valid:
            await interaction.response.send_message(f'❌ {error_msg}', ephemeral=True)
            return
        
        # 姓名を結合
        last_name = self.last_name.value.strip()
        first_name = self.first_name.value.strip()
        full_name = f"{last_name} {first_name}"
        
        # 1枚目のデータを保持（性別は既に選択済み）
        temp_data = {
            'player_name': full_name,
            'jsta_number': self.jsta_number.value.strip() or None,
            'birth_date': birth_date_value,
            'sex': self.sex_value  # 性別はSelect Menuで選択済み
        }
        
        print(f'📝 選手登録（1/2）: {temp_data["player_name"]}')
        
        # 「次へ」ボタンを表示（モーダルから直接モーダルを開けないため）
        view = ContinueToModal2View(self.discord_id, temp_data, self.context_data)
        
        embed = discord.Embed(
            title='📝 入力内容確認（1/2）',
            description='以下の内容で登録します',
            color=discord.Color.blue()
        )
        embed.add_field(name='氏名', value=temp_data['player_name'], inline=True)
        embed.add_field(name='性別', value='男子' if temp_data['sex'] == 0 else '女子', inline=True)
        embed.add_field(name='生年月日', value=temp_data['birth_date'], inline=True)
        embed.add_field(name='連盟番号', value=temp_data['jsta_number'] or 'なし', inline=True)
        embed.set_footer(text='「次へ」ボタンを押して連絡先情報を入力してください')
        
        await interaction.response.send_message(embed=embed, view=view, ephemeral=True)


class PlayerRegistrationModal2(discord.ui.Modal):
    """選手登録フォーム（2枚目：連絡先情報）"""
    
    postal_code = discord.ui.TextInput(
        label='郵便番号',
        placeholder='例：123-4567',
        required=True,
        max_length=10
    )
    
    address = discord.ui.TextInput(
        label='住所',
        placeholder='郵便番号を入力後、次の項目へ進んでください',
        style=discord.TextStyle.paragraph,
        required=True,
        max_length=200
    )
    
    phone_number = discord.ui.TextInput(
        label='電話番号',
        placeholder='例：090-1234-5678',
        required=True,
        max_length=20
    )
    
    def __init__(
        self,
        discord_id: str,
        temp_data: Dict[str, Any],
        context_data: Dict[str, Any]
    ):
        """
        Args:
            discord_id: Discord User ID
            temp_data: 1枚目のフォームデータ
            context_data: 申込コンテキスト
        """
        super().__init__(title='新規選手登録（2/2）')
        self.discord_id = discord_id
        self.temp_data = temp_data
        self.context_data = context_data
    
    async def on_submit(self, interaction: discord.Interaction):
        """2枚目のフォーム送信時"""
        
        postal_code_value = self.postal_code.value.strip()
        address_value = self.address.value.strip()
        phone_number_value = self.phone_number.value.strip()
        
        # 郵便番号から住所を取得（補助機能）
        postal_address = await PostalService.get_address(postal_code_value)
        
        # 住所が空の場合、郵便番号から自動入力を提案
        if not address_value and postal_address:
            suggested_address = postal_address['full_address']
            
            # 住所候補を表示して確認を求める
            embed = discord.Embed(
                title='📮 住所の自動入力',
                description=f'郵便番号 `{postal_code_value}` から以下の住所が見つかりました：',
                color=discord.Color.blue()
            )
            embed.add_field(
                name='候補住所',
                value=suggested_address,
                inline=False
            )
            embed.add_field(
                name='⚠️ 注意',
                value='住所が空欄のため登録できません。\n再度フォームを開き、住所を入力してください。',
                inline=False
            )
            
            await interaction.response.send_message(embed=embed, ephemeral=True)
            return
        
        # 完全なデータを作成
        player_data = {
            'discord_id': self.discord_id,
            'player_name': self.temp_data['player_name'],
            'jsta_number': self.temp_data['jsta_number'],
            'birth_date': self.temp_data['birth_date'],
            'sex': self.temp_data['sex'],
            'post_number': PostalService.format_postal_code(postal_code_value),
            'address': address_value,
            'phone_number': phone_number_value
        }
        
        print(f'📝 選手登録（2/2）完了: {player_data["player_name"]}')
        
        # データベースに保存
        try:
            new_player = await PlayerService.create_player(player_data)
            
            # 登録完了メッセージ
            embed = discord.Embed(
                title='✅ 選手登録完了',
                description=f'**{player_data["player_name"]}** さんの登録が完了しました！',
                color=discord.Color.green()
            )
            embed.add_field(name='選手ID', value=new_player['player_id'], inline=True)
            embed.add_field(name='性別', value='男子' if player_data['sex'] == 0 else '女子', inline=True)
            embed.add_field(name='連盟番号', value=player_data['jsta_number'] or 'なし', inline=True)
            embed.set_footer(text='引き続き大会申込を進めてください')
            
            # TODO: ここで元の申込フローに戻る処理を追加
            # 現在は登録完了メッセージのみ
            
            await interaction.response.send_message(embed=embed, ephemeral=True)
            
            print(f'✅ 選手登録成功: player_id={new_player["player_id"]}')
        
        except Exception as e:
            print(f'❌ 選手登録エラー: {e}')
            await interaction.response.send_message(
                f'❌ 登録エラーが発生しました: {str(e)}\nDiscord IDが既に登録されている可能性があります。',
                ephemeral=True
            )

