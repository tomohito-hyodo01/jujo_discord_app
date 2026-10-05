#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
コート予約システムの利用登録の有効期限お知らせルーター

コート予約の取り込み（sheets_import）と同じ表（Google Drive 上の Excel の1枚目のシート）を読み、
I列の有効期限が近いアカウントを Discord の DM で知らせる。
実行は X-Server の cron → scripts/notify_court_registration_expiry.sh 経由（毎朝9時）。

- 本人へ: M列に Discord のユーザーIDが書いてある人に、有効期限の1か月前（暦で数える）、2週間前、
  1週間前から期限日の当日までは毎日送る。期限を過ぎたら本人には送らない。
- 管理者（兵頭さん）へ: 新しく1か月以内に入ったアカウントが出た日に、その時点で1か月以内の全員
  （期限切れのまま表が直っていない行を含む）を一覧で送る。有効期限やIDが読めない行を
  新しく見つけた日にも送る。

送ったお知らせは court_registration_expiry_notices に記録し、同じお知らせを2回送らない。
記録のキーに有効期限を含めているので、表の有効期限が書き換わると新しい期限で数え直す。
"""

from fastapi import APIRouter, HTTPException
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Optional
import asyncio
import calendar
import hashlib
import os
import re
import unicodedata
import aiomysql
import httpx
from api.database import db
from api.routers.sheets_import import _download_spreadsheet
from api.routers.practice import _split_for_discord

router = APIRouter()

# 表の列（0始まり）。sheets_import と同じ表で、G列=予約者名（漢字）、H列=同カタカナ、I列=有効期限。
# M列は Discord のユーザーIDを書くために足した列（L列までは取り込みが位置で読んでいるので、その右に置く）
NAME_COL = 6
KANA_COL = 7
EXPIRY_COL = 8
DISCORD_ID_COL = 12

# 本人へのお知らせの区切り。1か月前（暦）と2週間前は1回ずつ、最後の1週間は毎日
TWO_WEEKS_DAYS = 14
DAILY_FROM_DAYS = 7

# 管理者（兵頭さん）の宛先の既定値（game_scores の管理者と同じ）。
# 環境変数 COURT_EXPIRY_ADMIN_DISCORD_ID で差し替えられる
DEFAULT_ADMIN_DISCORD_ID = '1427112485047242945'

TABLE = 'court_registration_expiry_notices'
DISCORD_API = 'https://discord.com/api/v10'
ADMIN_HEADER = '利用登録の有効期限が 1 か月以内のアカウント'
JST = timezone(timedelta(hours=9))

_EXPIRY_RE = re.compile(r'^(\d{4})年(\d{1,2})月(\d{1,2})日$')
# Discord のユーザーID（スノーフレーク）。現在は18〜19桁
_DISCORD_ID_RE = re.compile(r'^\d{17,20}$')

_table_ready = False


@dataclass
class Account:
    """表の1行（名義と有効期限が書いてある行）"""
    row_no: int                # 表の行番号（見出しが1行目）
    name: str                  # 名義（G列。空ならH列）
    expiry: Optional[date]     # 有効期限。読めなければ None
    expiry_raw: str            # I列の元の値（読めなかったときの表示と記録のキーに使う）
    discord_id: Optional[str]  # M列の Discord ユーザーID。読めたときだけ入る
    discord_status: str        # ok / missing（未記入） / invalid（読めない）
    discord_raw: str           # M列の元の値

    @property
    def name_key(self) -> str:
        """記録のキーに使う名義（全角・半角と空白の違いをそろえる）"""
        return re.sub(r'\s+', '', unicodedata.normalize('NFKC', self.name))


# ===== 表の読み取り =====

def _cell_text(value) -> str:
    return '' if value is None else str(value).strip()


def parse_expiry(value) -> Optional[date]:
    """I列の有効期限を date にする（読めなければ None）

    表の書き方は「2026年11月15日」。全角数字や月日の1桁も読む。
    セルが日付として入っている場合（表示形式で年月日にしている場合）も読む。
    """
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if value is None:
        return None
    text = re.sub(r'\s+', '', unicodedata.normalize('NFKC', str(value)))
    m = _EXPIRY_RE.match(text)
    if not m:
        return None
    try:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    except ValueError:
        return None


def parse_discord_id(value) -> tuple:
    """M列の Discord ユーザーIDを読み (ID, 状態) を返す。状態は ok / missing / invalid

    数値のセルは invalid にする。IDは18〜19桁あり、表計算ソフトは数値を15桁で丸めるので、
    数値として入っている時点で本人のIDと一致する保証が無い（別人に届くのを防ぐ）。
    """
    if value is None:
        return None, 'missing'
    if isinstance(value, (bool, int, float)):
        return None, 'invalid'
    text = unicodedata.normalize('NFKC', str(value)).strip()
    if not text:
        return None, 'missing'
    if _DISCORD_ID_RE.match(text):
        return text, 'ok'
    return None, 'invalid'


def _cell(row, index):
    return row[index] if index < len(row) else None


def extract_accounts(wb) -> list:
    """表の1枚目のシートから、名義と有効期限が書いてある行を読む（見出しの1行目は飛ばす）"""
    ws = wb.worksheets[0]
    accounts = []
    for row_no, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        name = _cell_text(_cell(row, NAME_COL)) or _cell_text(_cell(row, KANA_COL))
        expiry_value = _cell(row, EXPIRY_COL)
        # 有効期限が空の行は対象外。名義の無い行は誰のことか分からないので読まない
        if not name or not _cell_text(expiry_value):
            continue
        discord_value = _cell(row, DISCORD_ID_COL)
        discord_id, discord_status = parse_discord_id(discord_value)
        accounts.append(Account(
            row_no=row_no, name=name, expiry=parse_expiry(expiry_value), expiry_raw=_cell_text(expiry_value),
            discord_id=discord_id, discord_status=discord_status, discord_raw=_cell_text(discord_value),
        ))
    return accounts


# ===== いつ知らせるか =====

def one_month_before(d: date) -> date:
    """暦で1か月前の日（11/15 → 10/15）。前月に同じ日が無ければ前月の末日（3/31 → 2/28）"""
    year, month = (d.year - 1, 12) if d.month == 1 else (d.year, d.month - 1)
    return date(year, month, min(d.day, calendar.monthrange(year, month)[1]))


def in_window(expiry: date, today: date) -> bool:
    """今日が有効期限の1か月前以降か（期限を過ぎたものを含む）"""
    return today >= one_month_before(expiry)


def due_stages(expiry: date, today: date) -> list:
    """今日の時点で本人に知らせる区切り（送信記録の種類）。期限を過ぎていれば空

    1か月前・2週間前は、その日を過ぎていても未送信なら送る（サーバーの停止や、導入時に
    すでに1か月を切っている人の取りこぼしを防ぐ）。最後の1週間は日ごとに1回。
    同じ日に区切りが重なっても、送るDMは1通にする（呼び出し側）。
    """
    days_left = (expiry - today).days
    if days_left < 0 or not in_window(expiry, today):
        return []
    stages = ['1m']
    if days_left <= TWO_WEEKS_DAYS:
        stages.append('2w')
    if days_left <= DAILY_FROM_DAYS:
        stages.append(f'd{today.isoformat()}')
    return stages


def _notice(kind: str, account: Account, discord_id: Optional[str] = None, extra: str = '') -> dict:
    """送信記録1件。キーは種類・名義・有効期限（読めなければ元の値）・宛先から作る"""
    expiry_part = account.expiry.isoformat() if account.expiry else account.expiry_raw
    raw = '|'.join([kind, account.name_key, expiry_part, discord_id or '', extra])
    return {
        'key': hashlib.sha256(raw.encode('utf-8')).hexdigest(),
        'kind': kind,
        'account_name': account.name,
        'expiry_date': account.expiry,
        'discord_id': discord_id,
    }


# ===== 文面 =====

def format_jp_date(d: date) -> str:
    """表と同じ「2026年11月15日」の形にする"""
    return f'{d.year}年{d.month:02d}月{d.day:02d}日'


def _days_left_text(days_left: int) -> str:
    return '本日まで' if days_left == 0 else f'あと {days_left} 日'


def build_personal_message(account: Account, today: date) -> str:
    """本人へのDM"""
    days_left = (account.expiry - today).days
    return ('コート予約システムの利用登録の有効期限が近づいています。\n'
            f'名義: {account.name}\n'
            f'有効期限: {format_jp_date(account.expiry)}（{_days_left_text(days_left)}）\n'
            '期限までに更新をお願いします。')


def build_admin_message(accounts: list, today: date, statuses: dict) -> str:
    """管理者への一覧。1か月以内（期限切れを含む）の全員を期限の近い順に、読めなかった行はその下に並べる

    statuses: 行番号 → 本人への状況（本人に DM 済み / Discord 未記入 など）。期限切れの行は使わない
    """
    targets = sorted((a for a in accounts if a.expiry and in_window(a.expiry, today)),
                     key=lambda a: (a.expiry, a.row_no))
    lines = [ADMIN_HEADER]
    for a in targets:
        days_left = (a.expiry - today).days
        if days_left < 0:
            note = '期限切れ'
        else:
            note = f'{_days_left_text(days_left)}・{statuses.get(a.row_no, "")}'
        lines.append(f'・{a.name}　{format_jp_date(a.expiry)}（{note}）')
    if not targets:
        lines.append('（なし）')

    unreadable = [a for a in accounts if a.expiry is None or a.discord_status == 'invalid']
    if unreadable:
        lines += ['', '表で読めなかった行']
        for a in unreadable:
            problems = []
            if a.expiry is None:
                problems.append(f'有効期限「{a.expiry_raw}」が読めません')
            if a.discord_status == 'invalid':
                problems.append('Discord ID が読めません')
            lines.append(f'・{a.name}（{a.row_no}行目）　' + '、'.join(problems))
    return '\n'.join(lines)


# ===== 送信の記録（court_registration_expiry_notices） =====

def _today_jst() -> date:
    """今日の日付（JST固定）。サーバのタイムゾーン設定に依存させないため明示する"""
    return datetime.now(JST).date()


def _now_jst() -> datetime:
    """記録に使う日時（JST・秒精度）。DATETIME列は秒精度のため、巻き戻し条件が丸め誤差で外れないようにする"""
    return datetime.now(JST).replace(tzinfo=None, microsecond=0)


async def _ensure_table():
    """記録用のテーブルが無ければ作る（冪等・初回のみ実行）"""
    global _table_ready
    if _table_ready:
        return
    create_sql = f"""
    CREATE TABLE IF NOT EXISTS {TABLE} (
        id INT AUTO_INCREMENT PRIMARY KEY,
        notice_key CHAR(64) NOT NULL,
        kind VARCHAR(20) NOT NULL,
        account_name VARCHAR(255),
        expiry_date DATE NULL,
        discord_id VARCHAR(32) NULL,
        notified_at DATETIME NOT NULL,
        UNIQUE KEY uq_notice_key (notice_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """
    async with db.pool.acquire() as conn:
        async with conn.cursor() as cursor:
            await cursor.execute(create_sql)
    _table_ready = True


async def _recorded_keys(keys: list) -> set:
    """指定したキーのうち記録済みのもの"""
    if not keys:
        return set()
    placeholders = ', '.join(['%s'] * len(keys))
    async with db.pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            await cursor.execute(f'SELECT notice_key FROM {TABLE} WHERE notice_key IN ({placeholders})', list(keys))
            rows = await cursor.fetchall()
            return {r['notice_key'] for r in rows}


async def _record_notice(notice: dict, stamp: datetime) -> bool:
    """お知らせを記録する（送信権の獲得）。既に記録があれば False

    INSERT IGNORE は一意キーの重複で何もしないので、並行実行しても同じお知らせを2回送らない。
    """
    async with db.pool.acquire() as conn:
        async with conn.cursor() as cursor:
            await cursor.execute(
                f'INSERT IGNORE INTO {TABLE} (notice_key, kind, account_name, expiry_date, discord_id, notified_at) '
                'VALUES (%s, %s, %s, %s, %s, %s)',
                (notice['key'], notice['kind'], notice['account_name'][:255], notice['expiry_date'],
                 notice['discord_id'], stamp),
            )
            return cursor.rowcount > 0


async def _release_notice(notice_key: str, stamp: datetime) -> bool:
    """送れなかったお知らせの記録を消し、次回の実行で送り直せるようにする（戻せたら True）

    自分が書いた notified_at と一致する行だけを消す。無条件に消すと、並行して走った
    別の実行が送信済みにした記録まで消して二重送信になる。
    """
    try:
        async with db.pool.acquire() as conn:
            async with conn.cursor() as cursor:
                await cursor.execute(
                    f'DELETE FROM {TABLE} WHERE notice_key = %s AND notified_at = %s',
                    (notice_key, stamp),
                )
                return cursor.rowcount > 0
    except Exception as e:
        print(f'⚠️ 有効期限お知らせ: 記録の巻き戻しに失敗 key={notice_key} {e}')
        return False


async def _record_all(notices: list, stamp: datetime) -> list:
    """お知らせをまとめて記録し、自分が記録できたものを返す。途中でDBエラーになったら記録した分を戻して送出する"""
    owned = []
    try:
        for notice in notices:
            if await _record_notice(notice, stamp):
                owned.append(notice)
    except Exception:
        await _release_all(owned, stamp)
        raise
    return owned


async def _release_all(notices: list, stamp: datetime) -> bool:
    """記録をまとめて戻す。1件でも戻せなければ False"""
    released = True
    for notice in notices:
        if not await _release_notice(notice['key'], stamp):
            released = False
    return released


# ===== Discord への送信 =====

async def _post_with_retry(client: httpx.AsyncClient, url: str, headers: dict, payload: dict):
    """POST する。レート制限(429)は1度だけ待って再送する"""
    res = await client.post(url, headers=headers, json=payload, timeout=10.0)
    if res.status_code == 429:
        try:
            wait = float(res.headers.get('Retry-After', '1'))
        except ValueError:
            wait = 1.0
        await asyncio.sleep(min(wait, 10.0))
        res = await client.post(url, headers=headers, json=payload, timeout=10.0)
    return res


async def _send_dm(client: httpx.AsyncClient, discord_id: str, content: str) -> tuple:
    """Bot から DM を送り (成功したか, 失敗理由) を返す。長い本文は2000文字以内に分けて送る"""
    token = os.getenv('DISCORD_BOT_TOKEN', '')
    if not token:
        return False, 'DISCORD_BOT_TOKEN未設定'
    headers = {'Authorization': f'Bot {token}', 'Content-Type': 'application/json'}
    try:
        res = await _post_with_retry(client, f'{DISCORD_API}/users/@me/channels', headers,
                                     {'recipient_id': discord_id})
        if res.status_code != 200:
            return False, f'DMチャンネル作成 status={res.status_code} body={res.text[:200]}'
        channel_id = res.json()['id']
        for chunk in _split_for_discord(content):
            res = await _post_with_retry(client, f'{DISCORD_API}/channels/{channel_id}/messages', headers,
                                         {'content': chunk, 'allowed_mentions': {'parse': []}})
            if res.status_code not in (200, 201):
                return False, f'status={res.status_code} body={res.text[:200]}'
        return True, ''
    except Exception as e:
        return False, f'error: {e}'


# ===== エンドポイント =====

def _admin_discord_id() -> str:
    return os.getenv('COURT_EXPIRY_ADMIN_DISCORD_ID', DEFAULT_ADMIN_DISCORD_ID).strip()


async def _download_workbook():
    """表をダウンロードする。同期処理なので、ほかのリクエストを止めないよう別スレッドで動かす"""
    return await asyncio.to_thread(_download_spreadsheet)


@router.post('/notify/court-registration-expiry')
async def notify_court_registration_expiry(dry_run: bool = False):
    """コート予約システムの利用登録の有効期限が近いアカウントを DM で知らせる（cron から毎朝実行）

    dry_run: 記録も送信もせず、今日送る予定の内容だけを返す（導入時の確認用）
    """
    today = _today_jst()
    try:
        accounts = extract_accounts(await _download_workbook())
    except Exception as e:
        print(f'❌ 有効期限お知らせ: 表の取得に失敗 {e}')
        raise HTTPException(status_code=502, detail=f'表の取得失敗: {e}')

    # 本人へのDMの候補と、管理者への一覧のきっかけ（新しく1か月以内に入った・読めない行を見つけた）
    personal = []   # (Account, その日に知らせる区切りの記録)
    triggers = []
    statuses = {}   # 行番号 → 管理者への一覧に出す本人の状況
    for a in sorted(accounts, key=lambda x: (x.expiry or date.max, x.row_no)):
        if a.expiry is None:
            triggers.append(_notice('bad_expiry', a))
        if a.discord_status == 'invalid':
            triggers.append(_notice('bad_id', a, extra=a.discord_raw))
        if a.expiry is None or not in_window(a.expiry, today) or (a.expiry - today).days < 0:
            continue
        triggers.append(_notice('entered', a))
        if a.discord_status == 'ok':
            personal.append((a, [_notice(stage, a, discord_id=a.discord_id) for stage in due_stages(a.expiry, today)]))
        else:
            statuses[a.row_no] = 'Discord 未記入' if a.discord_status == 'missing' else 'ID が読めません'

    try:
        await _ensure_table()
        recorded = await _recorded_keys([n['key'] for n in triggers] + [n['key'] for _, ns in personal for n in ns])
    except Exception as e:
        # 判定できないまま送ると同じお知らせを毎日送り続けるため止める
        print(f'❌ 有効期限お知らせ: 送信記録を参照できません {e}')
        raise HTTPException(status_code=500, detail=f'DB参照失敗: {e}')

    pending = []
    for a, notices in personal:
        unsent = [n for n in notices if n['key'] not in recorded]
        if unsent:
            pending.append((a, unsent))
        else:
            statuses[a.row_no] = '本人に DM 済み'
    new_triggers = [n for n in triggers if n['key'] not in recorded]
    admin_id = _admin_discord_id()

    if dry_run:
        for a, _ in pending:
            statuses[a.row_no] = '本人に DM 予定'
        return {
            'success': True, 'dry_run': True, 'date': today.isoformat(), 'accounts': len(accounts),
            'personal': [{'name': a.name, 'row': a.row_no, 'discord_id': a.discord_id,
                          'stages': [n['kind'] for n in unsent], 'message': build_personal_message(a, today)}
                         for a, unsent in pending],
            'admin': ({'to': admin_id, 'message': build_admin_message(accounts, today, statuses)}
                      if new_triggers else None),
        }

    stamp = _now_jst()
    results = []
    async with httpx.AsyncClient() as client:
        for a, unsent in pending:
            base = {'name': a.name, 'row': a.row_no}
            try:
                owned = await _record_all(unsent, stamp)
            except Exception as e:
                print(f'⚠️ 有効期限お知らせ: 記録に失敗 {a.name} {e}')
                statuses[a.row_no] = 'DM が届かず'
                results.append({**base, 'status': 'failed', 'reason': f'db: {e}'})
                continue
            if not owned:
                statuses[a.row_no] = '本人に DM 済み'   # 並行して走った実行が先に送った
                continue

            if results:
                # 2通目以降は間隔を空ける（レート制限対策）
                await asyncio.sleep(1.0)
            ok, reason = await _send_dm(client, a.discord_id, build_personal_message(a, today))
            if ok:
                print(f'✅ 有効期限お知らせ: 本人へ送信 {a.name}（{format_jp_date(a.expiry)}）')
                statuses[a.row_no] = '本人に DM 済み'
                results.append({**base, 'status': 'sent', 'stages': [n['kind'] for n in owned]})
                continue

            print(f'⚠️ 有効期限お知らせ: 本人へ送信失敗 {a.name} {reason}')
            if not await _release_all(owned, stamp):
                # 戻せないと「未送信なのに記録済み」で、この区切りは二度と送られないため気づけるようにする
                reason += '（記録を戻せませんでした。次回も送られません）'
            statuses[a.row_no] = 'DM が届かず'
            results.append({**base, 'status': 'failed', 'reason': reason})

        admin = None
        if new_triggers and not admin_id:
            admin = {'status': 'skipped', 'reason': 'COURT_EXPIRY_ADMIN_DISCORD_ID が空のため送りません'}
        elif new_triggers:
            try:
                owned = await _record_all(new_triggers, stamp)
            except Exception as e:
                print(f'⚠️ 有効期限お知らせ: 管理者への一覧の記録に失敗 {e}')
                owned = None
                admin = {'status': 'failed', 'reason': f'db: {e}'}
            if owned:
                if results:
                    await asyncio.sleep(1.0)
                ok, reason = await _send_dm(client, admin_id, build_admin_message(accounts, today, statuses))
                if ok:
                    print(f'✅ 有効期限お知らせ: 管理者へ一覧を送信（きっかけ {len(owned)}件）')
                    admin = {'status': 'sent', 'triggers': [n['kind'] for n in owned]}
                else:
                    print(f'⚠️ 有効期限お知らせ: 管理者への一覧の送信失敗 {reason}')
                    if not await _release_all(owned, stamp):
                        reason += '（記録を戻せませんでした。次回も送られません）'
                    admin = {'status': 'failed', 'reason': reason}

    sent_count = sum(1 for r in results if r['status'] == 'sent')
    failed_count = sum(1 for r in results if r['status'] == 'failed') + (1 if admin and admin['status'] == 'failed' else 0)
    return {'success': True, 'date': today.isoformat(), 'accounts': len(accounts),
            'sent_count': sent_count, 'failed_count': failed_count, 'results': results, 'admin': admin}
