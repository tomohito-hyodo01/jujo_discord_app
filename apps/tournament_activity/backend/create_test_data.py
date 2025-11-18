#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
テストデータ作成スクリプト

Excel生成機能のテスト用データをSupabaseに登録
"""

import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
from dotenv import load_dotenv

# プロジェクトルートのパスを追加
sys.path.insert(0, str(Path(__file__).parent))

load_dotenv()

from api.database import db


def create_test_data():
    """テストデータを作成"""

    print("🔨 テストデータ作成開始...")

    # 明日の日付（CRON機能テスト用）
    tomorrow = (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')

    try:
        # 1. テスト用選手データを作成
        print("\n📝 選手データを作成中...")

        test_players = [
            {
                "player_name": "テスト太郎",
                "birth_date": "1990-05-15",
                "sex": 0,  # 男性
                "post_number": "134-0088",
                "address": "東京都江戸川区西葛西1-1-1",
                "phone_number": "090-1234-5678",
                "jsta_number": "T123456",
                "edogawa_flg": False,  # 江戸川区外の選手
                "affiliated_club": "十条クラブ",
                "discord_id": "test_user_1"
            },
            {
                "player_name": "テスト花子",
                "birth_date": "1992-08-20",
                "sex": 1,  # 女性
                "post_number": "134-0088",
                "address": "東京都江戸川区西葛西2-2-2",
                "phone_number": "090-2345-6789",
                "jsta_number": "T234567",
                "edogawa_flg": False,
                "affiliated_club": "十条クラブ",
                "discord_id": "test_user_2"
            },
            {
                "player_name": "サンプル一郎",
                "birth_date": "1985-03-10",
                "sex": 0,
                "post_number": "134-0088",
                "address": "東京都江戸川区西葛西3-3-3",
                "phone_number": "090-3456-7890",
                "jsta_number": "T345678",
                "edogawa_flg": False,
                "affiliated_club": "テニスクラブA",
                "discord_id": "test_user_3"
            },
            {
                "player_name": "サンプル二郎",
                "birth_date": "1988-11-25",
                "sex": 0,
                "post_number": "134-0088",
                "address": "東京都江戸川区西葛西4-4-4",
                "phone_number": "090-4567-8901",
                "jsta_number": "T456789",
                "edogawa_flg": False,
                "affiliated_club": "テニスクラブB",
                "discord_id": "test_user_4"
            },
            {
                "player_name": "デモ美咲",
                "birth_date": "1995-07-30",
                "sex": 1,
                "post_number": "134-0088",
                "address": "東京都江戸川区西葛西5-5-5",
                "phone_number": "090-5678-9012",
                "jsta_number": "T567890",
                "edogawa_flg": False,
                "affiliated_club": "テニスクラブC",
                "discord_id": "test_user_5"
            }
        ]

        player_ids = []
        for player_data in test_players:
            # 既存の選手を確認（discord_idで）
            existing = db.client.table('player_mst')\
                .select('player_id')\
                .eq('discord_id', player_data['discord_id'])\
                .execute()

            if existing.data:
                player_id = existing.data[0]['player_id']
                print(f"  ✓ 既存の選手を使用: {player_data['player_name']} (ID: {player_id})")
            else:
                result = db.client.table('player_mst')\
                    .insert(player_data)\
                    .execute()
                player_id = result.data[0]['player_id']
                print(f"  ✓ 選手を作成: {player_data['player_name']} (ID: {player_id})")

            player_ids.append(player_id)

        # 2. テスト用大会データを作成
        print("\n🏆 大会データを作成中...")

        tournament_id = f"test_tournament_{datetime.now().strftime('%Y%m%d')}"

        tournament_data = {
            "tournament_id": tournament_id,
            "tournament_name": "江戸川区テスト大会",
            "registrated_ward": 23,  # 江戸川区
            "deadline_date": tomorrow,  # 明日締切（CRON機能テスト用）
            "tournament_date": (datetime.now() + timedelta(days=7)).strftime('%Y-%m-%d'),
            "classification": 0,  # 個人戦
            "mix_flg": False,  # ミックスなし
            "type": ["一般", "45"]  # 種別
        }

        # 既存の大会を確認
        existing_tournament = db.client.table('tournament_mst')\
            .select('tournament_id')\
            .eq('tournament_id', tournament_id)\
            .execute()

        if existing_tournament.data:
            # 既存の大会を更新
            db.client.table('tournament_mst')\
                .update(tournament_data)\
                .eq('tournament_id', tournament_id)\
                .execute()
            print(f"  ✓ 大会を更新: {tournament_data['tournament_name']} (ID: {tournament_id})")
        else:
            # 新規作成
            db.client.table('tournament_mst')\
                .insert(tournament_data)\
                .execute()
            print(f"  ✓ 大会を作成: {tournament_data['tournament_name']} (ID: {tournament_id})")

        print(f"  📅 締切日: {tomorrow} (明日)")

        # 3. テスト用申込データを作成
        print("\n📋 申込データを作成中...")

        # 既存の申込を削除
        db.client.table('tournament_registration')\
            .delete()\
            .eq('tournament_id', tournament_id)\
            .execute()

        test_registrations = [
            {
                "discord_id": "test_user_1",
                "tournament_id": tournament_id,
                "type": "一般",
                "sex": 0,
                "pair1": player_ids[0],  # テスト太郎
                "pair2": [player_ids[2]]  # サンプル一郎とペア
            },
            {
                "discord_id": "test_user_2",
                "tournament_id": tournament_id,
                "type": "一般",
                "sex": 1,
                "pair1": player_ids[1],  # テスト花子
                "pair2": [player_ids[4]]  # デモ美咲とペア
            },
            {
                "discord_id": "test_user_3",
                "tournament_id": tournament_id,
                "type": "45",
                "sex": 0,
                "pair1": player_ids[2],  # サンプル一郎
                "pair2": [player_ids[3]]  # サンプル二郎とペア
            }
        ]

        for reg_data in test_registrations:
            result = db.client.table('tournament_registration')\
                .insert(reg_data)\
                .execute()

            player_name = next(p['player_name'] for p in test_players
                             if p['discord_id'] == reg_data['discord_id'])
            print(f"  ✓ 申込を作成: {player_name} - {reg_data['type']}{'男子' if reg_data['sex'] == 0 else '女子'}")

        print("\n" + "="*60)
        print("✅ テストデータ作成完了！")
        print("="*60)
        print(f"\n📊 作成されたデータ:")
        print(f"  選手数: {len(player_ids)}人")
        print(f"  大会ID: {tournament_id}")
        print(f"  大会名: {tournament_data['tournament_name']}")
        print(f"  締切日: {tomorrow}")
        print(f"  申込数: {len(test_registrations)}件")
        print("\n🧪 テスト方法:")
        print(f"  1. 手動生成API:")
        print(f"     curl -X POST https://tournament-api-jujo.fly.dev/api/excel/generate \\")
        print(f"       -H 'Content-Type: application/json' \\")
        print(f"       -d '{{\"tournament_id\": \"{tournament_id}\"}}'")
        print(f"\n  2. デバッグAPI:")
        print(f"     curl https://tournament-api-jujo.fly.dev/api/excel/test/{tournament_id}")
        print(f"\n  3. CRON機能:")
        print(f"     明日の朝9時に自動実行されます（締切が明日のため）")
        print(f"     または GitHub Actions から手動実行できます")
        print("\n")

    except Exception as e:
        print(f"\n❌ エラーが発生しました: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    create_test_data()
