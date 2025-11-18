#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Google Drive アクセステスト
"""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).parent))
load_dotenv()

from services.google_drive_service import GoogleDriveService

try:
    print("🔍 Google Drive アクセステスト開始...")

    drive_service = GoogleDriveService()

    # ルートフォルダの情報を取得
    root_folder_id = drive_service.ROOT_FOLDER_ID
    print(f"\n📁 ルートフォルダID: {root_folder_id}")

    # フォルダの詳細情報を取得
    try:
        folder = drive_service.service.files().get(
            fileId=root_folder_id,
            fields='id, name, mimeType, permissions, owners, capabilities'
        ).execute()

        print(f"✅ フォルダ取得成功!")
        print(f"  名前: {folder.get('name')}")
        print(f"  タイプ: {folder.get('mimeType')}")
        print(f"  権限: {folder.get('capabilities')}")

    except Exception as e:
        print(f"❌ フォルダ取得失敗: {e}")

    # サブフォルダの検索テスト
    print(f"\n🔍 サブフォルダ検索テスト...")
    try:
        query = f"'{root_folder_id}' in parents and trashed=false"
        result = drive_service.service.files().list(
            q=query,
            spaces='drive',
            fields='files(id, name, mimeType)'
        ).execute()

        files = result.get('files', [])
        print(f"✅ {len(files)}個のアイテムが見つかりました:")
        for file in files[:5]:  # 最初の5個だけ表示
            print(f"  - {file.get('name')} ({file.get('mimeType')})")

    except Exception as e:
        print(f"❌ サブフォルダ検索失敗: {e}")

    # テストファイル作成（実際にはアップロードしない）
    print(f"\n📝 フォルダ作成権限テスト...")
    try:
        test_folder_metadata = {
            'name': '_test_folder_' + str(os.urandom(4).hex()),
            'mimeType': 'application/vnd.google-apps.folder',
            'parents': [root_folder_id]
        }

        test_folder = drive_service.service.files().create(
            body=test_folder_metadata,
            fields='id, name'
        ).execute()

        print(f"✅ テストフォルダ作成成功!")
        print(f"  ID: {test_folder.get('id')}")
        print(f"  名前: {test_folder.get('name')}")

        # 作成したテストフォルダを削除
        drive_service.service.files().delete(fileId=test_folder.get('id')).execute()
        print(f"✅ テストフォルダ削除完了")

    except Exception as e:
        print(f"❌ フォルダ作成失敗: {e}")
        import traceback
        traceback.print_exc()

    print("\n" + "="*60)
    print("✅ テスト完了")

except Exception as e:
    print(f"\n❌ エラー: {e}")
    import traceback
    traceback.print_exc()
