#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
データベース接続

Supabaseへの接続を管理
"""

import os
from supabase import create_client, Client
from typing import Optional


class Database:
    """Supabaseデータベース接続（シングルトン）"""
    
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
        return self._client


# グローバルインスタンス
db = Database()

