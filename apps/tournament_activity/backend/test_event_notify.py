#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
イベント・日程アンケートの Discord 通知（/api/events/{id}/notify, /api/event-polls/{id}/notify）の動作確認

DB・Discord には接続せず、文面・送り方の選択・管理者の確認・送信先・
DM の届いた人数・通知の記録を検証する。

実行:
    cd apps/tournament_activity/backend
    python test_event_notify.py
"""

import asyncio
import os
import sys
import types
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, 'reconfigure'):
        _stream.reconfigure(encoding='utf-8', errors='replace')

for _name in ('aiomysql', 'httpx'):
    try:
        __import__(_name)
    except ImportError:  # pragma: no cover
        _stub = types.ModuleType(_name)
        _stub.DictCursor = object
        _stub.Pool = object
        _stub.AsyncClient = object
        sys.modules[_name] = _stub

from fastapi import HTTPException  # noqa: E402

import api.routers.event_notify as N  # noqa: E402

_failures = []


def check(label, actual, expected):
    if actual == expected:
        print(f"  ✅ {label}")
    else:
        _failures.append(f"{label}\n     actual  : {actual!r}\n     expected: {expected!r}")
        print(f"  ❌ {label}")


def _run(coro):
    return asyncio.run(coro)


# ===== 偽のDB・Discord =====

class _FakeCursor:
    def __init__(self, responder):
        self.responder = responder
        self.executed = []
        self.rows = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def execute(self, sql, params=None):
        sql = ' '.join(sql.split())
        self.executed.append((sql, params))
        self.rows = list(self.responder(sql, params))

    async def fetchone(self):
        return self.rows[0] if self.rows else None

    async def fetchall(self):
        return self.rows


class _FakeConn:
    def __init__(self, cursor):
        self._cursor = cursor

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    def cursor(self, *a, **kw):
        return self._cursor


class _FakePool:
    def __init__(self, cursor):
        self._cursor = cursor

    def acquire(self):
        return _FakeConn(self._cursor)


class _Res:
    def __init__(self, status, payload=None, headers=None):
        self.status_code = status
        self._payload = payload or {}
        self.headers = headers or {}
        self.text = ''

    def json(self):
        return self._payload


class _FakeClient:
    """Discord への POST を記録する。dm_fail に入れた ID は DM チャンネル作成で失敗させる"""
    posts = []
    webhook_status = 204
    dm_fail = set()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def post(self, url, headers=None, json=None, timeout=None):
        _FakeClient.posts.append((url, json))
        if url.endswith('/users/@me/channels'):
            if json['recipient_id'] in _FakeClient.dm_fail:
                return _Res(403)
            return _Res(200, {'id': f"dm-{json['recipient_id']}"})
        if '/channels/' in url:
            return _Res(200)
        return _Res(_FakeClient.webhook_status)


def _setup(players=None, events=None, responder=None):
    """偽のDB・Discordを差し込み、SQLを記録するカーソルを返す"""
    players = players if players is not None else {'admin': {'admin_role': 0}}
    events = events or {}

    async def execute_query(table, operation='select', filters=None, **kw):
        if table == 'player_mst':
            row = players.get(filters.get('discord_id'))
            return {'data': [row] if row else [], 'error': None}
        if table == 'events':
            row = events.get(filters.get('id'))
            return {'data': [row] if row else [], 'error': None}
        return {'data': [], 'error': None}

    cursor = _FakeCursor(responder or (lambda sql, p: []))
    N.db = types.SimpleNamespace(pool=_FakePool(cursor), execute_query=execute_query)
    N.httpx = types.SimpleNamespace(AsyncClient=_FakeClient)
    _FakeClient.posts = []
    _FakeClient.webhook_status = 204
    _FakeClient.dm_fail = set()
    os.environ[N.WEBHOOK_ENV] = 'https://discord.example/webhook'
    os.environ['DISCORD_BOT_TOKEN'] = 'token'
    N._table_ready = True
    return cursor


def _call(fn):
    try:
        return _run(fn())
    except HTTPException as e:
        return e


def _inserts(cursor):
    return [(s, p) for s, p in cursor.executed if s.startswith('INSERT INTO event_notifications')]


# ===== 文面 =====
print("\n▼ イベントの文面")
_event = {'id': 300, 'title': '忘年会', 'event_date': date(2026, 12, 12), 'start_time': timedelta(hours=19),
          'end_time': timedelta(hours=21), 'location': '北千住駅周辺', 'deadline_date': datetime(2026, 11, 20, 23, 59),
          'max_participants': 10, 'visibility': 'public'}
check("チャンネル（@everyone 付き）", N.build_event_message(_event, dm=False),
      "@everyone\n📢 **イベントのお知らせ**\n\n**忘年会**\n- 日付: 2026/12/12(土)\n- 時間: 19:00〜21:00\n"
      "- 場所: 北千住駅周辺\n- 参加締切: 11/20(金) 23:59\n- 定員: 10名\n\n"
      "アプリのイベント一覧から参加できます\nhttps://tournament.jujo-softtennis.com/")
_dm = N.build_event_message(_event, dm=True)
check("DM は @everyone なし・メンバー限定と書く", (_dm.startswith('📢 **イベントのお知らせ（メンバー限定）**'), '@everyone' in _dm),
      (True, False))
check("空の項目は書かない",
      N.build_event_message({'title': '練習試合', 'event_date': '2026-11-29', 'start_time': None, 'end_time': None}, dm=False),
      "@everyone\n📢 **イベントのお知らせ**\n\n**練習試合**\n- 日付: 2026/11/29(日)\n\n"
      "アプリのイベント一覧から参加できます\nhttps://tournament.jujo-softtennis.com/")
check("終了時刻なし", N._time_range({'start_time': '13:00', 'end_time': None}), '13:00〜')
check("文字列の締切も読める", N._fmt_deadline('2026-11-20T09:05:00'), '11/20(金) 9:05')

print("\n▼ アンケートの文面")
_poll = {'id': 1, 'title': '忘年会', 'start_time': timedelta(hours=19), 'end_time': timedelta(hours=21),
         'location': None, 'deadline_date': datetime(2026, 11, 20, 23, 59), 'visibility': 'invited', 'status': 'open'}
_dates = [date(2026, 12, 12), date(2026, 12, 19), date(2026, 12, 20)]
check("チャンネル（@everyone 付き）", N.build_poll_message(_poll, _dates, dm=False),
      "@everyone\n📢 **日程アンケートのお願い**\n\n**忘年会**\n- 候補日: 12/12(土)・12/19(土)・12/20(日)\n"
      "- 時間: 19:00〜21:00\n- 回答締切: 11/20(金) 23:59\n\n"
      "参加できる日に ○ を付けてください。アプリのイベント一覧から回答できます\nhttps://tournament.jujo-softtennis.com/")
check("DM は @everyone なし", '@everyone' in N.build_poll_message(_poll, _dates, dm=True), False)

# ===== イベントの通知 =====
print("\n▼ イベントの通知")
_cur = _setup(events={300: _event})
_res = _call(lambda: N.notify_event(300, N.NotifyRequest(method='channel', actor_discord_id='admin')))
check("チャンネルに送れる", (_res['success'], _res['method'], _res['sent_count'], _res['failed_count']),
      (True, 'channel', 1, 0))
check("大会通知と同じ Webhook に、@everyone を有効にして送る", _FakeClient.posts,
      [('https://discord.example/webhook',
        {'content': N.build_event_message(_event, False), 'allowed_mentions': {'parse': ['everyone']}})])
check("通知を記録する", [(p[0], p[1], p[2], p[3], p[4], p[5]) for _, p in _inserts(_cur)],
      [('event', 300, 'channel', 1, 0, 'admin')])

_setup(players={'admin1': {'admin_role': 1}}, events={300: _event})
check("大会申込管理者も送れる",
      _call(lambda: N.notify_event(300, N.NotifyRequest(method='channel', actor_discord_id='admin1')))['success'], True)

_cur = _setup(players={'member': {'admin_role': 2}}, events={300: _event})
_res = _call(lambda: N.notify_event(300, N.NotifyRequest(method='channel', actor_discord_id='member')))
check("一般メンバーは 403・送らない", (_res.status_code, _FakeClient.posts, _inserts(_cur)), (403, [], []))
_res = _call(lambda: N.notify_event(300, N.NotifyRequest(method='channel')))
check("操作者なしは 403", _res.status_code, 403)
_res = _call(lambda: N.notify_event(300, N.NotifyRequest(method='mail', actor_discord_id='admin')))
check("知らない送り方は 400", _res.status_code, 400)

_cur = _setup(events={300: _event})
_res = _call(lambda: N.notify_event(300, N.NotifyRequest(method='dm', actor_discord_id='admin')))
check("全体公開は DM できない（400・送らない）", (_res.status_code, _FakeClient.posts), (400, []))

_setup(events={})
check("無いイベントは 404",
      _call(lambda: N.notify_event(999, N.NotifyRequest(method='channel', actor_discord_id='admin'))).status_code, 404)

_cur = _setup(events={300: _event})
_FakeClient.webhook_status = 500
_res = _call(lambda: N.notify_event(300, N.NotifyRequest(method='channel', actor_discord_id='admin')))
check("チャンネルへの送信に失敗したら 500・記録しない", (_res.status_code, _inserts(_cur)), (500, []))

_cur = _setup(events={300: _event})
os.environ[N.WEBHOOK_ENV] = ''
_res = _call(lambda: N.notify_event(300, N.NotifyRequest(method='channel', actor_discord_id='admin')))
check("送り先が未設定なら 500・送らない", (_res.status_code, _FakeClient.posts), (500, []))

print("\n▼ メンバー限定イベントの DM")
_inv_event = {**_event, 'visibility': 'invited'}


def _invited(rows):
    def responder(sql, p):
        if sql.startswith('SELECT p.discord_id FROM event_invitations'):
            return rows
        return []
    return responder


_cur = _setup(events={300: _inv_event},
              responder=_invited([{'discord_id': 'u1'}, {'discord_id': 'u2'}, {'discord_id': None},
                                  {'discord_id': 'u1'}, {'discord_id': 'u3'}]))
_FakeClient.dm_fail = {'u3'}
_res = _call(lambda: N.notify_event(300, N.NotifyRequest(method='dm', actor_discord_id='admin')))
check("招待メンバーのSQL", _cur.executed[0],
      ("SELECT p.discord_id FROM event_invitations i LEFT JOIN player_mst p ON p.player_id = i.player_id "
       "WHERE i.event_id = %s", (300,)))
check("届いた人数・届かなかった人数（ID未登録と送信失敗）", (_res['success'], _res['sent_count'], _res['failed_count']),
      (True, 2, 2))
check("同じ人に2回送らない・@everyone は使わない",
      [j for u, j in _FakeClient.posts if u.endswith('/messages')],
      [{'content': N.build_event_message(_inv_event, True), 'allowed_mentions': {'parse': []}}] * 2)
check("DM 先", [j['recipient_id'] for u, j in _FakeClient.posts if u.endswith('/users/@me/channels')], ['u1', 'u2', 'u3'])
check("DM の記録", [p[2:5] for _, p in _inserts(_cur)], [('dm', 2, 2)])

_cur = _setup(events={300: _inv_event}, responder=_invited([{'discord_id': 'u1'}]))
_res = _call(lambda: N.notify_event(300, N.NotifyRequest(method='channel', actor_discord_id='admin')))
check("メンバー限定でもチャンネルを選べる", (_res['method'], _FakeClient.posts[0][0]),
      ('channel', 'https://discord.example/webhook'))

_cur = _setup(events={300: _inv_event}, responder=_invited([{'discord_id': ''}, {'discord_id': None}]))
_res = _call(lambda: N.notify_event(300, N.NotifyRequest(method='dm', actor_discord_id='admin')))
check("誰にも届かなければ通知済にしない", (_res['success'], _res['sent_count'], _res['failed_count'], _inserts(_cur)),
      (False, 0, 2, []))

_cur = _setup(events={300: _inv_event}, responder=_invited([]))
check("招待メンバーがいなければ 400",
      _call(lambda: N.notify_event(300, N.NotifyRequest(method='dm', actor_discord_id='admin'))).status_code, 400)

# ===== アンケートの通知 =====
print("\n▼ アンケートの通知")


def _poll_db(poll, invited=()):
    def responder(sql, p):
        if sql.startswith('SELECT * FROM event_date_polls'):
            return [poll] if poll else []
        if sql.startswith('SELECT option_date FROM event_date_poll_options'):
            return [{'option_date': d} for d in _dates]
        if sql.startswith('SELECT p.discord_id FROM event_date_poll_invitations'):
            return [{'discord_id': d} for d in invited]
        return []
    return responder


_cur = _setup(responder=_poll_db(_poll, invited=['u1', 'u2']))
_res = _call(lambda: N.notify_event_poll(1, N.NotifyRequest(method='dm', actor_discord_id='admin')))
check("メンバー限定アンケートの DM", (_res['sent_count'], _res['failed_count']), (2, 0))
check("候補日は日付順で取る", any(s == "SELECT option_date FROM event_date_poll_options WHERE poll_id = %s ORDER BY option_date"
                              for s, _ in _cur.executed), True)
check("アンケートの招待メンバーに送る", any(s.startswith('SELECT p.discord_id FROM event_date_poll_invitations')
                                    and s.endswith('WHERE i.poll_id = %s') for s, _ in _cur.executed), True)
check("アンケートとして記録", [p[:3] for _, p in _inserts(_cur)], [('poll', 1, 'dm')])

_cur = _setup(responder=_poll_db({**_poll, 'visibility': 'public'}))
_res = _call(lambda: N.notify_event_poll(1, N.NotifyRequest(method='channel', actor_discord_id='admin')))
check("全体公開アンケートはチャンネルへ", (_res['method'], _FakeClient.posts[0][1]['content'].startswith('@everyone\n📢 **日程アンケートのお願い**')),
      ('channel', True))

_cur = _setup(responder=_poll_db({**_poll, 'status': 'decided'}))
_res = _call(lambda: N.notify_event_poll(1, N.NotifyRequest(method='channel', actor_discord_id='admin')))
check("決定済みのアンケートは 400・送らない", (_res.status_code, _FakeClient.posts), (400, []))
_cur = _setup(responder=_poll_db(None))
check("無いアンケートは 404",
      _call(lambda: N.notify_event_poll(1, N.NotifyRequest(method='channel', actor_discord_id='admin'))).status_code, 404)

# ===== 記録・テーブル =====
print("\n▼ 記録・テーブル")
_cur = _setup(responder=lambda sql, p: [{'target_type': 'event', 'target_id': 300, 'method': 'channel',
                                         'sent_count': 1, 'failed_count': 0, 'notified_at': datetime(2026, 11, 8, 10, 0)}])
_res = _call(lambda: N.get_event_notifications())
check("記録の一覧", (len(_res), _cur.executed[0][0]),
      (1, "SELECT target_type, target_id, method, sent_count, failed_count, notified_at FROM event_notifications ORDER BY id"))
_cur = _setup()
N._table_ready = False
_run(N._ensure_table())
check("テーブルが無ければ作る", _cur.executed[0][0].startswith('CREATE TABLE IF NOT EXISTS event_notifications'), True)
_cur = _setup()
_run(N._ensure_table())
check("2回目以降は作らない", _cur.executed, [])
check("記録時刻は秒精度", N._now_jst().microsecond, 0)
check("エンドポイント", sorted((r.path, sorted(r.methods)) for r in N.router.routes),
      [('/event-notifications', ['GET']), ('/event-polls/{poll_id}/notify', ['POST']), ('/events/{event_id}/notify', ['POST'])])

print()
if _failures:
    print(f"❌ {len(_failures)}件失敗")
    for f in _failures:
        print(f"  - {f}")
    sys.exit(1)
print("✅ すべて成功")
