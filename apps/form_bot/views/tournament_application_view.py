#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
大会申込UI

ボタンとSelect Menuを使った大会申込フロー
"""

import discord
from typing import List, Dict, Any
import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from services.tournament_service import TournamentService
from services.player_service import PlayerService


class TournamentApplicationView(discord.ui.View):
    """大会申込ボタンのView"""
    
    def __init__(self):
        super().__init__(timeout=None)
    
    @discord.ui.button(
        label='大会に申し込む',
        style=discord.ButtonStyle.primary,
        emoji='📝',
        custom_id='tournament_application_button'
    )
    async def application_button(
        self,
        interaction: discord.Interaction,
        button: discord.ui.Button
    ):
        """大会申込ボタンがクリックされた時"""
        print(f'📝 申込ボタンクリック: {interaction.user.name}')
        
        # Step 1: 大会選択のSelect Menuを表示
        try:
            tournaments = await TournamentService.get_all_tournaments()
            
            if not tournaments:
                await interaction.response.send_message(
                    '❌ 現在募集中の大会がありません',
                    ephemeral=True
                )
                return
            
            # Select Menuを作成
            view = TournamentSelectView(tournaments)
            
            embed = discord.Embed(
                title='📋 大会申込',
                description='申し込む大会を選択してください',
                color=discord.Color.blue()
            )
            
            await interaction.response.send_message(
                embed=embed,
                view=view,
                ephemeral=True
            )
        
        except Exception as e:
            print(f'❌ エラー: {e}')
            await interaction.response.send_message(
                f'❌ エラーが発生しました: {str(e)}',
                ephemeral=True
            )


class TournamentSelectView(discord.ui.View):
    """大会選択のView"""
    
    def __init__(self, tournaments: List[Dict[str, Any]]):
        super().__init__(timeout=300)  # 5分でタイムアウト
        self.add_item(TournamentSelect(tournaments))
        self.add_item(CancelButton())


class TournamentSelect(discord.ui.Select):
    """大会選択のSelect Menu"""
    
    def __init__(self, tournaments: List[Dict[str, Any]]):
        self.tournaments = {t['tournament_id']: t for t in tournaments}
        
        options = [
            discord.SelectOption(
                label=t['tournament_name'][:100],  # 最大100文字
                value=t['tournament_id'],
                description=f"締切: {t['deadline_date'][:10]}"[:100]
            )
            for t in tournaments[:25]  # 最大25個まで
        ]
        
        super().__init__(
            placeholder='大会を選択してください',
            options=options,
            custom_id='tournament_select'
        )
    
    async def callback(self, interaction: discord.Interaction):
        """大会が選択された時"""
        tournament_id = self.values[0]
        tournament = self.tournaments[tournament_id]
        
        print(f'📋 大会選択: {tournament["tournament_name"]} by {interaction.user.name}')
        
        # Step 2: 種別選択のSelect Menuを表示
        types = tournament['type']
        
        view = TypeSelectView(tournament_id, types)
        
        embed = discord.Embed(
            title=f'📋 {tournament["tournament_name"]}',
            description='参加種別を選択してください',
            color=discord.Color.blue()
        )
        
        await interaction.response.edit_message(
            embed=embed,
            view=view
        )


class TypeSelectView(discord.ui.View):
    """種別選択のView"""
    
    def __init__(self, tournament_id: str, types: List[str]):
        super().__init__(timeout=300)
        self.add_item(TypeSelect(tournament_id, types))
        self.add_item(CancelButton())


class TypeSelect(discord.ui.Select):
    """種別選択のSelect Menu"""
    
    def __init__(self, tournament_id: str, types: List[str]):
        self.tournament_id = tournament_id
        
        options = [
            discord.SelectOption(
                label=type_name,
                value=type_name
            )
            for type_name in types[:25]  # 最大25個
        ]
        
        super().__init__(
            placeholder='種別を選択してください',
            options=options,
            custom_id='type_select'
        )
    
    async def callback(self, interaction: discord.Interaction):
        """種別が選択された時"""
        selected_type = self.values[0]
        
        print(f'📋 種別選択: {selected_type} by {interaction.user.name}')
        
        # Step 3: ペア選択のSelect Menuを表示
        try:
            players = await PlayerService.get_all_players()
            
            view = PairSelectView(self.tournament_id, selected_type, players)
            
            embed = discord.Embed(
                title='👥 ペア選択',
                description='申込ペアを選択してください',
                color=discord.Color.blue()
            )
            
            await interaction.response.edit_message(
                embed=embed,
                view=view
            )
        
        except Exception as e:
            print(f'❌ エラー: {e}')
            await interaction.response.send_message(
                f'❌ エラーが発生しました: {str(e)}',
                ephemeral=True
            )


class PairSelectView(discord.ui.View):
    """ペア選択のView"""
    
    def __init__(self, tournament_id: str, selected_type: str, players: List[Dict[str, Any]]):
        super().__init__(timeout=300)
        self.add_item(PairSelect(tournament_id, selected_type, players))
        self.add_item(CancelButton())


class PairSelect(discord.ui.Select):
    """ペア選択のSelect Menu"""
    
    def __init__(self, tournament_id: str, selected_type: str, players: List[Dict[str, Any]]):
        self.tournament_id = tournament_id
        self.selected_type = selected_type
        
        # 選手のオプションを作成
        options = [
            discord.SelectOption(
                label=p['player_name'],
                value=str(p['player_id']),
                description=f"連盟番号: {p.get('jsta_number', 'なし')}"[:100]
            )
            for p in players[:24]  # 最大24個（「その他」用に1枠残す）
        ]
        
        # 「選手登録」オプションを追加
        options.append(
            discord.SelectOption(
                label='選手登録',
                value='other',
                description='新しい選手を登録する',
                emoji='➕'
            )
        )
        
        super().__init__(
            placeholder='ペアを選択してください',
            options=options,
            custom_id='pair_select'
        )
    
    async def callback(self, interaction: discord.Interaction):
        """ペアが選択された時"""
        selected_pair = self.values[0]
        
        print(f'👥 ペア選択: {selected_pair} by {interaction.user.name}')
        
        # 「選手登録」が選択された場合は性別選択を表示
        if selected_pair == 'other':
            print(f'📝 新規選手登録フローへ: {interaction.user.name}')
            
            # 性別選択のSelect Menuを表示
            from views.player_registration_flow import SexSelectView
            
            context_data = {
                'tournament_id': self.tournament_id,
                'selected_type': self.selected_type,
                'return_to_application': True
            }
            
            view = SexSelectView(str(interaction.user.id), context_data)
            
            embed = discord.Embed(
                title='👤 選手登録',
                description='性別を選択してください',
                color=discord.Color.blue()
            )
            
            await interaction.response.edit_message(
                embed=embed,
                view=view
            )
            return
        
        # 既存選手が選択された場合は確認画面へ
        # Step 4: 確認画面を表示
        view = ConfirmView(self.tournament_id, self.selected_type, selected_pair)
        
        # 選手名を取得
        player = await PlayerService.get_player_by_id(int(selected_pair))
        pair_name = player['player_name'] if player else '不明'
        
        # 大会情報を取得
        tournament = await TournamentService.get_tournament_by_id(self.tournament_id)
        
        embed = discord.Embed(
            title='✅ 申込内容の確認',
            description='以下の内容で申し込みます',
            color=discord.Color.green()
        )
        embed.add_field(name='大会名', value=tournament['tournament_name'], inline=False)
        embed.add_field(name='種別', value=self.selected_type, inline=True)
        embed.add_field(name='ペア', value=pair_name, inline=True)
        embed.set_footer(text='確認して「申込」ボタンを押してください')
        
        await interaction.response.edit_message(
            embed=embed,
            view=view
        )


class ConfirmView(discord.ui.View):
    """確認・送信のView"""
    
    def __init__(self, tournament_id: str, selected_type: str, selected_pair: str):
        super().__init__(timeout=300)
        self.tournament_id = tournament_id
        self.selected_type = selected_type
        self.selected_pair = selected_pair
    
    @discord.ui.button(
        label='申込',
        style=discord.ButtonStyle.success,
        emoji='✅'
    )
    async def confirm_button(
        self,
        interaction: discord.Interaction,
        button: discord.ui.Button
    ):
        """申込ボタンがクリックされた時（現在は何もしない）"""
        print(f'✅ 申込確定: {interaction.user.name}')
        print(f'   大会ID: {self.tournament_id}')
        print(f'   種別: {self.selected_type}')
        print(f'   ペア: {self.selected_pair}')
        
        # TODO: ここでデータベースに保存する処理を追加
        
        embed = discord.Embed(
            title='✅ 申込完了',
            description='大会への申込を受け付けました！\n（テスト中のため、実際の登録は行われていません）',
            color=discord.Color.green()
        )
        
        await interaction.response.edit_message(
            embed=embed,
            view=None  # ボタンを削除
        )
    
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
        """キャンセルボタンがクリックされた時"""
        print(f'❌ 申込キャンセル: {interaction.user.name}')
        
        embed = discord.Embed(
            title='❌ キャンセルしました',
            description='申込をキャンセルしました',
            color=discord.Color.red()
        )
        
        await interaction.response.edit_message(
            embed=embed,
            view=None
        )


class CancelButton(discord.ui.Button):
    """キャンセルボタン（共通）"""
    
    def __init__(self):
        super().__init__(
            label='キャンセル',
            style=discord.ButtonStyle.danger,
            emoji='❌'
        )
    
    async def callback(self, interaction: discord.Interaction):
        """キャンセルボタンがクリックされた時"""
        print(f'❌ キャンセル: {interaction.user.name}')
        
        embed = discord.Embed(
            title='❌ キャンセルしました',
            description='申込をキャンセルしました',
            color=discord.Color.red()
        )
        
        await interaction.response.edit_message(
            embed=embed,
            view=None
        )

