#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
共通ユーティリティ関数

各アプリで共通して使用する便利な関数を提供します。
"""

import discord
from typing import Optional
from datetime import datetime


def create_embed(
    title: str,
    description: Optional[str] = None,
    color: discord.Color = discord.Color.blue(),
    fields: Optional[list[tuple[str, str, bool]]] = None,
    footer: Optional[str] = None,
    timestamp: bool = True
) -> discord.Embed:
    """
    Embedを作成
    
    Args:
        title: タイトル
        description: 説明文
        color: 色
        fields: フィールドのリスト [(name, value, inline), ...]
        footer: フッターテキスト
        timestamp: タイムスタンプを付けるか
    
    Returns:
        作成されたEmbed
    """
    embed = discord.Embed(title=title, description=description, color=color)
    
    if fields:
        for name, value, inline in fields:
            embed.add_field(name=name, value=value, inline=inline)
    
    if footer:
        embed.set_footer(text=footer)
    
    if timestamp:
        embed.timestamp = datetime.now()
    
    return embed


def format_user_info(user: discord.User) -> str:
    """
    ユーザー情報を整形
    
    Args:
        user: ユーザーオブジェクト
    
    Returns:
        整形されたユーザー情報
    """
    return f'{user.name} (ID: {user.id})'


def truncate_text(text: str, max_length: int = 100, suffix: str = '...') -> str:
    """
    テキストを指定した長さに切り詰め
    
    Args:
        text: 対象テキスト
        max_length: 最大文字数
        suffix: 切り詰めた場合に末尾に追加する文字列
    
    Returns:
        切り詰められたテキスト
    """
    if len(text) <= max_length:
        return text
    return text[:max_length - len(suffix)] + suffix

