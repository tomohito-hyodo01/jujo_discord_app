#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
練習予定ルーター

練習スケジュールと参加者の管理
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import timedelta, datetime, date as _date, timezone
import asyncio
import os
import aiomysql
import httpx
from api.database import db


# 練習時刻変更時の通知先Discordチャンネル
PRACTICE_TIME_CHANGE_NOTIFY_CHANNEL_ID = "1488129055017533620"
_WEEKDAY_JP = ['月', '火', '水', '木', '金', '土', '日']


def _normalize_time(v) -> Optional[str]:
    """timedelta/秒数/文字列 を 'HH:MM' に正規化"""
    if v is None:
        return None
    if isinstance(v, timedelta):
        total = int(v.total_seconds())
        return f"{total // 3600:02d}:{(total % 3600) // 60:02d}"
    if isinstance(v, (int, float)):
        total = int(v)
        return f"{total // 3600:02d}:{(total % 3600) // 60:02d}"
    if isinstance(v, str):
        return v[:5]
    return None


async def _notify_practice_time_extended(
    practice_date, old_start: Optional[str], old_end: Optional[str],
    new_start: str, new_end: str
):
    """練習時間が延長された場合のみDiscordチャンネルへ @everyone 付きで通知"""
    bot_token = os.getenv('DISCORD_BOT_TOKEN', '')
    if not bot_token or not PRACTICE_TIME_CHANGE_NOTIFY_CHANNEL_ID:
        return
    if not old_start or not old_end or not new_start or not new_end:
        return

    # 延長判定: 新しい範囲が旧範囲を完全に内包し、いずれかが拡張されていること
    end_extended = new_end > old_end
    start_extended = new_start < old_start
    if not (end_extended or start_extended):
        return  # 短縮・時刻シフトの場合は通知しない

    # 「コートが HH:MM〜 追加できましたので」の HH:MM
    # 終了時刻が延長された場合は旧end、開始時刻が延長された場合は新start
    added_start = old_end if end_extended else new_start

    try:
        if isinstance(practice_date, str):
            d = datetime.fromisoformat(practice_date.replace(' ', 'T')).date()
        elif isinstance(practice_date, datetime):
            d = practice_date.date()
        elif isinstance(practice_date, _date):
            d = practice_date
        else:
            return
        date_str = f"{d.month}/{d.day}({_WEEKDAY_JP[d.weekday()]})"
        content = (
            f"@everyone\n"
            f"{date_str}の練習はコートが{added_start}〜追加できましたので、\n"
            f"{new_start}〜{new_end}\n"
            f"となります。"
        )

        headers = {'Authorization': f'Bot {bot_token}', 'Content-Type': 'application/json'}
        async with httpx.AsyncClient() as client:
            res = await client.post(
                f'https://discord.com/api/v10/channels/{PRACTICE_TIME_CHANGE_NOTIFY_CHANNEL_ID}/messages',
                headers=headers,
                json={'content': content, 'allowed_mentions': {'parse': ['everyone']}},
                timeout=5.0,
            )
            if res.status_code in (200, 201):
                print(f'✅ 練習時間延長通知送信成功: {content}')
            else:
                print(f'⚠️ 練習時間延長通知失敗: status={res.status_code} body={res.text[:200]}')
    except Exception as e:
        print(f'⚠️ 練習時間延長通知失敗: {e}')


def _fix_time_fields(schedule: dict) -> dict:
    """MariaDBのTIME型がtimedeltaや秒数で返る場合を文字列に変換"""
    for field in ('start_time', 'end_time'):
        val = schedule.get(field)
        if val is None:
            continue
        if isinstance(val, timedelta):
            total = int(val.total_seconds())
            schedule[field] = f"{total // 3600:02d}:{(total % 3600) // 60:02d}"
        elif isinstance(val, (int, float)):
            total = int(val)
            schedule[field] = f"{total // 3600:02d}:{(total % 3600) // 60:02d}"
        elif isinstance(val, str) and len(val) >= 5:
            schedule[field] = val[:5]
    return schedule

router = APIRouter()


class PracticeCreate(BaseModel):
    practice_date: str
    start_time: str
    end_time: str
    location: str
    court_number: Optional[str] = None
    deadline_date: Optional[str] = None
    visibility: Optional[str] = 'public'


class PracticeUpdate(BaseModel):
    practice_date: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    location: Optional[str] = None
    court_number: Optional[str] = None
    status: Optional[str] = None
    visibility: Optional[str] = None
    deadline_date: Optional[str] = None


class InvitationUpdate(BaseModel):
    player_ids: list[int]


class CourtReservation(BaseModel):
    start_time: str
    end_time: str
    reserver_name: str


class PracticeJoin(BaseModel):
    player_id: int
    actor_discord_id: Optional[str] = None  # 操作者（管理者なら締切後も追加可）


