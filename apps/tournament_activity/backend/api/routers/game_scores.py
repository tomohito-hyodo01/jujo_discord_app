#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ゲームスコア・ランキングルーター

ミニゲーム（「エビ走」など）のベストスコアをアカウント単位で保持し、
利用者間で共有するランキング（ベスト5など）を提供する。

汎用 execute_query は ORDER BY / LIMIT / upsert に未対応のため、
ここでは db.pool を使った生SQLで実装する。
"""

import aiomysql
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from api.database import db

router = APIRouter()

# 対応ゲーム（不正な値でテーブルを汚さないためのホワイトリスト）
ALLOWED_GAMES = {"ebi_run"}

_table_ready = False


async def _ensure_table():
    """game_scores テーブルが無ければ作成（冪等・初回のみ実行）"""
    global _table_ready
    if _table_ready:
        return
    create_sql = """
    CREATE TABLE IF NOT EXISTS game_scores (
        id INT AUTO_INCREMENT PRIMARY KEY,
        game VARCHAR(40) NOT NULL,
        discord_id VARCHAR(255) NOT NULL,
        display_name VARCHAR(255),
        best_score INT NOT NULL DEFAULT 0,
        best_coins INT NOT NULL DEFAULT 0,
        play_count INT NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_game_user (game, discord_id),
        INDEX idx_game_score (game, best_score)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """
    async with db.pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(create_sql)
    _table_ready = True


class ScoreSubmit(BaseModel):
    game: str
    discord_id: str
    display_name: Optional[str] = None
    score: int
    coins: int = 0


async def _resolve_display_name(discord_id: str, fallback: Optional[str]) -> Optional[str]:
    """player_mst の選手名を優先。無ければ送信された表示名にフォールバック。"""
    try:
        res = await db.execute_query("player_mst", operation="select", filters={"discord_id": discord_id})
        if res.get("data"):
            name = res["data"][0].get("player_name")
            if name:
                return name
    except Exception:
        pass
    return fallback


async def _fetch_top(game: str, limit: int) -> list:
    """ベストスコア上位を取得（同点は先に達成した方を上位）"""
    sql = (
        "SELECT discord_id, display_name, best_score, best_coins, updated_at "
        "FROM game_scores WHERE game = %s "
        "ORDER BY best_score DESC, updated_at ASC LIMIT %s"
    )
    async with db.pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute(sql, (game, limit))
            rows = await cur.fetchall()
    top = []
    for i, r in enumerate(rows):
        top.append({
            "rank": i + 1,
            "discord_id": r["discord_id"],
            "display_name": r["display_name"] or "ランナー",
            "best_score": r["best_score"],
            "best_coins": r["best_coins"],
        })
    return top


async def _rank_of(game: str, discord_id: str) -> Optional[int]:
    """指定ユーザーの順位（1始まり）。未登録なら None。"""
    sql = (
        "SELECT COUNT(*) + 1 AS rnk FROM game_scores gs "
        "JOIN (SELECT best_score, updated_at FROM game_scores WHERE game = %s AND discord_id = %s) me "
        "ON gs.game = %s AND ("
        "  gs.best_score > me.best_score OR "
        "  (gs.best_score = me.best_score AND gs.updated_at < me.updated_at)"
        ")"
    )
    async with db.pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute(sql, (game, discord_id, game))
            row = await cur.fetchone()
    return int(row["rnk"]) if row else None


@router.post("/game_scores")
async def submit_score(payload: ScoreSubmit):
    """スコアを送信。ベストスコアのみ更新（upsert）し、ベスト5＋自分の順位を返す。"""
    if payload.game not in ALLOWED_GAMES:
        raise HTTPException(status_code=400, detail="invalid game")
    if not payload.discord_id:
        raise HTTPException(status_code=400, detail="discord_id is required")
    score = max(0, int(payload.score))
    coins = max(0, int(payload.coins))

    try:
        await _ensure_table()
        display_name = await _resolve_display_name(payload.discord_id, payload.display_name)

        # ベストスコアのみ更新。スコアが既存ベスト超過時のみ best_score/best_coins を更新。
        # play_count は毎回+1。display_name は最新の解決結果で常に更新。
        upsert_sql = (
            "INSERT INTO game_scores (game, discord_id, display_name, best_score, best_coins, play_count) "
            "VALUES (%s, %s, %s, %s, %s, 1) "
            "ON DUPLICATE KEY UPDATE "
            "  best_coins = IF(VALUES(best_score) > best_score, VALUES(best_coins), best_coins), "
            "  best_score = GREATEST(best_score, VALUES(best_score)), "
            "  display_name = VALUES(display_name), "
            "  play_count = play_count + 1"
        )
        async with db.pool.acquire() as conn:
            async with conn.cursor() as cur:
                await cur.execute(upsert_sql, (payload.game, payload.discord_id, display_name, score, coins))

        # 更新後の自分のベストを取得し、新記録かどうか判定
        async with db.pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cur:
                await cur.execute(
                    "SELECT best_score, best_coins FROM game_scores WHERE game = %s AND discord_id = %s",
                    (payload.game, payload.discord_id),
                )
                me = await cur.fetchone()
        best = int(me["best_score"]) if me else score
        new_best = best == score  # 今回のスコアが自分のベスト＝更新（同点の初回含む）

        top = await _fetch_top(payload.game, 5)
        rank = await _rank_of(payload.game, payload.discord_id)
        return {"success": True, "best": best, "new_best": new_best, "rank": rank, "top": top}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/game_scores/top")
async def get_top(game: str, limit: int = 5):
    """ベストスコア上位を取得（ランキング表示用）"""
    if game not in ALLOWED_GAMES:
        raise HTTPException(status_code=400, detail="invalid game")
    limit = max(1, min(500, int(limit)))   # 管理者の全件閲覧に対応（上限を引き上げ）
    try:
        await _ensure_table()
        top = await _fetch_top(game, limit)
        return {"top": top}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
