#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
練習予定ルーター

練習スケジュールと参加者の管理
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import timedelta
from api.database import db


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
    deadline_date: Optional[str] = None


class PracticeUpdate(BaseModel):
    practice_date: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    location: Optional[str] = None


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


@router.post("/practice/{practice_id}/join")
async def join_practice(practice_id: int, body: PracticeJoin):
    """練習に参加"""
    try:
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
async def leave_practice(practice_id: int, player_id: int):
    """練習の参加をキャンセル"""
    try:
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
        update_data = {k: v for k, v in practice.model_dump().items() if v is not None}
        if not update_data:
            return {"success": True, "message": "変更なし"}

        result = await db.execute_query(
            'practice_schedule',
            operation='update',
            filters={'id': practice_id},
            data=update_data
        )
        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        return {"success": True, "message": "練習予定を更新しました"}
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