async def _is_admin_actor(discord_id: Optional[str]) -> bool:
    """操作者が管理者(admin_role=0)または練習管理者(practice_admin=1)か"""
    if not discord_id:
        return False
    res = await db.execute_query('player_mst', operation='select', filters={'discord_id': discord_id})
    if not res.get('data'):
        return False
    row = res['data'][0]
    return row.get('admin_role') == 0 or row.get('practice_admin') == 1


@router.get("/practice")
async def get_practice_schedules():
    """練習予定一覧を取得（参加者数付き）"""
    try:
        result = await db.execute_query(
            'practice_schedule',
            operation='select'
        )
        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        schedules = result.get('data', [])
        # 時刻フィールドを文字列に変換
        schedules = [_fix_time_fields(s) for s in schedules]
        # 日付順にソート
        schedules.sort(key=lambda s: s.get('practice_date', ''))

        for schedule in schedules:
            participants_result = await db.execute_query(
                'practice_participants',
                operation='select',
                filters={'practice_id': schedule['id']}
            )
            participants = participants_result.get('data', [])
            schedule['participant_count'] = len(participants)

            # コート予約数
            r_result = await db.execute_query(
                'practice_court_reservations',
                operation='select',
                filters={'practice_id': schedule['id']}
            )
            schedule['reservation_count'] = len(r_result.get('data', []) or [])

            # 参加者名を取得
            names = []
            for pt in participants:
                player_result = await db.execute_query(
                    'player_mst',
                    operation='select',
                    filters={'player_id': pt['player_id']}
                )
                player_data = player_result.get('data', [])
                if player_data:
                    names.append(player_data[0]['player_name'])
            schedule['participant_names'] = names

            # 招待者リスト（visibility=invitedの場合）
            if schedule.get('visibility') == 'invited':
                inv_result = await db.execute_query(
                    'practice_invitations', operation='select',
                    filters={'practice_id': schedule['id']}
                )
                schedule['invited_player_ids'] = [r['player_id'] for r in (inv_result.get('data') or [])]
            else:
                schedule['invited_player_ids'] = []

        return schedules
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/practice/{practice_id}/participants")
async def get_practice_participants(practice_id: int):
    """練習の参加者一覧を取得（選手名付き）"""
    try:
        result = await db.execute_query(
            'practice_participants',
            operation='select',
            filters={'practice_id': practice_id}
        )
        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        participants = result.get('data', [])

        for participant in participants:
            player_result = await db.execute_query(
                'player_mst',
                operation='select',
                filters={'player_id': participant['player_id']}
            )
            player_data = player_result.get('data', [])
            participant['player_name'] = player_data[0]['player_name'] if player_data else None

        return participants
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _deadline_passed(deadline) -> bool:
    """締切が過ぎているか。日付のみ(時刻0:00)の締切は当日終日(23:59:59)を締切とみなす。"""
    if not deadline:
        return False
    s = str(deadline).replace(' ', 'T')
    if len(s) <= 10:
        s = s[:10] + 'T23:59:59'
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        return False
    if dt.hour == 0 and dt.minute == 0 and dt.second == 0:
        dt = dt.replace(hour=23, minute=59, second=59)
    return dt < datetime.now()


