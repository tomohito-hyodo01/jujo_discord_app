#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
申込可能な大会の取得（GET /api/tournaments/available/{discord_id}）の動作確認

DBに接続せず、次を検証する。
・一般会員は「自分が申し込んだ大会」「自分がペア/メンバーに入っている大会」が一覧から外れる
・管理者(admin_role=0)は自分の申込状況に関わらず一覧に残る（代理申込で複数チームを作るため）
・締切を過ぎた大会は誰でも外れる

実行:
    cd apps/tournament_activity/backend
    python test_available_tournaments.py
"""

import asyncio
import sys
import types
from datetime import date, timedelta
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

import api.routers.available_tournaments as A  # noqa: E402

_failures = []


def check(label, actual, expected):
    if actual == expected:
        print(f"  ✅ {label}")
    else:
        _failures.append(f"{label}\n     actual  : {actual!r}\n     expected: {expected!r}")
        print(f"  ❌ {label}")


class _FakeDb:
    def __init__(self, players, tournaments, registrations):
        self.players = players
        self.tournaments = tournaments
        self.registrations = registrations
        self.queries = []

    async def execute_query(self, table, operation='select', filters=None, data=None, columns='*', json_fields=None):
        self.queries.append((table, filters, columns))
        if table == 'player_mst':
            rows = [p for p in self.players if p['discord_id'] == filters['discord_id']]
            return {'data': rows, 'error': None}
        if table == 'tournament_mst':
            return {'data': list(self.tournaments), 'error': None}
        if table == 'tournament_registration':
            return {'data': list(self.registrations), 'error': None}
        return {'data': [], 'error': None}


_future = (date.today() + timedelta(days=30)).isoformat()
_past = (date.today() - timedelta(days=1)).isoformat()
_tournaments = [
    {'tournament_id': 'T1', 'tournament_name': '団体戦A', 'deadline_date': _future, 'type': ['一般']},
    {'tournament_id': 'T2', 'tournament_name': '団体戦B', 'deadline_date': _future, 'type': ['一般']},
    {'tournament_id': 'T3', 'tournament_name': '個人戦C', 'deadline_date': _future, 'type': ['一般']},
    {'tournament_id': 'T4', 'tournament_name': '締切済D', 'deadline_date': _past, 'type': ['一般']},
    {'tournament_id': 'T5', 'tournament_name': '未申込E', 'deadline_date': _future, 'type': ['一般']},
]
_players = [
    {'player_id': 1, 'discord_id': 'admin', 'admin_role': 0},
    {'player_id': 2, 'discord_id': 'member', 'admin_role': 2},
    {'player_id': 3, 'discord_id': 'tourney-admin', 'admin_role': 1},
]
_registrations = [
    {'tournament_id': 'T1', 'discord_id': 'admin', 'pair1': 10, 'pair2': [11, 12, 13]},    # 管理者の代理申込
    {'tournament_id': 'T1', 'discord_id': 'member', 'pair1': 20, 'pair2': [21, 22, 23]},   # 一般会員の申込
    {'tournament_id': 'T2', 'discord_id': 'other', 'pair1': 2, 'pair2': [1, 30]},          # 一般会員がpair1、管理者がpair2
    {'tournament_id': 'T3', 'discord_id': 'other', 'pair1': 3, 'pair2': None},             # 大会申込管理者がpair1
    {'tournament_id': 'T4', 'discord_id': 'other', 'pair1': 40, 'pair2': None},
]


def _available(discord_id):
    fake = _FakeDb(_players, _tournaments, _registrations)
    orig = A.db
    A.db = fake
    try:
        result = asyncio.run(A.get_available_tournaments(discord_id))
        return [t['tournament_id'] for t in result], fake
    finally:
        A.db = orig


print("\n▼ 一般会員")
_ids, _fake = _available('member')
check("自分が申し込んだ大会(T1)・pair1の大会(T2)は外れる", 'T1' in _ids or 'T2' in _ids, False)
check("締切済(T4)は外れる", 'T4' in _ids, False)
check("それ以外は残る", _ids, ['T3', 'T5'])
check("権限も一緒に取得する", _fake.queries[0][2], 'player_id, admin_role')

print("\n▼ 管理者（代理申込で同じ大会に複数チームを作れる）")
_ids, _ = _available('admin')
check("自分が申し込んだ大会(T1)が残る", 'T1' in _ids, True)
check("自分がpair2に入っている大会(T2)も残る", 'T2' in _ids, True)
check("締切済(T4)は管理者でも外れる", 'T4' in _ids, False)
check("一覧", _ids, ['T1', 'T2', 'T3', 'T5'])

print("\n▼ 大会申込管理者(admin_role=1)は一般会員と同じ扱い")
_ids, _ = _available('tourney-admin')
check("自分がpair1の大会(T3)は外れる", 'T3' in _ids, False)
check("一覧", _ids, ['T1', 'T2', 'T5'])

print("\n▼ 選手未登録の discord_id")
_ids, _ = _available('nobody')
check("申込が無いので締切前の大会がすべて残る", _ids, ['T1', 'T2', 'T3', 'T5'])

print()
if _failures:
    print(f"❌ {len(_failures)}件失敗")
    for f in _failures:
        print(f"  - {f}")
    sys.exit(1)
print("✅ すべて成功")
