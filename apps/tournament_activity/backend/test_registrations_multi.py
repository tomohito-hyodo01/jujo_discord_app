#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
同じ大会への複数申込（管理者のみ）と代理申込（誰でも可）の動作確認

DBにもDiscordにも接続せず、POST /api/registrations が
・一般会員の「同じ大会への2回目の申込」を 400 で止めて登録しないこと
・管理者は同じ大会に何度でも申し込めること（代理申込で複数チームを作る）
・代理申込（自分をメンバーに含めない）は誰でも使えること
を検証する。

実行:
    cd apps/tournament_activity/backend
    python test_registrations_multi.py
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
print("\n▼ 管理者判定（_is_admin_row）")
check("管理者(admin_role=0)", R._is_admin_row({'admin_role': 0}), True)
check("大会申込管理者(1)は管理者ではない", R._is_admin_row({'admin_role': 1}), False)
check("一般(2)", R._is_admin_row({'admin_role': 2}), False)
check("admin_role未設定", R._is_admin_row({}), False)
check("選手未登録(None)", R._is_admin_row(None), False)
check("文字列の'0'は不可（型を厳密に見る）", R._is_admin_row({'admin_role': '0'}), False)


# ===== エンドポイント（DBを差し替え） =====
print("\n▼ POST /registrations の複数申込チェック")


class _FakeDb:
    """execute_query の呼び出しを記録し、必要な行だけ返す"""

    def __init__(self, applicant_row, existing_registrations=(), insert_error=None, tournament_regs=()):
        self.applicant_row = applicant_row
        self.existing = list(existing_registrations)
        self.insert_error = insert_error
        self.tournament_regs = list(tournament_regs)   # 同じ大会・種別の既存申込（pair1/pair2）
        self.ops = []

    async def execute_query(self, table, operation='select', filters=None, data=None, columns='*', json_fields=None):
        self.ops.append((table, operation, filters, data))
        if table == 'tournament_mst' and operation == 'select':
            return {'data': [{'tournament_id': 'T1', 'tournament_name': '秋季クラブ対抗戦', 'classification': 1,
                              'registrated_ward': 7, 'deadline_date': None}], 'error': None}
        if table == 'player_mst' and operation == 'select' and filters and 'discord_id' in filters:
            return {'data': [self.applicant_row] if self.applicant_row else [], 'error': None}
        if table == 'tournament_registration' and operation == 'select' and filters \
                and filters.get('discord_id') == '111' and filters.get('tournament_id') == 'T1':
            return {'data': list(self.existing), 'error': None}
        if table == 'tournament_registration' and operation == 'select' and filters \
                and 'type' in filters and filters.get('tournament_id') == 'T1':
            return {'data': list(self.tournament_regs), 'error': None}
        if table == 'player_mst' and operation == 'select' and filters and 'player_id' in filters:
            names = {10: '山田', 11: '鈴木', 12: '佐藤', 13: '田中', 1: '兵頭', 2: '一般会員'}
            pid = filters['player_id']
            return {'data': [{'player_id': pid, 'player_name': names[pid]}] if pid in names else [], 'error': None}
        if operation == 'insert':
            if self.insert_error:
                return {'data': None, 'error': self.insert_error}
            return {'data': [{'id': 1, **(data or {})}], 'error': None}
        return {'data': [], 'error': None}

    def inserted(self):
        return [op for op in self.ops if op[1] == 'insert' and op[0] == 'tournament_registration']

    def dup_checks(self):
        return [op for op in self.ops if op[0] == 'tournament_registration' and op[1] == 'select'
                and 'discord_id' in (op[2] or {})]


def _call(applicant_row, is_proxy=False, existing=(), insert_error=None, tournament_regs=(), team_status=0):
    fake = _FakeDb(applicant_row, existing, insert_error, tournament_regs)
    orig = R.db
    R.db = fake
    try:
        reg = R.RegistrationCreate(discord_id='111', tournament_id='T1', type='一般', sex=0,
                                   pair1=10, pair2=[11, 12, 13], team_status=team_status, is_proxy=is_proxy)
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
_already = [{'registration_id': 99}]

