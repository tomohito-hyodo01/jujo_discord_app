#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
大会関連のビジネスロジック

tournament_mstテーブルへのアクセスを提供
"""

from typing import List, Dict, Any, Optional
from .database import db


class TournamentService:
    """大会関連のサービスクラス"""
    
    @staticmethod
    async def get_all_tournaments() -> List[Dict[str, Any]]:
        """
        全ての大会を取得
        
        Returns:
            大会リスト
        """
        result = await db.execute_query('tournament_mst', operation='select')
        return result.data if result.data else []
    
    @staticmethod
    async def get_tournament_by_id(tournament_id: str) -> Optional[Dict[str, Any]]:
        """
        大会IDで大会を取得
        
        Args:
            tournament_id: 大会ID
        
        Returns:
            大会情報
        """
        result = await db.execute_query(
            'tournament_mst',
            operation='select',
            filters={'tournament_id': tournament_id}
        )
        return result.data[0] if result.data else None
    
    @staticmethod
    async def get_tournament_types(tournament_id: str) -> List[str]:
        """
        大会の種別リストを取得
        
        Args:
            tournament_id: 大会ID
        
        Returns:
            種別リスト
        """
        tournament = await TournamentService.get_tournament_by_id(tournament_id)
        return tournament['type'] if tournament else []
    
    @staticmethod
    async def get_active_tournaments() -> List[Dict[str, Any]]:
        """
        募集中の大会のみを取得（deadline未来のもの）
        
        Returns:
            大会リスト
        """
        # 全大会を取得して、締切が未来のものだけフィルタ
        # TODO: Supabaseのフィルタ機能を使って最適化可能
        all_tournaments = await TournamentService.get_all_tournaments()
        
        from datetime import datetime
        now = datetime.now()
        
        active = []
        for t in all_tournaments:
            deadline = datetime.fromisoformat(t['deadline_date'].replace('Z', '+00:00'))
            if deadline > now:
                active.append(t)
        
        return active