@router.post("/practice/{practice_id}/join")
async def join_practice(practice_id: int, body: PracticeJoin):
    """練習に参加（締切後・受付締切は不可。ただし管理者は任意に追加可）"""
    try:
        # 締切/受付状態チェック（UIをすり抜けた直接呼び出しも防ぐ）
        p_res = await db.execute_query(
            'practice_schedule', operation='select', filters={'id': practice_id}
        )
        if not p_res.get('data'):
            raise HTTPException(status_code=404, detail="練習が見つかりません")
        practice_row = p_res['data'][0]
        # 管理者・練習管理者は締切後/受付締切でも追加できる
        is_admin = await _is_admin_actor(body.actor_discord_id)
        if not is_admin:
            if practice_row.get('closed') == 1:
                raise HTTPException(status_code=400, detail="この練習は受付を締め切りました")
            if _deadline_passed(practice_row.get('deadline_date')):
                raise HTTPException(status_code=400, detail="申込期限を過ぎています")

        existing = await db.execute_query(
            'practice_participants',
            operation='select',
            filters={'practice_id': practice_id, 'player_id': body.player_id}
        )
        if existing.get('data'):
            return {"success": True, "message": "既に参加登録済みです"}

        result = await db.execute_query(
            'practice_participants',
            operation='insert',
            data={'practice_id': practice_id, 'player_id': body.player_id}
        )
        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        return {"success": True, "message": "参加登録しました"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/practice/{practice_id}/leave/{player_id}")
async def leave_practice(practice_id: int, player_id: int, discord_id: Optional[str] = None):
    """練習の参加をキャンセル（締切後は管理者のみ可）"""
    try:
        # 締切チェック
        p_res = await db.execute_query(
            'practice_schedule', operation='select', filters={'id': practice_id}
        )
        if not p_res.get('data'):
            raise HTTPException(status_code=404, detail="練習が見つかりません")
        deadline = p_res['data'][0].get('deadline_date')
        if deadline:
            if _deadline_passed(deadline):
                # 管理者 or 練習管理者は締切後でも削除可
                is_admin = False
                if discord_id:
                    a_res = await db.execute_query(
                        'player_mst', operation='select', filters={'discord_id': discord_id}
                    )
                    if a_res.get('data'):
                        row = a_res['data'][0]
                        if row.get('admin_role') == 0 or row.get('practice_admin') == 1:
                            is_admin = True
                if not is_admin:
                    raise HTTPException(status_code=400, detail="締切後はキャンセルできません")

        result = await db.execute_query(
            'practice_participants',
            operation='delete',
            filters={'practice_id': practice_id, 'player_id': player_id}
        )
        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        return {"success": True, "message": "参加をキャンセルしました"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/practice")
async def create_practice(practice: PracticeCreate):
    """練習予定を作成"""
    try:
        result = await db.execute_query(
            'practice_schedule',
            operation='insert',
            data=practice.model_dump()
        )
        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        return result.get('data', [{}])[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/practice/{practice_id}")
async def update_practice(practice_id: int, practice: PracticeUpdate):
    """練習予定を更新"""
    try:
        raw = practice.model_dump()
        # None（未送信）は除外。空文字はNULLクリアとして扱う
        update_data = {}
        for k, v in raw.items():
            if v is None:
                continue
            if v == '' and k in ('court_number', 'deadline_date'):
                update_data[k] = None  # 空文字 → NULLに変換（締切クリア対応）
            else:
                update_data[k] = v
        if not update_data:
            return {"success": True, "message": "変更なし"}

        # 既存値を取得（時刻変更検出＆監査ログ用）
        prev = await db.execute_query(
            'practice_schedule', operation='select', filters={'id': practice_id}
        )
        existing = prev['data'][0] if prev.get('data') else None

        result = await db.execute_query(
            'practice_schedule',
            operation='update',
            filters={'id': practice_id},
            data=update_data
        )
        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        # 監査ログ: 練習更新の前後差分
        try:
            from api.routers.audit import record_change
            await record_change(
                action='PRACTICE_UPDATE', target_type='practice', target_id=practice_id,
                summary=f"練習更新: {(existing or {}).get('practice_date','')} {(existing or {}).get('location','')}",
                before={k: (existing or {}).get(k) for k in update_data.keys()},
                after=update_data,
            )
        except Exception as _e:
            print(f"⚠️ 監査ログ(練習更新)失敗: {_e}")

        # 練習時間が延長された場合のみ通知
        if existing is not None:
            old_start = _normalize_time(existing.get('start_time'))
            old_end = _normalize_time(existing.get('end_time'))
            new_start = update_data.get('start_time', old_start)
            new_end = update_data.get('end_time', old_end)
            if old_start and old_end and new_start and new_end:
                practice_date_for_msg = update_data.get('practice_date') or existing.get('practice_date')
                try:
                    await _notify_practice_time_extended(
                        practice_date_for_msg, old_start, old_end, new_start, new_end
                    )
                except Exception as e:
                    print(f'⚠️ 通知処理エラー（更新自体は成功）: {e}')

        return {"success": True, "message": "練習予定を更新しました"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/practice/{practice_id}/toggle-closed")
async def toggle_practice_closed(practice_id: int):
    """練習の受付を締切/再開する"""
    try:
        result = await db.execute_query(
            'practice_schedule',
            operation='select',
            filters={'id': practice_id}
        )
        if not result.get('data'):
            raise HTTPException(status_code=404, detail="練習が見つかりません")

        current = result['data'][0]
        new_closed = 0 if current.get('closed', 0) else 1

        update_result = await db.execute_query(
            'practice_schedule',
            operation='update',
            filters={'id': practice_id},
            data={'closed': new_closed}
        )
        if update_result.get('error'):
            raise HTTPException(status_code=500, detail=update_result['error'])

        return {"success": True, "closed": new_closed}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/practice/{practice_id}")
async def delete_practice(practice_id: int):
    """練習予定を削除（CASCADEで参加者も削除）"""
    try:
        result = await db.execute_query(
            'practice_schedule',
            operation='delete',
            filters={'id': practice_id}
        )
        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        return {"success": True, "message": "練習予定を削除しました"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/practice/{practice_id}/invitations")
async def update_invitations(practice_id: int, body: InvitationUpdate):
    """練習の招待者リストを更新（全置換）"""
    try:
        # 既存の招待を削除
        await db.execute_query(
            'practice_invitations', operation='delete',
            filters={'practice_id': practice_id}
        )
        # 新しい招待を挿入
        for pid in body.player_ids:
            await db.execute_query(
                'practice_invitations', operation='insert',
                data={'practice_id': practice_id, 'player_id': pid}
            )
        return {"success": True, "message": f"{len(body.player_ids)}名を招待しました"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/practice/{practice_id}/invitations")
async def get_invitations(practice_id: int):
    """練習の招待者リストを取得"""
    try:
        result = await db.execute_query(
            'practice_invitations', operation='select',
            filters={'practice_id': practice_id}
        )
        return result.get('data', [])
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- コート予約 ---

@router.get("/practice/{practice_id}/reservations")
async def get_reservations(practice_id: int):
    """練習のコート予約一覧を取得"""
    try:
        result = await db.execute_query(
            'practice_court_reservations', operation='select',
            filters={'practice_id': practice_id}
        )
        reservations = result.get('data', [])
        for r in reservations:
            r = _fix_time_fields_reservation(r)
        # 時間順にソート
        reservations.sort(key=lambda r: (r.get('start_time', ''), r.get('end_time', '')))
        return reservations
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/practice/{practice_id}/reservations")
async def add_reservation(practice_id: int, body: CourtReservation):
    """コート予約を追加"""
    try:
        result = await db.execute_query(
            'practice_court_reservations', operation='insert',
            data={
                'practice_id': practice_id,
                'start_time': body.start_time,
                'end_time': body.end_time,
                'reserver_name': body.reserver_name,
            }
        )
        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])
        return {"success": True, "message": "コート予約を追加しました"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/practice/reservations/{reservation_id}")
async def update_reservation(reservation_id: int, body: CourtReservation):
    """コート予約を更新"""
    try:
        result = await db.execute_query(
            'practice_court_reservations', operation='update',
            filters={'id': reservation_id},
            data={
                'start_time': body.start_time,
                'end_time': body.end_time,
                'reserver_name': body.reserver_name,
            }
        )
        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])
        return {"success": True, "message": "コート予約を更新しました"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/practice/reservations/{reservation_id}")
async def delete_reservation(reservation_id: int):
    """コート予約を削除"""
    try:
        result = await db.execute_query(
            'practice_court_reservations', operation='delete',
            filters={'id': reservation_id}
        )
        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])
        return {"success": True, "message": "コート予約を削除しました"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _fix_time_fields_reservation(record: dict) -> dict:
    for field in ('start_time', 'end_time'):
        val = record.get(field)
        if val is None:
            continue
        if isinstance(val, timedelta):
            total = int(val.total_seconds())
            record[field] = f"{total // 3600:02d}:{(total % 3600) // 60:02d}"
        elif isinstance(val, (int, float)):
            total = int(val)
            record[field] = f"{total // 3600:02d}:{(total % 3600) // 60:02d}"
        elif isinstance(val, str) and len(val) >= 5:
            record[field] = val[:5]
    return record


# --- 予約者通知（2日前の9:00にcronで実行） ---

PRACTICE_NOTIFY_CHANNEL_ID = '1489117062952390817'


@router.post("/practice/{practice_id}/notify-reservations")
async def notify_practice_reservations(practice_id: int):
    """指定した練習の予約者をDiscordチャンネルに通知"""
    import os
    import httpx

    DISCORD_BOT_TOKEN = os.getenv('DISCORD_BOT_TOKEN', '')
    if not DISCORD_BOT_TOKEN:
        raise HTTPException(status_code=500, detail="BOT_TOKEN未設定")

    # 練習情報を取得
    p_result = await db.execute_query(
        'practice_schedule', operation='select',
        filters={'id': practice_id}
    )
    if not p_result.get('data'):
        raise HTTPException(status_code=404, detail="練習が見つかりません")
    practice = p_result['data'][0]

    # コート予約を取得
    r_result = await db.execute_query(
        'practice_court_reservations', operation='select',
        filters={'practice_id': practice_id}
    )
    reservations = r_result.get('data', []) or []
    if not reservations:
        raise HTTPException(status_code=400, detail="予約者が登録されていません")

    for r in reservations:
        r = _fix_time_fields_reservation(r)
    reservations.sort(key=lambda r: (r.get('start_time', ''), r.get('end_time', '')))

    # メッセージ組み立て
    p_date = practice['practice_date']
    if hasattr(p_date, 'strftime'):
        p_date_str = p_date.strftime('%Y/%m/%d')
        weekday = '月火水木金土日'[p_date.weekday()]
        date_label = f"{p_date_str}({weekday})"
    else:
        date_label = str(p_date)

    lines = [f"📋 **{date_label} {practice['location']} コート予約**"]
    for r in reservations:
        lines.append(f"・{r['start_time']}〜{r['end_time']}  {r['reserver_name']}")

    content = '\n'.join(lines)

    # Discordチャンネルに投稿
    headers = {
        'Authorization': f'Bot {DISCORD_BOT_TOKEN}',
        'Content-Type': 'application/json',
    }
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f'https://discord.com/api/v10/channels/{PRACTICE_NOTIFY_CHANNEL_ID}/messages',
                headers=headers,
                json={'content': content},
                timeout=5.0,
            )
            if resp.status_code in [200, 201]:
                return {"success": True, "message": "通知を送信しました"}
            else:
                raise HTTPException(status_code=500, detail=f"送信失敗: {resp.status_code}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/practice/notify-upcoming-reservations")
async def notify_upcoming_reservations():
    """翌日に開催される練習の予約者をDiscordチャンネルに通知（毎週金曜8:00のcronで翌土曜分を通知）"""
    import os
    import httpx
    from datetime import date, timedelta as td

    DISCORD_BOT_TOKEN = os.getenv('DISCORD_BOT_TOKEN', '')
    if not DISCORD_BOT_TOKEN:
        raise HTTPException(status_code=500, detail="BOT_TOKEN未設定")

    # 翌日の日付（金曜実行→翌土曜の練習が対象）
    target_date = (date.today() + td(days=1)).isoformat()

    # 対象練習を取得
    result = await db.execute_query(
        'practice_schedule', operation='select',
        filters={'practice_date': target_date}
    )
    practices = result.get('data', []) or []

    sent = []
    for practice in practices:
        practice_id = practice['id']
        # コート予約を取得
        res = await db.execute_query(
            'practice_court_reservations', operation='select',
            filters={'practice_id': practice_id}
        )
        reservations = res.get('data', []) or []
        if not reservations:
            continue

        for r in reservations:
            r = _fix_time_fields_reservation(r)
        reservations.sort(key=lambda r: (r.get('start_time', ''), r.get('end_time', '')))

        # メッセージ組み立て
        p_date = practice['practice_date']
        if hasattr(p_date, 'strftime'):
            p_date_str = p_date.strftime('%Y/%m/%d')
            weekday = '月火水木金土日'[p_date.weekday()]
            date_label = f"{p_date_str}({weekday})"
        else:
            date_label = str(p_date)

        lines = [f"📋 **{date_label} {practice['location']} コート予約**"]
        for r in reservations:
            lines.append(f"・{r['start_time']}〜{r['end_time']}  {r['reserver_name']}")

        content = '\n'.join(lines)

        # Discordチャンネルに投稿
        headers = {
            'Authorization': f'Bot {DISCORD_BOT_TOKEN}',
            'Content-Type': 'application/json',
        }
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    f'https://discord.com/api/v10/channels/{PRACTICE_NOTIFY_CHANNEL_ID}/messages',
                    headers=headers,
                    json={'content': content},
                    timeout=5.0,
                )
                if resp.status_code in [200, 201]:
                    sent.append({'practice_id': practice_id, 'status': 'sent'})
                else:
                    sent.append({'practice_id': practice_id, 'status': f'failed: {resp.status_code}'})
        except Exception as e:
            sent.append({'practice_id': practice_id, 'status': f'error: {e}'})

    return {"success": True, "target_date": target_date, "sent_count": len(sent), "results": sent}


# --- 練習前日リマインド（参加予定者をメンションして通知） ---
#
# 「サイトで参加にしているのに当日来ない」「参加にしていないのに来る」を減らすため、
# 練習の前日19:00に参加予定者を個別メンションしてinfoチャンネルへ投稿する。
# 実行は X-Server の cron → scripts/notify_practice_reminder.sh 経由。

# リマインドの投稿先（infoチャンネル）。環境ごとに差し替えられるよう環境変数で上書き可能
PRACTICE_REMINDER_CHANNEL_ID = os.getenv('PRACTICE_REMINDER_CHANNEL_ID', '1427122263383216188')

# リマインドを投稿する練習の公開範囲。
# 参加者一覧を公開チャンネルへ出すことになるため、サイト上で誰でも閲覧できる練習に限る。
# （限定公開の練習は Home.tsx の canView で閲覧者を絞っており、
#   invited は招待リスト、members_* は会員区分でそれぞれ非公開にしている）
REMINDER_TARGET_VISIBILITIES = {'', 'public'}

# allowed_mentions.users に指定できるIDの上限（Discord API仕様）
_ALLOWED_MENTION_USERS_LIMIT = 100

JST = timezone(timedelta(hours=9))


def _today_jst() -> _date:
    """今日の日付（JST固定）。サーバのタイムゾーン設定に依存させないため明示する"""
    return datetime.now(JST).date()


def _to_date(value) -> Optional[_date]:
    """DATE型/日時/文字列を date に正規化（変換できなければ None）"""
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, _date):
        return value
    if isinstance(value, str):
        try:
            return _date.fromisoformat(value[:10])
        except ValueError:
            return None
    return None


