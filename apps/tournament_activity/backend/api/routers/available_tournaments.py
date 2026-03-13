#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
申込可能な大会を取得するルーター
"""

from fastapi import APIRouter, HTTPException
from api.database import db
from datetime import datetime

router = APIRouter()


@router.get("/tournaments/available/{discord_id}")
async def get_available_tournaments(discord_id: str):
    """
    申込可能な大会を取得
    
    条件：
    1. deadline_dateが過ぎていない
    2. そのdiscord_idがまだ申し込んでいない
    3. そのdiscord_idのplayer_idがpair1やpair2として登録されていない
    
    Args:
        discord_id: Discord User ID
    
    Returns:
        申込可能な大会のリスト
    """
    try:
        # discord_idからplayer_idを取得
        player_result = await db.execute_query(
            'player_mst',
            operation='select',
            filters={'discord_id': discord_id},
            columns='player_id'
        )

        if player_result.get('error'):
            raise HTTPException(status_code=500, detail=player_result['error'])

        player_id = None
        player_data = player_result.get('data', [])
        if player_data:
            player_id = player_data[0]['player_id']

        # 全大会を取得
        tournaments_result = await db.execute_query(
            'tournament_mst',
            operation='select',
            json_fields=['type']
        )

        if tournaments_result.get('error'):
            raise HTTPException(status_code=500, detail=tournaments_result['error'])

        all_tournaments = tournaments_result.get('data', [])

        # 全ての申込データを取得
        all_registrations_result = await db.execute_query(
            'tournament_registration',
            operation='select',
            columns='tournament_id, discord_id, pair1, pair2',
            json_fields=['pair2']
        )

        if all_registrations_result.get('error'):
            raise HTTPException(status_code=500, detail=all_registrations_result['error'])
        
        # 除外すべき大会IDを収集
        excluded_tournament_ids = set()
        all_registrations = all_registrations_result.get('data', [])
        if all_registrations:
            for reg in all_registrations:
                # 条件1: 自分が申し込んだ大会
                if reg['discord_id'] == discord_id:
                    excluded_tournament_ids.add(reg['tournament_id'])
                
                # 条件2: 自分がpair1として登録されている
                if player_id and reg['pair1'] == player_id:
                    excluded_tournament_ids.add(reg['tournament_id'])
                
                # 条件3: 自分がpair2配列に含まれている
                if player_id and reg['pair2'] and player_id in reg['pair2']:
                    excluded_tournament_ids.add(reg['tournament_id'])
        
        # 現在時刻
        now = datetime.now().date()
        
        # フィルタリング
        available_tournaments = []
        for tournament in all_tournaments:
            # 締切チェック
            deadline_str = tournament['deadline_date']
            if isinstance(deadline_str, str):
                deadline = datetime.fromisoformat(deadline_str.replace('Z', '')).date()
            else:
                deadline = deadline_str
            
            # 条件: 締切が過ぎていない AND 除外リストに含まれていない
            if deadline >= now and tournament['tournament_id'] not in excluded_tournament_ids:
                available_tournaments.append(tournament)
        
        return available_tournaments
    
    except Exception as e:
        print(f'申込可能大会取得エラー: {e}')
        raise HTTPException(status_code=500, detail=str(e))

