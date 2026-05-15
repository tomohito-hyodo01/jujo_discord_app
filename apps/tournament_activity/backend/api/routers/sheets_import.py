#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Google Driveスプレッドシートからコート予約を取り込む
"""

from fastapi import APIRouter, HTTPException
from api.database import db
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
import openpyxl
import io
import re
import os
from datetime import date, datetime, timedelta

router = APIRouter()

SPREADSHEET_ID = '18A-lnmKDznhg59h9_V32gbwXQjRgTpRZ'
SA_KEY_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'google_sa_key.json')


def _download_spreadsheet():
    """Google DriveからExcelファイルをダウンロードして解析"""
    creds = service_account.Credentials.from_service_account_file(
        SA_KEY_PATH,
        scopes=['https://www.googleapis.com/auth/drive.readonly']
    )
    service = build('drive', 'v3', credentials=creds)

    request = service.files().get_media(fileId=SPREADSHEET_ID)
    fh = io.BytesIO()
    downloader = MediaIoBaseDownload(fh, request)
    done = False
    while not done:
        _, done = downloader.next_chunk()

    fh.seek(0)
    return openpyxl.load_workbook(fh)


def _parse_detail(detail_text: str, year: int = None):
    """detail列から日付・時間帯を解析
    例: '舎人公園 テニス（人工芝） 1面 \t5月2日(土曜) 2026年\t09時00分～11時00分'
    """
    if not detail_text:
        return []

    if year is None:
        year = date.today().year

    results = []
    # 複数行に分かれている場合
    for line in detail_text.split('\n'):
        line = line.strip()
        if not line:
            continue

        # 場所を抽出
        location_match = re.match(r'^(.+?)\s+テニス', line)
        location = location_match.group(1).strip() if location_match else ''

        # 日付を抽出: 5月2日 or ５月２日
        date_match = re.search(r'(\d{1,2})月(\d{1,2})日', line)
        if not date_match:
            continue
        month = int(date_match.group(1))
        day = int(date_match.group(2))

        # 年を抽出
        year_match = re.search(r'(\d{4})年', line)
        if year_match:
            year = int(year_match.group(1))

        # 時間帯を抽出: 09時00分～11時00分（末尾の「分」が欠けている場合にも対応）
        time_match = re.search(r'(\d{1,2})時(\d{2})分?[～〜~](\d{1,2})時(\d{2})分?', line)
        if not time_match:
            continue

        start_time = f"{int(time_match.group(1)):02d}:{time_match.group(2)}"
        end_time = f"{int(time_match.group(3)):02d}:{time_match.group(4)}"

        practice_date = f"{year}-{month:02d}-{day:02d}"

        results.append({
            'practice_date': practice_date,
            'location': location,
            'start_time': start_time,
            'end_time': end_time,
        })

    return results


def _extract_reservations(wb):
    """スプレッドシートから当選予約を抽出（今日以降のみ）"""
    reservations = []
    today_str = date.today().isoformat()
    ws = wb.worksheets[0]  # 最初のシート

    rows = list(ws.iter_rows(min_row=2, values_only=True))  # ヘッダースキップ

    for row in rows:
        if len(row) < 12:
            continue

        username = str(row[6] or '').strip()        # G列(idx6): 予約者名（漢字）
        username_kana = str(row[7] or '').strip() if row[7] else ''  # H列(idx7): 予約者名（カタカナ）
        # I列(idx8): 有効期限
        # J列(idx9): テニスフラグ
        detail_next = str(row[10] or '').strip() if row[10] else ''   # K列(idx10): 次月の当選結果
        detail_current = str(row[11] or '').strip() if row[11] else ''  # L列(idx11): 当月の当選結果

        # 表示名: カタカナ優先、なければ漢字
        display_name = username_kana if username_kana else username

        for detail in [detail_next, detail_current]:
            if not detail or detail == 'None':
                continue
            parsed = _parse_detail(detail)
            for p in parsed:
                # 今日以降のもののみ
                if p['practice_date'] < today_str:
                    continue
                p['reserver_name'] = display_name
                reservations.append(p)

    return reservations


@router.post("/practice/import-from-sheets")
async def import_from_sheets():
    """スプレッドシートからコート予約を取り込み、練習日程を自動作成・更新"""
    try:
        # 1. スプレッドシートを読み込み
        wb = _download_spreadsheet()
        reservations = _extract_reservations(wb)

        if not reservations:
            return {"success": True, "message": "取り込む予約データがありません", "created": 0, "updated": 0}

        # 2. 日付+場所でグルーピング（同日同場所の予約をまとめる）
        schedule_map = {}
        for r in reservations:
            key = (r['practice_date'], r['location'])
            if key not in schedule_map:
                schedule_map[key] = {
                    'practice_date': r['practice_date'],
                    'location': r['location'],
                    'reservations': [],
                    'earliest_start': r['start_time'],
                    'latest_end': r['end_time'],
                }
            entry = schedule_map[key]
            entry['reservations'].append({
                'start_time': r['start_time'],
                'end_time': r['end_time'],
                'reserver_name': r['reserver_name'],
            })
            if r['start_time'] < entry['earliest_start']:
                entry['earliest_start'] = r['start_time']
            if r['end_time'] > entry['latest_end']:
                entry['latest_end'] = r['end_time']

        created_count = 0
        updated_count = 0
        details = []

        for key, schedule in schedule_map.items():
            practice_date = schedule['practice_date']
            location = schedule['location']

            # 3. 既存の練習日程を検索
            existing = await db.execute_query(
                'practice_schedule', operation='select',
                filters={'practice_date': practice_date, 'location': location}
            )

            if existing.get('data'):
                # 既存あり → 予約情報のみ更新
                practice_id = existing['data'][0]['id']
                action = '更新'
                # 期限が未設定なら開催日の5日前 21:00 に設定
                if not existing['data'][0].get('deadline_date'):
                    p_date = datetime.strptime(practice_date, '%Y-%m-%d').date()
                    deadline_dt = datetime.combine(p_date - timedelta(days=5), datetime.min.time()).replace(hour=21)
                    deadline_str = deadline_dt.strftime('%Y-%m-%d %H:%M:%S')
                    await db.execute_query(
                        'practice_schedule', operation='update',
                        filters={'id': practice_id},
                        data={'deadline_date': deadline_str}
                    )
            else:
                # 新規作成: 申込期限は開催日の5日前 21:00
                p_date = datetime.strptime(practice_date, '%Y-%m-%d').date()
                deadline_dt = datetime.combine(p_date - timedelta(days=5), datetime.min.time()).replace(hour=21)
                deadline_str = deadline_dt.strftime('%Y-%m-%d %H:%M:%S')
                result = await db.execute_query(
                    'practice_schedule', operation='insert',
                    data={
                        'practice_date': practice_date,
                        'start_time': schedule['earliest_start'],
                        'end_time': schedule['latest_end'],
                        'location': location,
                        'deadline_date': deadline_str,
                    }
                )
                if result.get('error'):
                    details.append(f"❌ {practice_date} {location}: 作成失敗")
                    continue
                practice_id = result['data'][0].get('id') or result['data'][0].get('player_id')
                # insertの返り値からIDを取得
                if not practice_id:
                    sel = await db.execute_query(
                        'practice_schedule', operation='select',
                        filters={'practice_date': practice_date, 'location': location}
                    )
                    if sel.get('data'):
                        practice_id = sel['data'][0]['id']
                    else:
                        details.append(f"❌ {practice_date} {location}: ID取得失敗")
                        continue
                created_count += 1
                action = '新規'

            # 4. 既存のコート予約を削除してスプレッドシートの内容で置き換え
            await db.execute_query(
                'practice_court_reservations', operation='delete',
                filters={'practice_id': practice_id}
            )

            # 時間順にソートして登録
            sorted_reservations = sorted(schedule['reservations'], key=lambda r: (r['start_time'], r['end_time']))
            for res in sorted_reservations:
                await db.execute_query(
                    'practice_court_reservations', operation='insert',
                    data={
                        'practice_id': practice_id,
                        'start_time': res['start_time'],
                        'end_time': res['end_time'],
                        'reserver_name': res['reserver_name'],
                    }
                )
            updated_count += len(schedule['reservations'])
            details.append(f"✅ [{action}] {practice_date} {location}: {len(schedule['reservations'])}件の予約")

        return {
            "success": True,
            "message": f"練習日程 {created_count}件作成、予約 {updated_count}件登録",
            "created": created_count,
            "updated": updated_count,
            "details": details,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/practice/preview-sheets")
async def preview_sheets():
    """スプレッドシートの予約データをプレビュー（取り込み前確認用）"""
    try:
        wb = _download_spreadsheet()
        reservations = _extract_reservations(wb)

        # 日付+場所でグルーピング
        schedule_map = {}
        for r in reservations:
            key = (r['practice_date'], r['location'])
            if key not in schedule_map:
                schedule_map[key] = {
                    'practice_date': r['practice_date'],
                    'location': r['location'],
                    'reservations': [],
                }
            schedule_map[key]['reservations'].append({
                'start_time': r['start_time'],
                'end_time': r['end_time'],
                'reserver_name': r['reserver_name'],
            })

        result = []
        for key, schedule in sorted(schedule_map.items()):
            # 時間順にソート
            schedule['reservations'].sort(key=lambda r: (r['start_time'], r['end_time']))
            result.append(schedule)

        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
