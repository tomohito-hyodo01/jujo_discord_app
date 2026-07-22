#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
主催区ID → Discord Webhook の対応（申込通知・締切通知・Excel送信で共用）

区別のWebhook定義はここに一元化する。個別ファイルにマップを複製すると
区の追加漏れ（例: 足立区が申込通知だけ広域チャンネルに流れる）が起きるため、
必ずこのモジュールを使うこと。
"""
import os
from typing import Optional

# 主催区ID → Webhook URL環境変数名
WARD_WEBHOOK_ENV = {
    99: 'DISCORD_WEBHOOK_URL',             # 東京都・その他広域
    23: 'DISCORD_WEBHOOK_URL_EDOGAWA',     # 江戸川区
    8:  'DISCORD_WEBHOOK_URL_KOTO',        # 江東区
    2:  'DISCORD_WEBHOOK_URL_CHUO',        # 中央区
    7:  'DISCORD_WEBHOOK_URL_SUMIDA',      # 墨田区
    18: 'DISCORD_WEBHOOK_URL_ARAKAWA',     # 荒川区
    21: 'DISCORD_WEBHOOK_URL_ADACHI',      # 足立区
    5:  'DISCORD_WEBHOOK_URL_BUNKYO',      # 文京区
    101: 'DISCORD_WEBHOOK_URL_NAGAREYAMA',  # 流山市（千葉）
    100: 'DISCORD_WEBHOOK_URL_EDOGAWA',    # 浦安市 → 江戸川区チャンネル
}


def get_ward_webhook_url(ward_id) -> Optional[str]:
    """主催区の管理者チャンネルWebhook URLを取得

    区別の環境変数が未設定の場合は広域チャンネル（DISCORD_WEBHOOK_URL）に
    フォールバックする。どちらも未設定なら None。
    """
    env_key = WARD_WEBHOOK_ENV.get(ward_id)
    url = os.getenv(env_key) if env_key else None
    return url or os.getenv('DISCORD_WEBHOOK_URL') or None
