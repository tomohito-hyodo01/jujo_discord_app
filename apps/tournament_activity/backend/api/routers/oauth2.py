#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Discord OAuth2認証ルーター
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import httpx
import os
from api.database import db

router = APIRouter()

# Discordロール → memberLevel マッピング
GUILD_ID = os.getenv('DISCORD_GUILD_ID', '1427113747306123409')
ROLE_MEMBER_LEVEL_MAP = {
    '1485309908424593589': 0,  # 正会員（都連登録者）
    '1485310538807377991': 1,  # 準会員
    '1485311046993448980': 2,  # ゲスト
}


class OAuth2Callback(BaseModel):
    code: str


@router.post("/oauth2/callback")
async def oauth2_callback(callback: OAuth2Callback):
    """
    Discord OAuth2コールバック

    Args:
        callback: 認証コード

    Returns:
        user_id: Discord User ID
        username: Discord Username
        member_level: ロールから判定した会員レベル (0:正会員, 1:準会員, 2:ゲスト, 3:未所属)
        roles: Discordロール名リスト
    """
    client_id = os.getenv('DISCORD_CLIENT_ID')
    client_secret = os.getenv('DISCORD_CLIENT_SECRET')
    redirect_uri = os.getenv('OAUTH_REDIRECT_URI', 'https://tournament.jujo-softtennis.com/')

    print(f'OAuth2 Callback: redirect_uri={redirect_uri}, code={callback.code[:10]}...')

    if not client_id or not client_secret:
        raise HTTPException(status_code=500, detail='OAuth2設定エラー')

    try:
        async with httpx.AsyncClient() as client:
            # トークン交換
            token_data_params = {
                'client_id': client_id,
                'client_secret': client_secret,
                'grant_type': 'authorization_code',
                'code': callback.code,
                'redirect_uri': redirect_uri,
            }
            print(f'トークン交換リクエスト: client_id={client_id}, redirect_uri={redirect_uri}')

            token_response = await client.post(
                'https://discord.com/api/oauth2/token',
                data=token_data_params,
                headers={
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                timeout=10.0
            )

            if token_response.status_code != 200:
                error_detail = token_response.text
                print(f'トークン交換失敗: {token_response.status_code}')
                print(f'Discord APIエラーレスポンス: {error_detail}')
                # エラーログ記録
                try:
                    await db.execute_query(
                        'app_logs',
                        operation='insert',
                        data={
                            'level': 'ERROR',
                            'event': 'LOGIN_FAILED',
                            'detail': f'トークン交換失敗: {token_response.status_code}'
                        }
                    )
                except:
                    pass
                raise HTTPException(status_code=400, detail=f'トークン交換失敗: {error_detail}')

            token_data = token_response.json()
            access_token = token_data['access_token']

            auth_headers = {'Authorization': f'Bearer {access_token}'}

            # ユーザー情報を取得
            user_response = await client.get(
                'https://discord.com/api/users/@me',
                headers=auth_headers,
                timeout=10.0
            )

            if user_response.status_code != 200:
                # エラーログ記録
                try:
                    await db.execute_query(
                        'app_logs',
                        operation='insert',
                        data={
                            'level': 'ERROR',
                            'event': 'LOGIN_FAILED',
                            'detail': f'ユーザー情報取得失敗: {user_response.status_code}'
                        }
                    )
                except:
                    pass
                raise HTTPException(status_code=400, detail='ユーザー情報取得失敗')

            user_data = user_response.json()

            # ギルドメンバー情報を取得（ロール判定用）
            member_level = 3  # デフォルト: 未所属
            role_names = []

            # OAuth2で取得したスコープを確認
            print(f'トークンスコープ: {token_data.get("scope", "不明")}')
            print(f'トークンguild: {token_data.get("guild", "なし")}')

            try:
                # まずギルド一覧を取得してサーバー参加状況を確認
                guilds_response = await client.get(
                    'https://discord.com/api/users/@me/guilds',
                    headers=auth_headers,
                    timeout=10.0
                )
                if guilds_response.status_code == 200:
                    guilds = guilds_response.json()
                    guild_ids = [g['id'] for g in guilds]
                    in_guild = GUILD_ID in guild_ids
                    print(f'ユーザーのギルド数: {len(guilds)}, 対象ギルド参加: {in_guild}')
                else:
                    print(f'ギルド一覧取得失敗: {guilds_response.status_code} {guilds_response.text[:200]}')

                member_response = await client.get(
                    f'https://discord.com/api/users/@me/guilds/{GUILD_ID}/member',
                    headers=auth_headers,
                    timeout=10.0
                )

                print(f'ギルドメンバーAPI: status={member_response.status_code}, body={member_response.text[:300]}')

                if member_response.status_code == 200:
                    member_data = member_response.json()
                    user_roles = member_data.get('roles', [])

                    # ロールIDからmemberLevelを判定（最も高い権限を採用）
                    for role_id, level in ROLE_MEMBER_LEVEL_MAP.items():
                        if role_id in user_roles:
                            if level < member_level:
                                member_level = level

                    print(f'ギルドメンバーロール: {user_roles} → memberLevel={member_level}')
                else:
                    print(f'ギルドメンバー情報取得失敗: {member_response.status_code} (サーバー未参加の可能性)')
            except Exception as e:
                print(f'ギルドメンバー情報取得エラー: {e}')

            print(f'OAuth2認証成功: {user_data["id"]} ({user_data["username"]}) memberLevel={member_level}')

            # アクセスログ記録
            try:
                # player_mstからadmin_roleを取得
                admin_role_name = '未登録'
                player_result = await db.execute_query(
                    'player_mst',
                    operation='select',
                    filters={'discord_id': user_data['id']}
                )
                if player_result.get('data'):
                    ar = player_result['data'][0].get('admin_role', 2)
                    admin_role_name = {0: '管理者', 1: '大会申込管理者', 2: '一般'}.get(ar, '一般')

                ml_name = {0: '正会員', 1: '準会員', 2: 'ゲスト'}.get(member_level, '未所属')

                await db.execute_query(
                    'app_logs',
                    operation='insert',
                    data={
                        'level': 'INFO',
                        'discord_id': user_data['id'],
                        'username': user_data['username'],
                        'event': 'LOGIN',
                        'detail': 'OAuth2認証成功',
                        'admin_role': admin_role_name,
                        'member_level_name': ml_name,
                    }
                )
            except:
                pass

            return {
                'user_id': user_data['id'],
                'username': user_data['username'],
                'member_level': member_level,
            }

    except HTTPException:
        raise
    except Exception as e:
        print(f'OAuth2エラー: {e}')
        # エラーログ記録
        try:
            await db.execute_query(
                'app_logs',
                operation='insert',
                data={
                    'level': 'ERROR',
                    'event': 'LOGIN_ERROR',
                    'detail': f'OAuth2エラー: {str(e)}'
                }
            )
        except:
            pass
        raise HTTPException(status_code=500, detail=str(e))
