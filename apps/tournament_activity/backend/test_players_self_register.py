#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ログイン不要の本人登録（POST /api/players/self-register）の動作確認

DBにもDiscordにも接続せず、
・全項目必須（空白のみも未入力扱い）と連盟番号の形式チェック
・Discord ID / 登録者なしで player_mst に登録されること
・氏名＋生年月日・連盟番号の重複時に新規作成しないこと
・公開エンドポイントなので既存選手の住所・電話番号を返さないこと
・共通化した登録処理を使う POST /api/players の戻り値がこれまでどおりであること
を検証する。

実行:
    cd apps/tournament_activity/backend
    python test_players_self_register.py
"""

import asyncio
import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

# Windowsの既定コンソール(cp932)でも絵文字を出せるようにする
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, 'reconfigure'):
        _stream.reconfigure(encoding='utf-8', errors='replace')

# 依存が入っていない環境（ローカルWindows等）でも動かせるよう、未導入のものだけ差し替える
for _name in ('aiomysql', 'httpx'):
    try:
        __import__(_name)
    except ImportError:  # pragma: no cover
        _stub = types.ModuleType(_name)
        _stub.DictCursor = object
        _stub.Pool = object
        _stub.AsyncClient = object
        sys.modules[_name] = _stub

import api.routers.players as P  # noqa: E402

_failures = []


def check(label, actual, expected):
    if actual == expected:
        print(f"  ✅ {label}")
    else:
        _failures.append(f"{label}\n     actual  : {actual!r}\n     expected: {expected!r}")
        print(f"  ❌ {label}")


class _FakeDb:
    """execute_query の呼び出しを記録し、設定した既存選手だけ返す"""

    def __init__(self, by_name=None, by_jsta=None, by_discord=None):
        self.by_name = by_name
        self.by_jsta = by_jsta
        self.by_discord = by_discord
        self.ops = []
        self.next_id = 100

    async def execute_query(self, table, operation='select', filters=None, data=None, columns='*', json_fields=None):
        self.ops.append((table, operation, filters, data))
        filters = filters or {}
        if operation == 'select':
            if 'discord_id' in filters:
                return {'data': [self.by_discord] if self.by_discord else [], 'error': None}
            if 'jsta_number' in filters:
                return {'data': [self.by_jsta] if self.by_jsta else [], 'error': None}
            if 'player_name' in filters and 'birth_date' in filters:
                return {'data': [self.by_name] if self.by_name else [], 'error': None}
            if 'player_id' in filters:
                inserted = self.inserted()
                if inserted and filters['player_id'] == self.next_id:
                    return {'data': [{'player_id': self.next_id, **inserted[0]}], 'error': None}
                return {'data': [], 'error': None}
            return {'data': [], 'error': None}
        if operation == 'insert':
            return {'data': [{'id': self.next_id}], 'error': None}
        return {'data': [], 'error': None}

    def inserted(self):
        return [op[3] for op in self.ops if op[0] == 'player_mst' and op[1] == 'insert']


_VALID = dict(
    last_name='山田', first_name='太郎', last_name_kana='ヤマダ', first_name_kana='タロウ',
    jsta_number='12345678', birth_date='1990-01-01', sex=0,
    post_number='114-0034', address='東京都北区上十条1-2-3', phone_number='090-1234-5678',
    affiliated_club='十条クラブ',
)

_EXISTING = {
    'player_id': 7, 'player_name': '山田 太郎', 'birth_date': '1990-01-01', 'discord_id': None,
    'address': '東京都北区上十条1-2-3', 'phone_number': '090-1234-5678', 'jsta_number': 'JSTA12345678',
}


def _self_register(body: dict, fake: _FakeDb):
    orig = P.db
    P.db = fake
    try:
        try:
            result = asyncio.run(P.self_register_player(P.PlayerSelfRegister(**body)))
            return 200, result
        except P.HTTPException as e:
            return e.status_code, e.detail
    finally:
        P.db = orig


def _create_player(body: dict, fake: _FakeDb):
    orig = P.db
    P.db = fake
    try:
        try:
            result = asyncio.run(P.create_player(P.PlayerCreate(**body)))
            return 200, result
        except P.HTTPException as e:
            return e.status_code, e.detail
    finally:
        P.db = orig


# ===== 必須チェック =====
print("\n▼ 全項目必須")
for field in P.SELF_REGISTER_FIELD_LABELS:
    fake = _FakeDb()
    status, detail = _self_register({**_VALID, field: ''}, fake)
    label = P.SELF_REGISTER_FIELD_LABELS[field]
    check(f"{label} が空なら400", status, 400)
    check(f"{label} が未入力エラーに含まれる", label in str(detail), True)
    check(f"{label} が空なら登録しない", fake.inserted(), [])

fake = _FakeDb()
status, detail = _self_register({**_VALID, 'affiliated_club': '   '}, fake)
check("空白のみは未入力扱い（400）", status, 400)
check("空白のみは登録しない", fake.inserted(), [])

fake = _FakeDb()
status, detail = _self_register({**_VALID, 'last_name': '', 'phone_number': ' '}, fake)
check("複数の未入力をまとめて返す", '姓' in str(detail) and '電話番号' in str(detail), True)

fake = _FakeDb()
status, detail = _self_register({**_VALID, 'sex': 2}, fake)
check("性別が0/1以外なら400", status, 400)
check("性別不正は登録しない", fake.inserted(), [])


# ===== 連盟番号の形式チェック（選手登録と同じ規則） =====
print("\n▼ 連盟番号の形式チェック")
fake = _FakeDb()
status, detail = _self_register({**_VALID, 'jsta_number': '1234567'}, fake)
check("7桁は400", status, 400)
check("桁数のメッセージ", '8桁' in str(detail), True)
check("7桁は登録しない", fake.inserted(), [])

fake = _FakeDb()
status, detail = _self_register({**_VALID, 'jsta_number': '-'}, fake)
check("'-' のみは未入力として400", status, 400)
check("未入力のメッセージ", '入力してください' in str(detail), True)
check("'-' は登録しない", fake.inserted(), [])

fake = _FakeDb()
status, detail = _self_register({**_VALID, 'jsta_number': 'abc'}, fake)
check("数字以外は400", status, 400)

fake = _FakeDb()
status, result = _self_register({**_VALID, 'jsta_number': 'JSTA １２３４５６７８'}, fake)
check("全角・接頭辞付きも正規化して受け付ける", status, 200)
check("正規化して保存する", fake.inserted()[0]['jsta_number'], 'JSTA12345678')


# ===== 正常登録 =====
print("\n▼ 正常登録")
fake = _FakeDb()
status, result = _self_register({**_VALID, 'first_name': ' 太郎 '}, fake)
check("200", status, 200)
check("1件登録する", len(fake.inserted()), 1)
row = fake.inserted()[0]
check("Discord ID は保存しない", 'discord_id' in row, False)
check("登録者(created_by)は保存しない", 'created_by' in row, False)
check("会員レベルは保存しない", 'member_level' in row, False)
check("氏名は空白を除いて「姓 名」で保存", row['player_name'], '山田 太郎')
check("カナは「セイ メイ」で保存", row['player_name_kana'], 'ヤマダ タロウ')
check("所属クラブを保存", row['affiliated_club'], '十条クラブ')
check("性別を保存", row['sex'], 0)
check("連盟番号を保存", row['jsta_number'], 'JSTA12345678')
check("応答は player_id / player_name / created のみ", sorted(result.keys()), ['created', 'player_id', 'player_name'])
check("応答: created=True", result['created'], True)
check("応答: player_id", result['player_id'], 100)
check("応答: player_name", result['player_name'], '山田 太郎')


# ===== 重複 =====
print("\n▼ 重複時の扱い")
fake = _FakeDb(by_name=dict(_EXISTING))
status, result = _self_register(_VALID, fake)
check("氏名＋生年月日が同じ選手がいれば200", status, 200)
check("新規作成しない", fake.inserted(), [])
check("応答: created=False", result['created'], False)
check("応答: 既存の player_id", result['player_id'], 7)
check("既存選手の住所・電話番号は返さない", sorted(result.keys()), ['created', 'player_id', 'player_name'])
check("既存選手の Discord ID を書き換えない", [op for op in fake.ops if op[1] == 'update'], [])

fake = _FakeDb(by_jsta=dict(_EXISTING))
status, detail = _self_register(_VALID, fake)
check("連盟番号が登録済みなら409", status, 409)
check("409は登録しない", fake.inserted(), [])
check("409の応答に住所・電話番号を含まない", '090-1234-5678' in str(detail), False)


# ===== 既存の POST /players（共通化の回帰確認） =====
print("\n▼ POST /players はこれまでどおり")
fake = _FakeDb()
status, result = _create_player({
    'discord_id': '111', 'player_name': '佐藤 花子', 'birth_date': '1992-02-02', 'sex': 1,
    'post_number': '114-0034', 'address': '東京都北区上十条1-2-3', 'phone_number': '090-1111-2222',
    'created_by': '111',
}, fake)
check("新規登録は200", status, 200)
check("採番IDを 'id' として返す（互換）", result.get('id'), 100)
check("player_id も返す", result.get('player_id'), 100)
check("Discord ID を保存する", fake.inserted()[0]['discord_id'], '111')
check("登録者を保存する", fake.inserted()[0]['created_by'], '111')

fake = _FakeDb(by_discord={**_EXISTING, 'discord_id': '111'})
status, result = _create_player({
    'discord_id': '111', 'player_name': '山田 太郎', 'birth_date': '1990-01-01', 'sex': 0,
    'post_number': '114-0034', 'address': '東京都北区上十条1-2-3', 'phone_number': '090-1234-5678',
}, fake)
check("Discord ID が登録済みなら既存行をそのまま返す", result.get('player_id'), 7)
check("既存行は全項目返す（ログイン後の画面が使う）", result.get('address'), '東京都北区上十条1-2-3')
check("新規作成しない", fake.inserted(), [])

fake = _FakeDb(by_name=dict(_EXISTING))
status, result = _create_player({
    'discord_id': '222', 'player_name': '山田 太郎', 'birth_date': '1990-01-01', 'sex': 0,
    'post_number': '114-0034', 'address': '東京都北区上十条1-2-3', 'phone_number': '090-1234-5678',
}, fake)
check("氏名＋生年月日一致で Discord ID 未設定なら紐付ける", result.get('discord_id'), '222')
check("紐付けの update を発行する", [op[3] for op in fake.ops if op[1] == 'update'], [{'discord_id': '222'}])

fake = _FakeDb(by_jsta=dict(_EXISTING))
status, detail = _create_player({
    'discord_id': '333', 'player_name': '鈴木 一郎', 'birth_date': '1980-03-03', 'sex': 0,
    'jsta_number': '12345678',
    'post_number': '114-0034', 'address': '東京都北区上十条1-2-3', 'phone_number': '090-1234-5678',
}, fake)
check("連盟番号の重複は409のまま", status, 409)

print()
if _failures:
    print(f"❌ {len(_failures)}件失敗")
    for f in _failures:
        print(f"  - {f}")
    sys.exit(1)
print("✅ すべて成功")
