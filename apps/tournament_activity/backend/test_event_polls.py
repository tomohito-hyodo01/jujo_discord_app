#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
日程アンケート（/api/event-polls）の動作確認

DB には接続せず、入力の検証・一覧の組み立て・発行SQL・作成者の確認・
回答締切・二重決定の防止・失敗時の巻き戻しを検証する。

実行:
    cd apps/tournament_activity/backend
    python test_event_polls.py
"""

import asyncio
import sys
import types
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

# Windowsの既定コンソール(cp932)でも絵文字を出せるようにする
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, 'reconfigure'):
        _stream.reconfigure(encoding='utf-8', errors='replace')

# 依存が入っていない環境（ローカルWindows等）でも動かせるよう、未導入のものだけ差し替える
try:
    import aiomysql  # noqa: F401
except ImportError:  # pragma: no cover
    _stub = types.ModuleType('aiomysql')
    _stub.DictCursor = object
    _stub.Pool = object
    sys.modules['aiomysql'] = _stub

from fastapi import HTTPException  # noqa: E402

import api.routers.event_polls as E  # noqa: E402

_failures = []


def check(label, actual, expected):
    if actual == expected:
        print(f"  ✅ {label}")
    else:
        _failures.append(f"{label}\n     actual  : {actual!r}\n     expected: {expected!r}")
        print(f"  ❌ {label}")


def _run(coro):
    return asyncio.run(coro)


def _status_of(fn):
    """HTTPException の status_code と detail。例外が出なければ None"""
    try:
        _run(fn())
    except HTTPException as e:
        return e.status_code, e.detail
    return None


def _status_of_sync(fn):
    try:
        fn()
    except HTTPException as e:
        return e.status_code, e.detail
    return None


# ===== 偽のDB =====

class _FakeCursor:
    """execute ごとに responder(sql, params) が (rows, rowcount, lastrowid) を返す"""

    def __init__(self, responder=None):
        self.responder = responder or (lambda sql, params: ([], 0, None))
        self.executed = []
        self.rows = []
        self.rowcount = 0
        self.lastrowid = None

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def execute(self, sql, params=None):
        sql = ' '.join(sql.split())
        self.executed.append((sql, params))
        rows, rowcount, lastrowid = self.responder(sql, params)
        self.rows = list(rows)
        self.rowcount = rowcount
        self.lastrowid = lastrowid

    async def executemany(self, sql, seq):
        sql = ' '.join(sql.split())
        self.executed.append((sql, list(seq)))
        self.rowcount = len(self.executed[-1][1])

    async def fetchone(self):
        return self.rows[0] if self.rows else None

    async def fetchall(self):
        return self.rows


class _FakeConn:
    def __init__(self, cursor):
        self._cursor = cursor
        self.log = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    def cursor(self, *a, **kw):
        return self._cursor

    async def begin(self):
        self.log.append('begin')

    async def commit(self):
        self.log.append('commit')

    async def rollback(self):
        self.log.append('rollback')


class _FakePool:
    def __init__(self, conn):
        self._conn = conn

    def acquire(self):
        return self._conn


def _with_db(responder, fn):
    """偽のDBで fn を実行し、(結果 or HTTPException, cursor, conn) を返す"""
    cursor = _FakeCursor(responder)
    conn = _FakeConn(cursor)
    orig = E.db
    E.db = types.SimpleNamespace(pool=_FakePool(conn))
    try:
        try:
            result = _run(fn())
        except HTTPException as e:
            result = e
    finally:
        E.db = orig
    return result, cursor, conn


def _sqls(cursor):
    return [sql for sql, _ in cursor.executed]


# ===== 入力の検証 =====
print("\n▼ 候補日")
check("重複を除いて日付順", E._normalize_option_dates(['2026-12-20', '2026-12-12', '2026-12-20', '2026-12-19']),
      ['2026-12-12', '2026-12-19', '2026-12-20'])
check("空欄は無視", E._normalize_option_dates(['2026-12-12', '', '  ', '2026-12-19']), ['2026-12-12', '2026-12-19'])
check("時刻つきでも日付だけ使う", E._normalize_option_dates(['2026-12-12T00:00', '2026-12-19']),
      ['2026-12-12', '2026-12-19'])
check("1日だけは不可", _status_of_sync(lambda: E._normalize_option_dates(['2026-12-12', '2026-12-12']))[0], 400)
check("形式違いは不可", _status_of_sync(lambda: E._normalize_option_dates(['12/12', '2026-12-19']))[0], 400)
check("21日以上は不可", _status_of_sync(lambda: E._normalize_option_dates(
    [(date(2026, 12, 1) + timedelta(days=i)).isoformat() for i in range(21)]))[0], 400)

print("\n▼ 作成時の値")
_body = E.PollCreate(title=' 忘年会 ', option_dates=['2026-12-12', '2026-12-19'], start_time='19:00', end_time='',
                     location='北千住駅周辺', deadline_date='2026-11-20T23:59', visibility='invited',
                     created_by='111', invited_player_ids=[3, 1, 3])
_row = E._poll_row(_body)
check("タイトルの前後の空白を除く", _row['title'], '忘年会')
check("空欄は NULL", _row['end_time'], None)
check("締切は DATETIME の形", _row['deadline_date'], '2026-11-20 23:59')
check("状態は受付中", _row['status'], 'open')
check("公開設定はそのまま", _row['visibility'], 'invited')
check("知らない公開設定は全体公開", E._poll_row(E.PollCreate(title='a', option_dates=[], visibility='x'))['visibility'],
      'public')
check("タイトル空は不可", _status_of_sync(lambda: E._poll_row(E.PollCreate(title='  ', option_dates=[])))[0], 400)

print("\n▼ 回答締切")
_now = datetime(2026, 11, 20, 23, 59, 30)
check("締切なしは受け付ける", E._deadline_passed(None, _now), False)
check("締切前", E._deadline_passed(datetime(2026, 11, 21, 0, 0), _now), False)
check("締切後", E._deadline_passed(datetime(2026, 11, 20, 23, 59), _now), True)
check("文字列の締切も読める", E._deadline_passed('2026-11-20 23:59:00', _now), True)
check("読めない締切は受け付ける", E._deadline_passed('不明', _now), False)
check("JSTは+9時間固定", E.JST.utcoffset(None) == timedelta(hours=9), True)

# ===== 一覧の組み立て =====
print("\n▼ 一覧の組み立て")
_polls = [
    {'id': 1, 'title': '忘年会', 'start_time': timedelta(hours=19), 'end_time': timedelta(hours=21),
     'visibility': 'invited', 'status': 'open', 'decided_event_id': None},
    {'id': 2, 'title': '新年会', 'start_time': None, 'end_time': None, 'visibility': 'public',
     'status': 'decided', 'decided_event_id': 50},
]
_options = [
    {'id': 12, 'poll_id': 1, 'option_date': date(2026, 12, 19)},
    {'id': 11, 'poll_id': 1, 'option_date': date(2026, 12, 12)},
    {'id': 21, 'poll_id': 2, 'option_date': date(2027, 1, 9)},
    {'id': 99, 'poll_id': 9, 'option_date': date(2027, 1, 9)},  # 消えたアンケートの候補日
]
_answers = [
    {'poll_id': 1, 'option_id': 11, 'player_id': 5, 'answer': 1, 'player_name': '佐藤'},
    {'poll_id': 1, 'option_id': 12, 'player_id': 5, 'answer': 0, 'player_name': '佐藤'},
    {'poll_id': 1, 'option_id': 11, 'player_id': 3, 'answer': 1, 'player_name': '鈴木'},
    {'poll_id': 1, 'option_id': 12, 'player_id': 3, 'answer': 1, 'player_name': '鈴木'},
    {'poll_id': 1, 'option_id': 99, 'player_id': 3, 'answer': 1, 'player_name': '鈴木'},  # 別のアンケートの候補日
]
_inv = [{'poll_id': 1, 'player_id': 5}, {'poll_id': 1, 'player_id': 3}, {'poll_id': 9, 'player_id': 1}]
_list = E._assemble(_polls, _options, _answers, _inv)
_p1 = _list[0]
check("アンケートの並び", [p['id'] for p in _list], [1, 2])
check("時刻は HH:MM", (_p1['start_time'], _p1['end_time']), ('19:00', '21:00'))
check("候補日は日付順", [o['id'] for o in _p1['options']], [11, 12])
check("○の数", [o['yes_count'] for o in _p1['options']], [2, 1])
check("回答者は最初に答えた順", [r['player_name'] for r in _p1['respondents']], ['佐藤', '鈴木'])
check("回答は候補日IDごと", _p1['respondents'][0]['answers'], {'11': 1, '12': 0})
check("回答者数", _p1['respondent_count'], 2)
check("招待者", _p1['invited_player_ids'], [5, 3])
check("決定済みも返す（イベント詳細の表示に使う）", (_list[1]['status'], _list[1]['decided_event_id']), ('decided', 50))
check("回答のないアンケート", (_list[1]['respondents'], _list[1]['respondent_count'], _list[1]['options'][0]['yes_count']),
      ([], 0, 0))
check("内部用のキーは返さない", '_respondent_index' in _p1, False)

# ===== 決定したイベントの値 =====
print("\n▼ 決定したイベントの値")
_ev = E._event_row({'title': '忘年会', 'start_time': timedelta(hours=19), 'end_time': None, 'location': '北千住駅周辺',
                    'max_participants': None, 'visibility': 'invited', 'created_by': '111',
                    'deadline_date': datetime(2026, 11, 20, 23, 59)}, date(2026, 12, 12))
check("値のある列だけ・参加締切は引き継がない", _ev,
      {'title': '忘年会', 'event_date': '2026-12-12', 'start_time': '19:00', 'location': '北千住駅周辺',
       'visibility': 'invited', 'created_by': '111'})

# 以降は CREATE TABLE を飛ばす
E._table_ready = True

# ===== 作成 =====
print("\n▼ 作成")
_res, _cur, _conn = _with_db(lambda sql, p: ([], 1, 7 if sql.startswith('INSERT INTO event_date_polls ') else None),
                             lambda: E.create_event_poll(_body))
check("作成したID", _res['id'], 7)
check("候補日・招待者もまとめて保存し、コミット", _conn.log, ['begin', 'commit'])
check("アンケート本体", _cur.executed[0][0],
      "INSERT INTO event_date_polls (title, start_time, end_time, location, deadline_date, max_participants, "
      "visibility, created_by, status) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)")
check("候補日", _cur.executed[1], ("INSERT INTO event_date_poll_options (poll_id, option_date) VALUES (%s, %s)",
                                  [(7, '2026-12-12'), (7, '2026-12-19')]))
check("招待者（重複なし）", _cur.executed[2], ("INSERT INTO event_date_poll_invitations (poll_id, player_id) VALUES (%s, %s)",
                                       [(7, 1), (7, 3)]))
_pub = E.PollCreate(title='忘年会', option_dates=['2026-12-12', '2026-12-19'], invited_player_ids=[1])
_res, _cur, _conn = _with_db(lambda sql, p: ([], 1, 8), lambda: E.create_event_poll(_pub))
check("全体公開なら招待者は保存しない", len(_cur.executed), 2)


class _BoomCursor(_FakeCursor):
    """候補日の保存（executemany）で落ちる"""

    async def executemany(self, sql, seq):
        raise RuntimeError('db down')


def _with_boom(fn):
    cursor = _BoomCursor(lambda sql, p: ([], 1, 9))
    conn = _FakeConn(cursor)
    orig = E.db
    E.db = types.SimpleNamespace(pool=_FakePool(conn))
    try:
        try:
            result = _run(fn())
        except HTTPException as e:
            result = e
    finally:
        E.db = orig
    return result, conn


_res, _conn = _with_boom(lambda: E.create_event_poll(_pub))
check("途中で失敗したら巻き戻して 500", (_conn.log, _res.status_code), (['begin', 'rollback'], 500))
check("候補日1日では作らない（DBを触らない）",
      _with_db(lambda sql, p: ([], 0, None),
               lambda: E.create_event_poll(E.PollCreate(title='a', option_dates=['2026-12-12'])))[0].status_code, 400)

# ===== 回答 =====
print("\n▼ 回答")
_ans = E.PollAnswers(player_id=5, answers=[E.PollAnswerItem(option_id=11, answer=1),
                                           E.PollAnswerItem(option_id=12, answer=0)])


def _answer_db(status='open', deadline=None, option_ids=(11, 12)):
    def responder(sql, p):
        if sql.startswith('SELECT status, deadline_date FROM event_date_polls'):
            return ([{'status': status, 'deadline_date': deadline}] if status else []), 0, None
        if sql.startswith('SELECT id FROM event_date_poll_options'):
            return [{'id': i} for i in option_ids], 0, None
        return [], 0, None
    return responder


_res, _cur, _ = _with_db(_answer_db(), lambda: E.save_event_poll_answers(1, _ans))
check("保存できる", _res['success'], True)
check("候補日ごとに上書き保存", _cur.executed[-1],
      ("INSERT INTO event_date_poll_answers (poll_id, option_id, player_id, answer) VALUES (%s, %s, %s, %s) "
       "ON DUPLICATE KEY UPDATE answer = VALUES(answer)", [(1, 11, 5, 1), (1, 12, 5, 0)]))
_res, _cur, _ = _with_db(_answer_db(deadline=datetime(2000, 1, 1)), lambda: E.save_event_poll_answers(1, _ans))
check("締切後は 400・保存しない", (_res.status_code, any('INSERT' in s for s in _sqls(_cur))), (400, False))
_res, _cur, _ = _with_db(_answer_db(status='decided'), lambda: E.save_event_poll_answers(1, _ans))
check("決定後は 400・保存しない", (_res.status_code, any('INSERT' in s for s in _sqls(_cur))), (400, False))
_res, _cur, _ = _with_db(_answer_db(status=None), lambda: E.save_event_poll_answers(1, _ans))
check("無いアンケートは 404", _res.status_code, 404)
_res, _cur, _ = _with_db(_answer_db(option_ids=(11,)), lambda: E.save_event_poll_answers(1, _ans))
check("別のアンケートの候補日は 400・保存しない", (_res.status_code, any('INSERT' in s for s in _sqls(_cur))), (400, False))
_bad = E.PollAnswers(player_id=5, answers=[E.PollAnswerItem(option_id=11, answer=2)])
check("○×以外は 400", _with_db(_answer_db(), lambda: E.save_event_poll_answers(1, _bad))[0].status_code, 400)
check("回答なしは 400",
      _with_db(_answer_db(), lambda: E.save_event_poll_answers(1, E.PollAnswers(player_id=5, answers=[])))[0].status_code,
      400)

# ===== 決定 =====
print("\n▼ 日程の決定")
_poll_row = {'id': 1, 'title': '忘年会', 'start_time': timedelta(hours=19), 'end_time': timedelta(hours=21),
             'location': '北千住駅周辺', 'deadline_date': datetime(2026, 11, 20, 23, 59), 'max_participants': None,
             'visibility': 'invited', 'created_by': '111', 'status': 'open'}


def _decide_db(poll=_poll_row, option=True):
    def responder(sql, p):
        if sql.startswith('SELECT * FROM event_date_polls WHERE id = %s FOR UPDATE'):
            return ([poll] if poll else []), 0, None
        if sql.startswith('SELECT option_date FROM event_date_poll_options'):
            return ([{'option_date': date(2026, 12, 12)}] if option else []), 0, None
        if sql.startswith('INSERT INTO events '):
            return [], 1, 300
        if sql.startswith('INSERT INTO event_participants'):
            return [], 6, None
        return [], 1, None
    return responder


_res, _cur, _conn = _with_db(_decide_db(), lambda: E.decide_event_poll(1, E.PollDecide(option_id=11, actor_discord_id='111')))
check("決定の結果", _res, {'success': True, 'event_id': 300, 'event_date': '2026-12-12', 'participant_count': 6})
check("まとめてコミット", _conn.log, ['begin', 'commit'])
check("行をロックしてから状態を見る", _cur.executed[0], ("SELECT * FROM event_date_polls WHERE id = %s FOR UPDATE", (1,)))
check("候補日はこのアンケートのものに限る", _cur.executed[1],
      ("SELECT option_date FROM event_date_poll_options WHERE id = %s AND poll_id = %s", (11, 1)))
check("その日のイベントを作る", _cur.executed[2],
      ("INSERT INTO events (title, event_date, start_time, end_time, location, visibility, created_by) "
       "VALUES (%s, %s, %s, %s, %s, %s, %s)",
       ['忘年会', '2026-12-12', '19:00', '21:00', '北千住駅周辺', 'invited', '111']))
check("○の人を参加者にする", _cur.executed[3],
      ("INSERT INTO event_participants (event_id, player_id) "
       "SELECT %s, player_id FROM event_date_poll_answers WHERE option_id = %s AND answer = 1", (300, 11)))
check("メンバー限定なら招待者も引き継ぐ", _cur.executed[4],
      ("INSERT INTO event_invitations (event_id, player_id) "
       "SELECT %s, player_id FROM event_date_poll_invitations WHERE poll_id = %s", (300, 1)))
check("アンケートを決定済みにする", _cur.executed[5],
      ("UPDATE event_date_polls SET status = %s, decided_option_id = %s, decided_event_id = %s WHERE id = %s",
       ('decided', 11, 300, 1)))

_res, _cur, _conn = _with_db(_decide_db(poll={**_poll_row, 'visibility': 'public'}),
                             lambda: E.decide_event_poll(1, E.PollDecide(option_id=11, actor_discord_id='111')))
check("全体公開なら招待者は引き継がない", any('event_invitations' in s for s in _sqls(_cur)), False)

_res, _cur, _conn = _with_db(_decide_db(), lambda: E.decide_event_poll(1, E.PollDecide(option_id=11, actor_discord_id='222')))
check("作成者以外は 403・何も作らず巻き戻す",
      (_res.status_code, any('INSERT' in s for s in _sqls(_cur)), _conn.log), (403, False, ['begin', 'rollback']))
_res, _cur, _conn = _with_db(_decide_db(), lambda: E.decide_event_poll(1, E.PollDecide(option_id=11)))
check("操作者なしは 403", _res.status_code, 403)
_res, _cur, _conn = _with_db(_decide_db(poll={**_poll_row, 'status': 'decided'}),
                             lambda: E.decide_event_poll(1, E.PollDecide(option_id=11, actor_discord_id='111')))
check("決定済みは 409（二重に押してもイベントは1つ）",
      (_res.status_code, any('INSERT' in s for s in _sqls(_cur))), (409, False))
_res, _cur, _conn = _with_db(_decide_db(option=False),
                             lambda: E.decide_event_poll(1, E.PollDecide(option_id=99, actor_discord_id='111')))
check("別のアンケートの候補日は 404", (_res.status_code, any('INSERT' in s for s in _sqls(_cur))), (404, False))
_res, _cur, _conn = _with_db(_decide_db(poll=None),
                             lambda: E.decide_event_poll(1, E.PollDecide(option_id=11, actor_discord_id='111')))
check("無いアンケートは 404", _res.status_code, 404)


def _decide_fail(sql, p):
    if sql.startswith('INSERT INTO event_participants'):
        raise RuntimeError('db down')
    return _decide_db()(sql, p)


_res, _cur, _conn = _with_db(_decide_fail, lambda: E.decide_event_poll(1, E.PollDecide(option_id=11, actor_discord_id='111')))
check("途中で失敗したら巻き戻して 500", (_res.status_code, _conn.log), (500, ['begin', 'rollback']))

# ===== 削除 =====
print("\n▼ 削除")


def _delete_db(created_by='111'):
    def responder(sql, p):
        if sql.startswith('SELECT created_by FROM event_date_polls'):
            return ([{'created_by': created_by}] if created_by else []), 0, None
        return [], 1, None
    return responder


_res, _cur, _conn = _with_db(_delete_db(), lambda: E.delete_event_poll(1, actor_discord_id='111'))
check("作成者は削除できる", _res['success'], True)
check("回答・候補日・招待者・本体を消す", _sqls(_cur)[1:],
      ["DELETE FROM event_date_poll_answers WHERE poll_id = %s", "DELETE FROM event_date_poll_options WHERE poll_id = %s",
       "DELETE FROM event_date_poll_invitations WHERE poll_id = %s", "DELETE FROM event_date_polls WHERE id = %s"])
check("決定後のイベントは消さない", any('events' in s.split(' FROM ')[-1].split()[0] for s in _sqls(_cur)[1:]), False)
check("まとめてコミット", _conn.log, ['begin', 'commit'])
_res, _cur, _conn = _with_db(_delete_db(), lambda: E.delete_event_poll(1, actor_discord_id='222'))
check("作成者以外は 403・消さない", (_res.status_code, any('DELETE' in s for s in _sqls(_cur))), (403, False))
_res, _cur, _conn = _with_db(_delete_db(created_by=None), lambda: E.delete_event_poll(1, actor_discord_id='111'))
check("無いアンケートは 404", _res.status_code, 404)

# ===== 一覧（SQL） =====
print("\n▼ 一覧")


def _list_db(sql, p):
    if sql.startswith('SELECT * FROM event_date_polls'):
        return _polls, 0, None
    if sql.startswith('SELECT id, poll_id, option_date'):
        return _options, 0, None
    if sql.startswith('SELECT a.poll_id'):
        return _answers, 0, None
    if sql.startswith('SELECT poll_id, player_id'):
        return _inv, 0, None
    return [], 0, None


_res, _cur, _ = _with_db(_list_db, lambda: E.get_event_polls())
check("4回のSQLで全件をまとめて取る（アンケートごとに問い合わせない）", len(_cur.executed), 4)
check("回答者名は選手マスタから", 'LEFT JOIN player_mst p ON p.player_id = a.player_id' in _cur.executed[2][0], True)
check("一覧の中身", [p['respondent_count'] for p in _res], [2, 0])

# ===== テーブル =====
print("\n▼ テーブル")
E._table_ready = False
_res, _cur, _ = _with_db(lambda sql, p: ([], 0, None), lambda: E._ensure_tables())
check("4つのテーブルを無ければ作る", [s.split(' (')[0] for s in _sqls(_cur)],
      ["CREATE TABLE IF NOT EXISTS event_date_polls", "CREATE TABLE IF NOT EXISTS event_date_poll_options",
       "CREATE TABLE IF NOT EXISTS event_date_poll_answers", "CREATE TABLE IF NOT EXISTS event_date_poll_invitations"])
check("1人1候補日に1回答", "UNIQUE KEY uq_option_player (option_id, player_id)" in _sqls(_cur)[2], True)
_res, _cur, _ = _with_db(lambda sql, p: ([], 0, None), lambda: E._ensure_tables())
check("2回目以降は作らない", _cur.executed, [])

check("エンドポイント", sorted((r.path, sorted(r.methods)) for r in E.router.routes),
      [('/event-polls', ['GET']), ('/event-polls', ['POST']), ('/event-polls/{poll_id}', ['DELETE']),
       ('/event-polls/{poll_id}/answers', ['PUT']), ('/event-polls/{poll_id}/decide', ['POST'])])

print()
if _failures:
    print(f"❌ {len(_failures)}件失敗")
    for f in _failures:
        print(f"  - {f}")
    sys.exit(1)
print("✅ すべて成功")