def _format_practice_date(value) -> str:
    """練習日を '2026/08/11(火)' 形式に整形"""
    d = _to_date(value)
    if d is None:
        return str(value)
    return f"{d.year}/{d.month:02d}/{d.day:02d}({_WEEKDAY_JP[d.weekday()]})"


def _split_for_discord(content: str, limit: int = 1900) -> list:
    """Discordのメッセージ長制限(2000文字)に収まるよう行単位で分割。
    1行が limit を超える場合はその行自体も分割する（メンション行が並ぶため行数が多くなる）"""
    if len(content) <= limit:
        return [content]

    chunks = []
    current = ''
    for line in content.split('\n'):
        # 1行単体が上限を超える場合は文字数で強制分割する
        while len(line) > limit:
            if current:
                chunks.append(current.rstrip('\n'))
                current = ''
            chunks.append(line[:limit])
            line = line[limit:]
        if current and len(current) + len(line) + 1 > limit:
            chunks.append(current.rstrip('\n'))
            current = ''
        current += line + '\n'
    if current.strip():
        chunks.append(current.rstrip('\n'))
    return chunks


async def _fetch_participants_with_discord(practice_id: int) -> list:
    """練習の参加者を discord_id 付きで一括取得（db.execute_query はJOINできないため生SQL）"""
    async with db.pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            await cursor.execute(
                """SELECT p.player_id, p.player_name, p.discord_id
                   FROM practice_participants pp
                   JOIN player_mst p ON p.player_id = pp.player_id
                   WHERE pp.practice_id = %s
                   ORDER BY p.player_name""",
                (practice_id,),
            )
            return list(await cursor.fetchall())