_status, _fake = _call(_member)
check("一般会員の初回申込は通る", _status, 200)
check("登録される", len(_fake.inserted()), 1)
check("既存の申込を確認している", len(_fake.dup_checks()) >= 1, True)

_status, _fake = _call(_member, existing=_already)
check("一般会員の同じ大会への2回目は400", _status, 400)
check("400の理由", '管理者のみ' in getattr(_fake, 'detail', ''), True)
check("登録は行わない", _fake.inserted(), [])

_status, _fake = _call(_member, is_proxy=True)
check("一般会員でも代理申込（自分を含めない）は通る", _status, 200)
check("登録される", len(_fake.inserted()), 1)
check("is_proxy はDBに書かない（列が無い）", 'is_proxy' in _fake.inserted()[0][3], False)

_status, _fake = _call(_member, is_proxy=True, existing=_already)
check("一般会員の代理申込でも2回目は400", _status, 400)

_status, _fake = _call(_admin, is_proxy=True, existing=_already)
check("管理者は同じ大会に2回目の代理申込ができる", _status, 200)
check("登録される", len(_fake.inserted()), 1)
check("管理者は既存の申込を確認しない（何チームでも可）", _fake.dup_checks(), [])

_status, _fake = _call({**_member, 'admin_role': 1}, existing=_already)
check("大会申込管理者(admin_role=1)は一般会員と同じく400", _status, 400)

_status, _fake = _call(None)
check("選手未登録の discord_id でも初回は通る（既存の挙動）", _status, 200)
_status, _fake = _call(None, existing=_already)
check("選手未登録の discord_id の2回目は400", _status, 400)

print("\n▼ DBの一意制約違反（まったく同じ内容の二重登録）")
_dup = "(1062, \"Duplicate entry '111-T1-一般-10' for key 'unique_registration'\")"
_status, _fake = _call(_admin, is_proxy=True, insert_error=_dup)
check("1062 は 400 で分かりやすいメッセージ", (_status, '既に登録されています' in getattr(_fake, 'detail', '')), (400, True))
_status, _fake = _call(_admin, insert_error="(2013, 'Lost connection to MySQL server')")
check("それ以外のDBエラーは 500 のまま", _status, 500)
check("判定: 1062", R._is_duplicate_error(_dup), True)
check("判定: メッセージのみ", R._is_duplicate_error("Duplicate entry 'x' for key 'unique_registration'"), True)
check("判定: 別のエラー", R._is_duplicate_error("(2013, 'Lost connection')"), False)

print("")
print("▼ 同じ大会・種別で既に別の申込に入っている選手")
_other_team = [{'pair1': 20, 'pair2': [21, 12, 22]}]   # 佐藤(12) が別チームに入っている
_status, _fake = _call(_admin, is_proxy=True, tournament_regs=_other_team)
check("既に別チームにいる選手を含むと400", _status, 400)
check("誰が重複しているかを名前で返す", '佐藤' in getattr(_fake, 'detail', ''), True)
check("登録は行わない", _fake.inserted(), [])
_status, _fake = _call(_admin, is_proxy=True, tournament_regs=[{'pair1': 20, 'pair2': [21, 22]}])
check("重複が無ければ通る", _status, 200)
_status, _fake = _call(_admin, is_proxy=True, tournament_regs=[{'pair1': 12, 'pair2': None}])
check("既存申込の pair1 とも突き合わせる", _status, 400)
_status, _fake = _call(_admin, is_proxy=False, tournament_regs=[{'pair1': 20, 'pair2': [1]}])
check("代理申込でなければ申込者本人(player_id=1)も重複判定に含める", _status, 400)
_status, _fake = _call(_admin, is_proxy=True, tournament_regs=[{'pair1': 20, 'pair2': [1]}])
check("代理申込なら申込者本人は出場しないので重複にならない", _status, 200)
_status, _fake = _call(_admin, tournament_regs=_other_team, team_status=1)
check("参加希望(team_status=1)は出場者未定なので対象外", _status, 200)

print()
if _failures:
    print(f"❌ {len(_failures)}件失敗")
    for f in _failures:
        print(f"  - {f}")
    sys.exit(1)
print("✅ すべて成功")
