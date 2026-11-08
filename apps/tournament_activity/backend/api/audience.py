#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
イベント・日程アンケートの公開範囲（見せる範囲）

visibility 列（VARCHAR）の値:
- 'public'              : 全員（正会員・準会員・ゲスト）
- 'invited'             : 個人で選んだ人だけ（招待テーブル）
- 'members:0,1' など     : 選んだ会員区分 ＋ 個人で選んだ人（招待テーブル）
                          区分は player_mst.member_level（0=正会員, 1=準会員, 2=ゲスト）

練習日程の 'members_all'（正会員・準会員）/ 'members_regular'（正会員）も同じ意味で読む。
画面（frontend/src/utils/audience.ts）と同じ規則にそろえること。
"""

from typing import Optional

MEMBER_LEVELS = (0, 1, 2)
LEVEL_LABELS = {0: '正会員', 1: '準会員', 2: 'ゲスト'}
PREFIX = 'members:'


def parse_levels(visibility: Optional[str]) -> tuple:
    """見せる会員区分。不明な値は従来どおり全員として扱う"""
    v = (visibility or 'public').strip()
    if v == 'public':
        return MEMBER_LEVELS
    if v == 'invited':
        return ()
    if v == 'members_all':
        return (0, 1)
    if v == 'members_regular':
        return (0,)
    if v.startswith(PREFIX):
        levels = set()
        for s in v[len(PREFIX):].split(','):
            s = s.strip()
            if s.isdigit() and int(s) in MEMBER_LEVELS:
                levels.add(int(s))
        return tuple(sorted(levels))
    return MEMBER_LEVELS


def normalize_visibility(visibility: Optional[str]) -> Optional[str]:
    """画面から来た値を保存する形にそろえる。読めない値は None

    全区分を選んだら 'public'、区分を選ばなければ 'invited'（個人だけ）。
    """
    v = (visibility or 'public').strip()
    if v in ('public', 'invited'):
        return v
    if not (v.startswith(PREFIX) or v in ('members_all', 'members_regular')):
        return None
    if v.startswith(PREFIX):
        parts = [s.strip() for s in v[len(PREFIX):].split(',') if s.strip()]
        if any(not s.isdigit() or int(s) not in MEMBER_LEVELS for s in parts):
            return None
    levels = parse_levels(v)
    if levels == MEMBER_LEVELS:
        return 'public'
    if not levels:
        return 'invited'
    return PREFIX + ','.join(str(x) for x in levels)


def is_restricted(visibility: Optional[str]) -> bool:
    """全員公開ではない（会員区分か個人で絞っている）"""
    return parse_levels(visibility) != MEMBER_LEVELS
