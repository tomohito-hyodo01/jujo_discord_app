#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
選手ルーター

選手マスタの操作
"""

from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import Optional
from api.database import db
import aiomysql
import json
import csv
import io

router = APIRouter()


class PlayerCreate(BaseModel):
    discord_id: Optional[str] = None  # 大会申込からの追加時はnull
    player_name: str
    player_name_kana: Optional[str] = None
    last_name: Optional[str] = None
    first_name: Optional[str] = None
    last_name_kana: Optional[str] = None
    first_name_kana: Optional[str] = None
    jsta_number: Optional[str] = None
    post_number: str
    address: str
    phone_number: str
    birth_date: str
    sex: int
    affiliated_club: Optional[str] = None  # 所属クラブ
    member_level: Optional[int] = None  # Discordロールから取得した会員レベル
    created_by: Optional[str] = None  # 登録者のDiscord ID


class PlayerUpdate(BaseModel):
    player_name: Optional[str] = None
    player_name_kana: Optional[str] = None
    last_name: Optional[str] = None
    first_name: Optional[str] = None
    last_name_kana: Optional[str] = None
    first_name_kana: Optional[str] = None
    jsta_number: Optional[str] = None
    post_number: Optional[str] = None
    address: Optional[str] = None
    phone_number: Optional[str] = None
    birth_date: Optional[str] = None
    sex: Optional[int] = None
    affiliated_club: Optional[str] = None


class PlayerPermissionUpdate(BaseModel):
    admin_role: Optional[int] = None
    member_level: Optional[int] = None
    managed_ward_id: Optional[int] = None
    practice_admin: Optional[int] = None


class PlayerWardFlagsUpdate(BaseModel):
    tokyo_flg: Optional[bool] = None
    edogawa_flg: Optional[bool] = None
    koto_flg: Optional[bool] = None
    chuo_flg: Optional[bool] = None
    sumida_flg: Optional[bool] = None
    arakawa_flg: Optional[bool] = None
    adachi_flg: Optional[bool] = None
    itabashi_flg: Optional[bool] = None


class PlayerQualificationUpdate(BaseModel):
    skill_grade: Optional[str] = None
    skill_grade_date: Optional[str] = None
    referee_qualification: Optional[str] = None
    referee_date: Optional[str] = None
    referee_expiry: Optional[str] = None


class MergeRequest(BaseModel):
    keep_id: int
    remove_id: int


class LinkDiscordBody(BaseModel):
    discord_id: str


@router.get("/players")
async def get_players():
    """全選手を取得"""
    try:
        result = await db.execute_query('player_mst', operation='select')
        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])
        return result.get('data', [])
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/players/match")
async def match_player(player_name: str, birth_date: str):
    """名前と生年月日で既存選手を検索（重複防止用）"""
    try:
        result = await db.execute_query(
            'player_mst',
            operation='select',
            filters={'player_name': player_name, 'birth_date': birth_date}
        )
        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        matches = result.get('data', [])
        return matches
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/players/duplicates")
async def get_duplicate_players():
    """重複の可能性がある選手を検出"""
    try:
        result = await db.execute_query('player_mst', operation='select')
        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        players = result.get('data', [])

        # player_name でグループ化して重複を検出
        name_groups: dict = {}
        for p in players:
            name = p.get('player_name', '').strip()
            if not name:
                continue
            if name not in name_groups:
                name_groups[name] = []
            name_groups[name].append(p)

        # 重複ペアを生成
        duplicates = []
        for name, group in name_groups.items():
            if len(group) < 2:
                continue
            # グループ内の全ペアを生成
            for i in range(len(group)):
                for j in range(i + 1, len(group)):
                    p1, p2 = group[i], group[j]
                    duplicates.append({
                        'id1': p1['player_id'],
                        'name1': p1.get('player_name', ''),
                        'discord1': p1.get('discord_id'),
                        'birth1': p1.get('birth_date'),
                        'id2': p2['player_id'],
                        'name2': p2.get('player_name', ''),
                        'discord2': p2.get('discord_id'),
                        'birth2': p2.get('birth_date'),
                    })

        return duplicates
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/players/merge")
async def merge_players(req: MergeRequest):
    """2つの選手アカウントを統合する"""
    try:
        # 両選手の存在確認
        keep_result = await db.execute_query(
            'player_mst', operation='select', filters={'player_id': req.keep_id}
        )
        remove_result = await db.execute_query(
            'player_mst', operation='select', filters={'player_id': req.remove_id}
        )

        keep_data = keep_result.get('data', [])
        remove_data = remove_result.get('data', [])

        if not keep_data:
            raise HTTPException(status_code=404, detail=f"残す選手 (ID: {req.keep_id}) が見つかりません")
        if not remove_data:
            raise HTTPException(status_code=404, detail=f"削除する選手 (ID: {req.remove_id}) が見つかりません")

        keep_player = keep_data[0]
        remove_player = remove_data[0]

        async with db.pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cursor:
                # 1. tournament_registration: pair1 の更新
                await cursor.execute(
                    "UPDATE tournament_registration SET pair1 = %s WHERE pair1 = %s",
                    (req.keep_id, req.remove_id)
                )
                pair1_updated = cursor.rowcount

                # 2. tournament_registration: pair2 (JSON配列) の更新
                # pair2 は JSON配列なので文字列置換で対応
                await cursor.execute(
                    "UPDATE tournament_registration SET pair2 = REPLACE(pair2, %s, %s) WHERE pair2 LIKE %s",
                    (str(req.remove_id), str(req.keep_id), f'%{req.remove_id}%')
                )
                pair2_updated = cursor.rowcount

                # 3. practice_participants: player_id の更新
                # keep_id が既に存在する場合は remove_id のレコードを削除
                await cursor.execute(
                    "SELECT id FROM practice_participants WHERE player_id = %s",
                    (req.keep_id,)
                )
                keep_practices = {row['id'] for row in await cursor.fetchall()}

                await cursor.execute(
                    "SELECT id, practice_id FROM practice_participants WHERE player_id = %s",
                    (req.remove_id,)
                )
                remove_practices = await cursor.fetchall()

                practice_updated = 0
                practice_deleted = 0
                for rp in remove_practices:
                    # practice_id で重複チェック
                    await cursor.execute(
                        "SELECT id FROM practice_participants WHERE player_id = %s AND practice_id = %s",
                        (req.keep_id, rp['practice_id'])
                    )
                    existing = await cursor.fetchone()
                    if existing:
                        # keep_id が同じ練習に既に参加 -> remove_id のレコードを削除
                        await cursor.execute(
                            "DELETE FROM practice_participants WHERE player_id = %s AND practice_id = %s",
                            (req.remove_id, rp['practice_id'])
                        )
                        practice_deleted += 1
                    else:
                        # keep_id が参加していない -> player_id を更新
                        await cursor.execute(
                            "UPDATE practice_participants SET player_id = %s WHERE player_id = %s AND practice_id = %s",
                            (req.keep_id, req.remove_id, rp['practice_id'])
                        )
                        practice_updated += 1

                # 4. discord_id の引き継ぎ
                discord_transferred = False
                if remove_player.get('discord_id') and not keep_player.get('discord_id'):
                    await cursor.execute(
                        "UPDATE player_mst SET discord_id = %s WHERE player_id = %s",
                        (remove_player['discord_id'], req.keep_id)
                    )
                    discord_transferred = True

                # 5. 削除対象の選手を削除
                await cursor.execute(
                    "DELETE FROM player_mst WHERE player_id = %s",
                    (req.remove_id,)
                )

        return {
            "success": True,
            "message": f"選手を統合しました (残: {req.keep_id}, 削除: {req.remove_id})",
            "details": {
                "pair1_updated": pair1_updated,
                "pair2_updated": pair2_updated,
                "practice_updated": practice_updated,
                "practice_deleted": practice_deleted,
                "discord_transferred": discord_transferred,
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/players/{player_id}")
async def get_player(player_id: int):
    """選手IDで選手を取得"""
    try:
        result = await db.execute_query(
            'player_mst',
            operation='select',
            filters={'player_id': player_id}
        )

        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        data = result.get('data', [])
        if not data:
            raise HTTPException(status_code=404, detail="Player not found")

        return data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/players")
async def create_player(player: PlayerCreate):
    """新規選手を登録"""
    try:
        # discord_idが指定されている場合、重複チェック
        if player.discord_id:
            existing = await db.execute_query(
                'player_mst',
                operation='select',
                filters={'discord_id': player.discord_id}
            )
            if existing.get('data'):
                # 既に登録済み → 既存データを返す（再試行対策）
                return existing['data'][0]

        # 日連登録番号の重複チェック
        if player.jsta_number:
            jsta_dup = await db.execute_query(
                'player_mst',
                operation='select',
                filters={'jsta_number': player.jsta_number}
            )
            if jsta_dup.get('data'):
                raise HTTPException(status_code=409, detail="すでに該当の番号の選手は登録されています")

        # 同姓名＋同生年月日の重複チェック
        if player.player_name and player.birth_date:
            dup = await db.execute_query(
                'player_mst',
                operation='select',
                filters={'player_name': player.player_name, 'birth_date': player.birth_date}
            )
            if dup.get('data'):
                existing_player = dup['data'][0]
                # discord_idがなければ紐付けて返す
                if not existing_player.get('discord_id') and player.discord_id:
                    await db.execute_query(
                        'player_mst',
                        operation='update',
                        filters={'player_id': existing_player['player_id']},
                        data={'discord_id': player.discord_id}
                    )
                    existing_player['discord_id'] = player.discord_id
                return existing_player

        result = await db.execute_query(
            'player_mst',
            operation='insert',
            data=player.model_dump(exclude_none=True)
        )

        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        return result.get('data', [{}])[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/players/discord/{discord_id}")
async def get_player_by_discord_id(discord_id: str):
    """Discord IDで選手を取得"""
    try:
        result = await db.execute_query(
            'player_mst',
            operation='select',
            filters={'discord_id': discord_id}
        )

        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        data = result.get('data', [])
        if not data:
            return None

        return data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/players/discord/{discord_id}")
async def update_player_by_discord_id(discord_id: str, player: PlayerUpdate):
    """Discord IDで選手情報を更新"""
    try:
        update_data = player.model_dump(exclude_none=True)
        if not update_data:
            raise HTTPException(status_code=400, detail="No fields to update")

        result = await db.execute_query(
            'player_mst',
            operation='update',
            filters={'discord_id': discord_id},
            data=update_data
        )

        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        data = result.get('data', [])
        if not data:
            raise HTTPException(status_code=404, detail="Player not found")

        return data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/players/{player_id}/update")
async def update_player_by_id(player_id: int, player: PlayerUpdate):
    """選手IDで選手情報を更新"""
    try:
        update_data = player.model_dump(exclude_none=True)
        if not update_data:
            raise HTTPException(status_code=400, detail="No fields to update")

        result = await db.execute_query(
            'player_mst',
            operation='update',
            filters={'player_id': player_id},
            data=update_data
        )

        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        data = result.get('data', [])
        if not data:
            raise HTTPException(status_code=404, detail="Player not found")

        return data[0]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/players/{player_id}/link-discord")
async def link_discord(player_id: int, body: LinkDiscordBody):
    """既存選手にDiscord IDを紐付ける"""
    try:
        # Check if discord_id is already used by another player
        existing = await db.execute_query(
            'player_mst',
            operation='select',
            filters={'discord_id': body.discord_id}
        )
        if existing.get('data'):
            raise HTTPException(status_code=409, detail="このDiscord IDは既に別の選手に登録されています")

        result = await db.execute_query(
            'player_mst',
            operation='update',
            filters={'player_id': player_id},
            data={'discord_id': body.discord_id}
        )
        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        return {"success": True, "message": "Discord IDを紐付けました"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/players/{player_id}/permissions")
async def update_player_permissions(player_id: int, permissions: PlayerPermissionUpdate):
    """選手の権限を更新"""
    try:
        # 選手の存在確認
        result = await db.execute_query(
            'player_mst',
            operation='select',
            filters={'player_id': player_id}
        )

        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        data = result.get('data', [])
        if not data:
            raise HTTPException(status_code=404, detail="Player not found")

        # 提供されたフィールドのみ更新
        update_data = permissions.model_dump(exclude_none=True)
        if not update_data:
            return {"success": True, "message": "権限を更新しました"}

        result = await db.execute_query(
            'player_mst',
            operation='update',
            filters={'player_id': player_id},
            data=update_data
        )

        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        return {"success": True, "message": "権限を更新しました"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/players/{player_id}/ward-flags")
async def update_player_ward_flags(player_id: int, flags: PlayerWardFlagsUpdate):
    """選手の区登録状況を更新"""
    try:
        result = await db.execute_query(
            'player_mst',
            operation='select',
            filters={'player_id': player_id}
        )

        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        if not result.get('data'):
            raise HTTPException(status_code=404, detail="Player not found")

        update_data = {k: v for k, v in flags.model_dump().items() if v is not None}
        if not update_data:
            return {"success": True, "message": "区登録状況を更新しました"}

        result = await db.execute_query(
            'player_mst',
            operation='update',
            filters={'player_id': player_id},
            data=update_data
        )

        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        return {"success": True, "message": "区登録状況を更新しました"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/players/{player_id}/qualifications")
async def update_player_qualifications(player_id: int, quals: PlayerQualificationUpdate):
    """選手の資格情報を更新（管理者用）"""
    try:
        result = await db.execute_query(
            'player_mst',
            operation='select',
            filters={'player_id': player_id}
        )

        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        if not result.get('data'):
            raise HTTPException(status_code=404, detail="Player not found")

        update_data = {}
        for k, v in quals.model_dump().items():
            if v is not None:
                update_data[k] = v if v != '' else None

        if not update_data:
            return {"success": True, "message": "資格情報を更新しました"}

        result = await db.execute_query(
            'player_mst',
            operation='update',
            filters={'player_id': player_id},
            data=update_data
        )

        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        return {"success": True, "message": "資格情報を更新しました"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/players/import-csv")
async def import_csv(file: UploadFile = File(...)):
    """CSVから選手情報を補完（空欄のみ埋める）"""
    try:
        content = await file.read()
        # BOM付きUTF-8対応
        text = content.decode('utf-8-sig')
        reader = csv.DictReader(io.StringIO(text))

        # 全選手を取得
        all_players = await db.execute_query('player_mst', operation='select')
        players = all_players.get('data', [])

        # jsta_numberとplayer_nameでインデックス作成
        by_jsta = {}
        by_name = {}
        for p in players:
            if p.get('jsta_number'):
                by_jsta[p['jsta_number']] = p
            if p.get('player_name'):
                by_name[p['player_name']] = p

        updated = 0
        skipped = 0
        not_found = []

        for row in reader:
            jsta = row.get('会員番号', '').strip()
            name = (row.get('姓', '').strip() + row.get('名', '').strip())
            kana = (row.get('姓フリガナ', '').strip() + row.get('名フリガナ', '').strip())
            sex_str = row.get('性別', '').strip()
            birth = row.get('生年月日', '').strip()
            club = row.get('団体名', '').strip()
            skill = row.get('技術等級コード', '').strip().strip('"')
            skill_date = row.get('技術等級認定日', '').strip().strip('"')
            referee = row.get('公認審判員コード', '').strip().strip('"')
            referee_dt = row.get('公認審判員認定日', '').strip().strip('"')
            referee_exp = row.get('公認審判有効期限', '').strip().strip('"')

            # 既存選手を検索: jsta_number優先、なければ名前
            player = by_jsta.get(jsta) if jsta else None
            if not player and name:
                player = by_name.get(name)

            if not player:
                not_found.append(name or jsta)
                continue

            # 空欄のみ埋める
            fill = {}
            if not player.get('jsta_number') and jsta:
                fill['jsta_number'] = jsta
            if not player.get('player_name_kana') and kana:
                fill['player_name_kana'] = kana
            if player.get('sex') is None and sex_str:
                fill['sex'] = 0 if sex_str == '男' else 1
            if not player.get('birth_date') and birth:
                fill['birth_date'] = birth.replace('/', '-')
            if not player.get('affiliated_club') and club:
                fill['affiliated_club'] = club
            if not player.get('skill_grade') and skill:
                fill['skill_grade'] = skill
            if not player.get('skill_grade_date') and skill_date:
                fill['skill_grade_date'] = skill_date.replace('/', '-')
            if not player.get('referee_qualification') and referee:
                fill['referee_qualification'] = referee
            if not player.get('referee_date') and referee_dt:
                fill['referee_date'] = referee_dt.replace('/', '-')
            if not player.get('referee_expiry') and referee_exp:
                # YYYY/MM/DD → YYYY-MM
                fill['referee_expiry'] = referee_exp.replace('/', '-')[:7]

            if fill:
                await db.execute_query(
                    'player_mst',
                    operation='update',
                    filters={'player_id': player['player_id']},
                    data=fill
                )
                updated += 1
            else:
                skipped += 1

        return {
            "success": True,
            "updated": updated,
            "skipped": skipped,
            "not_found": not_found,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/players/{player_id}")
async def delete_player(player_id: int):
    """選手を削除"""
    try:
        existing = await db.execute_query(
            'player_mst',
            operation='select',
            filters={'player_id': player_id}
        )
        if not existing.get('data'):
            raise HTTPException(status_code=404, detail="選手が見つかりません")

        result = await db.execute_query(
            'player_mst',
            operation='delete',
            filters={'player_id': player_id}
        )
        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        return {"success": True, "message": "選手を削除しました"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

