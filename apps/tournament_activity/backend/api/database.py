#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
データベース接続管理（MariaDB版）

全ての機能から利用される共通のDB接続クラス
X-Server環境用
"""

import os
import json
import aiomysql
from typing import Optional, Dict, List, Any
from dotenv import load_dotenv

load_dotenv()


class Database:
    """MariaDBデータベース接続クラス（シングルトン）"""

    _instance: Optional['Database'] = None
    _pool: Optional[aiomysql.Pool] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    async def initialize(self):
        """コネクションプールを初期化"""
        if self._pool is None:
            db_host = os.getenv('DB_HOST', 'localhost')
            db_port = int(os.getenv('DB_PORT', '3306'))
            db_user = os.getenv('DB_USER')
            db_password = os.getenv('DB_PASSWORD')
            db_name = os.getenv('DB_NAME')

            if not all([db_user, db_password, db_name]):
                raise ValueError('DB_USER, DB_PASSWORD, and DB_NAME must be set')

            self._pool = await aiomysql.create_pool(
                host=db_host,
                port=db_port,
                user=db_user,
                password=db_password,
                db=db_name,
                charset='utf8mb4',
                autocommit=True,
                minsize=1,
                maxsize=10
            )

    async def close(self):
        """コネクションプールをクローズ"""
        if self._pool:
            self._pool.close()
            await self._pool.wait_closed()
            self._pool = None

    @property
    def pool(self) -> aiomysql.Pool:
        """コネクションプールを取得"""
        if self._pool is None:
            raise RuntimeError('Database pool not initialized. Call initialize() first.')
        return self._pool

    def _serialize_json_fields(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """リストをJSON文字列に変換"""
        result = data.copy()
        for key, value in result.items():
            if isinstance(value, (list, dict)):
                result[key] = json.dumps(value, ensure_ascii=False)
        return result

    def _deserialize_json_fields(self, row: Dict[str, Any], json_fields: List[str] = None) -> Dict[str, Any]:
        """JSON文字列をPythonオブジェクトに変換"""
        if json_fields is None:
            json_fields = ['type', 'pair2']  # デフォルトのJSONフィールド

        result = dict(row)
        for field in json_fields:
            if field in result and result[field]:
                if isinstance(result[field], str):
                    try:
                        result[field] = json.loads(result[field])
                    except json.JSONDecodeError:
                        pass  # JSON以外の文字列はそのまま
        return result

    async def execute_query(
        self,
        table: str,
        operation: str = 'select',
        filters: Optional[Dict[str, Any]] = None,
        data: Optional[Dict[str, Any]] = None,
        columns: str = '*',
        json_fields: List[str] = None
    ) -> Dict[str, Any]:
        """
        クエリを実行する汎用メソッド

        Args:
            table: テーブル名
            operation: 操作（select/insert/update/delete）
            filters: フィルタ条件
            data: 挿入/更新データ
            columns: 取得カラム
            json_fields: JSONとして扱うフィールドのリスト

        Returns:
            クエリ結果（Supabase互換形式）
        """
        try:
            async with self.pool.acquire() as conn:
                async with conn.cursor(aiomysql.DictCursor) as cursor:

                    if operation == 'select':
                        # SELECT クエリ
                        sql = f"SELECT {columns} FROM {table}"
                        params = []

                        if filters:
                            where_clauses = []
                            for key, value in filters.items():
                                where_clauses.append(f"{key} = %s")
                                params.append(value)
                            sql += " WHERE " + " AND ".join(where_clauses)

                        await cursor.execute(sql, params)
                        rows = await cursor.fetchall()

                        # JSON フィールドをデシリアライズ
                        deserialized_rows = [
                            self._deserialize_json_fields(row, json_fields)
                            for row in rows
                        ]

                        # Supabase互換形式で返す
                        return {'data': deserialized_rows, 'error': None}

                    elif operation == 'insert':
                        # INSERT クエリ
                        serialized_data = self._serialize_json_fields(data)
                        columns_str = ', '.join(serialized_data.keys())
                        placeholders = ', '.join(['%s'] * len(serialized_data))
                        sql = f"INSERT INTO {table} ({columns_str}) VALUES ({placeholders})"

                        await cursor.execute(sql, list(serialized_data.values()))

                        # 挿入されたIDを取得
                        inserted_id = cursor.lastrowid

                        # Supabase互換形式で返す
                        return {'data': [{'id': inserted_id, **data}], 'error': None}

                    elif operation == 'update':
                        # UPDATE クエリ
                        serialized_data = self._serialize_json_fields(data)
                        set_clauses = [f"{key} = %s" for key in serialized_data.keys()]
                        params = list(serialized_data.values())

                        sql = f"UPDATE {table} SET {', '.join(set_clauses)}"

                        if filters:
                            where_clauses = []
                            for key, value in filters.items():
                                where_clauses.append(f"{key} = %s")
                                params.append(value)
                            sql += " WHERE " + " AND ".join(where_clauses)

                        await cursor.execute(sql, params)

                        # Supabase互換形式で返す
                        return {'data': [data], 'error': None}

                    elif operation == 'delete':
                        # DELETE クエリ
                        sql = f"DELETE FROM {table}"
                        params = []

                        if filters:
                            where_clauses = []
                            for key, value in filters.items():
                                where_clauses.append(f"{key} = %s")
                                params.append(value)
                            sql += " WHERE " + " AND ".join(where_clauses)

                        await cursor.execute(sql, params)

                        # Supabase互換形式で返す
                        return {'data': [], 'error': None}

                    else:
                        raise ValueError(f'Unknown operation: {operation}')

        except Exception as e:
            print(f'❌ Database error: {e}')
            # Supabase互換形式でエラーを返す
            return {'data': None, 'error': str(e)}


# グローバルインスタンス
db = Database()
