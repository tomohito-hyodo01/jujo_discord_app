#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
申込ルーター

大会申込の操作
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import date
from api.database import db

router = APIRouter()


class RegistrationCreate(BaseModel):
    discord_id: str
    tournament_id: str
    type: str
    sex: int
    pair1: Optional[int] = None
    pair2: Optional[List[int]] = None


@router.post("/registrations")
async def create_registration(registration: RegistrationCreate):
    """新規申込を登録"""
    try:
        data = registration.model_dump()
        result = await db.execute_query(
            'tournament_registration',
            operation='insert',
            data=data
        )

        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        return result.get('data', [{}])[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/registrations/user/{discord_id}")
async def get_user_registrations(discord_id: str):
    """ユーザーの申込一覧を取得（ペアとして含まれる申込も含む）"""
    try:
        # 自分が申込者のレコード
        own_result = await db.execute_query(
            'tournament_registration',
            operation='select',
            filters={'discord_id': discord_id},
            json_fields=['pair2']
        )
        if own_result.get('error'):
            raise HTTPException(status_code=500, detail=own_result['error'])

        own_regs = own_result.get('data', [])
        own_ids = {r['registration_id'] for r in own_regs}
        for r in own_regs:
            r['is_applicant'] = True

        # 自分のplayer_idを取得してペアとしての申込を検索
        player_result = await db.execute_query(
            'player_mst',
            operation='select',
            filters={'discord_id': discord_id}
        )
        player_data = player_result.get('data', [])

        pair_regs = []
        if player_data:
            player_id = player_data[0]['player_id']
            pair_result = await db.execute_query(
                'tournament_registration',
                operation='select',
                filters={'pair1': player_id},
                json_fields=['pair2']
            )
            if pair_result.get('data'):
                for r in pair_result['data']:
                    if r['registration_id'] not in own_ids:
                        r['is_applicant'] = False
                        pair_regs.append(r)

        return own_regs + pair_regs
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/registrations/{registration_id}")
async def delete_registration(registration_id: int):
    """申込をキャンセル（削除）"""
    # 申込の存在確認
    result = await db.execute_query(
        'tournament_registration',
        operation='select',
        filters={'registration_id': registration_id}
    )

    if result.get('error'):
        raise HTTPException(status_code=500, detail=result['error'])

    if not result.get('data'):
        raise HTTPException(status_code=404, detail="申込が見つかりません")

    # 削除
    delete_result = await db.execute_query(
        'tournament_registration',
        operation='delete',
        filters={'registration_id': registration_id}
    )

    if delete_result.get('error'):
        raise HTTPException(status_code=500, detail=delete_result['error'])

    return {"success": True, "message": "申込をキャンセルしました"}


class CourtNumberUpdateRequest(BaseModel):
    court_number: Optional[str] = None


class PairUpdateRequest(BaseModel):
    pair1: int


@router.put("/registrations/{registration_id}/pair")
async def update_pair(registration_id: int, request: PairUpdateRequest):
    """ペアを変更（締切前のみ）"""
    # 申込の存在確認
    reg_result = await db.execute_query(
        'tournament_registration',
        operation='select',
        filters={'registration_id': registration_id}
    )
    if reg_result.get('error'):
        raise HTTPException(status_code=500, detail=reg_result['error'])
    if not reg_result.get('data'):
        raise HTTPException(status_code=404, detail="申込が見つかりません")

    registration = reg_result['data'][0]

    # 大会の締切日を確認
    tour_result = await db.execute_query(
        'tournament_mst',
        operation='select',
        filters={'tournament_id': registration['tournament_id']}
    )
    if tour_result.get('data'):
        tournament = tour_result['data'][0]
        deadline = tournament.get('deadline_date')
        if deadline:
            deadline_date = deadline if isinstance(deadline, date) else date.fromisoformat(str(deadline))
            if date.today() > deadline_date:
                raise HTTPException(status_code=400, detail="締切日を過ぎているため変更できません")

    # ペア更新
    update_result = await db.execute_query(
        'tournament_registration',
        operation='update',
        filters={'registration_id': registration_id},
        data={'pair1': request.pair1}
    )
    if update_result.get('error'):
        raise HTTPException(status_code=500, detail=update_result['error'])

    return {"success": True, "message": "ペアを変更しました"}


@router.put("/registrations/{registration_id}/court-number")
async def update_court_number(registration_id: int, request: CourtNumberUpdateRequest):
    """コート番号を更新"""
    # 申込の存在確認
    reg_result = await db.execute_query(
        'tournament_registration',
        operation='select',
        filters={'registration_id': registration_id}
    )
    if reg_result.get('error'):
        raise HTTPException(status_code=500, detail=reg_result['error'])
    if not reg_result.get('data'):
        raise HTTPException(status_code=404, detail="申込が見つかりません")

    # コート番号更新
    update_result = await db.execute_query(
        'tournament_registration',
        operation='update',
        filters={'registration_id': registration_id},
        data={'court_number': request.court_number}
    )
    if update_result.get('error'):
        raise HTTPException(status_code=500, detail=update_result['error'])

    return {"success": True, "message": "コート番号を更新しました"}


@router.get("/registrations/tournament/{tournament_id}")
async def get_tournament_registrations(tournament_id: str):
    """大会の申込一覧を取得（選手情報付き）"""
    try:
        result = await db.execute_query(
            'tournament_registration',
            operation='select',
            filters={'tournament_id': tournament_id},
            json_fields=['pair2']
        )

        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        registrations = result.get('data', [])

        enriched = []
        for reg in registrations:
            # 申込者の選手情報を取得
            applicant_result = await db.execute_query(
                'player_mst',
                operation='select',
                filters={'discord_id': reg['discord_id']}
            )
            applicant_data = applicant_result.get('data', [])
            reg['applicant_name'] = applicant_data[0]['player_name'] if applicant_data else None

            # ペアの選手情報を取得
            pair_result = await db.execute_query(
                'player_mst',
                operation='select',
                filters={'player_id': reg['pair1']}
            )
            pair_data = pair_result.get('data', [])
            reg['pair_name'] = pair_data[0]['player_name'] if pair_data else None

            enriched.append(reg)

        return enriched
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

