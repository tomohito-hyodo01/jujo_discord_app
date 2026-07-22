#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
申込ルーター

大会申込の操作
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import date
from api.database import db
from api.ward_webhooks import get_ward_webhook_url
import httpx
import os

router = APIRouter()


class RegistrationCreate(BaseModel):
    discord_id: str
    tournament_id: str
    type: str
    sex: int
    pair1: Optional[int] = None
    pair2: Optional[List[int]] = None
    team_status: int = 0  # 0=チーム確定, 1=参加希望


@router.post("/registrations")
async def create_registration(registration: RegistrationCreate):
    """新規申込を登録"""
    try:
        data = registration.model_dump()
        result = await db.execute_query(
            'tournament_registration',
            operation='insert',
            data=data
        )

        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        # パターンA（チーム確定）の場合、メンバーのパターンB（参加希望）レコードを削除
        if registration.team_status == 0 and registration.pair2:
            # pair2に含まれるメンバーのplayer_idからdiscord_idを取得して参加希望を削除
            all_member_ids = [registration.pair1] + (registration.pair2 or [])
            for member_id in all_member_ids:
                if member_id is None:
                    continue
                # player_idからdiscord_idを取得
                player_result = await db.execute_query(
                    'player_mst',
                    operation='select',
                    filters={'player_id': member_id}
                )
                if player_result.get('data'):
                    member_discord_id = player_result['data'][0].get('discord_id')
                    if member_discord_id:
                        # その人のこの大会の参加希望(team_status=1)を削除
                        existing = await db.execute_query(
                            'tournament_registration',
                            operation='select',
                            filters={
                                'discord_id': member_discord_id,
                                'tournament_id': registration.tournament_id,
                            }
                        )
                        if existing.get('data'):
                            for reg in existing['data']:
                                # 同一種別の参加希望のみ削除（他種別の希望は残す）
                                if reg.get('team_status') == 1 and reg.get('type') == registration.type:
                                    await db.execute_query(
                                        'tournament_registration',
                                        operation='delete',
                                        filters={'registration_id': reg['registration_id']}
                                    )

        # Discord Webhook通知
        try:
            webhook_url = os.getenv('DISCORD_WEBHOOK_URL', '')
            if webhook_url:
                # 申込者名を取得
                applicant = await db.execute_query('player_mst', operation='select', filters={'discord_id': registration.discord_id})
                applicant_name = applicant['data'][0]['player_name'] if applicant.get('data') else registration.discord_id

                # 大会名を取得
                tournament = await db.execute_query('tournament_mst', operation='select', filters={'tournament_id': registration.tournament_id})
                tournament_name = tournament['data'][0]['tournament_name'] if tournament.get('data') else registration.tournament_id
                classification = tournament['data'][0].get('classification', 0) if tournament.get('data') else 0

                registrated_ward = tournament['data'][0].get('registrated_ward') if tournament.get('data') else None

                # Webhook送信先を主催区で振り分け（未設定の区は広域チャンネルにフォールバック）
                target_webhook = get_ward_webhook_url(registrated_ward)
                if not target_webhook:
                    raise Exception(f'Discord Webhook未設定 (ward_id={registrated_ward})')

                sex_label = '男子' if registration.sex == 0 else '女子'

                if classification == 1 and registration.team_status == 1:
                    # 団体戦（個人参加希望）
                    content = f"🙋 **大会申込（参加希望）**\n**{tournament_name}**\n{registration.type} {sex_label}【団体】\n申込者: {applicant_name}"
                elif classification == 1:
                    # 団体戦（チーム確定）
                    member_names = []
                    all_ids = ([registration.pair1] if registration.pair1 else []) + (registration.pair2 or [])
                    for pid in all_ids:
                        if pid:
                            p = await db.execute_query('player_mst', operation='select', filters={'player_id': pid})
                            if p.get('data'):
                                member_names.append(p['data'][0]['player_name'])
                    members_str = '、'.join(member_names) if member_names else ''
                    content = f"📋 **大会申込（チーム）**\n**{tournament_name}**\n{registration.type} {sex_label}【団体】\n申込者: {applicant_name}\n出場者: {members_str}"
                else:
                    # 個人戦
                    pair_name = ''
                    if registration.pair1:
                        pair = await db.execute_query('player_mst', operation='select', filters={'player_id': registration.pair1})
                        if pair.get('data'):
                            pair_name = pair['data'][0]['player_name']
                    if pair_name:
                        content = f"📋 **大会申込**\n**{tournament_name}**\n{registration.type} {sex_label}\n申込者: {applicant_name}\n出場者: {applicant_name}、{pair_name}"
                    else:
                        content = f"📋 **大会申込**\n**{tournament_name}**\n{registration.type} {sex_label}\n申込者: {applicant_name}"

                async with httpx.AsyncClient() as client:
                    await client.post(target_webhook, json={'content': content}, timeout=5.0)
                print(f'✅ 申込通知送信: {tournament_name} / {applicant_name}')

                # 申込者+ペア/メンバーへDM送信（チャンネルと同じ内容）
                bot_token = os.getenv('DISCORD_BOT_TOKEN', '')
                if bot_token:
                    # DM送信先のdiscord_idを収集
                    dm_targets = set()
                    if registration.discord_id:
                        dm_targets.add(registration.discord_id)

                    # ペア/メンバーのdiscord_idを取得
                    member_player_ids = []
                    if classification == 1:
                        member_player_ids = ([registration.pair1] if registration.pair1 else []) + (registration.pair2 or [])
                    elif registration.pair1:
                        member_player_ids = [registration.pair1]

                    for pid in member_player_ids:
                        if pid:
                            p_result = await db.execute_query('player_mst', operation='select', filters={'player_id': pid})
                            if p_result.get('data') and p_result['data'][0].get('discord_id'):
                                dm_targets.add(p_result['data'][0]['discord_id'])

                    headers = {
                        'Authorization': f'Bot {bot_token}',
                        'Content-Type': 'application/json',
                    }
                    for target_id in dm_targets:
                        try:
                            async with httpx.AsyncClient() as client:
                                dm_ch = await client.post(
                                    'https://discord.com/api/v10/users/@me/channels',
                                    headers=headers,
                                    json={'recipient_id': target_id},
                                    timeout=5.0,
                                )
                                if dm_ch.status_code == 200:
                                    channel_id = dm_ch.json()['id']
                                    msg_res = await client.post(
                                        f'https://discord.com/api/v10/channels/{channel_id}/messages',
                                        headers=headers,
                                        json={'content': content},
                                        timeout=5.0,
                                    )
                                    if msg_res.status_code in (200, 201):
                                        print(f'✅ DM送信成功: {target_id}')
                                    else:
                                        print(f'⚠️ DM本文送信失敗: {target_id} / {msg_res.status_code} {msg_res.text[:120]}')
                                else:
                                    print(f'⚠️ DMチャンネル作成失敗: {target_id} / {dm_ch.status_code}')
                        except Exception as dm_e:
                            print(f'⚠️ DM送信失敗（申込自体は成功）: {target_id} / {dm_e}')

        except Exception as e:
            print(f'⚠️ 申込通知送信失敗（申込自体は成功）: {e}')

        return result.get('data', [{}])[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/registrations/user/{discord_id}")
async def get_user_registrations(discord_id: str):
    """ユーザーの申込一覧を取得（ペアとして含まれる申込も含む）"""
    try:
        # 自分が申込者のレコード
        own_result = await db.execute_query(
            'tournament_registration',
            operation='select',
            filters={'discord_id': discord_id},
            json_fields=['pair2']
        )
        if own_result.get('error'):
            raise HTTPException(status_code=500, detail=own_result['error'])

        own_regs = own_result.get('data', [])
        own_ids = {r['registration_id'] for r in own_regs}
        for r in own_regs:
            r['is_applicant'] = True

        # 自分のplayer_idを取得してペアとしての申込を検索
        player_result = await db.execute_query(
            'player_mst',
            operation='select',
            filters={'discord_id': discord_id}
        )
        player_data = player_result.get('data', [])

        pair_regs = []
        if player_data:
            player_id = player_data[0]['player_id']
            pair_result = await db.execute_query(
                'tournament_registration',
                operation='select',
                filters={'pair1': player_id},
                json_fields=['pair2']
            )
            if pair_result.get('data'):
                for r in pair_result['data']:
                    if r['registration_id'] not in own_ids:
                        r['is_applicant'] = False
                        pair_regs.append(r)

        return own_regs + pair_regs
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/registrations/{registration_id}")
async def delete_registration(registration_id: int):
    """申込をキャンセル（削除）"""
    # 申込の存在確認
    result = await db.execute_query(
        'tournament_registration',
        operation='select',
        filters={'registration_id': registration_id}
    )

    if result.get('error'):
        raise HTTPException(status_code=500, detail=result['error'])

    if not result.get('data'):
        raise HTTPException(status_code=404, detail="申込が見つかりません")

    # 削除
    delete_result = await db.execute_query(
        'tournament_registration',
        operation='delete',
        filters={'registration_id': registration_id}
    )

    if delete_result.get('error'):
        raise HTTPException(status_code=500, detail=delete_result['error'])

    return {"success": True, "message": "申込をキャンセルしました"}


class PairUpdateRequest(BaseModel):
    pair1: int


@router.put("/registrations/{registration_id}/pair")
async def update_pair(registration_id: int, request: PairUpdateRequest):
    """ペアを変更（締切前のみ）"""
    # 申込の存在確認
    reg_result = await db.execute_query(
        'tournament_registration',
        operation='select',
        filters={'registration_id': registration_id}
    )
    if reg_result.get('error'):
        raise HTTPException(status_code=500, detail=reg_result['error'])
    if not reg_result.get('data'):
        raise HTTPException(status_code=404, detail="申込が見つかりません")

    registration = reg_result['data'][0]

    # 大会の締切日を確認
    tour_result = await db.execute_query(
        'tournament_mst',
        operation='select',
        filters={'tournament_id': registration['tournament_id']}
    )
    if tour_result.get('data'):
        tournament = tour_result['data'][0]
        deadline = tournament.get('deadline_date')
        if deadline:
            deadline_date = deadline if isinstance(deadline, date) else date.fromisoformat(str(deadline))
            if date.today() > deadline_date:
                raise HTTPException(status_code=400, detail="締切日を過ぎているため変更できません")

    # ペア更新
    update_result = await db.execute_query(
        'tournament_registration',
        operation='update',
        filters={'registration_id': registration_id},
        data={'pair1': request.pair1}
    )
    if update_result.get('error'):
        raise HTTPException(status_code=500, detail=update_result['error'])

    return {"success": True, "message": "ペアを変更しました"}


class TeamUpdateRequest(BaseModel):
    pair1: int
    pair2: List[int]


@router.put("/registrations/{registration_id}/team")
async def update_team(registration_id: int, request: TeamUpdateRequest):
    """チームメンバーを変更（締切前のみ）"""
    # 申込の存在確認
    reg_result = await db.execute_query(
        'tournament_registration',
        operation='select',
        filters={'registration_id': registration_id}
    )
    if reg_result.get('error'):
        raise HTTPException(status_code=500, detail=reg_result['error'])
    if not reg_result.get('data'):
        raise HTTPException(status_code=404, detail="申込が見つかりません")

    registration = reg_result['data'][0]

    # 大会の締切日を確認
    tour_result = await db.execute_query(
        'tournament_mst',
        operation='select',
        filters={'tournament_id': registration['tournament_id']}
    )
    if tour_result.get('data'):
        tournament = tour_result['data'][0]
        deadline = tournament.get('deadline_date')
        if deadline:
            deadline_date = deadline if isinstance(deadline, date) else date.fromisoformat(str(deadline))
            if date.today() > deadline_date:
                raise HTTPException(status_code=400, detail="締切日を過ぎているため変更できません")

    # チームメンバー更新（確定状態に正規化＝参加希望フラグを解除）
    update_result = await db.execute_query(
        'tournament_registration',
        operation='update',
        filters={'registration_id': registration_id},
        data={'pair1': request.pair1, 'pair2': request.pair2, 'team_status': 0}
    )
    if update_result.get('error'):
        raise HTTPException(status_code=500, detail=update_result['error'])

    # 新メンバーの参加希望レコードを削除（同一種別のみ）
    reg_type = registration.get('type')
    all_member_ids = [request.pair1] + request.pair2
    for member_id in all_member_ids:
        player_result = await db.execute_query(
            'player_mst',
            operation='select',
            filters={'player_id': member_id}
        )
        if player_result.get('data'):
            member_discord_id = player_result['data'][0].get('discord_id')
            if member_discord_id:
                existing = await db.execute_query(
                    'tournament_registration',
                    operation='select',
                    filters={
                        'discord_id': member_discord_id,
                        'tournament_id': registration['tournament_id'],
                    }
                )
                if existing.get('data'):
                    for reg in existing['data']:
                        if reg.get('team_status') == 1 and reg.get('type') == reg_type:
                            await db.execute_query(
                                'tournament_registration',
                                operation='delete',
                                filters={'registration_id': reg['registration_id']}
                            )

    return {"success": True, "message": "チームメンバーを変更しました"}


@router.get("/registrations/tournament/{tournament_id}")
async def get_tournament_registrations(tournament_id: str):
    """大会の申込一覧を取得（選手情報付き）"""
    try:
        result = await db.execute_query(
            'tournament_registration',
            operation='select',
            filters={'tournament_id': tournament_id},
            json_fields=['pair2']
        )

        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])

        registrations = result.get('data', [])

        enriched = []
        for reg in registrations:
            # 申込者の選手情報を取得
            applicant_result = await db.execute_query(
                'player_mst',
                operation='select',
                filters={'discord_id': reg['discord_id']}
            )
            applicant_data = applicant_result.get('data', [])
            reg['applicant_name'] = applicant_data[0]['player_name'] if applicant_data else None

            # ペアの選手情報を取得
            pair_result = await db.execute_query(
                'player_mst',
                operation='select',
                filters={'player_id': reg['pair1']}
            )
            pair_data = pair_result.get('data', [])
            reg['pair_name'] = pair_data[0]['player_name'] if pair_data else None

            # 団体戦メンバー名を取得
            member_names = []
            all_member_ids = ([reg['pair1']] if reg.get('pair1') else []) + (reg.get('pair2') or [])
            for mid in all_member_ids:
                if mid:
                    m_result = await db.execute_query('player_mst', operation='select', filters={'player_id': mid})
                    if m_result.get('data'):
                        member_names.append(m_result['data'][0]['player_name'])
            reg['member_names'] = member_names

            enriched.append(reg)

        return enriched
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

