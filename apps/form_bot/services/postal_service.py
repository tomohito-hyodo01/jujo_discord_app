#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
郵便番号から住所を取得するサービス（共通化）

zipcloud APIを使用（無料、登録不要）
https://zipcloud.ibsnet.co.jp/doc/api
"""

import aiohttp
from typing import Optional, Dict


class PostalService:
    """郵便番号検索サービス"""
    
    API_URL = "https://zipcloud.ibsnet.co.jp/api/search"
    
    @staticmethod
    async def get_address(postal_code: str) -> Optional[Dict[str, str]]:
        """
        郵便番号から住所を取得
        
        Args:
            postal_code: 郵便番号（ハイフンあり/なし両方OK）
        
        Returns:
            住所情報の辞書、見つからない場合はNone
            {
                'prefecture': '東京都',
                'city': '渋谷区',
                'town': '渋谷',
                'full_address': '東京都渋谷区渋谷'
            }
        """
        # ハイフンを除去
        postal_code_clean = postal_code.replace('-', '').replace('−', '')
        
        # 7桁の数字であることを確認
        if not postal_code_clean.isdigit() or len(postal_code_clean) != 7:
            return None
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    PostalService.API_URL,
                    params={'zipcode': postal_code_clean}
                ) as response:
                    
                    if response.status != 200:
                        return None
                    
                    data = await response.json()
                    
                    # APIレスポンスのチェック
                    if data.get('status') != 200:
                        return None
                    
                    results = data.get('results')
                    if not results or len(results) == 0:
                        return None
                    
                    # 最初の結果を使用
                    result = results[0]
                    
                    return {
                        'prefecture': result.get('address1', ''),
                        'city': result.get('address2', ''),
                        'town': result.get('address3', ''),
                        'full_address': f"{result.get('address1', '')}{result.get('address2', '')}{result.get('address3', '')}"
                    }
        
        except Exception as e:
            print(f'❌ 郵便番号検索エラー: {e}')
            return None
    
    @staticmethod
    def format_postal_code(postal_code: str) -> str:
        """
        郵便番号をフォーマット（123-4567形式）
        
        Args:
            postal_code: 郵便番号
        
        Returns:
            フォーマットされた郵便番号
        """
        # ハイフンを除去
        clean = postal_code.replace('-', '').replace('−', '')
        
        # 7桁でない場合はそのまま返す
        if len(clean) != 7 or not clean.isdigit():
            return postal_code
        
        # 123-4567形式にフォーマット
        return f"{clean[:3]}-{clean[3:]}"

