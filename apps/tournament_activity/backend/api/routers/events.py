#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
汎用イベントルーター

合宿・練習試合・飲み会等の管理
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import timedelta
from api.database import db

router = APIRouter()


def _fix_time_fields(row: dict) -> dict:
    """TIME型をHH:MM文字列に変換"""
    for field in ('start_time', 'end_time'):
        val = row.get(field)
        if val is None:
            continue
        if isinstance(val, timedelta):
            total = int(val.total_seconds())
            row[field] = f"{total // 3600:02d}:{(total % 3600) // 60:02d}"
        elif isinstance(val, (int, float)):
            total = int(val)
            row[field] = f"{total // 3600:02d}:{(total % 3600) // 60:02d}"
        elif isinstance(val, str) and len(val) >= 5:
            row[field] = val[:5]
    return row


class EventCreate(BaseModel):
    title: str
    event_date: str
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    location: Optional[str] = None
    deadline_date: Optional[str] = None
    max_participants: Optional[int] = None
    description: Optional[str] = None
    visibility: Optional[str] = 'public'
    created_by: Optional[str] = None


class EventUpdate(BaseModel):
    title: Optional[str] = None
    event_date: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    location: Optional[str] = None
    deadline_date: Optional[str] = None
    max_participants: Optional[int] = None
    description: Optional[str] = None
    status: Optional[str] = None
    visibility: Optional[str] = None


class EventJoin(BaseModel):
    player_id: int


class EventInvitationUpdate(BaseModel):
    player_ids: list[int]


@router.get("/events")
async def get_events():
    """イベント一覧を取得（参加者数付き）"""
    try:
        result = await db.execute_query('events', operation='select')
        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        events = result.get('data', [])
        events = [_fix_time_fields(e) for e in events]
        events.sort(key=lambda e: e.get('event_date', ''))

        for event in events:
            pt_result = await db.execute_query(
                'event_participants', operation='select',
                filters={'event_id': event['id']}
            )
            participants = pt_result.get('data', [])
            event['participant_count'] = len(participants)

            names = []
            for pt in participants:
                p_result = await db.execute_query(
                    'player_mst', operation='select',
                    filters={'player_id': pt['player_id']}
                )
                if p_result.get('data'):
                    names.append(p_result['data'][0]['player_name'])
            event['participant_names'] = names

            # 招待者リスト
            if event.get('visibility') == 'invited':
                inv_result = await db.execute_query(
                    'event_invitations', operation='select',
                    filters={'event_id': event['id']}
                )
                event['invited_player_ids'] = [r['player_id'] for r in (inv_result.get('data') or [])]
            else:
                event['invited_player_ids'] = []

        return events
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/events")
async def create_event(event: EventCreate):
    """イベントを作成"""
    try:
        data = event.model_dump(exclude_none=True)
        result = await db.execute_query('events', operation='insert', data=data)
        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])
        return result.get('data', [{}])[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/events/{event_id}")
async def update_event(event_id: int, event: EventUpdate):
    """イベントを更新"""
    try:
        raw = event.model_dump()
        update_data = {}
        for k, v in raw.items():
            if v is None:
                continue
            update_data[k] = v
        if not update_data:
            return {"success": True, "message": "変更なし"}

        result = await db.execute_query(
            'events', operation='update',
            filters={'id': event_id}, data=update_data
        )
        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])
        return {"success": True, "message": "イベントを更新しました"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/events/{event_id}")
async def delete_event(event_id: int):
    """イベントを削除"""
    try:
        result = await db.execute_query(
            'events', operation='delete', filters={'id': event_id}
        )
        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])
        return {"success": True, "message": "イベントを削除しました"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/events/{event_id}/participants")
async def get_event_participants(event_id: int):
    """イベントの参加者一覧を取得"""
    try:
        result = await db.execute_query(
            'event_participants', operation='select',
            filters={'event_id': event_id}
        )
        participants = result.get('data', [])
        for pt in participants:
            p_result = await db.execute_query(
                'player_mst', operation='select',
                filters={'player_id': pt['player_id']}
            )
            pt['player_name'] = p_result['data'][0]['player_name'] if p_result.get('data') else None
        return participants
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/events/{event_id}/join")
async def join_event(event_id: int, body: EventJoin):
    """イベントに参加"""
    try:
        existing = await db.execute_query(
            'event_participants', operation='select',
            filters={'event_id': event_id, 'player_id': body.player_id}
        )
        if existing.get('data'):
            return {"success": True, "message": "既に参加登録済みです"}

        result = await db.execute_query(
            'event_participants', operation='insert',
            data={'event_id': event_id, 'player_id': body.player_id}
        )
        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])
        return {"success": True, "message": "参加登録しました"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/events/{event_id}/leave/{player_id}")
async def leave_event(event_id: int, player_id: int):
    """イベントの参加をキャンセル"""
    try:
        result = await db.execute_query(
            'event_participants', operation='delete',
            filters={'event_id': event_id, 'player_id': player_id}
        )
        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])
        return {"success": True, "message": "参加をキャンセルしました"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/events/{event_id}/invitations")
async def update_event_invitations(event_id: int, body: EventInvitationUpdate):
    """イベントの招待者リストを更新"""
    try:
        await db.execute_query('event_invitations', operation='delete', filters={'event_id': event_id})
        for pid in body.player_ids:
            await db.execute_query('event_invitations', operation='insert', data={'event_id': event_id, 'player_id': pid})
        return {"success": True, "message": f"{len(body.player_ids)}名を招待しました"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
