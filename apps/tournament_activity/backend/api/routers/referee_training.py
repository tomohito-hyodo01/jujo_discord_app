#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
審判講習会ルーター

審判講習会スケジュールと参加者の管理
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import timedelta
from api.database import db


def _fix_time_fields(record: dict) -> dict:
    """MariaDBのTIME型がtimedeltaや秒数で返る場合を文字列に変換"""
    for field in ('reception_time', 'start_time'):
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


router = APIRouter()


class RefereeTrainingCreate(BaseModel):
    training_date: str
    reception_time: Optional[str] = None
    start_time: Optional[str] = None
    location: str
    training_type: Optional[str] = None
    notes: Optional[str] = None
    deadline_date: Optional[str] = None


class RegisterBody(BaseModel):
    discord_id: str


@router.get("/referee-training")
async def get_referee_trainings():
    """審判講習会一覧を取得（参加者数付き）"""
    try:
        result = await db.execute_query(
            'referee_training',
            operation='select'
        )
        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        trainings = result.get('data', [])
        # 時刻フィールドを文字列に変換
        trainings = [_fix_time_fields(t) for t in trainings]
        # 日付順にソート
        trainings.sort(key=lambda t: t.get('training_date', ''))

        for training in trainings:
            participants_result = await db.execute_query(
                'referee_training_registration',
                operation='select',
                filters={'training_id': training['id']}
            )
            participants = participants_result.get('data', [])
            training['participant_count'] = len(participants)

        return trainings
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/referee-training/{training_id}/participants")
async def get_referee_training_participants(training_id: int):
    """審判講習会の参加者一覧を取得（選手名付き）"""
    try:
        result = await db.execute_query(
            'referee_training_registration',
            operation='select',
            filters={'training_id': training_id}
        )
        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        participants = result.get('data', [])

        for participant in participants:
            player_result = await db.execute_query(
                'player_mst',
                operation='select',
                filters={'discord_id': participant['discord_id']}
            )
            player_data = player_result.get('data', [])
            participant['player_name'] = player_data[0]['player_name'] if player_data else None

        return participants
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/referee-training/{training_id}/register")
async def register_referee_training(training_id: int, body: RegisterBody):
    """審判講習会に参加登録"""
    try:
        existing = await db.execute_query(
            'referee_training_registration',
            operation='select',
            filters={'training_id': training_id, 'discord_id': body.discord_id}
        )
        if existing.get('data'):
            return {"success": True, "message": "既に参加登録済みです"}

        result = await db.execute_query(
            'referee_training_registration',
            operation='insert',
            data={'training_id': training_id, 'discord_id': body.discord_id}
        )
        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        return {"success": True, "message": "参加登録しました"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/referee-training/{training_id}/cancel/{discord_id}")
async def cancel_referee_training(training_id: int, discord_id: str):
    """審判講習会の参加をキャンセル"""
    try:
        result = await db.execute_query(
            'referee_training_registration',
            operation='delete',
            filters={'training_id': training_id, 'discord_id': discord_id}
        )
        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        return {"success": True, "message": "参加をキャンセルしました"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/referee-training")
async def create_referee_training(training: RefereeTrainingCreate):
    """審判講習会を作成"""
    try:
        result = await db.execute_query(
            'referee_training',
            operation='insert',
            data=training.model_dump()
        )
        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        return result.get('data', [{}])[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/referee-training/{training_id}")
async def delete_referee_training(training_id: int):
    """審判講習会を削除（CASCADEで参加登録も削除）"""
    try:
        result = await db.execute_query(
            'referee_training',
            operation='delete',
            filters={'id': training_id}
        )
        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        return {"success": True, "message": "審判講習会を削除しました"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