def _mentionable_discord_id(participant: dict) -> Optional[str]:
    """メンションに使える discord_id を返す（未連携・不正値は None）"""
    did = str(participant.get('discord_id') or '').strip()
    return did if did.isdigit() else None


def _build_reminder_message(practice: dict, participants: list) -> tuple:
    """リマインド本文とメンション対象のdiscord_id一覧を組み立てる"""
    schedule = _fix_time_fields(dict(practice))
    start, end = schedule.get('start_time'), schedule.get('end_time')
    if start and end:
        time_label = f" {start}〜{end}"
    elif start:
        time_label = f" {start}〜"
    else:
        time_label = ''

    place = f"📍 {practice.get('location') or '場所未定'}"
    court = practice.get('court_number')
    if court:
        place += f"（コート{court}）"

    lines = [
        '📢 **明日の練習は下記となりますのでお間違えのないようお願いいたします。**',
        '',
        f"📅 {_format_practice_date(practice.get('practice_date'))}{time_label}",
        place,
        '',
        f"【参加予定 {len(participants)}名】",
    ]

    mention_ids = []
    for participant in participants:
        name = participant.get('player_name') or '(名前未登録)'
        did = _mentionable_discord_id(participant)
        if did:
            mention_ids.append(did)
            lines.append(f"・<@{did}> {name}")
        else:
            lines.append(f"・{name}")

    return '\n'.join(lines), mention_ids


