#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
監査ログ（操作ログ）ルーター＆記録ヘルパー

- record_request(): 全変更系API操作の自動記録（middlewareから呼ばれる）
- record_change(): 重要データの変更前後スナップショット（各エンドポイントから呼ばれる）
- GET /api/audit-logs: 閲覧用

記録は常にベストエフォート（失敗しても本処理を妨げない）。
"""

import json
from datetime import datetime
from typing import Optional, Any
from fastapi import APIRouter, HTTPException
from api.database import db

router = APIRouter()

# request_body / before / after の最大保存長（肥大化防止）
_MAX_FIELD = 4000


def _truncate(s: Optional[str]) -> Optional[str]:
    if s is None:
        return None
    if len(s) > _MAX_FIELD:
        return s[:_MAX_FIELD] + f"...(truncated {len(s) - _MAX_FIELD} chars)"
    return s


def _to_json(value: Any) -> Optional[str]:
    if value is None:
        return None
    try:
        return _truncate(json.dumps(value, ensure_ascii=False, default=str))
    except Exception:
        return _truncate(str(value))


async def _insert(data: dict):
    try:
        await db.execute_query('audit_logs', operation='insert', data=data)
    except Exception as e:
        print(f"⚠️ 監査ログ記録失敗: {e}")


async def record_request(
    *, actor_discord_id: Optional[str], method: str, path: str,
    status_code: int, request_body: Optional[str] = None,
):
    """全変更系API操作の自動記録（middleware用）"""
    await _insert({
        'kind': 'request',
        'actor_discord_id': actor_discord_id,
        'method': method,
        'path': path[:255] if path else path,
        'status_code': status_code,
        'request_body': _truncate(request_body),
    })


async def record_change(
    *, action: str, target_type: str, target_id: Optional[str],
    actor_discord_id: Optional[str] = None, summary: Optional[str] = None,
    before: Any = None, after: Any = None,
):
    """重要データの変更前後スナップショット記録（エンドポイント計装用）"""
    await _insert({
        'kind': 'change',
        'actor_discord_id': actor_discord_id,
        'action': action,
        'target_type': target_type,
        'target_id': str(target_id) if target_id is not None else None,
        'summary': summary,
        'before_json': _to_json(before),
        'after_json': _to_json(after),
    })


@router.get("/audit-logs")
async def get_audit_logs(kind: Optional[str] = None, target_id: Optional[str] = None, limit: int = 300):
    """監査ログを取得（timestamp降順）。kind/target_idで絞り込み可。"""
    try:
        filters = {}
        if kind:
            filters['kind'] = kind
        if target_id:
            filters['target_id'] = target_id
        result = await db.execute_query(
            'audit_logs', operation='select',
            filters=filters if filters else None,
        )
        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])
        logs = result.get('data') or []
        logs.sort(key=lambda x: (x.get('timestamp') or ''), reverse=True)
        logs = logs[:max(1, min(limit, 1000))]

        # 実行者名をplayer_mstから付与
        ids = list({l.get('actor_discord_id') for l in logs if l.get('actor_discord_id')})
        name_map = {}
        if ids:
            p = await db.execute_query('player_mst', operation='select')
            for row in (p.get('data') or []):
                did = row.get('discord_id')
                if did:
                    name_map[did] = row.get('player_name')
        for l in logs:
            l['actor_name'] = name_map.get(l.get('actor_discord_id'))
            ts = l.get('timestamp')
            if isinstance(ts, datetime):
                l['timestamp'] = ts.isoformat()
        return logs
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
