#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Excel生成ルーター

大会申込Excelファイルの生成とGoogle Driveアップロード
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict
from api.database import db
from datetime import datetime, timedelta
import httpx
import os
import sys
from pathlib import Path

# servicesディレクトリをパスに追加
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from services.excel_service_factory import ExcelServiceFactory
from services.google_drive_service import GoogleDriveService

router = APIRouter()

# Discord Webhook URL（環境変数から取得）
DISCORD_WEBHOOK_URL = os.getenv('DISCORD_WEBHOOK_URL', '')


async def send_discord_notification(tournament_name: str, file_urls: Dict[str, str], registration_count: int):
    """
    Excel生成完了をDiscord Webhookで通知

    Args:
        tournament_name: 大会名
        file_urls: アップロードされたファイルのURL辞書
        registration_count: 申込件数
    """
    if not DISCORD_WEBHOOK_URL:
        print('Discord Webhook URLが設定されていません')
        return

    try:
        # メッセージを作成
        content = f"【大会申込Excel生成完了】\n"
        content += f"大会名: {tournament_name}\n"
        content += f"申込件数: {registration_count}件\n\n"

        if 'member_registration' in file_urls:
            content += f"会員登録表: {file_urls['member_registration']}\n"

        if 'individual_application' in file_urls:
            content += f"個人戦申込書: {file_urls['individual_application']}\n"

        # Discord Webhookに送信
        async with httpx.AsyncClient() as client:
            response = await client.post(
                DISCORD_WEBHOOK_URL,
                json={'content': content},
                timeout=5.0
            )

            if response.status_code in [200, 204]:
                print(f'✅ Discord通知送信成功: {tournament_name}')
            else:
                print(f'❌ Discord通知送信失敗: {response.status_code}')

    except Exception as e:
        print(f'❌ Discord通知送信エラー: {e}')
        # 通知失敗してもExcel生成自体は成功しているので例外を投げない


class ExcelGenerationRequest(BaseModel):
    tournament_id: str


class ExcelGenerationResponse(BaseModel):
    success: bool
    tournament_id: str
    tournament_name: str
    file_urls: Optional[Dict[str, str]] = None
    error: Optional[str] = None