def _allowed_mentions_for(chunk: str, mention_ids: list) -> dict:
    """そのチャンクに実際に載っている参加者だけを許可する allowed_mentions を組み立てる

    parse を空にして users を列挙することで、選手名などに紛れ込んだ
    @everyone / ロール / 他人のメンション記法が発火しないようにする。
    users は最大100件だが、1チャンクは1900文字以内でメンション1件が約22文字を占めるため
    自然に上限を下回る。念のため上限で切っておく。
    """
    users = [did for did in mention_ids if f'<@{did}>' in chunk]
    return {'parse': [], 'users': users[:_ALLOWED_MENTION_USERS_LIMIT]}


async def _post_reminder_to_channel(content: str, mention_ids: list) -> tuple:
    """リマインドをDiscordチャンネルへ投稿し、(投稿できたチャンク数, 全チャンク数) を返す

    分割投稿の途中で失敗したかを呼び出し側が判別できるよう、bool ではなく件数を返す。
    """
    chunks = _split_for_discord(content)

    bot_token = os.getenv('DISCORD_BOT_TOKEN', '')
    if not bot_token or not PRACTICE_REMINDER_CHANNEL_ID:
        print('⚠️ 練習リマインド: DISCORD_BOT_TOKEN または投稿先チャンネルが未設定')
        return 0, len(chunks)

    headers = {'Authorization': f'Bot {bot_token}', 'Content-Type': 'application/json'}
    url = f'https://discord.com/api/v10/channels/{PRACTICE_REMINDER_CHANNEL_ID}/messages'

    posted = 0
    try:
        async with httpx.AsyncClient() as client:
            for chunk in chunks:
                payload = {'content': chunk,
                           'allowed_mentions': _allowed_mentions_for(chunk, mention_ids)}
                res = await client.post(url, headers=headers, json=payload, timeout=10.0)
                # 同じ日に複数の練習があると連続投稿になるため、レート制限は1度だけ待って再送する
                if res.status_code == 429:
                    try:
                        wait = float(res.headers.get('Retry-After', '1'))
                    except ValueError:
                        wait = 1.0
                    await asyncio.sleep(min(wait, 10.0))
                    res = await client.post(url, headers=headers, json=payload, timeout=10.0)
                if res.status_code not in (200, 201):
                    print(f'⚠️ 練習リマインド送信失敗: status={res.status_code} body={res.text[:200]}')
                    return posted, len(chunks)
                posted += 1
    except Exception as e:
        print(f'⚠️ 練習リマインド送信エラー: {e}')
    return posted, len(chunks)


