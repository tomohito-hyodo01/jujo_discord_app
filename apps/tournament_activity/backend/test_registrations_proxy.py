#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
代理申込（自分をメンバーに含めないチーム作成）の管理者限定チェックの動作確認

DBにもDiscordにも接続せず、POST /api/registrations が
・管理者以外の代理申込を 403 で止めて登録しないこと
・管理者の代理申込と、通常の申込はこれまでどおり登録されること
を検証する。

実行:
    cd apps/tournament_activity/backend
    python test_registrations_proxy.py
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

import api.routers.registrations as R  # noqa: E402

_failures = []


def check(label, actual, expected):
    if actual == expected:
        print(f"  ✅ {label}")
    else:
        _failures.append(f"{label}\n     actual  : {actual!r}\n     expected: {expected!r}")
        print(f"  ❌ {label}")


# ===== 判定関数 =====
print("\n▼ 代理申込の可否判定（_can_proxy_register）")
check("管理者(admin_role=0)は可", R._can_proxy_register({'admin_role': 0}), True)
check("大会申込管理者(1)は不可", R._can_proxy_register({'admin_role': 1}), False)
check("一般(2)は不可", R._can_proxy_register({'admin_role': 2}), False)
check("admin_role未設定は不可", R._can_proxy_register({}), False)
check("選手未登録(None)は不可", R._can_proxy_register(None), False)
check("文字列の'0'は不可（型を厳密に見る）", R._can_proxy_register({'admin_role': '0'}), False)


# ===== エンドポイント（DBを差し替え） =====
print("\n▼ POST /registrations の代理申込チェック")


class _FakeDb:
    """execute_query の呼び出しを記録し、必要な行だけ返す"""

    def __init__(self, applicant_row):
        self.applicant_row = applicant_row
        self.ops = []

    async def execute_query(self, table, operation='select', filters=None, data=None, columns='*', json_fields=None):
        self.ops.append((table, operation, filters, data))
        if table == 'tournament_mst' and operation == 'select':
            return {'data': [{'tournament_id': 'T1', 'tournament_name': '秋季クラブ対抗戦', 'classification': 1,
                              'registrated_ward': 7, 'deadline_date': None}], 'error': None}
        if table == 'player_mst' and operation == 'select' and filters and 'discord_id' in filters:
            return {'data': [self.applicant_row] if self.applicant_row else [], 'error': None}
        if operation == 'insert':
            return {'data': [{'id': 1, **(data or {})}], 'error': None}
        return {'data': [], 'error': None}

    def inserted(self):
        return [op for op in self.ops if op[1] == 'insert' and op[0] == 'tournament_registration']


def _call(applicant_row, is_proxy):
    fake = _FakeDb(applicant_row)
    orig = R.db
    R.db = fake
    try:
        reg = R.RegistrationCreate(discord_id='111', tournament_id='T1', type='一般', sex=0,
                                   pair1=10, pair2=[11, 12, 13], team_status=0, is_proxy=is_proxy)
        try:
            asyncio.run(R.create_registration(reg))
            status = 200
        except R.HTTPException as e:
            status = e.status_code
            fake.detail = e.detail
        return status, fake
    finally:
        R.db = orig


_admin = {'player_id': 1, 'player_name': '兵頭', 'discord_id': '111', 'admin_role': 0}
_member = {'player_id': 2, 'player_name': '一般会員', 'discord_id': '111', 'admin_role': 2}

_status, _fake = _call(_member, is_proxy=True)
check("一般会員の代理申込は403", _status, 403)
check("403の理由", '管理者のみ' in getattr(_fake, 'detail', ''), True)
check("登録は行わない", _fake.inserted(), [])

_status, _fake = _call(_admin, is_proxy=True)
check("管理者の代理申込は通る", _status, 200)
check("登録される", len(_fake.inserted()), 1)
check("is_proxy はDBに書かない（列が無い）", 'is_proxy' in _fake.inserted()[0][3], False)

_status, _fake = _call(_member, is_proxy=False)
check("一般会員の通常のチーム作成はこれまでどおり通る", _status, 200)
check("登録される", len(_fake.inserted()), 1)

_status, _fake = _call(None, is_proxy=True)
check("選手未登録の代理申込は403", _status, 403)

print()
if _failures:
    print(f"❌ {len(_failures)}件失敗")
    for f in _failures:
        print(f"  - {f}")
    sys.exit(1)
print("✅ すべて成功")