@router.post("/excel/generate", response_model=ExcelGenerationResponse)
async def generate_excel(request: ExcelGenerationRequest):
    """
    大会申込Excelファイルを生成してGoogle Driveにアップロード

    Args:
        request: ExcelGenerationRequest
            - tournament_id: 大会ID

    Returns:
        ExcelGenerationResponse:
            - success: 成功フラグ
            - tournament_id: 大会ID
            - tournament_name: 大会名
            - file_urls: アップロードされたファイルのURL辞書
            - error: エラーメッセージ（失敗時）
    """
    try:
        # 1. 大会情報を取得
        tournament_result = db.client.table('tournament_mst')\
            .select('*')\
            .eq('tournament_id', request.tournament_id)\
            .execute()

        if not tournament_result.data:
            raise HTTPException(status_code=404, detail=f"Tournament not found: {request.tournament_id}")

        tournament = tournament_result.data[0]
        ward_id = tournament.get('registrated_ward')
        tournament_name = tournament.get('tournament_name')

        if not ward_id:
            raise HTTPException(status_code=400, detail="Tournament does not have registrated_ward")

        # 2. 申込データを取得
        registration_result = db.client.table('tournament_registration')\
            .select('*')\
            .eq('tournament_id', request.tournament_id)\
            .execute()

        if not registration_result.data:
            return ExcelGenerationResponse(
                success=False,
                tournament_id=request.tournament_id,
                tournament_name=tournament_name,
                error="No registrations found for this tournament"
            )

        registrations = registration_result.data

        # 3. 選手情報を取得して申込データに結合
        enriched_registrations = []

        for reg in registrations:
            # pair1の選手情報を取得
            player1_result = db.client.table('player_mst')\
                .select('*')\
                .eq('player_id', reg['pair1'])\
                .execute()

            if not player1_result.data:
                continue

            player1 = player1_result.data[0]

            # 申込情報と選手情報を統合
            enriched_reg = {
                **reg,
                'player_name': player1.get('player_name'),
                'birth_date': player1.get('birth_date'),
                'sex': player1.get('sex'),
                'post_number': player1.get('post_number'),
                'address': player1.get('address'),
                'phone_number': player1.get('phone_number'),
                'jsta_number': player1.get('jsta_number'),
                'edogawa_flg': player1.get('edogawa_flg', False),
                'affiliated_club': player1.get('affiliated_club', ''),
            }

            # pair2がある場合（ダブルス）
            if reg.get('pair2') and isinstance(reg['pair2'], list) and len(reg['pair2']) > 0:
                player2_id = reg['pair2'][0]
                player2_result = db.client.table('player_mst')\
                    .select('*')\
                    .eq('player_id', player2_id)\
                    .execute()

                if player2_result.data:
                    player2 = player2_result.data[0]
                    enriched_reg['player2_name'] = player2.get('player_name')
                    enriched_reg['player2_birth_date'] = player2.get('birth_date')
                    enriched_reg['player2_affiliated_club'] = player2.get('affiliated_club', '')

            enriched_registrations.append(enriched_reg)

        if not enriched_registrations:
            return ExcelGenerationResponse(
                success=False,
                tournament_id=request.tournament_id,
                tournament_name=tournament_name,
                error="No valid player data found for registrations"
            )

        # 4. Excelファイルを生成
        excel_service = ExcelServiceFactory.create(ward_id)
        file_paths = excel_service.generate_tournament_files(tournament, enriched_registrations)

        if not file_paths:
            return ExcelGenerationResponse(
                success=False,
                tournament_id=request.tournament_id,
                tournament_name=tournament_name,
                error="Failed to generate Excel files"
            )

        # 5. Google Driveにアップロード
        drive_service = GoogleDriveService()
        file_urls = drive_service.upload_tournament_files(
            ward_id=ward_id,
            tournament_name=tournament_name,
            file_paths=file_paths
        )

        # 6. Discord通知を送信
        await send_discord_notification(
            tournament_name=tournament_name,
            file_urls=file_urls,
            registration_count=len(enriched_registrations)
        )

        return ExcelGenerationResponse(
            success=True,
            tournament_id=request.tournament_id,
            tournament_name=tournament_name,
            file_urls=file_urls
        )

    except ValueError as e:
        # Ward not supported など
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/excel/test/{tournament_id}")
async def test_tournament_data(tournament_id: str):
    """
    大会の申込データを確認（デバッグ用）

    Args:
        tournament_id: 大会ID

    Returns:
        大会情報と申込データ
    """
    try:
        # 大会情報
        tournament_result = db.client.table('tournament_mst')\
            .select('*')\
            .eq('tournament_id', tournament_id)\
            .execute()

        if not tournament_result.data:
            raise HTTPException(status_code=404, detail="Tournament not found")

        tournament = tournament_result.data[0]

        # 申込データ
        registration_result = db.client.table('tournament_registration')\
            .select('*')\
            .eq('tournament_id', tournament_id)\
            .execute()

        registrations = registration_result.data

        # 選手情報を付与
        enriched_registrations = []
        for reg in registrations:
            player_result = db.client.table('player_mst')\
                .select('*')\
                .eq('player_id', reg['pair1'])\
                .execute()

            if player_result.data:
                enriched_reg = {**reg, 'player1_info': player_result.data[0]}
                enriched_registrations.append(enriched_reg)

        return {
            "tournament": tournament,
            "registrations_count": len(registrations),
            "registrations": enriched_registrations
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/excel/process-deadlines")
async def process_tournament_deadlines():
    """
    明日締切の大会のExcelファイルを自動生成（CRON用）

    Returns:
        処理結果の辞書
        {
            "processed_count": 処理した大会数,
            "results": [各大会の処理結果],
            "errors": [エラーが発生した大会]
        }
    """
    try:
        # 明日の日付を取得
        tomorrow = (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')

        # 明日締切の大会を検索
        tournaments_result = db.client.table('tournament_mst')\
            .select('*')\
            .eq('deadline', tomorrow)\
            .execute()

        tournaments = tournaments_result.data

        if not tournaments:
            return {
                "processed_count": 0,
                "results": [],
                "errors": [],
                "message": f"No tournaments with deadline on {tomorrow}"
            }

        results = []
        errors = []

        # 各大会のExcelを生成
        for tournament in tournaments:
            tournament_id = tournament['tournament_id']
            tournament_name = tournament['tournament_name']
            ward_id = tournament.get('registrated_ward')

            try:
                # 申込データを取得
                registration_result = db.client.table('tournament_registration')\
                    .select('*')\
                    .eq('tournament_id', tournament_id)\
                    .execute()

                if not registration_result.data:
                    results.append({
                        "tournament_id": tournament_id,
                        "tournament_name": tournament_name,
                        "status": "skipped",
                        "reason": "No registrations"
                    })
                    continue

                registrations = registration_result.data

                # 選手情報を取得して申込データに結合
                enriched_registrations = []
                for reg in registrations:
                    player1_result = db.client.table('player_mst')\
                        .select('*')\
                        .eq('player_id', reg['pair1'])\
                        .execute()

                    if not player1_result.data:
                        continue

                    player1 = player1_result.data[0]

                    enriched_reg = {
                        **reg,
                        'player_name': player1.get('player_name'),
                        'birth_date': player1.get('birth_date'),
                        'sex': player1.get('sex'),
                        'post_number': player1.get('post_number'),
                        'address': player1.get('address'),
                        'phone_number': player1.get('phone_number'),
                        'jsta_number': player1.get('jsta_number'),
                        'edogawa_flg': player1.get('edogawa_flg', False),
                        'affiliated_club': player1.get('affiliated_club', ''),
                    }

                    # pair2がある場合
                    if reg.get('pair2') and isinstance(reg['pair2'], list) and len(reg['pair2']) > 0:
                        player2_id = reg['pair2'][0]
                        player2_result = db.client.table('player_mst')\
                            .select('*')\
                            .eq('player_id', player2_id)\
                            .execute()

                        if player2_result.data:
                            player2 = player2_result.data[0]
                            enriched_reg['player2_name'] = player2.get('player_name')
                            enriched_reg['player2_birth_date'] = player2.get('birth_date')
                            enriched_reg['player2_affiliated_club'] = player2.get('affiliated_club', '')

                    enriched_registrations.append(enriched_reg)

                if not enriched_registrations:
                    results.append({
                        "tournament_id": tournament_id,
                        "tournament_name": tournament_name,
                        "status": "skipped",
                        "reason": "No valid player data"
                    })
                    continue

                # Excelファイルを生成
                excel_service = ExcelServiceFactory.create(ward_id)
                file_paths = excel_service.generate_tournament_files(tournament, enriched_registrations)

                # Google Driveにアップロード
                drive_service = GoogleDriveService()
                file_urls = drive_service.upload_tournament_files(
                    ward_id=ward_id,
                    tournament_name=tournament_name,
                    file_paths=file_paths
                )

                # Discord通知を送信
                await send_discord_notification(
                    tournament_name=tournament_name,
                    file_urls=file_urls,
                    registration_count=len(enriched_registrations)
                )

                results.append({
                    "tournament_id": tournament_id,
                    "tournament_name": tournament_name,
                    "status": "success",
                    "file_urls": file_urls
                })

            except Exception as e:
                errors.append({
                    "tournament_id": tournament_id,
                    "tournament_name": tournament_name,
                    "error": str(e)
                })

        return {
            "processed_count": len(tournaments),
            "success_count": len([r for r in results if r.get("status") == "success"]),
            "results": results,
            "errors": errors,
            "deadline_date": tomorrow
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process deadlines: {str(e)}")