def _reminder_stamp() -> datetime:
    """reminder_sent_at に書き込む日時（JST・秒精度）

    DATETIME列は既定で秒精度のため、マイクロ秒を落として書き込む。
    こうしないと「自分が書いた値と一致する行だけ巻き戻す」条件が丸め誤差で外れる。
    """
    return datetime.now(JST).replace(tzinfo=None, microsecond=0)


def _is_missing_reminder_column(e: Exception) -> bool:
    """reminder_sent_at カラムが無いことによるエラーか（ALTER未適用の環境）

    一時的なDBエラーまで「カラム未追加」とみなして送信を続けると二重送信になるため、
    カラム欠落だけを見分ける。
    """
    message = str(e)
    if 'reminder_sent_at' not in message:
        return False
    code = e.args[0] if e.args else None
    return code == 1054 or 'Unknown column' in message  # 1054 = MySQL ER_BAD_FIELD_ERROR


async def _claim_reminder(practice_id: int, stamp: datetime) -> Optional[bool]:
    """リマインドの送信権を獲得する（二重送信防止）

    戻り値: True=獲得（未送信だった）／False=既に送信済み／None=判定不能（カラム未追加）
    ALTER 未適用の環境でも機能自体は動くよう、カラム欠落のときだけ送信を止めない。
    それ以外のDBエラーは呼び出し側で失敗として扱えるようそのまま送出する。
    """
    try:
        async with db.pool.acquire() as conn:
            async with conn.cursor() as cursor:
                await cursor.execute(
                    "UPDATE practice_schedule SET reminder_sent_at = %s "
                    "WHERE id = %s AND reminder_sent_at IS NULL",
                    (stamp, practice_id),
                )
                return cursor.rowcount > 0
    except Exception as e:
        if not _is_missing_reminder_column(e):
            raise
        print(f'⚠️ 練習リマインドの送信済み判定をスキップ（reminder_sent_at 未追加）: {e}')
        return None


async def _release_reminder(practice_id: int, stamp: datetime) -> bool:
    """自分が立てた送信権だけをNULLへ戻す（戻せたらTrue）

    無条件に NULL を書くと、並行して走った別の実行が立てた「送信済み」を
    打ち消して三重送信になりうるため、自分が書いた値と一致する行だけを戻す。
    戻せなかった場合は「未送信なのに送信済みとして残る」ので、呼び出し側で結果に出す。
    """
    try:
        async with db.pool.acquire() as conn:
            async with conn.cursor() as cursor:
                await cursor.execute(
                    "UPDATE practice_schedule SET reminder_sent_at = NULL "
                    "WHERE id = %s AND reminder_sent_at = %s",
                    (practice_id, stamp),
                )
                if cursor.rowcount == 0:
                    print(f'ℹ️ 練習リマインドの送信権は別の実行に更新済みのため巻き戻しません: practice_id={practice_id}')
                    return False
                return True
    except Exception as e:
        print(f'⚠️ 練習リマインドの送信権の巻き戻しに失敗: practice_id={practice_id} {e}')
        return False


async def _mark_reminder_sent(practice_id: int, stamp: datetime) -> None:
    """送信済みとして記録する（force送信で送信権を獲得していない場合に使う）"""
    try:
        async with db.pool.acquire() as conn:
            async with conn.cursor() as cursor:
                await cursor.execute(
                    "UPDATE practice_schedule SET reminder_sent_at = %s WHERE id = %s",
                    (stamp, practice_id),
                )
    except Exception as e:
        print(f'⚠️ 練習リマインドの送信済み記録に失敗: practice_id={practice_id} {e}')


