#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
データベース接続管理

全ての機能から利用される共通のDB接続クラス
"""

import os
from typing import Optional, Dict, List, Any
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()


class Database:
    """Supabaseデータベース接続クラス（シングルトン）"""
    
    _instance: Optional['Database'] = None
    _client: Optional[Client] = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if self._client is None:
            supabase_url = os.getenv('SUPABASE_URL')
            supabase_key = os.getenv('SUPABASE_KEY')
            
            if not supabase_url or not supabase_key:
                raise ValueError('SUPABASE_URL and SUPABASE_KEY must be set')
            
            self._client = create_client(supabase_url, supabase_key)
    
    @property
    def client(self) -> Client:
        """Supabaseクライアントを取得"""
        return self._client
    
    async def execute_query(
        self,
        table: str,
        operation: str = 'select',
        filters: Optional[Dict[str, Any]] = None,
        data: Optional[Dict[str, Any]] = None,
        columns: str = '*'
    ) -> Dict[str, Any]:
        """
        クエリを実行する汎用メソッド
        
        Args:
            table: テーブル名
            operation: 操作（select/insert/update/delete）
            filters: フィルタ条件
            data: 挿入/更新データ
            columns: 取得カラム
        
        Returns:
            クエリ結果
        """
        try:
            query = self._client.table(table)
            
            if operation == 'select':
                query = query.select(columns)
                if filters:
                    for key, value in filters.items():
                        query = query.eq(key, value)
                return query.execute()
            
            elif operation == 'insert':
                return query.insert(data).execute()
            
            elif operation == 'update':
                query = query.update(data)
                if filters:
                    for key, value in filters.items():
                        query = query.eq(key, value)
                return query.execute()
            
            elif operation == 'delete':
                if filters:
                    for key, value in filters.items():
                        query = query.eq(key, value)
                return query.delete().execute()
            
            else:
                raise ValueError(f'Unknown operation: {operation}')
        
        except Exception as e:
            print(f'❌ Database error: {e}')
            raise


# グローバルインスタンス
db = Database()

