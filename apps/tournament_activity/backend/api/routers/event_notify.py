#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
イベント・日程アンケートの Discord 通知ルーター

イベント詳細・日程アンケート画面の「通知」ボタンから呼ばれる（管理者のみ）。

- 全体公開: 大会の登録通知と同じチャンネル（DISCORD_WEBHOOK_URL_TOURNAMENT_NOTIFY）に @everyone で投稿
- メンバー限定: 招待メンバーへの DM か、チャンネルへの全体通知を選ぶ

送った記録は event_notifications に残し、画面の「通知済」表示に使う。
同じものをもう一度送ることもできる（内容を変えたとき用）。
"""

import asyncio
import os
from datetime import date, datetime, timedelta, timezone
from typing import Optional

import aiomysql
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from api.database import db
from api.routers.events import _fix_time_fields

router = APIRouter()

JST = timezone(timedelta(hours=9))
DISCORD_API = 'https://discord.com/api/v10'
APP_URL = 'https://tournament.jujo-softtennis.com/'
WEBHOOK_ENV = 'DISCORD_WEBHOOK_URL_TOURNAMENT_NOTIFY'

TABLE = 'event_notifications'
METHOD_CHANNEL = 'channel'
METHOD_DM = 'dm'

WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日']

_table_ready = False


async def _ensure_table():
    """通知の記録用テーブルが無ければ作る（冪等・初回のみ実行）"""
    global _table_ready
    if _table_ready:
        return
    create_sql = f"""
    CREATE TABLE IF NOT EXISTS {TABLE} (
        id INT AUTO_INCREMENT PRIMARY KEY,
        target_type VARCHAR(10) NOT NULL,
        target_id INT NOT NULL,
        method VARCHAR(10) NOT NULL,
        sent_count INT NOT NULL DEFAULT 0,
        failed_count INT NOT NULL DEFAULT 0,
        notified_by VARCHAR(255) NULL,
        notified_at DATETIME NOT NULL,
        INDEX idx_target (target_type, target_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """
    async with db.pool.acquire() as conn:
        async with conn.cursor() as cursor:
            await cursor.execute(create_sql)
    _table_ready = True


class NotifyRequest(BaseModel):
    method: str  # 'channel' | 'dm'
    actor_discord_id: Optional[str] = None


# ===== 文面 =====

def _to_date(value) -> Optional[date]:
    if value is None or value == '':
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _fmt_date(value) -> str:
    """2026-12-12 → 2026/12/12(土)"""
    d = _to_date(value)
    return f"{d.year}/{d.month:02d}/{d.day:02d}({WEEKDAYS[d.weekday()]})" if d else str(value)


def _fmt_short_date(value) -> str:
    """2026-12-12 → 12/12(土)"""
    d = _to_date(value)
    return f"{d.month}/{d.day}({WEEKDAYS[d.weekday()]})" if d else str(value)


def _fmt_deadline(value) -> Optional[str]:
    """締切日時 → 11/20(金) 23:59"""
    if value is None or value == '':
        return None
    if not isinstance(value, datetime):
        try:
            value = datetime.fromisoformat(str(value).replace(' ', 'T'))
        except ValueError:
            return str(value)
    return f"{value.month}/{value.day}({WEEKDAYS[value.weekday()]}) {value.hour}:{value.minute:02d}"


def _time_range(row: dict) -> Optional[str]:
    fixed = _fix_time_fields({'start_time': row.get('start_time'), 'end_time': row.get('end_time')})
    start, end = fixed.get('start_time'), fixed.get('end_time')
    if not start:
        return None
    return f"{start}〜{end}" if end else f"{start}〜"


def build_event_message(event: dict, dm: bool) -> str:
    """イベントのお知らせ。チャンネルは @everyone 付き、DM はメンバー限定の案内"""
    lines = [] if dm else ['@everyone']
    lines.append('📢 **イベントのお知らせ（メンバー限定）**' if dm else '📢 **イベントのお知らせ**')
    lines.append('')
    lines.append(f"**{event.get('title', '')}**")
    lines.append(f"- 日付: {_fmt_date(event.get('event_date'))}")
    time_range = _time_range(event)
    if time_range:
        lines.append(f"- 時間: {time_range}")
    if event.get('location'):
        lines.append(f"- 場所: {event['location']}")
    deadline = _fmt_deadline(event.get('deadline_date'))
    if deadline:
        lines.append(f"- 参加締切: {deadline}")
    if event.get('max_participants'):
        lines.append(f"- 定員: {event['max_participants']}名")
    lines.append('')
    lines.append('アプリのイベント一覧から参加できます')
    lines.append(APP_URL)
    return '\n'.join(lines)


def build_poll_message(poll: dict, option_dates: list, dm: bool) -> str:
    """日程アンケートの回答のお願い"""
    lines = [] if dm else ['@everyone']
    lines.append('📢 **日程アンケートのお願い（メンバー限定）**' if dm else '📢 **日程アンケートのお願い**')
    lines.append('')
    lines.append(f"**{poll.get('title', '')}**")
    lines.append(f"- 候補日: {'・'.join(_fmt_short_date(d) for d in option_dates)}")
    time_range = _time_range(poll)
    if time_range:
        lines.append(f"- 時間: {time_range}")
    if poll.get('location'):
        lines.append(f"- 場所: {poll['location']}")
    deadline = _fmt_deadline(poll.get('deadline_date'))
    if deadline:
        lines.append(f"- 回答締切: {deadline}")
    lines.append('')
    lines.append('参加できる日に ○ を付けてください。アプリのイベント一覧から回答できます')
    lines.append(APP_URL)
    return '\n'.join(lines)


# ===== 送信 =====

async def _post_with_retry(client, url: str, payload: dict, headers: Optional[dict] = None):
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


async def _post_channel(content: str):
    """大会の登録通知と同じチャンネルに @everyone 付きで投稿する。失敗は 500"""
    webhook_url = os.getenv(WEBHOOK_ENV, '')
    if not webhook_url:
        raise HTTPException(status_code=500, detail=f"通知先のチャンネルが設定されていません（{WEBHOOK_ENV}）")
    async with httpx.AsyncClient() as client:
        res = await _post_with_retry(client, webhook_url,
                                     {'content': content, 'allowed_mentions': {'parse': ['everyone']}})
    if res.status_code not in (200, 204):
        print(f'❌ イベント通知（チャンネル）失敗: status={res.status_code} body={res.text[:200]}')
        raise HTTPException(status_code=500, detail='チャンネルへの通知に失敗しました')


async def _send_dms(discord_ids: list, content: str) -> tuple:
    """Bot から1人ずつ DM を送る。(送れた人数, 送れなかった人数)"""
    token = os.getenv('DISCORD_BOT_TOKEN', '')
    if not token:
        raise HTTPException(status_code=500, detail='DMを送るための設定がありません（DISCORD_BOT_TOKEN）')
    headers = {'Authorization': f'Bot {token}', 'Content-Type': 'application/json'}
    sent = failed = 0
    async with httpx.AsyncClient() as client:
        for discord_id in discord_ids:
            try:
                res = await _post_with_retry(client, f'{DISCORD_API}/users/@me/channels',
                                             {'recipient_id': discord_id}, headers)
                if res.status_code != 200:
                    raise RuntimeError(f'DMチャンネル作成 status={res.status_code}')
                channel_id = res.json()['id']
                res = await _post_with_retry(client, f'{DISCORD_API}/channels/{channel_id}/messages',
                                             {'content': content, 'allowed_mentions': {'parse': []}}, headers)
                if res.status_code not in (200, 201):
                    raise RuntimeError(f'送信 status={res.status_code}')
                sent += 1
            except Exception as e:
                failed += 1
                print(f'❌ イベント通知（DM）失敗: {discord_id} {e}')
    return sent, failed


# ===== DB =====

async def _is_admin(discord_id: Optional[str]) -> bool:
    """イベントの作成・編集ができる人（管理者・大会申込管理者）か。画面のボタン表示と同じ条件"""
    if not discord_id:
        return False
    res = await db.execute_query('player_mst', operation='select', filters={'discord_id': discord_id})
    rows = res.get('data') or []
    if not rows:
        return False
    role = rows[0].get('admin_role')
    return role is not None and role <= 1


async def _invited_discord_ids(invitation_table: str, key: str, target_id: int) -> tuple:
    """招待メンバーの Discord ID（重複なし）と、ID が未登録の人数"""
    sql = (f"SELECT p.discord_id FROM {invitation_table} i "
           f"LEFT JOIN player_mst p ON p.player_id = i.player_id WHERE i.{key} = %s")
    async with db.pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            await cursor.execute(sql, (target_id,))
            rows = await cursor.fetchall()
    ids, missing = [], 0
    for r in rows:
        did = (r.get('discord_id') or '').strip()
        if not did:
            missing += 1
        elif did not in ids:
            ids.append(did)
    return ids, missing


async def _record(target_type: str, target_id: int, method: str, sent: int, failed: int,
                  actor: Optional[str], stamp: datetime):
    async with db.pool.acquire() as conn:
        async with conn.cursor() as cursor:
            await cursor.execute(
                f"INSERT INTO {TABLE} (target_type, target_id, method, sent_count, failed_count, notified_by, notified_at) "
                f"VALUES (%s, %s, %s, %s, %s, %s, %s)",
                (target_type, target_id, method, sent, failed, actor, stamp),
            )


def _now_jst() -> datetime:
    return datetime.now(JST).replace(tzinfo=None, microsecond=0)


# ===== 共通の流れ =====

async def _notify(target_type: str, target_id: int, visibility: Optional[str], body: NotifyRequest,
                  build, invitation_table: str, invitation_key: str) -> dict:
    method = body.method
    if method == METHOD_DM and visibility != 'invited':
        raise HTTPException(status_code=400, detail='全体公開はチャンネルへの通知だけです')

    if method == METHOD_CHANNEL:
        await _post_channel(build(False))
        sent, failed = 1, 0
    else:
        ids, missing = await _invited_discord_ids(invitation_table, invitation_key, target_id)
        if not ids and not missing:
            raise HTTPException(status_code=400, detail='招待メンバーがいません')
        sent, failed = await _send_dms(ids, build(True)) if ids else (0, 0)
        failed += missing

    stamp = _now_jst()
    # DM が1人にも届かなかったときは「通知済」にしない
    if sent > 0:
        await _record(target_type, target_id, method, sent, failed, body.actor_discord_id, stamp)
    return {
        'success': sent > 0,
        'method': method,
        'sent_count': sent,
        'failed_count': failed,
        'notified_at': stamp.isoformat() if sent > 0 else None,
    }


async def _check_request(body: NotifyRequest):
    if body.method not in (METHOD_CHANNEL, METHOD_DM):
        raise HTTPException(status_code=400, detail='送り方が正しくありません')
    if not await _is_admin(body.actor_discord_id):
        raise HTTPException(status_code=403, detail='通知できるのは管理者だけです')
    await _ensure_table()


# ===== エンドポイント =====

@router.get("/event-notifications")
async def get_event_notifications():
    """通知の記録（古い順）。画面はイベント・アンケートごとに最後のものを「通知済」として表示する"""
    try:
        await _ensure_table()
        async with db.pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cursor:
                await cursor.execute(
                    f"SELECT target_type, target_id, method, sent_count, failed_count, notified_at "
                    f"FROM {TABLE} ORDER BY id"
                )
                return list(await cursor.fetchall())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/events/{event_id}/notify")
async def notify_event(event_id: int, body: NotifyRequest):
    """イベントを Discord に通知する（管理者のみ）"""
    try:
        await _check_request(body)
        res = await db.execute_query('events', operation='select', filters={'id': event_id})
        if res.get('error'):
            raise HTTPException(status_code=500, detail=res['error'])
        if not res.get('data'):
            raise HTTPException(status_code=404, detail='イベントが見つかりません')
        event = res['data'][0]
        return await _notify('event', event_id, event.get('visibility'), body,
                             lambda dm: build_event_message(event, dm), 'event_invitations', 'event_id')
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/event-polls/{poll_id}/notify")
async def notify_event_poll(poll_id: int, body: NotifyRequest):
    """日程アンケートを Discord に通知する（管理者のみ・受付中のみ）"""
    try:
        await _check_request(body)
        async with db.pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cursor:
                await cursor.execute("SELECT * FROM event_date_polls WHERE id = %s", (poll_id,))
                poll = await cursor.fetchone()
                if not poll:
                    raise HTTPException(status_code=404, detail='アンケートが見つかりません')
                if poll.get('status') != 'open':
                    raise HTTPException(status_code=400, detail='日程が決まったアンケートは通知できません（決まったイベントから通知してください）')
                await cursor.execute(
                    "SELECT option_date FROM event_date_poll_options WHERE poll_id = %s ORDER BY option_date",
                    (poll_id,),
                )
                option_dates = [r['option_date'] for r in await cursor.fetchall()]
        return await _notify('poll', poll_id, poll.get('visibility'), body,
                             lambda dm: build_poll_message(poll, option_dates, dm),
                             'event_date_poll_invitations', 'poll_id')
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
