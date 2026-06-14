#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Discord通知ルーター

大会申込完了時にDiscord Webhookで通知 + 申込者へDM送信
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import date, timedelta
import httpx
import os
import re
import aiomysql

router = APIRouter()

DISCORD_WEBHOOK_URL = os.getenv('DISCORD_WEBHOOK_URL', '')
DISCORD_BOT_TOKEN = os.getenv('DISCORD_BOT_TOKEN', '')

# 区ごとのWebhook URL
WARD_WEBHOOK_MAP = {
    23: os.getenv('DISCORD_WEBHOOK_URL_EDOGAWA', ''),   # 江戸川区
    8: os.getenv('DISCORD_WEBHOOK_URL_KOTO', ''),       # 江東区
    2: os.getenv('DISCORD_WEBHOOK_URL_CHUO', ''),       # 中央区
    7: os.getenv('DISCORD_WEBHOOK_URL_SUMIDA', ''),     # 墨田区
    18: os.getenv('DISCORD_WEBHOOK_URL_ARAKAWA', ''),   # 荒川区
    5: os.getenv('DISCORD_WEBHOOK_URL_BUNKYO', ''),     # 文京区
    101: os.getenv('DISCORD_WEBHOOK_URL_NAGAREYAMA', ''),  # 流山市（千葉）
    100: os.getenv('DISCORD_WEBHOOK_URL_EDOGAWA', ''),  # 浦安市 → 江戸川区チャンネル
}


async def send_dm(discord_id: str, content: str):
    """Discord BotでユーザーにDMを送信"""
    if not DISCORD_BOT_TOKEN:
        print('BOT_TOKENが設定されていません')
        return

    headers = {
        'Authorization': f'Bot {DISCORD_BOT_TOKEN}',
        'Content-Type': 'application/json',
    }

    try:
        async with httpx.AsyncClient() as client:
            # DMチャンネルを作成
            dm_res = await client.post(
                'https://discord.com/api/v10/users/@me/channels',
                headers=headers,
                json={'recipient_id': discord_id},
                timeout=5.0,
            )
            if dm_res.status_code != 200:
                print(f'❌ DMチャンネル作成失敗: {dm_res.status_code} {dm_res.text}')
                return

            channel_id = dm_res.json()['id']

            # メッセージ送信
            msg_res = await client.post(
                f'https://discord.com/api/v10/channels/{channel_id}/messages',
                headers=headers,
                json={'content': content},
                timeout=5.0,
            )
            if msg_res.status_code in [200, 201]:
                print(f'✅ DM送信成功: {discord_id}')
            else:
                print(f'❌ DM送信失敗: {msg_res.status_code} {msg_res.text}')
    except Exception as e:
        print(f'❌ DM送信エラー: {e}')


class RegistrationNotification(BaseModel):
    tournament_name: str
    type: str
    sex: int
    player1_name: str
    player2_name: str = None
    discord_id: Optional[str] = None


@router.post("/notify/registration")
async def notify_registration(notification: RegistrationNotification):
    """大会申込完了をDiscord Webhookで通知 + 申込者へDM送信"""
    # 性別ラベル
    sex_label = '男子' if notification.sex == 0 else '女子'

    # メッセージを作成
    if notification.player2_name:
        content = f"【大会申込完了】\n{notification.tournament_name}\n{notification.type}{sex_label}\n{notification.player1_name}・{notification.player2_name}"
    else:
        content = f"【大会申込完了】\n{notification.tournament_name}\n{notification.type}{sex_label}\n{notification.player1_name}"

    results = {}

    # 1. Webhookでチャンネル通知
    if DISCORD_WEBHOOK_URL:
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    DISCORD_WEBHOOK_URL, json={'content': content}, timeout=5.0
                )
                if response.status_code in [200, 204]:
                    print(f'✅ Webhook通知送信成功: {notification.tournament_name}')
                    results['webhook'] = 'success'
                else:
                    print(f'❌ Webhook送信失敗: {response.status_code}')
                    results['webhook'] = 'failed'
        except Exception as e:
            print(f'❌ Webhook送信エラー: {e}')
            results['webhook'] = 'error'

    # 2. 申込者へDM送信
    if notification.discord_id:
        dm_content = f"✅ 大会申込が完了しました\n\n**{notification.tournament_name}**\n種別: {notification.type}{sex_label}"
        if notification.player2_name:
            dm_content += f"\nペア: {notification.player2_name}"
        await send_dm(notification.discord_id, dm_content)
        results['dm'] = 'sent'

    return {'status': 'success', **results}


