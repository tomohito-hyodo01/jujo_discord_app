#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
外部Webフォームリンクボタン

テキストチャンネルで使用可能
"""

import discord


class WebFormButtonView(discord.ui.View):
    """外部Webフォームへのリンクボタン"""
    
    def __init__(self, base_url: str = 'http://localhost:3000'):
        super().__init__(timeout=None)
        self.base_url = base_url
    
    @discord.ui.button(
        label='大会申込',
        style=discord.ButtonStyle.primary,
        custom_id='web_form_open_button'
    )
    async def open_form_button(
        self,
        interaction: discord.Interaction,
        button: discord.ui.Button
    ):
        """大会申込ボタン - セッションを作成してフォームを開く"""
        import httpx
        
        # セッションを作成
        user_id = str(interaction.user.id)
        username = interaction.user.name
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    'http://localhost:8000/api/session',
                    json={
                        'discord_id': user_id,
                        'username': username
                    },
                    timeout=5.0
                )
                
                if response.status_code == 200:
                    data = response.json()
                    session_id = data['session_id']
                    url = f'{self.base_url}?view=tournament&session={session_id}'
                    
                    embed = discord.Embed(
                        title='大会申込フォーム',
                        description=f'[フォームを開く]({url})',
                        color=0x3b82f6
                    )
                    
                    await interaction.response.send_message(embed=embed, ephemeral=True)
                else:
                    await interaction.response.send_message(
                        'エラーが発生しました。しばらくしてから再度お試しください。',
                        ephemeral=True
                    )
        except Exception as e:
            print(f'セッション作成エラー: {e}')
            await interaction.response.send_message(
                'サーバーに接続できませんでした。管理者に連絡してください。',
                ephemeral=True
            )


def create_web_form_embed(base_url: str = 'http://localhost:3000') -> discord.Embed:
    """Webフォーム案内のEmbedを作成"""
    embed = discord.Embed(
        title='大会申込',
        description='下のボタンをクリックして申し込んでください',
        color=0x5865F2  # Discordの青色
    )
    
    embed.set_footer(text='リンクは外部ブラウザで開きます')
    
    return embed

