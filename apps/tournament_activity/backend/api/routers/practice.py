#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
練習予定ルーター

練習スケジュールと参加者の管理
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import timedelta, datetime, date as _date
import os
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
    """練習に参加（締切後・受付締切は不可）"""
    try:
        # 締切/受付状態チェック（UIをすり抜けた直接呼び出しも防ぐ）
        p_res = await db.execute_query(
            'practice_schedule', operation='select', filters={'id': practice_id}
        )
        if not p_res.get('data'):
            raise HTTPException(status_code=404, detail="練習が見つかりません")
        practice_row = p_res['data'][0]
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
    """2日後に開催される練習の予約者をDiscordチャンネルに通知"""
    import os
    import httpx
    from datetime import date, timedelta as td

    DISCORD_BOT_TOKEN = os.getenv('DISCORD_BOT_TOKEN', '')
    if not DISCORD_BOT_TOKEN:
        raise HTTPException(status_code=500, detail="BOT_TOKEN未設定")

    # 2日後の日付
    target_date = (date.today() + td(days=2)).isoformat()

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
