#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
選手ルーター

選手マスタの操作
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from api.database import db

router = APIRouter()


class PlayerCreate(BaseModel):
    discord_id: Optional[str] = None  # 大会申込からの追加時はnull
    player_name: str
    player_name_kana: Optional[str] = None
    jsta_number: Optional[str] = None
    post_number: str
    address: str
    phone_number: str
    birth_date: str
    sex: int
    affiliated_club: Optional[str] = None  # 所属クラブ
    member_level: Optional[int] = None  # Discordロールから取得した会員レベル
    created_by: Optional[str] = None  # 登録者のDiscord ID


class PlayerUpdate(BaseModel):
    player_name: Optional[str] = None
    player_name_kana: Optional[str] = None
    jsta_number: Optional[str] = None
    post_number: Optional[str] = None
    address: Optional[str] = None
    phone_number: Optional[str] = None
    birth_date: Optional[str] = None
    sex: Optional[int] = None
    affiliated_club: Optional[str] = None


class PlayerPermissionUpdate(BaseModel):
    admin_role: Optional[int] = None
    member_level: Optional[int] = None
    managed_ward_id: Optional[int] = None


class PlayerWardFlagsUpdate(BaseModel):
    tokyo_flg: Optional[bool] = None
    edogawa_flg: Optional[bool] = None
    koto_flg: Optional[bool] = None
    chuo_flg: Optional[bool] = None
    sumida_flg: Optional[bool] = None
    arakawa_flg: Optional[bool] = None
    adachi_flg: Optional[bool] = None
    itabashi_flg: Optional[bool] = None


@router.get("/players")
async def get_players():
    """全選手を取得"""
    try:
        result = await db.execute_query('player_mst', operation='select')
        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])
        return result.get('data', [])
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/players/{player_id}")
async def get_player(player_id: int):
    """選手IDで選手を取得"""
    try:
        result = await db.execute_query(
            'player_mst',
            operation='select',
            filters={'player_id': player_id}
        )

        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        data = result.get('data', [])
        if not data:
            raise HTTPException(status_code=404, detail="Player not found")

        return data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/players")
async def create_player(player: PlayerCreate):
    """新規選手を登録"""
    try:
        # discord_idが指定されている場合、重複チェック
        if player.discord_id:
            existing = await db.execute_query(
                'player_mst',
                operation='select',
                filters={'discord_id': player.discord_id}
            )
            if existing.get('data'):
                raise HTTPException(status_code=409, detail="この選手は既に登録されています")

        result = await db.execute_query(
            'player_mst',
            operation='insert',
            data=player.model_dump()
        )

        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        return result.get('data', [{}])[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/players/discord/{discord_id}")
async def get_player_by_discord_id(discord_id: str):
    """Discord IDで選手を取得"""
    try:
        result = await db.execute_query(
            'player_mst',
            operation='select',
            filters={'discord_id': discord_id}
        )

        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        data = result.get('data', [])
        if not data:
            return None

        return data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/players/discord/{discord_id}")
async def update_player_by_discord_id(discord_id: str, player: PlayerUpdate):
    """Discord IDで選手情報を更新"""
    try:
        update_data = player.model_dump(exclude_none=True)
        if not update_data:
            raise HTTPException(status_code=400, detail="No fields to update")

        result = await db.execute_query(
            'player_mst',
            operation='update',
            filters={'discord_id': discord_id},
            data=update_data
        )

        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        data = result.get('data', [])
        if not data:
            raise HTTPException(status_code=404, detail="Player not found")

        return data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/players/{player_id}/update")
async def update_player_by_id(player_id: int, player: PlayerUpdate):
    """選手IDで選手情報を更新"""
    try:
        update_data = player.model_dump(exclude_none=True)
        if not update_data:
            raise HTTPException(status_code=400, detail="No fields to update")

        result = await db.execute_query(
            'player_mst',
            operation='update',
            filters={'player_id': player_id},
            data=update_data
        )

        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        data = result.get('data', [])
        if not data:
            raise HTTPException(status_code=404, detail="Player not found")

        return data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/players/{player_id}/permissions")
async def update_player_permissions(player_id: int, permissions: PlayerPermissionUpdate):
    """選手の権限を更新"""
    try:
        # 選手の存在確認
        result = await db.execute_query(
            'player_mst',
            operation='select',
            filters={'player_id': player_id}
        )

        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        data = result.get('data', [])
        if not data:
            raise HTTPException(status_code=404, detail="Player not found")

        # 提供されたフィールドのみ更新
        update_data = permissions.model_dump(exclude_none=True)
        if not update_data:
            return {"success": True, "message": "権限を更新しました"}

        result = await db.execute_query(
            'player_mst',
            operation='update',
            filters={'player_id': player_id},
            data=update_data
        )

        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        return {"success": True, "message": "権限を更新しました"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/players/{player_id}/ward-flags")
async def update_player_ward_flags(player_id: int, flags: PlayerWardFlagsUpdate):
    """選手の区登録状況を更新"""
    try:
        result = await db.execute_query(
            'player_mst',
            operation='select',
            filters={'player_id': player_id}
        )

        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        if not result.get('data'):
            raise HTTPException(status_code=404, detail="Player not found")

        update_data = {k: v for k, v in flags.model_dump().items() if v is not None}
        if not update_data:
            return {"success": True, "message": "区登録状況を更新しました"}

        result = await db.execute_query(
            'player_mst',
            operation='update',
            filters={'player_id': player_id},
            data=update_data
        )

        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        return {"success": True, "message": "区登録状況を更新しました"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/players/{player_id}")
async def delete_player(player_id: int):
    """選手を削除"""
    try:
        existing = await db.execute_query(
            'player_mst',
            operation='select',
            filters={'player_id': player_id}
        )
        if not existing.get('data'):
            raise HTTPException(status_code=404, detail="選手が見つかりません")

        result = await db.execute_query(
            'player_mst',
            operation='delete',
            filters={'player_id': player_id}
        )
        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        return {"success": True, "message": "選手を削除しました"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