# --- プロフィール不備チェック ---

def _validate_phone(phone: str) -> bool:
    """電話番号の妥当性チェック"""
    digits = re.sub(r'\D', '', phone)
    if len(digits) < 10 or len(digits) > 11:
        return False
    if not digits.startswith('0'):
        return False
    # 全桁同一
    if len(set(digits)) == 1:
        return False
    # 連番チェック (0123456789...)
    seq = '0123456789012345678901'
    if digits in seq:
        return False
    return True


def _check_player_issues(player: dict, ward_id: int = 0) -> List[str]:
    """選手のプロフィール不備を検出。ward_id=99は東京都・広域大会"""
    issues = []
    address = (player.get('address') or '').strip() if isinstance(player.get('address'), str) else (str(player.get('address', '')) if player.get('address') else '')
    phone = (player.get('phone_number') or '').strip() if isinstance(player.get('phone_number'), str) else (str(player.get('phone_number', '')) if player.get('phone_number') else '')
    birth = player.get('birth_date')
    birth_str = str(birth) if birth else ''
    jsta = (player.get('jsta_number') or '').strip() if isinstance(player.get('jsta_number'), str) else ''

    is_wide = ward_id == 99  # 東京都・広域

    if is_wide:
        # 東京都・広域: 住所不要、日連登録番号が必須
        if not jsta:
            issues.append('日連登録番号が未登録です')
    else:
        # 区大会等: 住所が必須
        if not address:
            issues.append('住所が未入力です')
        elif not re.search(r'[\d０-９]', address):
            issues.append('住所に番地がありません')

    if not phone:
        issues.append('電話番号が未入力です')
    elif not _validate_phone(phone):
        issues.append('電話番号が不正です')

    if not birth_str:
        issues.append('生年月日が未入力です')

    return issues


@router.get("/notify/incomplete-profiles")
async def get_incomplete_profiles():
    """今後の大会の申込単位でプロフィール不備を検出"""
    from api.database import db

    try:
        today_str = date.today().isoformat()

        async with db.pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cursor:
                # 1. 今後開催の大会を取得
                await cursor.execute(
                    "SELECT tournament_id, tournament_name, registrated_ward FROM tournament_mst WHERE tournament_date >= %s",
                    (today_str,)
                )
                upcoming = await cursor.fetchall()
                if not upcoming:
                    return []

                tournament_map = {t['tournament_id']: t['tournament_name'] for t in upcoming}
                tournament_ward_map = {t['tournament_id']: t.get('registrated_ward', 0) for t in upcoming}
                tournament_ids = list(tournament_map.keys())

                # 2. 該当大会の申込を取得
                placeholders = ','.join(['%s'] * len(tournament_ids))
                await cursor.execute(
                    f"SELECT registration_id, discord_id, pair1, tournament_id FROM tournament_registration WHERE tournament_id IN ({placeholders})",
                    tournament_ids
                )
                registrations = await cursor.fetchall()
                if not registrations:
                    return []

                # 3. 関連する全player_idを収集
                discord_ids = list({r['discord_id'] for r in registrations if r.get('discord_id')})
                pair_ids = list({r['pair1'] for r in registrations if r.get('pair1')})

                # discord_id → player マッピング
                discord_player_map = {}
                if discord_ids:
                    d_placeholders = ','.join(['%s'] * len(discord_ids))
                    await cursor.execute(
                        f"SELECT player_id, player_name, discord_id, address, phone_number, birth_date, jsta_number FROM player_mst WHERE discord_id IN ({d_placeholders})",
                        discord_ids
                    )
                    for row in await cursor.fetchall():
                        discord_player_map[row['discord_id']] = row

                # player_id → player マッピング
                player_id_map = {}
                if pair_ids:
                    p_placeholders = ','.join(['%s'] * len(pair_ids))
                    await cursor.execute(
                        f"SELECT player_id, player_name, discord_id, address, phone_number, birth_date, jsta_number FROM player_mst WHERE player_id IN ({p_placeholders})",
                        pair_ids
                    )
                    for row in await cursor.fetchall():
                        player_id_map[row['player_id']] = row

                # 4. 申込単位で不備を検出
                results = []
                for reg in registrations:
                    t_name = tournament_map.get(reg['tournament_id'], '')
                    ward_id = tournament_ward_map.get(reg['tournament_id'], 0)
                    did = reg.get('discord_id')
                    applicant = discord_player_map.get(did) if did else None
                    pair = player_id_map.get(reg.get('pair1')) if reg.get('pair1') else None

                    applicant_issues = _check_player_issues(applicant, ward_id) if applicant else []
                    pair_issues = _check_player_issues(pair, ward_id) if pair else []

                    if not applicant_issues and not pair_issues:
                        continue

                    results.append({
                        'registration_id': reg['registration_id'],
                        'tournament_name': t_name,
                        'tournament_id': reg['tournament_id'],
                        'applicant_name': applicant.get('player_name', '') if applicant else did or '',
                        'applicant_discord_id': did,
                        'applicant_issues': applicant_issues,
                        'pair_name': pair.get('player_name', '') if pair else '',
                        'pair_issues': pair_issues,
                    })

                results.sort(key=lambda x: (x['tournament_name'], x['applicant_name']))
                return results

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class ProfileIncompleteNotifyRequest(BaseModel):
    registration_ids: List[int]
    send_channel: bool = False


