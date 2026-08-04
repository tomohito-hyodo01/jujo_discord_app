#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
大会申込締切の判定ヘルパー

締切は deadline_date（DATE）＋ deadline_time（'HH:MM'、NULL=終日）で決まる。
判定ロジックの分散（画面・APIごとの食い違い）を防ぐため、
申込可否・変更可否の締切判定は必ずこのモジュールを使うこと。
"""
from datetime import datetime, date, time as dtime
from typing import Optional

# 時刻未設定の大会は締切日の終日（23:59:59）まで受付
DEFAULT_CUTOFF_TIME = dtime(23, 59, 59)


def get_deadline_cutoff(tournament: dict) -> Optional[datetime]:
    """大会の申込締切日時を返す（deadline_date が無ければ None）

    deadline_time（HH:MM）が設定されていればその時刻ちょうどまで受付
    （now <= cutoff が受付可）。不正な値は警告を出して終日扱いにする。
    """
    deadline = tournament.get('deadline_date')
    if not deadline:
        return None
    if isinstance(deadline, datetime):
        deadline = deadline.date()
    elif not isinstance(deadline, date):
        try:
            deadline = date.fromisoformat(str(deadline)[:10])
        except ValueError:
            return None

    cutoff_time = DEFAULT_CUTOFF_TIME
    time_str = tournament.get('deadline_time')
    if time_str:
        try:
            hour, minute = str(time_str)[:5].split(':')
            cutoff_time = dtime(int(hour), int(minute))
        except ValueError:
            print(f"⚠️ deadline_timeが不正なため終日扱いにフォールバック: {time_str!r} "
                  f"(tournament_id={tournament.get('tournament_id')})")

    return datetime.combine(deadline, cutoff_time)


def is_deadline_passed(tournament: dict) -> bool:
    """申込締切を過ぎているか（deadline_date が無い場合は False）"""
    cutoff = get_deadline_cutoff(tournament)
    if cutoff is None:
        return False
    return datetime.now() > cutoff
