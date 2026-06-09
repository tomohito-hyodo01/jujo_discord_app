#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
汎用コメントルーター

練習・イベント・審判講習へのコメント（スレッド）機能
メンション(<@player_id>)時にDiscord DMで通知
"""

import os
import re
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Literal
from datetime import datetime
from api.database import db

router = APIRouter()

ALLOWED_TARGET_TYPES = {"practice", "event", "referee_training"}

TARGET_LABELS = {
    "practice": "練習",
    "event": "イベント",
    "referee_training": "審判講習",
}


class CommentCreate(BaseModel):
    target_type: Literal["practice", "event", "referee_training"]
    target_id: int
    player_id: int
    body: str
    parent_id: Optional[int] = None  # 返信先コメントID（スレッド。トップレベルはNone）


class CommentUpdate(BaseModel):
    body: str
    discord_id: str  # 編集者のdiscord_id（権限チェック用）


class CommentDeleteAuth(BaseModel):
    discord_id: str


def _serialize_comment(row: dict) -> dict:
    out = dict(row)
    for f in ("created_at", "updated_at"):
        v = out.get(f)
        if isinstance(v, datetime):
            out[f] = v.isoformat()
    return out


async def _is_admin(discord_id: str) -> bool:
    if not discord_id:
        return False
    res = await db.execute_query("player_mst", operation="select", filters={"discord_id": discord_id})
    if not res.get("data"):
        return False
    return (res["data"][0].get("admin_role") or 2) == 0


async def _attach_player_names(comments: list) -> list:
    for c in comments:
        p_res = await db.execute_query("player_mst", operation="select", filters={"player_id": c["player_id"]})
        if p_res.get("data"):
            c["player_name"] = p_res["data"][0].get("player_name")
        else:
            c["player_name"] = None
    return comments


async def _send_mention_dms(body: str, target_type: str, target_id: int, sender_player_id: int, exclude_ids=None):
    """本文中の <@player_id> を抽出し、対象者にDiscord DMを送信。
    exclude_ids（編集前に既に通知済みのID等）と送信者自身は除外する。"""
    bot_token = os.getenv("DISCORD_BOT_TOKEN", "")
    if not bot_token:
        return

    mentioned_ids = set(int(m) for m in re.findall(r"<@(\d+)>", body or ""))
    exclude = set(exclude_ids or [])
    if sender_player_id is not None:
        exclude.add(sender_player_id)  # 自己メンションは通知しない
    mentioned_ids = [pid for pid in mentioned_ids if pid not in exclude]
    if not mentioned_ids:
        return

    sender_name = "メンバー"
    s_res = await db.execute_query("player_mst", operation="select", filters={"player_id": sender_player_id})
    if s_res.get("data"):
        sender_name = s_res["data"][0].get("player_name") or sender_name

    target_label = TARGET_LABELS.get(target_type, target_type)
    target_title = ""
    if target_type == "practice":
        t_res = await db.execute_query("practice_schedule", operation="select", filters={"id": target_id})
        if t_res.get("data"):
            t = t_res["data"][0]
            target_title = f"{t.get('practice_date', '')} {t.get('location', '')}"
    elif target_type == "event":
        t_res = await db.execute_query("events", operation="select", filters={"id": target_id})
        if t_res.get("data"):
            target_title = t_res["data"][0].get("title", "")
    elif target_type == "referee_training":
        t_res = await db.execute_query("referee_training", operation="select", filters={"id": target_id})
        if t_res.get("data"):
            t = t_res["data"][0]
            target_title = f"審判講習 {t.get('training_date', '')} {t.get('location', '')}"

    # メンション展開用に全player_idの名前を先取得
    name_map: dict = {}
    all_ids = set(re.findall(r"<@(\d+)>", body or ""))
    for pid_str in all_ids:
        try:
            pres = await db.execute_query("player_mst", operation="select", filters={"player_id": int(pid_str)})
            if pres.get("data"):
                name_map[pid_str] = pres["data"][0].get("player_name") or pid_str
        except Exception:
            pass
    plain_body = re.sub(r"<@(\d+)>", lambda m: f"@{name_map.get(m.group(1), m.group(1))}", body)

    headers = {"Authorization": f"Bot {bot_token}", "Content-Type": "application/json"}

    for pid in mentioned_ids:
        try:
            p_res = await db.execute_query("player_mst", operation="select", filters={"player_id": pid})
            if not p_res.get("data"):
                continue
            target_discord_id = p_res["data"][0].get("discord_id")
            if not target_discord_id:
                continue

            content = (
                f"💬 {target_label}「{target_title}」のコメントであなたがメンションされました。\n"
                f"投稿者: {sender_name}\n"
                f"内容: {plain_body}"
            )

            async with httpx.AsyncClient() as client:
                ch = await client.post(
                    "https://discord.com/api/v10/users/@me/channels",
                    headers=headers,
                    json={"recipient_id": target_discord_id},
                    timeout=5.0,
                )
                if ch.status_code == 200:
                    channel_id = ch.json()["id"]
                    await client.post(
                        f"https://discord.com/api/v10/channels/{channel_id}/messages",
                        headers=headers,
                        json={"content": content},
                        timeout=5.0,
                    )
                    print(f"✅ メンションDM送信成功: {target_discord_id}")
        except Exception as e:
            print(f"⚠️ メンションDM送信失敗: player_id={pid} / {e}")


@router.get("/comments")
async def get_comments(target_type: str, target_id: int):
    """コメント一覧を取得"""
    if target_type not in ALLOWED_TARGET_TYPES:
        raise HTTPException(status_code=400, detail="invalid target_type")
    try:
        result = await db.execute_query(
            "comments", operation="select",
            filters={"target_type": target_type, "target_id": target_id},
        )
        if result.get("error"):
            raise HTTPException(status_code=500, detail=result["error"])
        comments = result.get("data", []) or []
        comments.sort(key=lambda c: c.get("created_at") or "")
        comments = [_serialize_comment(c) for c in comments]
        await _attach_player_names(comments)
        return comments
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/comments")
async def create_comment(comment: CommentCreate):
    """コメントを投稿"""
    if comment.target_type not in ALLOWED_TARGET_TYPES:
        raise HTTPException(status_code=400, detail="invalid target_type")
    body = (comment.body or "").strip()
    if not body:
        raise HTTPException(status_code=400, detail="本文を入力してください")
    try:
        insert_data = {
            "target_type": comment.target_type,
            "target_id": comment.target_id,
            "player_id": comment.player_id,
            "body": body,
        }
        if comment.parent_id is not None:
            insert_data["parent_id"] = comment.parent_id
        result = await db.execute_query(
            "comments", operation="insert",
            data=insert_data,
        )
        if result.get("error"):
            raise HTTPException(status_code=500, detail=result["error"])

        # メンションDM送信（バックグラウンド的に。失敗しても投稿は成功）
        try:
            await _send_mention_dms(body, comment.target_type, comment.target_id, comment.player_id)
        except Exception as e:
            print(f"⚠️ メンションDM処理エラー: {e}")

        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/comments/{comment_id}")
async def update_comment(comment_id: int, payload: CommentUpdate):
    """コメントを編集（投稿者本人 or 管理者のみ）"""
    body = (payload.body or "").strip()
    if not body:
        raise HTTPException(status_code=400, detail="本文を入力してください")
    try:
        c_res = await db.execute_query("comments", operation="select", filters={"id": comment_id})
        if not c_res.get("data"):
            raise HTTPException(status_code=404, detail="コメントが見つかりません")
        c = c_res["data"][0]

        # 権限チェック
        is_owner = False
        p_res = await db.execute_query("player_mst", operation="select", filters={"discord_id": payload.discord_id})
        if p_res.get("data") and p_res["data"][0].get("player_id") == c.get("player_id"):
            is_owner = True
        if not is_owner and not await _is_admin(payload.discord_id):
            raise HTTPException(status_code=403, detail="編集権限がありません")

        # 編集前の本文に含まれていたメンション（通知済み）を控える
        old_mentioned = set(int(m) for m in re.findall(r"<@(\d+)>", c.get("body") or ""))

        result = await db.execute_query(
            "comments", operation="update",
            filters={"id": comment_id},
            data={"body": body},
        )
        if result.get("error"):
            raise HTTPException(status_code=500, detail=result["error"])

        # 編集時は「新規に追加されたメンションのみ」へ通知（既存分の再送を防ぐ）
        # 送信者は編集者本人とする
        editor_player_id = p_res["data"][0].get("player_id") if p_res.get("data") else c["player_id"]
        try:
            await _send_mention_dms(body, c["target_type"], c["target_id"], editor_player_id, exclude_ids=old_mentioned)
        except Exception as e:
            print(f"⚠️ メンションDM処理エラー: {e}")

        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/comments/{comment_id}")
async def delete_comment(comment_id: int, discord_id: str):
    """コメントを削除（投稿者本人 or 管理者のみ）"""
    try:
        c_res = await db.execute_query("comments", operation="select", filters={"id": comment_id})
        if not c_res.get("data"):
            raise HTTPException(status_code=404, detail="コメントが見つかりません")
        c = c_res["data"][0]

        is_owner = False
        p_res = await db.execute_query("player_mst", operation="select", filters={"discord_id": discord_id})
        if p_res.get("data") and p_res["data"][0].get("player_id") == c.get("player_id"):
            is_owner = True
        if not is_owner and not await _is_admin(discord_id):
            raise HTTPException(status_code=403, detail="削除権限がありません")

        result = await db.execute_query("comments", operation="delete", filters={"id": comment_id})
        if result.get("error"):
            raise HTTPException(status_code=500, detail=result["error"])
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
