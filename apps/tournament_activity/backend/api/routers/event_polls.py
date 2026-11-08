#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
日程アンケートルーター

飲み会などの日程を決めるため、候補日ごとにメンバーが ○ / × で答える。
作成者が「この日に決定」を押すと、その日の普通のイベント（events）を作り、
その日に ○ を付けた人を参加者（event_participants）に入れる。

既存の events / event_participants / event_invitations の構造は変えず、
アンケート側は専用のテーブルに持つ。汎用 execute_query は JOIN・一括挿入・
トランザクションに未対応のため、db.pool を使った生SQLで実装する。
"""

from datetime import date, datetime, timedelta, timezone
from typing import Optional

import aiomysql
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from api.audience import is_restricted, normalize_visibility
from api.database import db
from api.routers.events import _fix_time_fields

router = APIRouter()

JST = timezone(timedelta(hours=9))

POLLS = 'event_date_polls'
OPTIONS = 'event_date_poll_options'
ANSWERS = 'event_date_poll_answers'
INVITATIONS = 'event_date_poll_invitations'

STATUS_OPEN = 'open'
STATUS_DECIDED = 'decided'

MIN_OPTIONS = 2
MAX_OPTIONS = 20

_table_ready = False

_CREATE_SQLS = (
    f"""
    CREATE TABLE IF NOT EXISTS {POLLS} (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        start_time TIME NULL,
        end_time TIME NULL,
        location VARCHAR(255) NULL,
        deadline_date DATETIME NULL,
        max_participants INT NULL,
        visibility VARCHAR(20) NOT NULL DEFAULT 'public',
        created_by VARCHAR(255) NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'open',
        decided_option_id INT NULL,
        decided_event_id INT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,
    f"""
    CREATE TABLE IF NOT EXISTS {OPTIONS} (
        id INT AUTO_INCREMENT PRIMARY KEY,
        poll_id INT NOT NULL,
        option_date DATE NOT NULL,
        UNIQUE KEY uq_poll_date (poll_id, option_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,
    f"""
    CREATE TABLE IF NOT EXISTS {ANSWERS} (
        id INT AUTO_INCREMENT PRIMARY KEY,
        poll_id INT NOT NULL,
        option_id INT NOT NULL,
        player_id INT NOT NULL,
        answer TINYINT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_option_player (option_id, player_id),
        INDEX idx_poll (poll_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,
    f"""
    CREATE TABLE IF NOT EXISTS {INVITATIONS} (
        poll_id INT NOT NULL,
        player_id INT NOT NULL,
        PRIMARY KEY (poll_id, player_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,
)


async def _ensure_tables():
    """アンケート用のテーブルが無ければ作る（冪等・初回のみ実行）"""
    global _table_ready
    if _table_ready:
        return
    async with db.pool.acquire() as conn:
        async with conn.cursor() as cursor:
            for sql in _CREATE_SQLS:
                await cursor.execute(sql)
    _table_ready = True


# ===== 入力 =====

class PollCreate(BaseModel):
    title: str
    option_dates: list[str]
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    location: Optional[str] = None
    deadline_date: Optional[str] = None
    max_participants: Optional[int] = None
    visibility: Optional[str] = 'public'
    created_by: Optional[str] = None
    invited_player_ids: list[int] = []


class PollAnswerItem(BaseModel):
    option_id: int
    answer: int  # 1 = ○, 0 = ×


class PollAnswers(BaseModel):
    player_id: int
    answers: list[PollAnswerItem]


class PollDecide(BaseModel):
    option_id: int
    actor_discord_id: Optional[str] = None


def _blank_to_none(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    value = value.strip()
    return value or None


def _normalize_deadline(value: Optional[str]) -> Optional[str]:
    """datetime-local の値（2026-11-20T23:59）を DATETIME に入る形にする"""
    value = _blank_to_none(value)
    if value is None:
        return None
    return value.replace('T', ' ')


def _normalize_option_dates(values: list[str]) -> list[str]:
    """候補日を YYYY-MM-DD にそろえ、重複を除いて日付順にする。不正な値は 400"""
    seen = set()
    for raw in values:
        s = (raw or '').strip()
        if not s:
            continue
        try:
            d = date.fromisoformat(s[:10])
        except ValueError:
            raise HTTPException(status_code=400, detail=f"候補日の形式が正しくありません: {raw}")
        seen.add(d)
    dates = sorted(seen)
    if len(dates) < MIN_OPTIONS:
        raise HTTPException(status_code=400, detail=f"候補日は{MIN_OPTIONS}日以上入れてください")
    if len(dates) > MAX_OPTIONS:
        raise HTTPException(status_code=400, detail=f"候補日は{MAX_OPTIONS}日までです")
    return [d.isoformat() for d in dates]


def _poll_row(body: PollCreate) -> dict:
    """作成時に event_date_polls へ入れる値"""
    title = (body.title or '').strip()
    if not title:
        raise HTTPException(status_code=400, detail="タイトルは必須です")
    visibility = normalize_visibility(body.visibility)
    if visibility is None:
        raise HTTPException(status_code=400, detail="公開範囲の指定が正しくありません")
    return {
        'title': title,
        'start_time': _blank_to_none(body.start_time),
        'end_time': _blank_to_none(body.end_time),
        'location': _blank_to_none(body.location),
        'deadline_date': _normalize_deadline(body.deadline_date),
        'max_participants': body.max_participants,
        'visibility': visibility,
        'created_by': _blank_to_none(body.created_by),
        'status': STATUS_OPEN,
    }


def _now_jst_naive() -> datetime:
    return datetime.now(JST).replace(tzinfo=None)


def _deadline_passed(deadline, now: datetime) -> bool:
    """回答締切を過ぎたか。締切なしは常に受け付ける"""
    if deadline is None or deadline == '':
        return False
    if isinstance(deadline, str):
        try:
            deadline = datetime.fromisoformat(deadline.replace(' ', 'T'))
        except ValueError:
            return False
    return now > deadline


# ===== 一覧の組み立て =====

def _assemble(polls: list, options: list, answers: list, invitations: list) -> list:
    """4つのテーブルの行から、画面が使う形にまとめる

    - options: 候補日（日付順）と ○ の数
    - respondents: 回答した人（最初に回答した順）と候補日ごとの ○ / ×
    - invited_player_ids: 個人で選んだ人（メンバー限定・会員区分＋個人のとき）
    """
    by_poll = {}
    result = []
    for p in polls:
        item = _fix_time_fields(dict(p))
        item['options'] = []
        item['respondents'] = []
        item['invited_player_ids'] = []
        item['_respondent_index'] = {}
        by_poll[item['id']] = item
        result.append(item)

    option_index = {}
    for o in options:
        poll = by_poll.get(o['poll_id'])
        if poll is None:
            continue
        opt = {'id': o['id'], 'option_date': o['option_date'], 'yes_count': 0}
        option_index[o['id']] = opt
        poll['options'].append(opt)
    for poll in result:
        poll['options'].sort(key=lambda x: str(x['option_date']))

    for a in answers:
        poll = by_poll.get(a['poll_id'])
        opt = option_index.get(a['option_id'])
        if poll is None or opt is None:
            continue
        idx = poll['_respondent_index']
        if a['player_id'] not in idx:
            idx[a['player_id']] = len(poll['respondents'])
            poll['respondents'].append({
                'player_id': a['player_id'],
                'player_name': a.get('player_name'),
                'answers': {},
            })
        answer = 1 if a['answer'] else 0
        poll['respondents'][idx[a['player_id']]]['answers'][str(a['option_id'])] = answer
        if answer:
            opt['yes_count'] += 1

    for inv in invitations:
        poll = by_poll.get(inv['poll_id'])
        if poll is not None:
            poll['invited_player_ids'].append(inv['player_id'])

    for poll in result:
        poll['respondent_count'] = len(poll['respondents'])
        del poll['_respondent_index']
    return result


# ===== エンドポイント =====

@router.get("/event-polls")
async def get_event_polls():
    """日程アンケートの一覧（決定済みも含む。決定済みはイベント詳細の表示に使う）"""
    try:
        await _ensure_tables()
        async with db.pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cursor:
                await cursor.execute(f"SELECT * FROM {POLLS} ORDER BY id")
                polls = await cursor.fetchall()
                await cursor.execute(f"SELECT id, poll_id, option_date FROM {OPTIONS} ORDER BY option_date, id")
                options = await cursor.fetchall()
                await cursor.execute(
                    f"SELECT a.poll_id, a.option_id, a.player_id, a.answer, p.player_name "
                    f"FROM {ANSWERS} a LEFT JOIN player_mst p ON p.player_id = a.player_id "
                    f"ORDER BY a.id"
                )
                answers = await cursor.fetchall()
                await cursor.execute(f"SELECT poll_id, player_id FROM {INVITATIONS}")
                invitations = await cursor.fetchall()
        return _assemble(list(polls), list(options), list(answers), list(invitations))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/event-polls")
async def create_event_poll(body: PollCreate):
    """日程アンケートを作る（候補日・招待者もまとめて保存）"""
    row = _poll_row(body)
    option_dates = _normalize_option_dates(body.option_dates)
    invited = sorted(set(body.invited_player_ids)) if is_restricted(row['visibility']) else []
    try:
        await _ensure_tables()
        async with db.pool.acquire() as conn:
            await conn.begin()
            try:
                async with conn.cursor() as cursor:
                    cols = ', '.join(row.keys())
                    placeholders = ', '.join(['%s'] * len(row))
                    await cursor.execute(
                        f"INSERT INTO {POLLS} ({cols}) VALUES ({placeholders})", list(row.values())
                    )
                    poll_id = cursor.lastrowid
                    await cursor.executemany(
                        f"INSERT INTO {OPTIONS} (poll_id, option_date) VALUES (%s, %s)",
                        [(poll_id, d) for d in option_dates],
                    )
                    if invited:
                        await cursor.executemany(
                            f"INSERT INTO {INVITATIONS} (poll_id, player_id) VALUES (%s, %s)",
                            [(poll_id, pid) for pid in invited],
                        )
                await conn.commit()
            except Exception:
                await conn.rollback()
                raise
        return {'id': poll_id, **row, 'option_dates': option_dates, 'invited_player_ids': invited}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/event-polls/{poll_id}/answers")
async def save_event_poll_answers(poll_id: int, body: PollAnswers):
    """自分の回答を保存する（候補日ごとの ○ / × を上書き）"""
    if not body.answers:
        raise HTTPException(status_code=400, detail="回答がありません")
    if any(a.answer not in (0, 1) for a in body.answers):
        raise HTTPException(status_code=400, detail="回答は ○ か × で選んでください")
    try:
        await _ensure_tables()
        async with db.pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cursor:
                await cursor.execute(f"SELECT status, deadline_date FROM {POLLS} WHERE id = %s", (poll_id,))
                poll = await cursor.fetchone()
                if not poll:
                    raise HTTPException(status_code=404, detail="アンケートが見つかりません")
                if poll['status'] != STATUS_OPEN:
                    raise HTTPException(status_code=400, detail="このアンケートは日程が決まっています")
                if _deadline_passed(poll.get('deadline_date'), _now_jst_naive()):
                    raise HTTPException(status_code=400, detail="回答締切を過ぎています")

                await cursor.execute(f"SELECT id FROM {OPTIONS} WHERE poll_id = %s", (poll_id,))
                valid_ids = {r['id'] for r in await cursor.fetchall()}
                if any(a.option_id not in valid_ids for a in body.answers):
                    raise HTTPException(status_code=400, detail="このアンケートにない候補日が含まれています")

                await cursor.executemany(
                    f"INSERT INTO {ANSWERS} (poll_id, option_id, player_id, answer) VALUES (%s, %s, %s, %s) "
                    f"ON DUPLICATE KEY UPDATE answer = VALUES(answer)",
                    [(poll_id, a.option_id, body.player_id, a.answer) for a in body.answers],
                )
        return {"success": True, "message": "回答を保存しました"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/event-polls/{poll_id}/decide")
async def decide_event_poll(poll_id: int, body: PollDecide):
    """日程を決める。その日のイベントを作り、○ を付けた人を参加者にする（作成者のみ）"""
    try:
        await _ensure_tables()
        async with db.pool.acquire() as conn:
            await conn.begin()
            try:
                async with conn.cursor(aiomysql.DictCursor) as cursor:
                    # 二重に押されても1つしかイベントを作らないよう、行をロックしてから状態を見る
                    await cursor.execute(f"SELECT * FROM {POLLS} WHERE id = %s FOR UPDATE", (poll_id,))
                    poll = await cursor.fetchone()
                    if not poll:
                        raise HTTPException(status_code=404, detail="アンケートが見つかりません")
                    if not body.actor_discord_id or body.actor_discord_id != poll.get('created_by'):
                        raise HTTPException(status_code=403, detail="日程を決められるのは作成者だけです")
                    if poll['status'] != STATUS_OPEN:
                        raise HTTPException(status_code=409, detail="このアンケートは既に日程が決まっています")

                    await cursor.execute(
                        f"SELECT option_date FROM {OPTIONS} WHERE id = %s AND poll_id = %s",
                        (body.option_id, poll_id),
                    )
                    option = await cursor.fetchone()
                    if not option:
                        raise HTTPException(status_code=404, detail="候補日が見つかりません")

                    event = _event_row(poll, option['option_date'])
                    cols = ', '.join(event.keys())
                    placeholders = ', '.join(['%s'] * len(event))
                    await cursor.execute(f"INSERT INTO events ({cols}) VALUES ({placeholders})", list(event.values()))
                    event_id = cursor.lastrowid

                    await cursor.execute(
                        f"INSERT INTO event_participants (event_id, player_id) "
                        f"SELECT %s, player_id FROM {ANSWERS} WHERE option_id = %s AND answer = 1",
                        (event_id, body.option_id),
                    )
                    participant_count = cursor.rowcount

                    if is_restricted(poll.get('visibility')):
                        await cursor.execute(
                            f"INSERT INTO event_invitations (event_id, player_id) "
                            f"SELECT %s, player_id FROM {INVITATIONS} WHERE poll_id = %s",
                            (event_id, poll_id),
                        )

                    await cursor.execute(
                        f"UPDATE {POLLS} SET status = %s, decided_option_id = %s, decided_event_id = %s WHERE id = %s",
                        (STATUS_DECIDED, body.option_id, event_id, poll_id),
                    )
                await conn.commit()
            except Exception:
                await conn.rollback()
                raise
        return {
            'success': True,
            'event_id': event_id,
            'event_date': str(option['option_date']),
            'participant_count': participant_count,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _event_row(poll: dict, option_date) -> dict:
    """決定した日のイベントとして events に入れる値（値の無い列は入れない＝既存の作成と同じ）

    回答締切はアンケートのものなので、イベントの参加締切には引き継がない。
    """
    fixed = _fix_time_fields({'start_time': poll.get('start_time'), 'end_time': poll.get('end_time')})
    row = {
        'title': poll['title'],
        'event_date': str(option_date),
        'start_time': fixed.get('start_time'),
        'end_time': fixed.get('end_time'),
        'location': poll.get('location'),
        'max_participants': poll.get('max_participants'),
        'visibility': poll.get('visibility') or 'public',
        'created_by': poll.get('created_by'),
    }
    return {k: v for k, v in row.items() if v is not None}


@router.delete("/event-polls/{poll_id}")
async def delete_event_poll(poll_id: int, actor_discord_id: Optional[str] = None):
    """アンケートを削除する（作成者のみ）。決定後に作られたイベントは消さない"""
    try:
        await _ensure_tables()
        async with db.pool.acquire() as conn:
            await conn.begin()
            try:
                async with conn.cursor(aiomysql.DictCursor) as cursor:
                    await cursor.execute(f"SELECT created_by FROM {POLLS} WHERE id = %s", (poll_id,))
                    poll = await cursor.fetchone()
                    if not poll:
                        raise HTTPException(status_code=404, detail="アンケートが見つかりません")
                    if not actor_discord_id or actor_discord_id != poll.get('created_by'):
                        raise HTTPException(status_code=403, detail="削除できるのは作成者だけです")
                    await cursor.execute(f"DELETE FROM {ANSWERS} WHERE poll_id = %s", (poll_id,))
                    await cursor.execute(f"DELETE FROM {OPTIONS} WHERE poll_id = %s", (poll_id,))
                    await cursor.execute(f"DELETE FROM {INVITATIONS} WHERE poll_id = %s", (poll_id,))
                    await cursor.execute(f"DELETE FROM {POLLS} WHERE id = %s", (poll_id,))
                await conn.commit()
            except Exception:
                await conn.rollback()
                raise
        return {"success": True, "message": "アンケートを削除しました"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
