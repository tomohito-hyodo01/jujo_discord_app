#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
日本連盟登録番号（JSTA番号）の形式チェック

「JSTA」＋数字8桁のみを有効とする。
`-` や `JSTA-` のような値が「登録あり」と判定されると、
広域大会の連盟番号チェックをすり抜けてしまうため、
登録時の検証と申込時の判定で同じ関数を使う。
"""
import re
import unicodedata
from typing import Optional

JSTA_DIGITS = 8
_VALID = re.compile(r'^JSTA\d{8}$')


def normalize_jsta_number(value: Optional[str]) -> Optional[str]:
    """入力値を 'JSTA########' に正規化する

    - 全角数字・空白・ハイフン・接頭辞の大小文字を吸収する
    - 数字が無い場合（空欄、'-' など）は None（未登録）を返す
    - 数字はあるが8桁でない場合は ValueError

    Returns:
        正規化した番号、または None（未登録）
    """
    if value is None:
        return None
    # 全角→半角に揃えてから、区切り文字を除去する
    text = unicodedata.normalize('NFKC', str(value)).strip()
    text = re.sub(r'^JSTA', '', text, flags=re.IGNORECASE)
    text = re.sub(r'[\s\-‐‑‒–—―−]', '', text)

    if text == '':
        return None
    if not text.isdigit():
        raise ValueError('日本連盟登録番号は数字で入力してください')
    if len(text) != JSTA_DIGITS:
        raise ValueError(f'日本連盟登録番号は数字{JSTA_DIGITS}桁で入力してください（入力: {len(text)}桁）')
    return f'JSTA{text}'


def is_valid_jsta_number(value: Optional[str]) -> bool:
    """保存済みの値が有効な形式かどうか（申込時の判定用）

    過去に保存された '-' や 'JSTA-' のような値は無効として扱う。
    """
    if not value:
        return False
    return bool(_VALID.match(str(value).strip()))
