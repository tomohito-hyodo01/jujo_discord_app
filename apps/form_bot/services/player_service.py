#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
選手関連のビジネスロジック

player_mstテーブルへのアクセスを提供
"""

from typing import List, Dict, Any, Optional
from .database import db


class PlayerService:
    """選手関連のサービスクラス"""
    
    @staticmethod
    async def get_all_players() -> List[Dict[str, Any]]:
        """
        全ての選手を取得
        
        Returns:
            選手リスト
        """
        result = await db.execute_query('player_mst', operation='select')
        return result.data if result.data else []
    
    @staticmethod
    async def get_player_by_discord_id(discord_id: str) -> Optional[Dict[str, Any]]:
        """
        Discord IDで選手を取得
        
        Args:
            discord_id: Discord User ID
        
        Returns:
            選手情報
        """
        result = await db.execute_query(
            'player_mst',
            operation='select',
            filters={'discord_id': discord_id}
        )
        return result.data[0] if result.data else None
    
    @staticmethod
    async def get_player_by_id(player_id: int) -> Optional[Dict[str, Any]]:
        """
        player_idで選手を取得
        
        Args:
            player_id: 選手ID
        
        Returns:
            選手情報
        """
        result = await db.execute_query(
            'player_mst',
            operation='select',
            filters={'player_id': player_id}
        )
        return result.data[0] if result.data else None
    
    @staticmethod
    async def create_player(player_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        選手を新規登録
        
        Args:
            player_data: 選手情報
        
        Returns:
            登録された選手情報
        """
        result = await db.execute_query(
            'player_mst',
            operation='insert',
            data=player_data
        )
        return result.data[0] if result.data else None
    
    @staticmethod
    async def update_player(discord_id: str, player_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        選手情報を更新
        
        Args:
            discord_id: Discord User ID
            player_data: 更新する選手情報
        
        Returns:
            更新された選手情報
        """
        result = await db.execute_query(
            'player_mst',
            operation='update',
            filters={'discord_id': discord_id},
            data=player_data
        )
        return result.data[0] if result.data else None

