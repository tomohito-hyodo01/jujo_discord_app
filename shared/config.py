#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
共通設定モジュール

環境変数や共通設定を管理します。
"""

import os
from typing import Optional
from dotenv import load_dotenv


class Config:
    """設定クラス"""
    
    def __init__(self, env_file: Optional[str] = None):
        """
        初期化
        
        Args:
            env_file: .envファイルのパス（指定しない場合は自動検出）
        """
        if env_file:
            load_dotenv(env_file)
        else:
            load_dotenv()
    
    @property
    def bot_token(self) -> Optional[str]:
        """Botトークンを取得"""
        return os.getenv('DISCORD_BOT_TOKEN')
    
    @property
    def channel_id(self) -> Optional[int]:
        """チャンネルIDを取得"""
        channel_id = os.getenv('DISCORD_CHANNEL_ID')
        return int(channel_id) if channel_id else None
    
    def validate(self) -> tuple[bool, list[str]]:
        """
        設定の検証
        
        Returns:
            (is_valid, error_messages): 検証結果とエラーメッセージのリスト
        """
        errors = []
        
        if not self.bot_token:
            errors.append('DISCORD_BOT_TOKEN が設定されていません')
        
        return len(errors) == 0, errors


# グローバル設定インスタンス
config = Config()

