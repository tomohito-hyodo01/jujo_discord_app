#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
テーブルスキーマ確認スクリプト
"""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).parent))
load_dotenv()

from api.database import db

# tournament_mstテーブルの既存データを1件取得
result = db.client.table('tournament_mst').select('*').limit(1).execute()

if result.data:
    print("tournament_mstテーブルの構造:")
    print("="*60)
    for key in result.data[0].keys():
        print(f"  {key}: {type(result.data[0][key]).__name__}")
    print("\nサンプルデータ:")
    print(result.data[0])
else:
    print("tournament_mstテーブルにデータがありません")
