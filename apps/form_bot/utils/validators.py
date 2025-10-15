#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
バリデーション関数（共通化）
"""

import re
from datetime import datetime
from typing import Tuple


class Validators:
    """バリデーション用のユーティリティクラス"""
    
    @staticmethod
    def validate_date(date_str: str) -> Tuple[bool, str]:
        """
        日付のバリデーション（YYYY-MM-DD形式）
        
        Args:
            date_str: 日付文字列
        
        Returns:
            (is_valid, error_message)
        """
        try:
            datetime.strptime(date_str, '%Y-%m-%d')
            return True, ''
        except ValueError:
            return False, 'YYYY-MM-DD形式で入力してください（例：1990-01-15）'
    
    @staticmethod
    def validate_phone_number(phone: str) -> Tuple[bool, str]:
        """
        電話番号のバリデーション
        
        Args:
            phone: 電話番号
        
        Returns:
            (is_valid, error_message)
        """
        # ハイフンを除去
        clean = phone.replace('-', '').replace('−', '')
        
        # 10桁または11桁の数字であることを確認
        if not clean.isdigit():
            return False, '電話番号は数字とハイフンのみ使用できます'
        
        if len(clean) not in [10, 11]:
            return False, '電話番号は10桁または11桁で入力してください'
        
        return True, ''
    
    @staticmethod
    def validate_postal_code(postal_code: str) -> Tuple[bool, str]:
        """
        郵便番号のバリデーション
        
        Args:
            postal_code: 郵便番号
        
        Returns:
            (is_valid, error_message)
        """
        # ハイフンを除去
        clean = postal_code.replace('-', '').replace('−', '')
        
        # 7桁の数字であることを確認
        if not clean.isdigit():
            return False, '郵便番号は数字とハイフンのみ使用できます'
        
        if len(clean) != 7:
            return False, '郵便番号は7桁で入力してください（例：123-4567）'
        
        return True, ''
    
    @staticmethod
    def validate_sex(sex_input: str) -> Tuple[bool, int, str]:
        """
        性別のバリデーション
        
        Args:
            sex_input: 性別入力（男子/女子）
        
        Returns:
            (is_valid, sex_value, error_message)
        """
        sex_input = sex_input.strip()
        
        if sex_input == '男子':
            return True, 0, ''
        elif sex_input == '女子':
            return True, 1, ''
        else:
            return False, -1, '性別は「男子」または「女子」で入力してください'
    
    @staticmethod
    def validate_jsta_number(jsta_number: str) -> Tuple[bool, str]:
        """
        日本連盟登録番号のバリデーション
        
        Args:
            jsta_number: 登録番号
        
        Returns:
            (is_valid, error_message)
        """
        if not jsta_number:
            return True, ''  # 任意項目なので空でもOK
        
        # 基本的なフォーマットチェック（必要に応じて調整）
        if len(jsta_number) > 20:
            return False, '登録番号は20文字以内で入力してください'
        
        return True, ''