@router.post("/notify/send-profile-incomplete")
async def send_profile_incomplete_notifications(request: ProfileIncompleteNotifyRequest):
    """申込単位でプロフィール不備の通知を申込者へ送信"""
    from api.database import db

    try:
        if not request.registration_ids:
            return {"success": True, "sent_count": 0, "results": []}

        async with db.pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cursor:
                placeholders = ','.join(['%s'] * len(request.registration_ids))
                await cursor.execute(
                    f"""SELECT r.registration_id, r.discord_id, r.pair1, r.tournament_id, t.tournament_name, t.registrated_ward
                        FROM tournament_registration r
                        JOIN tournament_mst t ON r.tournament_id = t.tournament_id
                        WHERE r.registration_id IN ({placeholders})""",
                    request.registration_ids
                )
                regs = await cursor.fetchall()

                # 関連する選手情報を取得
                all_discord_ids = list({r['discord_id'] for r in regs if r.get('discord_id')})
                all_pair_ids = list({r['pair1'] for r in regs if r.get('pair1')})

                discord_player_map = {}
                if all_discord_ids:
                    dp = ','.join(['%s'] * len(all_discord_ids))
                    await cursor.execute(f"SELECT player_id, player_name, discord_id, address, phone_number, birth_date, jsta_number FROM player_mst WHERE discord_id IN ({dp})", all_discord_ids)
                    for row in await cursor.fetchall():
                        discord_player_map[row['discord_id']] = row

                player_id_map = {}
                if all_pair_ids:
                    pp = ','.join(['%s'] * len(all_pair_ids))
                    await cursor.execute(f"SELECT player_id, player_name, discord_id, address, phone_number, birth_date, jsta_number FROM player_mst WHERE player_id IN ({pp})", all_pair_ids)
                    for row in await cursor.fetchall():
                        player_id_map[row['player_id']] = row

        results = []
        sent_count = 0

        for reg in regs:
            t_name = reg.get('tournament_name', '')
            did = reg.get('discord_id')
            applicant = discord_player_map.get(did) if did else None
            pair = player_id_map.get(reg.get('pair1')) if reg.get('pair1') else None

            ward_id = reg.get('registrated_ward', 0) or 0
            applicant_issues = _check_player_issues(applicant, ward_id) if applicant else []
            pair_issues = _check_player_issues(pair, ward_id) if pair else []

            if not applicant_issues and not pair_issues:
                continue

            applicant_name = applicant.get('player_name', '') if applicant else ''
            pair_name = pair.get('player_name', '') if pair else ''

            # DMメッセージ組み立て
            dm_lines = [f"⚠️ 大会申込に関する情報不備のお知らせ\n\n大会: {t_name}\n登録情報に不備があるため、エントリーできませんでした。以下をご確認ください。"]
            if applicant_issues and pair_issues:
                dm_lines.append(f"\n【{applicant_name}さん（あなた）】")
                dm_lines.extend(f'・{i}' for i in applicant_issues)
                dm_lines.append("→ マイページから修正してください。")
                dm_lines.append(f"\n【{pair_name}さん（ペア）】")
                dm_lines.extend(f'・{i}' for i in pair_issues)
                dm_lines.append(f"→ {pair_name}さんご本人に修正していただくか、管理者に問い合わせてください。")
            elif applicant_issues:
                dm_lines.extend(f'・{i}' for i in applicant_issues)
                dm_lines.append("\nマイページから修正してください。")
            elif pair_issues:
                dm_lines.append(f"\nペアの{pair_name}さんの情報に不備があります。")
                dm_lines.extend(f'・{i}' for i in pair_issues)
                dm_lines.append(f"\n{pair_name}さんご本人に修正していただくか、管理者に問い合わせてください。")
            dm_lines.append(f"\nhttps://tournament.jujo-softtennis.com/")
            dm_content = '\n'.join(dm_lines)

            result_entry = {
                'registration_id': reg['registration_id'],
                'tournament_name': t_name,
                'applicant_name': applicant_name,
                'dm': 'no_discord_id',
                'channel': 'not_requested',
            }

            # DM送信（申込者へ）
            if did:
                try:
                    await send_dm(did, dm_content)
                    result_entry['dm'] = 'sent'
                except Exception as e:
                    result_entry['dm'] = f'error: {e}'

            # チャンネル通知
            if request.send_channel and DISCORD_WEBHOOK_URL:
                all_issues = []
                if applicant_issues:
                    all_issues.append(f"{applicant_name}: {', '.join(applicant_issues)}")
                if pair_issues:
                    all_issues.append(f"{pair_name}(ペア): {', '.join(pair_issues)}")
                channel_content = f"【プロフィール不備通知】{t_name}\n申込者: {applicant_name}\n{chr(10).join(all_issues)}"
                try:
                    async with httpx.AsyncClient() as client:
                        resp = await client.post(DISCORD_WEBHOOK_URL, json={'content': channel_content}, timeout=5.0)
                        result_entry['channel'] = 'sent' if resp.status_code in [200, 204] else f'failed: {resp.status_code}'
                except Exception as e:
                    result_entry['channel'] = f'error: {e}'

            result_entry['status'] = 'sent'
            sent_count += 1
            results.append(result_entry)

        return {"success": True, "sent_count": sent_count, "results": results}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- 大会申込締切通知 ---

