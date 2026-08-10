#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
練習前日リマインド（/api/practice/notify-tomorrow-participants）の動作確認

DBにもDiscordにも接続せず、メッセージ組み立て・分割・送信済み判定・
対象練習の絞り込みを検証する。

実行:
    cd apps/tournament_activity/backend
    python test_practice_reminder.py
"""

import asyncio
import os
import sys
import types
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

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

import api.routers.practice as P  # noqa: E402

_failures = []


def check(label, actual, expected):
    if actual == expected:
        print(f"  ✅ {label}")
    else:
        _failures.append(f"{label}\n     actual  : {actual!r}\n     expected: {expected!r}")
        print(f"  ❌ {label}")


# ===== 日付整形 =====
print("\n▼ 日付整形")
check("date型", P._format_practice_date(date(2026, 8, 11)), "2026/08/11(火)")
check("文字列", P._format_practice_date("2026-08-11"), "2026/08/11(火)")
check("datetime型", P._format_practice_date(datetime(2026, 8, 11, 9, 0)), "2026/08/11(火)")
check("変換不能はそのまま", P._format_practice_date("不明"), "不明")
for _i in range(7):
    _d = date(2026, 8, 10) + timedelta(days=_i)  # 8/10=月曜
    check(f"曜日 {_d}", P._format_practice_date(_d)[-2], "月火水木金土日"[_d.weekday()])

# ===== メンション可否 =====
print("\n▼ discord_id の判定")
check("通常", P._mentionable_discord_id({'discord_id': '111111111111111111'}), '111111111111111111')
check("未連携(None)", P._mentionable_discord_id({'discord_id': None}), None)
check("空文字", P._mentionable_discord_id({'discord_id': ''}), None)
check("空白のみ", P._mentionable_discord_id({'discord_id': '  '}), None)
check("数字以外", P._mentionable_discord_id({'discord_id': 'everyone'}), None)
check("キー無し", P._mentionable_discord_id({}), None)

# ===== メッセージ組み立て =====
print("\n▼ メッセージ組み立て")
_practice = {
    'id': 1,
    'practice_date': date(2026, 8, 11),
    'start_time': timedelta(hours=19),           # TIME型はaiomysqlがtimedeltaで返す
    'end_time': timedelta(hours=21, minutes=30),
    'location': '荒川河川敷コート',
    'court_number': '3,4',
}
_participants = [
    {'player_id': 1, 'player_name': '山田太郎', 'discord_id': '111111111111111111'},
    {'player_id': 2, 'player_name': '鈴木花子', 'discord_id': '222222222222222222'},
    {'player_id': 3, 'player_name': '佐藤次郎', 'discord_id': None},
]
_content, _ids = P._build_reminder_message(_practice, _participants)
check("メンション対象は連携済みのみ", _ids, ['111111111111111111', '222222222222222222'])
check("TIME型を HH:MM に整形", "📅 2026/08/11(火) 19:00〜21:30" in _content, True)
check("場所とコート", "📍 荒川河川敷コート（コート3,4）" in _content, True)
check("人数", "【参加予定 3名】" in _content, True)
check("メンション行", "・<@111111111111111111> 山田太郎" in _content, True)
check("未連携は氏名のみ", "・佐藤次郎" in _content, True)
check("壊れたメンションを含まない", "<@None>" in _content or "<@>" in _content, False)
check("@everyoneを含まない", "@everyone" in _content, False)
check("URLを含まない", "http" in _content, False)
check("引数のdictを破壊しない", _practice['start_time'], timedelta(hours=19))

_c2, _ = P._build_reminder_message(
    {'id': 2, 'practice_date': '2026-08-12', 'start_time': None, 'end_time': None,
     'location': None, 'court_number': None},
    [{'player_name': '田中三郎', 'discord_id': '333333333333333333'}],
)
check("時刻なしでも壊れない", "📅 2026/08/12(水)\n" in _c2, True)
check("場所なしはフォールバック", "📍 場所未定" in _c2, True)
check("コートなしは括弧を出さない", "（コート" in _c2, False)

_c3, _ = P._build_reminder_message(
    {'id': 3, 'practice_date': '2026-08-12', 'start_time': '19:00:00', 'end_time': None,
     'location': 'A', 'court_number': None}, [])
check("開始時刻のみ", "📅 2026/08/12(水) 19:00〜\n" in _c3, True)
check("参加者0名", "【参加予定 0名】" in _c3, True)

# ===== 2000文字分割 =====
print("\n▼ Discordのメッセージ長対応")
check("短文は分割しない", P._split_for_discord("abc"), ["abc"])
_many = "\n".join(f"・<@{str(i).rjust(18, '1')}> 選手{i}" for i in range(200))
_chunks = P._split_for_discord(_many)
check("全チャンクが上限以下", all(len(c) <= 1900 for c in _chunks), True)
check("複数チャンクになる", len(_chunks) > 1, True)
check("内容が欠落しない", "\n".join(_chunks).replace("\n", ""), _many.replace("\n", ""))
_long = "x" * 5000
_lc = P._split_for_discord(_long)
check("1行が上限超でも分割される", all(len(c) <= 1900 for c in _lc), True)
check("長い1行も欠落しない", "".join(_lc), _long)

# ===== 送信フロー =====
print("\n▼ 送信フロー（_send_practice_reminder）")


def _run(coro):
    return asyncio.run(coro)


class _Stubs:
    """practice.py のI/O関数を差し替えて分岐を検証する"""

    def __init__(self, claim=True, participants=None, post_ok=True):
        self.claim = claim
        self.participants = participants if participants is not None else _participants
        self.post_ok = post_ok
        self.flag_calls = []
        self.posted = []
        self._orig = {}

    def __enter__(self):
        async def fake_claim(pid):
            return self.claim

        async def fake_fetch(pid):
            return self.participants

        async def fake_post(content, ids):
            self.posted.append((content, ids))
            return self.post_ok

        async def fake_flag(pid, sent):
            self.flag_calls.append((pid, sent))

        for name, fn in (('_claim_reminder', fake_claim),
                         ('_fetch_participants_with_discord', fake_fetch),
                         ('_post_reminder_to_channel', fake_post),
                         ('_set_reminder_sent_at', fake_flag)):
            self._orig[name] = getattr(P, name)
            setattr(P, name, fn)
        return self

    def __exit__(self, *exc):
        for name, fn in self._orig.items():
            setattr(P, name, fn)
        return False


with _Stubs() as s:
    r = _run(P._send_practice_reminder(_practice))
    check("送信成功のstatus", r['status'], 'sent')
    check("参加者数", r['participant_count'], 3)
    check("メンション数", r['mentioned_count'], 2)
    check("未連携者を返す", r['unlinked_names'], ['佐藤次郎'])
    check("送信済みフラグは触らない(claim済み)", s.flag_calls, [])

with _Stubs(claim=False) as s:
    r = _run(P._send_practice_reminder(_practice))
    check("送信済みならスキップ", (r['status'], r['reason']), ('skipped', 'already_sent'))
    check("スキップ時は投稿しない", s.posted, [])

with _Stubs(claim=None) as s:
    # reminder_sent_at 未追加（ALTER未適用）でも送信は止めない
    r = _run(P._send_practice_reminder(_practice))
    check("判定不能でも送信する", r['status'], 'sent')

with _Stubs(participants=[]) as s:
    r = _run(P._send_practice_reminder(_practice))
    check("参加者0名はスキップ", (r['status'], r['reason']), ('skipped', 'no_participants'))
    check("フラグをNULLへ戻す", s.flag_calls, [(1, False)])
    check("投稿しない", s.posted, [])

with _Stubs(post_ok=False) as s:
    r = _run(P._send_practice_reminder(_practice))
    check("送信失敗のstatus", (r['status'], r['reason']), ('failed', 'discord_error'))
    check("失敗時はフラグをNULLへ戻す(再送可能)", s.flag_calls, [(1, False)])

with _Stubs(claim=False) as s:
    r = _run(P._send_practice_reminder(_practice, force=True))
    check("force時は送信済みでも送る", r['status'], 'sent')
    check("force時は送信後にフラグを立てる", s.flag_calls, [(1, True)])

# ===== Discordへの投稿 =====
print("\n▼ Discordへの投稿（_post_reminder_to_channel）")


class _FakeResponse:
    def __init__(self, status_code, headers=None):
        self.status_code = status_code
        self.headers = headers or {}
        self.text = ''


class _FakeClient:
    """httpx.AsyncClient の差し替え。statuses に返すステータスを順番に並べる"""

    calls = []
    statuses = []

    def __init__(self, *a, **kw):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def post(self, url, headers=None, json=None, timeout=None):
        _FakeClient.calls.append({'url': url, 'json': json})
        status = _FakeClient.statuses.pop(0) if _FakeClient.statuses else 200
        return _FakeResponse(status, {'Retry-After': '0'})


def _post_with_fake(content, ids, statuses=None):
    _FakeClient.calls = []
    _FakeClient.statuses = list(statuses or [])
    orig_client, orig_sleep = P.httpx.AsyncClient, P.asyncio.sleep

    async def no_sleep(_s):
        return None

    P.httpx.AsyncClient, P.asyncio.sleep = _FakeClient, no_sleep
    os.environ['DISCORD_BOT_TOKEN'] = 'dummy'
    try:
        ok = _run(P._post_reminder_to_channel(content, ids))
    finally:
        P.httpx.AsyncClient, P.asyncio.sleep = orig_client, orig_sleep
        os.environ.pop('DISCORD_BOT_TOKEN', None)
    return ok, list(_FakeClient.calls)


_ok, _calls = _post_with_fake('こんばんは', ['111111111111111111'])
check("投稿成功", _ok, True)
check("1通だけ送る", len(_calls), 1)
check("投稿先URL", _calls[0]['url'],
      f"https://discord.com/api/v10/channels/{P.PRACTICE_REMINDER_CHANNEL_ID}/messages")
check("everyone/ロールを許可しない", _calls[0]['json']['allowed_mentions']['parse'], [])
check("指定ユーザーのみ許可", _calls[0]['json']['allowed_mentions']['users'], ['111111111111111111'])

_ok, _calls = _post_with_fake('a', [str(i).rjust(18, '1') for i in range(101)])
check("100件超はparse指定へ切替", _calls[0]['json']['allowed_mentions'], {'parse': ['users']})

_ok, _calls = _post_with_fake("\n".join(f"・<@{str(i).rjust(18, '1')}> 選手{i}" for i in range(200)), [])
check("長文は分割して複数回投稿", len(_calls) > 1, True)
check("分割時も全て成功", _ok, True)

_ok, _calls = _post_with_fake('a', [], statuses=[429, 200])
check("429は1度だけ再送する", (_ok, len(_calls)), (True, 2))

_ok, _calls = _post_with_fake('a', [], statuses=[500])
check("失敗はFalseを返す", _ok, False)

_prev_token = os.environ.pop('DISCORD_BOT_TOKEN', None)
check("トークン未設定はFalse", _run(P._post_reminder_to_channel('a', [])), False)
if _prev_token is not None:
    os.environ['DISCORD_BOT_TOKEN'] = _prev_token

# ===== 対象練習の絞り込み =====
print("\n▼ 対象練習の絞り込み（notify_tomorrow_participants）")


class _FakeDB:
    def __init__(self, rows):
        self.rows = rows
        self.filters = None

    async def execute_query(self, table, operation='select', filters=None, **kw):
        self.filters = filters
        return {'data': self.rows, 'error': None}


def _call_endpoint(rows, **kwargs):
    fake = _FakeDB(rows)
    orig_db, orig_send = P.db, P._send_practice_reminder
    sent = []

    async def fake_send(practice, force=False):
        sent.append(practice['id'])
        return {'practice_id': practice['id'], 'status': 'sent'}

    P.db, P._send_practice_reminder = fake, fake_send
    os.environ['DISCORD_BOT_TOKEN'] = 'dummy'
    try:
        res = _run(P.notify_tomorrow_participants(**kwargs))
    finally:
        P.db, P._send_practice_reminder = orig_db, orig_send
        os.environ.pop('DISCORD_BOT_TOKEN', None)
    return res, sent, fake


_rows = [
    {'id': 10, 'practice_date': '2026-08-11', 'status': None, 'visibility': 'public'},
    {'id': 11, 'practice_date': '2026-08-11', 'status': 'cancelled', 'visibility': 'public'},
    {'id': 12, 'practice_date': '2026-08-11', 'status': None, 'visibility': 'invited'},
    {'id': 13, 'practice_date': '2026-08-11', 'status': None, 'visibility': None},
    {'id': 14, 'practice_date': '2026-08-11', 'status': None, 'visibility': 'members_regular'},
]
_res, _sent, _fake = _call_endpoint(_rows, target_date='2026-08-11')
check("中止と招待制を除いて送信", _sent, [10, 13, 14])
check("送信件数", _res['sent_count'], 3)
check("中止のスキップ理由", next(r['reason'] for r in _res['results'] if r['practice_id'] == 11), 'cancelled')
check("招待制のスキップ理由", next(r['reason'] for r in _res['results'] if r['practice_id'] == 12), 'visibility_restricted')
check("指定日で検索", _fake.filters, {'practice_date': '2026-08-11'})

_res2, _, _fake2 = _call_endpoint([])
check("既定はJSTの翌日", _fake2.filters, {'practice_date': (P._today_jst() + timedelta(days=1)).isoformat()})
check("対象0件でも成功", (_res2['success'], _res2['sent_count']), (True, 0))

# ===== 設定 =====
print("\n▼ 設定")
check("投稿先はinfoチャンネル", P.PRACTICE_REMINDER_CHANNEL_ID, '1427122263383216188')
check("招待制は対象外", P.REMINDER_EXCLUDED_VISIBILITIES, {'invited'})
check("JSTは+9時間固定", P.JST.utcoffset(None), timedelta(hours=9))
check("サーバTZに依存しない今日", P._today_jst(), datetime.now(P.JST).date())

print()
if _failures:
    print(f"❌ {len(_failures)}件失敗")
    for f in _failures:
        print(f"  - {f}")
    sys.exit(1)
print("✅ すべて成功")
