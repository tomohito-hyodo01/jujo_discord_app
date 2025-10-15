#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
共通ロガーモジュール

アプリケーション全体で使用するロガーを提供します。
"""

import logging
import sys
from typing import Optional


def setup_logger(
    name: str = 'discord_bot',
    level: int = logging.INFO,
    log_file: Optional[str] = None
) -> logging.Logger:
    """
    ロガーをセットアップ
    
    Args:
        name: ロガー名
        level: ログレベル
        log_file: ログファイルパス（指定した場合はファイルにも出力）
    
    Returns:
        設定済みのロガー
    """
    logger = logging.getLogger(name)
    logger.setLevel(level)
    
    # フォーマッターを作成
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    
    # コンソールハンドラー
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(level)
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)
    
    # ファイルハンドラー（オプション）
    if log_file:
        file_handler = logging.FileHandler(log_file, encoding='utf-8')
        file_handler.setLevel(level)
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)
    
    return logger


# デフォルトロガー
default_logger = setup_logger()