@router.post("/notify/deadline-closed")
async def notify_deadline_closed(target_date: Optional[str] = None):
    """締切日が指定日（デフォルト: 昨日）の大会の申込一覧をDiscordチャンネルに通知"""
    from api.database import db

    try:
        if target_date:
            target = target_date
        else:
            target = (date.today() - timedelta(days=1)).isoformat()

        async with db.pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cursor:
                # 締切日が対象日の大会を取得
                await cursor.execute(
                    "SELECT tournament_id, tournament_name, registrated_ward, classification FROM tournament_mst WHERE deadline_date = %s",
                    (target,)
                )
                tournaments = await cursor.fetchall()
                if not tournaments:
                    return {"success": True, "message": "締切日が昨日の大会はありません", "sent_count": 0}

                results = []
                for t in tournaments:
                    tid = t['tournament_id']
                    t_name = t['tournament_name']
                    ward_id = t.get('registrated_ward', 0)
                    is_team = t.get('classification') == 1

                    # 申込一覧を取得
                    await cursor.execute(
                        "SELECT discord_id, pair1, pair2, type, team_status FROM tournament_registration WHERE tournament_id = %s",
                        (tid,)
                    )
                    registrations = await cursor.fetchall()
                    if not registrations:
                        results.append({'tournament': t_name, 'status': 'no_registrations'})
                        continue

                    # 関連する全player_idを収集
                    all_discord_ids = list({r['discord_id'] for r in registrations if r.get('discord_id')})
                    pair_ids = set()
                    for r in registrations:
                        if r.get('pair1'):
                            pair_ids.add(r['pair1'])
                        if r.get('pair2'):
                            import json as json_mod
                            try:
                                p2 = json_mod.loads(r['pair2']) if isinstance(r['pair2'], str) else r['pair2']
                                if isinstance(p2, list):
                                    pair_ids.update(p2)
                            except:
                                pass

                    # player情報を取得（Excel生成のためbirth_date/sex等も含めて全カラム取得）
                    discord_player_map = {}
                    if all_discord_ids:
                        dp = ','.join(['%s'] * len(all_discord_ids))
                        await cursor.execute(f"SELECT * FROM player_mst WHERE discord_id IN ({dp})", all_discord_ids)
                        for row in await cursor.fetchall():
                            discord_player_map[row['discord_id']] = row

                    player_id_map = {}
                    all_pids = list(pair_ids)
                    if all_pids:
                        pp = ','.join(['%s'] * len(all_pids))
                        await cursor.execute(f"SELECT * FROM player_mst WHERE player_id IN ({pp})", all_pids)
                        for row in await cursor.fetchall():
                            player_id_map[row['player_id']] = row

                    # メッセージ組み立て
                    lines = [f"📋 **【申込締切】{t_name}**", f"申込一覧（{len(registrations)}組）:"]

                    for reg in registrations:
                        applicant = discord_player_map.get(reg.get('discord_id'))
                        applicant_name = applicant['player_name'] if applicant else (reg.get('discord_id') or '不明')

                        if is_team:
                            # 団体戦
                            members = []
                            members.append(applicant_name)
                            if reg.get('pair1'):
                                p1 = player_id_map.get(reg['pair1'])
                                if p1:
                                    members.append(p1['player_name'])
                            if reg.get('pair2'):
                                import json as json_mod
                                try:
                                    p2 = json_mod.loads(reg['pair2']) if isinstance(reg['pair2'], str) else reg['pair2']
                                    if isinstance(p2, list):
                                        for pid in p2:
                                            pm = player_id_map.get(pid)
                                            if pm:
                                                members.append(pm['player_name'])
                                except:
                                    pass
                            if reg.get('team_status') == 1:
                                lines.append(f"・{applicant_name}（参加希望）")
                            else:
                                lines.append(f"・チーム: {', '.join(members)}")
                        else:
                            # 個人戦
                            pair1 = player_id_map.get(reg.get('pair1'))
                            pair_name = pair1['player_name'] if pair1 else None
                            reg_type = reg.get('type', '')

                            if reg_type == 'シングルス' or not pair_name:
                                lines.append(f"・{applicant_name}（{reg_type}）")
                            else:
                                lines.append(f"・{applicant_name} / {pair_name}（{reg_type}）")

                    content = '\n'.join(lines)

                    # Excel申込書を生成（対応区のみ）
                    attached_files = []
                    try:
                        # 大会情報を再取得（typeをJSONとして読みたい等の都合）
                        await cursor.execute(
                            "SELECT * FROM tournament_mst WHERE tournament_id = %s",
                            (tid,)
                        )
                        tournament_row = await cursor.fetchone()
                        if tournament_row:
                            # typeはJSON文字列で保存されている → デシリアライズ
                            import json as json_mod
                            t_type = tournament_row.get('type')
                            if isinstance(t_type, str):
                                try:
                                    tournament_row['type'] = json_mod.loads(t_type)
                                except Exception:
                                    pass

                            # enriched_registrations を組み立て
                            enriched_regs = []
                            for reg in registrations:
                                applicant_row = discord_player_map.get(reg.get('discord_id'))
                                if not applicant_row:
                                    continue
                                applicant = dict(applicant_row)
                                partner = None
                                if reg.get('pair1'):
                                    p1 = player_id_map.get(reg['pair1'])
                                    if p1:
                                        partner = dict(p1)
                                # regのpair2はJSON文字列の可能性 → デシリアライズ
                                reg_dict = dict(reg)
                                rp2 = reg_dict.get('pair2')
                                if isinstance(rp2, str):
                                    try:
                                        reg_dict['pair2'] = json_mod.loads(rp2)
                                    except Exception:
                                        pass
                                enriched_regs.append({**reg_dict, 'applicant': applicant, 'partner': partner})

                            # ExcelServiceFactoryで対応区かチェック
                            try:
                                from services.excel_service_factory import ExcelServiceFactory
                                from pathlib import Path as _Path
                                from datetime import datetime as _dt

                                # 同一大会名の旧ファイルを削除（自動上書き）
                                output_dir = _Path(__file__).parent.parent.parent / 'output'
                                if output_dir.exists():
                                    for f in output_dir.glob('*.xlsx'):
                                        if t_name and t_name in f.name:
                                            try:
                                                f.unlink()
                                            except Exception:
                                                pass

                                excel_service = ExcelServiceFactory.create(ward_id)
                                file_paths_dict = excel_service.generate_tournament_files(tournament_row, enriched_regs)
                                attached_files = [_Path(p) for p in file_paths_dict.values() if _Path(p).exists()]
                            except ValueError:
                                # 未対応区はExcel添付なしで送信
                                pass
                            except Exception as ex:
                                print(f'⚠️ Excel生成失敗（テキストのみ送信）: {ex}')
                    except Exception as ex:
                        print(f'⚠️ Excel生成準備失敗: {ex}')

                    # 対応するWebhook URLを選択
                    webhook_url = WARD_WEBHOOK_MAP.get(ward_id, '') or DISCORD_WEBHOOK_URL

                    if webhook_url:
                        try:
                            async with httpx.AsyncClient() as client:
                                if attached_files:
                                    # multipart送信（添付ファイル付き）
                                    import json as json_mod
                                    multipart_files = []
                                    for i, p in enumerate(attached_files):
                                        with open(p, 'rb') as fh:
                                            multipart_files.append((
                                                f'files[{i}]',
                                                (p.name, fh.read(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
                                            ))
                                    data = {'payload_json': json_mod.dumps({'content': content})}
                                    resp = await client.post(webhook_url, files=multipart_files, data=data, timeout=20.0)
                                    # 添付付き送信が失敗したら、申込一覧テキストだけでも再送（通知欠落防止）
                                    if resp.status_code not in [200, 204]:
                                        try:
                                            fb = await client.post(webhook_url, json={'content': content}, timeout=10.0)
                                            if fb.status_code in [200, 204]:
                                                results.append({'tournament': t_name, 'status': 'sent_text_only_after_attach_fail'})
                                            else:
                                                results.append({'tournament': t_name, 'status': f'failed: attach={resp.status_code} text={fb.status_code}'})
                                        except Exception as fe:
                                            results.append({'tournament': t_name, 'status': f'error_fallback: {fe}'})
                                    else:
                                        results.append({'tournament': t_name, 'status': f'sent (添付{len(attached_files)}件)'})
                                else:
                                    resp = await client.post(webhook_url, json={'content': content}, timeout=10.0)
                                    if resp.status_code in [200, 204]:
                                        results.append({'tournament': t_name, 'status': 'sent'})
                                    else:
                                        results.append({'tournament': t_name, 'status': f'failed: {resp.status_code} body={resp.text[:200]}'})
                        except Exception as e:
                            results.append({'tournament': t_name, 'status': f'error: {e}'})
                    else:
                        results.append({'tournament': t_name, 'status': 'no_webhook'})

                return {"success": True, "sent_count": len([r for r in results if r['status'].startswith('sent')]), "results": results}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class TournamentNotifyRequest(BaseModel):
    tournament_id: str
    tournament_name: str
    tournament_date: str
    deadline_date: str
    classification: int
    type: List[str] = []
    venue: Optional[str] = None
    registrated_ward: Optional[int] = None


@router.post("/notify/tournament-registered")
async def notify_tournament_registered(req: TournamentNotifyRequest):
    """大会登録通知をDiscordに送信"""
    webhook_url = os.getenv('DISCORD_WEBHOOK_URL_TOURNAMENT_NOTIFY', '')
    if not webhook_url:
        return {'status': 'skipped', 'message': 'Webhook URL not configured'}

    try:
        from api.database import db

        # 主催区名を取得
        ward_name = ''
        if req.registrated_ward:
            ward_result = await db.execute_query('ward_mst', operation='select', filters={'ward_id': req.registrated_ward})
            if ward_result.get('data'):
                ward_name = ward_result['data'][0].get('ward_name', '')

        classification_label = '団体戦' if req.classification == 1 else '個人戦'
        types_str = '・'.join(req.type) if req.type else ''

        from datetime import datetime as dt
        weekdays = ['月', '火', '水', '木', '金', '土', '日']
        def fmt_date(d: str) -> str:
            try:
                p = dt.strptime(d.split('T')[0], '%Y-%m-%d')
                return f"{p.year}/{p.month:02d}/{p.day:02d}({weekdays[p.weekday()]})"
            except:
                return d

        content = f"@everyone\n📢 **大会が登録されました**\n\n"
        content += f"**{req.tournament_name}**\n"
        content += f"- 開催日: {fmt_date(req.tournament_date)}\n"
        content += f"- 締切日: {fmt_date(req.deadline_date)}\n"
        content += f"- 形式: {classification_label}"

        async with httpx.AsyncClient() as client:
            response = await client.post(webhook_url, json={'content': content, 'allowed_mentions': {'parse': ['everyone']}}, timeout=5.0)
            if response.status_code in [200, 204]:
                print(f'✅ 大会登録通知送信: {req.tournament_name}')
                # 通知済みフラグを更新
                await db.execute_query(
                    'tournament_mst', operation='update',
                    filters={'tournament_id': req.tournament_id},
                    data={'notified': 1}
                )
                return {'status': 'success'}
            else:
                print(f'❌ 大会登録通知失敗: {response.status_code}')
                raise HTTPException(status_code=500, detail='通知送信に失敗しました')
    except HTTPException:
        raise
    except Exception as e:
        print(f'❌ 大会登録通知エラー: {e}')
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/notify/deadline-reminder")
async def notify_deadline_reminder(target_date: Optional[str] = None):
    """申込締切の1週間前リマインドをDiscordに送信。
    締切が「今日の1週間後」(target_date指定時はその日)の大会が対象。毎日cronで実行する想定。"""
    from api.database import db

    webhook_url = os.getenv('DISCORD_WEBHOOK_URL_TOURNAMENT_NOTIFY', '') or DISCORD_WEBHOOK_URL
    if not webhook_url:
        return {'success': True, 'message': 'Webhook URL未設定', 'sent_count': 0}

    try:
        target = target_date or (date.today() + timedelta(days=7)).isoformat()

        result = await db.execute_query(
            'tournament_mst', operation='select',
            filters={'deadline_date': target}, json_fields=['type']
        )
        if result.get('error'):
            raise HTTPException(status_code=500, detail=result['error'])
        tournaments = result.get('data', []) or []
        if not tournaments:
            return {'success': True, 'message': f'締切が{target}の大会はありません', 'sent_count': 0}

        from datetime import datetime as dt
        weekdays = ['月', '火', '水', '木', '金', '土', '日']

        def fmt_date(d) -> str:
            try:
                s = str(d).split('T')[0].split(' ')[0]
                p = dt.strptime(s, '%Y-%m-%d')
                return f"{p.year}/{p.month:02d}/{p.day:02d}({weekdays[p.weekday()]})"
            except Exception:
                return str(d)

        results = []
        for t in tournaments:
            classification_label = '団体戦' if t.get('classification') == 1 else '個人戦'
            type_val = t.get('type')
            types_str = '・'.join(type_val) if isinstance(type_val, list) else (type_val or '')

            content = "@everyone\n⏰ **申込締切まであと1週間です**\n\n"
            content += f"**{t.get('tournament_name')}**\n"
            content += f"- 開催日: {fmt_date(t.get('tournament_date'))}\n"
            content += f"- 締切日: {fmt_date(t.get('deadline_date'))}（あと7日）\n"
            content += f"- 形式: {classification_label}"
            if types_str:
                content += f"\n- 種別: {types_str}"
            content += "\n\nまだ申込がお済みでない方はお早めにお願いします。"

            try:
                async with httpx.AsyncClient() as client:
                    resp = await client.post(
                        webhook_url,
                        json={'content': content, 'allowed_mentions': {'parse': ['everyone']}},
                        timeout=10.0,
                    )
                    if resp.status_code in (200, 204):
                        results.append({'tournament': t.get('tournament_name'), 'status': 'sent'})
                    else:
                        results.append({'tournament': t.get('tournament_name'), 'status': f'failed: {resp.status_code}'})
            except Exception as e:
                results.append({'tournament': t.get('tournament_name'), 'status': f'error: {e}'})

        return {
            'success': True,
            'sent_count': len([r for r in results if r['status'] == 'sent']),
            'results': results,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