async def _send_practice_reminder(practice: dict, force: bool = False) -> dict:
    """練習1件のリマインドを送信し、結果を返す"""
    practice_id = practice.get('id')
    stamp = _reminder_stamp()
    claimed = False
    posted = 0

    try:
        if not force:
            # None（reminder_sent_at が無く判定不能）のときは送信を止めない
            claim = await _claim_reminder(practice_id, stamp)
            if claim is False:
                return {'practice_id': practice_id, 'status': 'skipped', 'reason': 'already_sent'}
            claimed = claim is True

        participants = await _fetch_participants_with_discord(practice_id)
        if not participants:
            if claimed:
                await _release_reminder(practice_id, stamp)
            return {'practice_id': practice_id, 'status': 'skipped', 'reason': 'no_participants'}

        content, mention_ids = _build_reminder_message(practice, participants)
        posted, total = await _post_reminder_to_channel(content, mention_ids)

        if posted == 0:
            # 1通も出ていないので送信権を戻し、次回の実行で再送できるようにする
            reason = 'discord_error'
            if claimed and not await _release_reminder(practice_id, stamp):
                # 戻せないと「未送信なのに送信済み」で止まるため、気づけるよう結果に出す
                reason = 'discord_error（送信権を戻せませんでした。force=true で再送してください）'
            return {'practice_id': practice_id, 'status': 'failed', 'reason': reason}

        if force:
            await _mark_reminder_sent(practice_id, stamp)

        if not mention_ids:
            print(f'⚠️ 練習リマインド: メンションできる参加者が1人もいません（Discord未連携）: '
                  f'practice_id={practice_id}')

        result = {
            'practice_id': practice_id,
            'status': 'sent' if posted == total else 'partially_sent',
            'participant_count': len(participants),
            'mentioned_count': len(mention_ids),
            # Discord未連携でメンションできなかった人。運用で連携を促すために返す
            'unlinked_names': [
                p.get('player_name') for p in participants if not _mentionable_discord_id(p)
            ],
        }
        if posted != total:
            # 一部は投稿済み。送信権を戻すと再送で先頭が重複メンションになるため送信済みのままにする
            print(f'⚠️ 練習リマインドを一部しか投稿できませんでした: practice_id={practice_id} {posted}/{total}')
            result['reason'] = f'{posted}/{total} chunks'
        return result
    except Exception as e:
        # 送信権を握ったまま落ちるとその練習は二度と通知されないため必ず戻す
        # （1通でも投稿済みなら戻さない。戻すと再送で重複メンションになる）
        print(f'⚠️ 練習リマインド処理エラー: practice_id={practice_id} {e}')
        if claimed and posted == 0:
            await _release_reminder(practice_id, stamp)
        return {'practice_id': practice_id, 'status': 'failed', 'reason': str(e)}


@router.post("/practice/notify-tomorrow-participants")
async def notify_tomorrow_participants(target_date: Optional[str] = None, force: bool = False):
    """翌日の練習の参加予定者をメンションしてリマインド（前日19:00のcronで実行）

    target_date: 対象の練習日をYYYY-MM-DDで明示指定（省略時はJSTの翌日）
    force: 送信済みでも再送する
    """
    if not os.getenv('DISCORD_BOT_TOKEN', ''):
        raise HTTPException(status_code=500, detail="BOT_TOKEN未設定")

    target = target_date or (_today_jst() + timedelta(days=1)).isoformat()

    result = await db.execute_query(
        'practice_schedule', operation='select', filters={'practice_date': target}
    )
    if result.get('error'):
        raise HTTPException(status_code=500, detail=result['error'])

    results = []
    for practice in (result.get('data') or []):
        # 1件の失敗で同じ日の他の練習が巻き添えにならないよう、練習ごとに握る
        try:
            if practice.get('status') == 'cancelled':
                results.append({'practice_id': practice.get('id'), 'status': 'skipped', 'reason': 'cancelled'})
                continue
            if (practice.get('visibility') or 'public') not in REMINDER_TARGET_VISIBILITIES:
                results.append({'practice_id': practice.get('id'), 'status': 'skipped', 'reason': 'visibility_restricted'})
                continue
            results.append(await _send_practice_reminder(practice, force=force))
        except Exception as e:
            print(f'⚠️ 練習リマインド失敗: practice_id={practice.get("id")} {e}')
            results.append({'practice_id': practice.get('id'), 'status': 'failed', 'reason': str(e)})

    sent_count = sum(1 for r in results if r['status'] == 'sent')
    partial_count = sum(1 for r in results if r['status'] == 'partially_sent')
    failed_count = sum(1 for r in results if r['status'] == 'failed')
    print(f"📢 練習前日リマインド: target={target} sent={sent_count} partial={partial_count} "
          f"failed={failed_count} total={len(results)}")
    return {
        "success": True,
        "target_date": target,
        "sent_count": sent_count,
        "partial_count": partial_count,
        "failed_count": failed_count,
        "results": results,
    }
