#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
完全なExcel生成＆アップロードテスト
"""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).parent))
load_dotenv()

from services.excel_service_factory import ExcelServiceFactory
from services.google_drive_service import GoogleDriveService

try:
    print("🧪 完全なExcel生成＆アップロードテスト開始...\n")

    # テスト用の大会データ
    tournament = {
        'tournament_id': 'test_local_upload',
        'tournament_name': 'ローカルテスト大会',
        'registrated_ward': 23,
        'classification': 0,
        'mix_flg': False,
        'type': ['一般']
    }

    # テスト用の申込データ
    registrations = [
        {
            'discord_id': 'test_1',
            'tournament_id': 'test_local_upload',
            'type': '一般',
            'sex': 0,
            'player_name': 'テスト太郎',
            'birth_date': '1990-05-15',
            'post_number': '134-0088',
            'address': '東京都江戸川区西葛西1-1-1',
            'phone_number': '090-1234-5678',
            'jsta_number': 'T123456',
            'edogawa_flg': False,
            'affiliated_club': '十条クラブ',
            'player2_name': 'テスト次郎',
            'player2_birth_date': '1992-03-20',
            'player2_affiliated_club': '十条クラブ',
        }
    ]

    # 1. Excelファイル生成
    print("📊 Step 1: Excelファイル生成中...")
    excel_service = ExcelServiceFactory.create(23)
    file_paths = excel_service.generate_tournament_files(tournament, registrations)

    print(f"✅ Excelファイル生成成功!")
    for key, path in file_paths.items():
        print(f"  {key}: {path}")
        # ファイルが実際に存在するか確認
        if os.path.exists(path):
            size = os.path.getsize(path)
            print(f"    → ファイルサイズ: {size} bytes")
        else:
            print(f"    → ❌ ファイルが存在しません！")

    # 2. Google Driveにアップロード
    print(f"\n📤 Step 2: Google Driveへアップロード中...")
    drive_service = GoogleDriveService()

    try:
        file_urls = drive_service.upload_tournament_files(
            ward_id=23,
            tournament_name='ローカルテスト大会',
            file_paths=file_paths
        )

        print(f"✅ Google Driveアップロード成功!")
        for key, url in file_urls.items():
            print(f"  {key}: {url}")

    except Exception as e:
        print(f"❌ Google Driveアップロード失敗: {e}")
        import traceback
        traceback.print_exc()

    print("\n" + "="*60)
    print("✅ テスト完了")

except Exception as e:
    print(f"\n❌ エラー: {e}")
    import traceback
    traceback.print_exc()
