#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
イベント・日程アンケートの公開範囲（正会員・準会員・ゲスト＋個人）の動作確認

DB には接続せず、値の読み方・保存する形・イベントの作成/更新/一覧での扱いを検証する。
画面側（frontend/src/utils/audience.ts）と同じ規則であることもここで確かめる。

実行:
    cd apps/tournament_activity/backend
    python test_audience.py
"""

import asyncio
import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, 'reconfigure'):
        _stream.reconfigure(encoding='utf-8', errors='replace')

try:
    import aiomysql  # noqa: F401
except ImportError:  # pragma: no cover
    _stub = types.ModuleType('aiomysql')
    _stub.DictCursor = object
    _stub.Pool = object
    sys.modules['aiomysql'] = _stub

from fastapi import HTTPException  # noqa: E402

import api.audience as A  # noqa: E402
import api.routers.events as EV  # noqa: E402

_failures = []


def check(label, actual, expected):
    if actual == expected:
        print(f"  ✅ {label}")
    else:
        _failures.append(f"{label}\n     actual  : {actual!r}\n     expected: {expected!r}")
        print(f"  ❌ {label}")


def _run(coro):
    try:
        return asyncio.run(coro)
    except HTTPException as e:
        return e


# ===== 値の読み方 =====
print("\n▼ 会員区分の読み方")
check("全員公開", A.parse_levels('public'), (0, 1, 2))
check("未設定は全員", A.parse_levels(None), (0, 1, 2))
check("個人だけ", A.parse_levels('invited'), ())
check("正会員", A.parse_levels('members:0'), (0,))
check("正会員・ゲスト", A.parse_levels('members:2,0'), (0, 2))
check("練習の値（全会員）", A.parse_levels('members_all'), (0, 1))
check("練習の値（正会員のみ）", A.parse_levels('members_regular'), (0,))
check("知らない区分は無視", A.parse_levels('members:0,5'), (0,))
check("不明な値は従来どおり全員", A.parse_levels('xyz'), (0, 1, 2))

print("\n▼ 保存する形")
check("全員公開はそのまま", A.normalize_visibility('public'), 'public')
check("個人だけはそのまま", A.normalize_visibility('invited'), 'invited')
check("未設定は全員公開", A.normalize_visibility(None), 'public')
check("区分は並べ替えて重複なし", A.normalize_visibility('members:1,0,1'), 'members:0,1')
check("全区分なら全員公開", A.normalize_visibility('members:2,1,0'), 'public')
check("区分なしは個人だけ", A.normalize_visibility('members:'), 'invited')
check("練習の値もそろえる", A.normalize_visibility('members_all'), 'members:0,1')
check("知らない区分は読めない", A.normalize_visibility('members:0,5'), None)
check("数字以外は読めない", A.normalize_visibility('members:a'), None)
check("不明な値は読めない", A.normalize_visibility('everyone'), None)
check("保存する形は VARCHAR(20) に収まる", max(len(A.normalize_visibility(v)) for v in
                                       ['members:0,1', 'members:0,2', 'members:1,2', 'members:0', 'public', 'invited']) <= 20, True)

print("\n▼ 絞っているか")
check("全員公開は絞っていない", A.is_restricted('public'), False)
check("全区分は絞っていない", A.is_restricted('members:0,1,2'), False)
check("個人だけは絞っている", A.is_restricted('invited'), True)
check("正会員は絞っている", A.is_restricted('members:0'), True)

# ===== イベントの作成・更新・一覧 =====
print("\n▼ イベント")
_calls = []


def _fake_db(events=None, invitations=None):
    events = events or []
    invitations = invitations or {}

    async def execute_query(table, operation='select', filters=None, data=None, **kw):
        _calls.append((table, operation, filters, data))
        if table == 'events' and operation == 'select':
            return {'data': [dict(e) for e in events], 'error': None}
        if table == 'event_invitations' and operation == 'select':
            return {'data': [{'player_id': p} for p in invitations.get(filters['event_id'], [])], 'error': None}
        if operation == 'insert':
            return {'data': [{'id': 5, **data}], 'error': None}
        return {'data': [], 'error': None}

    EV.db = types.SimpleNamespace(execute_query=execute_query)
    _calls.clear()


_fake_db()
_run(EV.create_event(EV.EventCreate(title='忘年会', event_date='2026-12-12', visibility='members:1,0')))
check("作成時に公開範囲をそろえて保存", _calls[-1][3]['visibility'], 'members:0,1')
_fake_db()
check("読めない公開範囲で作ると 400",
      _run(EV.create_event(EV.EventCreate(title='a', event_date='2026-12-12', visibility='x'))).status_code, 400)
_fake_db()
_run(EV.create_event(EV.EventCreate(title='a', event_date='2026-12-12')))
check("指定なしは全員公開", _calls[-1][3]['visibility'], 'public')
_fake_db()
_run(EV.update_event(1, EV.EventUpdate(visibility='members:0,1,2')))
check("更新時もそろえる（全区分→全員公開）", _calls[-1][3], {'visibility': 'public'})
_fake_db()
check("読めない公開範囲で更新すると 400", _run(EV.update_event(1, EV.EventUpdate(visibility='x'))).status_code, 400)

_fake_db(events=[{'id': 1, 'event_date': '2026-12-12', 'visibility': 'members:0'},
                 {'id': 2, 'event_date': '2026-12-13', 'visibility': 'invited'},
                 {'id': 3, 'event_date': '2026-12-14', 'visibility': 'public'}],
         invitations={1: [7], 2: [8], 3: [9]})
_list = _run(EV.get_events())
check("会員区分＋個人のイベントも、個人で選んだ人を返す", [e['invited_player_ids'] for e in _list], [[7], [8], []])

print()
if _failures:
    print(f"❌ {len(_failures)}件失敗")
    for f in _failures:
        print(f"  - {f}")
    sys.exit(1)
print("✅ すべて成功")
