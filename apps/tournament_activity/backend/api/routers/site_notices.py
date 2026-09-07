#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
東京都ソフトテニス連盟サイト「お知らせ」新着通知ルーター

https://softtennis-tokyo.com/category/01_infomation/ に新しいお知らせが投稿されたら、
Discord（Webhook）へ埋め込みメッセージで通知する。
実行は X-Server の cron → scripts/notify_site_notices.sh 経由（月火木金の 8〜22 時台に毎時）。

新着の判定は WordPress の投稿IDで行い、通知済みのIDを site_notice_posts テーブルに記録する。
更新日時（modified）はサイト側の自動処理で動くことがあり信用できないため使わない。
"""

from fastapi import APIRouter, HTTPException
from typing import Optional
from datetime import datetime, timedelta, timezone
import asyncio
import html
import os
import re
import urllib.parse
import aiomysql
import httpx
from api.database import db

router = APIRouter()

# 取得元（WordPress REST API）。カテゴリID 3 = お知らせ。新しい順に返る。
# 1回の実行で拾える新着は per_page 件まで（実績は多くても1日に数件）
SITE_NOTICE_SOURCE_URL = os.getenv(
    'SITE_NOTICE_SOURCE_URL',
    'https://softtennis-tokyo.com/wp-json/wp/v2/posts'
    '?categories=3&per_page=20&_fields=id,date,link,title,content',
)
SITE_NOTICE_PAGE_URL = 'https://softtennis-tokyo.com/category/01_infomation/'
SITE_NAME = '東京都ソフトテニス連盟'
SITE_ICON_URL = ('https://softtennis-tokyo.com/tokyo1/wp-content/uploads/2020/01/'
                 'cropped-tokyo_softtennis_association_logo2-146x146-1-192x192.jpg')
USER_AGENT = 'jujo-softtennis-notice-bot/1.0 (+https://tournament.jujo-softtennis.com)'
EMBED_COLOR = 0x1E6FBF

# 本文の表示上限（文字）。超えた分は切って省略記号を付ける。環境変数 SITE_NOTICE_BODY_LIMIT で調整可
DEFAULT_BODY_LIMIT = 400
TRUNCATE_SUFFIX = '\n………'
DISCORD_DESCRIPTION_LIMIT = 4096
DISCORD_TITLE_LIMIT = 256
DISCORD_FIELD_VALUE_LIMIT = 1024
# 同じ url を持つ embed を並べると Discord 上で1つのギャラリーにまとまる（最大4枚）
MAX_IMAGES = 4
# 添付ファイル欄に載せるPDFの上限。1欄1024文字を超える分は「（続き）」欄に分ける
MAX_PDF_LINKS = 20
MAX_PDF_FIELDS = 3

_WEEKDAY_JP = ['月', '火', '水', '木', '金', '土', '日']
JST = timezone(timedelta(hours=9))

_IMG_SRC_RE = re.compile(r'<img\s[^>]*src="([^"]+\.(?:jpe?g|png|gif|webp))"', re.I)
_IMAGE_HREF_RE = re.compile(r'\.(?:jpe?g|png|gif|webp)(?:\?.*)?$', re.I)
_PDF_HREF_RE = re.compile(r'\.pdf(?:\?.*)?$', re.I)


class SiteFetchError(Exception):
    """連盟サイトからの取得・応答の検証に失敗"""


# ===== HTML → Discord Markdown =====

def _encode_url(url: str) -> str:
    """日本語ファイル名を含むURLをDiscordが扱える形（パスをパーセントエンコード）にする"""
    parts = urllib.parse.urlsplit(url)
    return urllib.parse.urlunsplit((
        parts.scheme, parts.netloc, urllib.parse.quote(parts.path, safe='/%'),
        parts.query, parts.fragment,
    ))


def _inner_text(fragment: str) -> str:
    """タグを除いた文字列（リンクの表示文字などに使う）"""
    return html.unescape(re.sub(r'<[^>]+>', '', fragment)).strip()


def _collect_images(content_html: str) -> list:
    """本文中の画像URL（PDFリンク内のアイコン画像は除く）を出現順・重複なしで返す"""
    without_pdf_links = re.sub(
        r'<a\s[^>]*href="[^"]+\.pdf(?:\?[^"]*)?"[^>]*>.*?</a>', '', content_html, flags=re.I | re.S)
    return list(dict.fromkeys(_encode_url(u) for u in _IMG_SRC_RE.findall(without_pdf_links)))


def html_to_markdown(content_html: str) -> tuple:
    """WordPress本文HTML → Discord Markdown。(本文, 画像URL一覧, PDF一覧[(名前, URL)]) を返す

    サイトの見た目に近づけるため、段落の空行と全角スペースの字下げは残す。
    画像は本文から除いて別途返し、埋め込みの image / ギャラリーで表示する。
    """
    images = _collect_images(content_html)
    pdfs = []

    def _link(m):
        href, inner = m.group(1), m.group(2)
        url = _encode_url(href)
        text = _inner_text(inner)
        if _IMAGE_HREF_RE.search(href) and re.search(r'<img\s', inner, re.I):
            # 画像へのリンク付き画像。画像側で表示するので本文からは消す
            return ''
        if _PDF_HREF_RE.search(href):
            # PDFへのリンクは添付ファイル欄に載せるので、本文では表示文字だけにする
            name = text or urllib.parse.unquote(href.rsplit('/', 1)[-1])
            pdfs.append((name, url))
            return name
        if not text or text == href:
            return url
        return f'[{text}]({url})'

    s = re.sub(r'<a\s[^>]*href="([^"]+)"[^>]*>(.*?)</a>', _link, content_html, flags=re.I | re.S)
    s = re.sub(r'<img\s[^>]*>', '', s, flags=re.I)
    s = re.sub(r'<(strong|b)>(.*?)</\1>', lambda m: f'**{_inner_text(m.group(2))}**', s, flags=re.I | re.S)
    s = re.sub(r'<(em|i)>(.*?)</\1>', lambda m: f'*{_inner_text(m.group(2))}*', s, flags=re.I | re.S)
    s = re.sub(r'<h[1-6][^>]*>(.*?)</h[1-6]>',
               lambda m: f'\n\n**{_inner_text(m.group(1))}**\n\n', s, flags=re.I | re.S)
    s = re.sub(r'<li[^>]*>(.*?)</li>', lambda m: f'・{_inner_text(m.group(1))}\n', s, flags=re.I | re.S)
    s = re.sub(r'<hr\s*/?>', '\n\n──────────\n\n', s, flags=re.I)
    s = re.sub(r'<br\s*/?>', '\n', s, flags=re.I)
    s = re.sub(r'</(p|div|figure|blockquote|ul|ol|table|tr)>', '\n\n', s, flags=re.I)
    s = re.sub(r'<[^>]+>', '', s)
    s = html.unescape(s).replace('\xa0', ' ')
    # 半角スペースの連続はブラウザ表示と同じく1つにする。全角スペース（字下げ）は残す
    lines = [re.sub(r'[ \t]+', ' ', line).rstrip() for line in s.split('\n')]
    s = re.sub(r'\n{3,}', '\n\n', '\n'.join(lines))
    return s.strip(), images, pdfs


def _drop_title_line(body: str, title: str) -> str:
    """本文の先頭行がタイトルと同じなら省く（埋め込みのタイトルと重複して見えるため）"""
    lines = body.split('\n')
    if lines and lines[0].strip() == title.strip():
        return '\n'.join(lines[1:]).strip()
    return body


def _body_limit() -> int:
    """本文の表示上限。環境変数で調整でき、Discordの上限(4096)を超えない"""
    try:
        limit = int(os.getenv('SITE_NOTICE_BODY_LIMIT', str(DEFAULT_BODY_LIMIT)))
    except ValueError:
        limit = DEFAULT_BODY_LIMIT
    return max(len(TRUNCATE_SUFFIX) + 50, min(limit, DISCORD_DESCRIPTION_LIMIT))


def _truncate(body: str, limit: int) -> str:
    """limit 文字を超える本文は上限手前の直近の改行で切り、省略記号（………）を付ける

    改行が上限の6割より手前にしか無い場合は文字数で切る。結果は必ず limit 文字以内。
    """
    if len(body) <= limit:
        return body
    room = limit - len(TRUNCATE_SUFFIX)
    cut = body.rfind('\n', int(room * 0.6), room)
    if cut == -1:
        cut = room
    return body[:cut].rstrip() + TRUNCATE_SUFFIX


def _format_published(date_str) -> str:
    """サイトの公開日時（JST・ISO形式）を '2026/09/04(金) 16:59' に整形"""
    try:
        d = datetime.fromisoformat(str(date_str))
    except (TypeError, ValueError):
        return str(date_str)
    return f'{d.year}/{d.month:02d}/{d.day:02d}({_WEEKDAY_JP[d.weekday()]}) {d.hour:02d}:{d.minute:02d}'


def _post_title(post: dict) -> str:
    title = (post.get('title') or {}).get('rendered') or ''
    return html.unescape(str(title)).strip() or '（無題）'


# ===== 埋め込みメッセージの組み立て =====

def _pdf_fields(pdfs: list) -> list:
    """添付ファイル欄を組み立てる。1欄1024文字の上限を超える分は「（続き）」欄に分ける"""
    fields, lines = [], []
    for name, url in pdfs[:MAX_PDF_LINKS]:
        safe_name = name.replace('[', '［').replace(']', '］')
        line = f'・[{safe_name} (PDF)]({url})'
        if len(line) > DISCORD_FIELD_VALUE_LIMIT:
            continue
        if lines and len('\n'.join(lines + [line])) > DISCORD_FIELD_VALUE_LIMIT:
            fields.append('\n'.join(lines))
            lines = []
            if len(fields) >= MAX_PDF_FIELDS:
                break
        lines.append(line)
    if lines and len(fields) < MAX_PDF_FIELDS:
        fields.append('\n'.join(lines))
    return [{'name': '📎 添付ファイル' if i == 0 else '📎 添付ファイル（続き）', 'value': value}
            for i, value in enumerate(fields)]


def build_embeds(post: dict, body_limit: Optional[int] = None) -> list:
    """投稿1件から Discord の embed 一覧を組み立てる（先頭が本体、2枚目以降の画像はギャラリー用）"""
    title = _post_title(post)
    body, images, pdfs = html_to_markdown((post.get('content') or {}).get('rendered') or '')
    body = _drop_title_line(body, title)
    link = post.get('link') or SITE_NOTICE_PAGE_URL

    embed = {
        'author': {'name': '📢 新しいお知らせ', 'url': SITE_NOTICE_PAGE_URL},
        'title': title[:DISCORD_TITLE_LIMIT],
        'url': link,
        'color': EMBED_COLOR,
        'footer': {'text': f'softtennis-tokyo.com ・ 公開 {_format_published(post.get("date"))}'},
    }
    if pdfs:
        # 本文がPDFの名前だけの記事（画像＋PDFの典型的な形）は、添付ファイル欄と重複するので本文欄を省く
        pdf_names = {name for name, _ in pdfs}
        if all(line.strip() in pdf_names for line in body.split('\n') if line.strip()):
            body = ''
    if body:
        embed['description'] = _truncate(body, body_limit or _body_limit())

    if pdfs:
        fields = _pdf_fields(pdfs)
        if fields:
            embed['fields'] = fields

    embeds = [embed]
    if images:
        embed['image'] = {'url': images[0]}
        for img in images[1:MAX_IMAGES]:
            embeds.append({'url': link, 'image': {'url': img}})
    return embeds


def build_payload(post: dict, body_limit: Optional[int] = None) -> dict:
    """Webhook に送る本文。メンションは一切発火させない"""
    return {
        'username': SITE_NAME,
        'avatar_url': SITE_ICON_URL,
        'embeds': build_embeds(post, body_limit),
        'allowed_mentions': {'parse': []},
    }


# ===== 連盟サイトからの取得 =====

def _validate_posts(data) -> list:
    """REST APIの応答を検証し、公開が古い順に並べて返す。形が違えば SiteFetchError"""
    if not isinstance(data, list):
        raise SiteFetchError('応答がリストではありません')
    if not data:
        raise SiteFetchError('投稿が0件でした（カテゴリ設定の変更やサイト側の障害の可能性）')
    posts = []
    for item in data:
        if (not isinstance(item, dict)
                or not isinstance(item.get('id'), int)
                or not isinstance(item.get('title'), dict)
                or not isinstance(item.get('date'), str)
                or not item.get('link')):
            raise SiteFetchError(f'投稿の形式が想定と違います: {str(item)[:200]}')
        posts.append(item)
    posts.sort(key=lambda p: (p['date'], p['id']))
    return posts


async def fetch_latest_posts(client: httpx.AsyncClient) -> list:
    """連盟サイトのお知らせ最新分を取得する"""
    try:
        res = await client.get(SITE_NOTICE_SOURCE_URL, headers={'User-Agent': USER_AGENT}, timeout=20.0)
    except Exception as e:
        raise SiteFetchError(f'サイトへの接続に失敗: {e}')
    if res.status_code != 200:
        raise SiteFetchError(f'サイトの応答が {res.status_code}: {res.text[:200]}')
    try:
        data = res.json()
    except ValueError as e:
        raise SiteFetchError(f'応答がJSONではありません: {e}')
    return _validate_posts(data)


# ===== 通知済みの記録（site_notice_posts） =====

def _now_jst() -> datetime:
    """記録に使う日時（JST・秒精度）。DATETIME列は秒精度のため、巻き戻し条件が丸め誤差で外れないようにする"""
    return datetime.now(JST).replace(tzinfo=None, microsecond=0)


def _published_at(post: dict) -> datetime:
    """サイトの公開日時（JST）を DATETIME に入れられる naive datetime にする"""
    try:
        return datetime.fromisoformat(str(post.get('date'))).replace(tzinfo=None)
    except (TypeError, ValueError):
        return _now_jst()


async def _count_recorded() -> int:
    """記録済みの投稿数。テーブル未作成などのDBエラーはそのまま送出する（呼び出し側で止める）"""
    async with db.pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            await cursor.execute('SELECT COUNT(*) AS n FROM site_notice_posts')
            row = await cursor.fetchone()
            return int(row['n']) if row else 0


async def _recorded_ids(post_ids: list) -> set:
    """指定した投稿IDのうち記録済みのもの"""
    if not post_ids:
        return set()
    placeholders = ', '.join(['%s'] * len(post_ids))
    async with db.pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            await cursor.execute(
                f'SELECT post_id FROM site_notice_posts WHERE post_id IN ({placeholders})', list(post_ids))
            rows = await cursor.fetchall()
            return {int(r['post_id']) for r in rows}


async def _record_post(post: dict, notified_at: Optional[datetime]) -> bool:
    """投稿を記録する（送信権の獲得）。既に記録があれば False

    INSERT IGNORE は主キー重複で何もしないので、並行実行しても同じ投稿を2回送らない。
    notified_at=None は初回シード（通知していない既知の投稿）。
    """
    async with db.pool.acquire() as conn:
        async with conn.cursor() as cursor:
            await cursor.execute(
                'INSERT IGNORE INTO site_notice_posts (post_id, title, link, published_at, notified_at) '
                'VALUES (%s, %s, %s, %s, %s)',
                (post['id'], _post_title(post)[:255], str(post['link'])[:500], _published_at(post), notified_at),
            )
            return cursor.rowcount > 0


async def _release_post(post_id: int, notified_at: datetime) -> bool:
    """送信に失敗した投稿の記録を消し、次回の実行で再送できるようにする（戻せたら True）

    自分が書いた notified_at と一致する行だけを消す。無条件に消すと、並行して走った
    別の実行が送信済みにした記録まで消して二重送信になる。
    """
    try:
        async with db.pool.acquire() as conn:
            async with conn.cursor() as cursor:
                await cursor.execute(
                    'DELETE FROM site_notice_posts WHERE post_id = %s AND notified_at = %s',
                    (post_id, notified_at),
                )
                return cursor.rowcount > 0
    except Exception as e:
        print(f'⚠️ 連盟サイトお知らせ通知: 記録の巻き戻しに失敗 post_id={post_id} {e}')
        return False


# ===== Discord への送信 =====

async def _send_to_discord(client: httpx.AsyncClient, webhook_url: str, payload: dict) -> tuple:
    """Webhook へ投稿し (成功したか, 失敗理由) を返す。レート制限(429)は1度だけ待って再送する"""
    sep = '&' if '?' in webhook_url else '?'
    url = f'{webhook_url}{sep}wait=true'
    try:
        res = await client.post(url, json=payload, timeout=15.0)
        if res.status_code == 429:
            try:
                wait = float(res.headers.get('Retry-After', '1'))
            except ValueError:
                wait = 1.0
            await asyncio.sleep(min(wait, 10.0))
            res = await client.post(url, json=payload, timeout=15.0)
        if res.status_code in (200, 204):
            return True, ''
        return False, f'status={res.status_code} body={res.text[:200]}'
    except Exception as e:
        return False, f'error: {e}'


# ===== エンドポイント =====

@router.post('/notify/site-notices')
async def notify_site_notices(dry_run: bool = False):
    """連盟サイトの新着お知らせを Discord へ通知する（cron から毎時実行）

    dry_run: DBにもDiscordにも書かず、何が新着扱いになるかだけを返す（導入時の確認用）
    """
    webhook_url = os.getenv('SITE_NOTICE_WEBHOOK_URL', '')
    if not webhook_url and not dry_run:
        raise HTTPException(status_code=500, detail='SITE_NOTICE_WEBHOOK_URL未設定')

    async with httpx.AsyncClient() as client:
        try:
            posts = await fetch_latest_posts(client)
        except SiteFetchError as e:
            print(f'❌ 連盟サイトのお知らせ取得に失敗: {e}')
            raise HTTPException(status_code=502, detail=f'サイト取得失敗: {e}')

        try:
            recorded = await _count_recorded()
        except Exception as e:
            # テーブル未作成など。判定できないまま送ると同じ記事を毎時送り続けるため止める
            print(f'❌ site_notice_posts を参照できません（create_site_notice_posts_table.sql は適用済みですか）: {e}')
            raise HTTPException(status_code=500, detail=f'DB参照失敗: {e}')

        if recorded == 0:
            # 初回: 現在の投稿を既知として登録するだけで通知しない（導入時に過去分が一気に流れるのを防ぐ）
            if dry_run:
                return {'success': True, 'dry_run': True, 'would_seed': True,
                        'fetched': len(posts), 'new_count': 0, 'new': []}
            seeded = 0
            for post in posts:
                try:
                    if await _record_post(post, None):
                        seeded += 1
                except Exception as e:
                    print(f'⚠️ 連盟サイトお知らせ通知: 初回シードの記録に失敗 post_id={post["id"]} {e}')
            print(f'ℹ️ 連盟サイトお知らせ通知: 初回シード {seeded}件（通知なし）')
            return {'success': True, 'seeded': True, 'seeded_count': seeded, 'fetched': len(posts),
                    'new_count': 0, 'sent_count': 0, 'failed_count': 0, 'results': []}

        if dry_run:
            known = await _recorded_ids([p['id'] for p in posts])
            new = [{'post_id': p['id'], 'title': _post_title(p), 'published_at': p['date']}
                   for p in posts if p['id'] not in known]
            return {'success': True, 'dry_run': True, 'would_seed': False,
                    'fetched': len(posts), 'new_count': len(new), 'new': new}

        stamp = _now_jst()
        results = []
        for post in posts:   # 公開が古い順。チャンネル上の並びを公開順に揃える
            post_id = post['id']
            try:
                if not await _record_post(post, stamp):
                    continue   # 通知済み（または並行実行が先に送信権を取った）
            except Exception as e:
                print(f'⚠️ 連盟サイトお知らせ通知: 記録に失敗 post_id={post_id} {e}')
                results.append({'post_id': post_id, 'status': 'failed', 'reason': f'db: {e}'})
                continue

            if results:
                # 2件目以降は間隔を空ける（Webhookのレート制限対策）
                await asyncio.sleep(1.0)
            ok, reason = await _send_to_discord(client, webhook_url, build_payload(post))
            title = _post_title(post)
            if ok:
                print(f'✅ 連盟サイトお知らせ通知: 送信 post_id={post_id} {title}')
                results.append({'post_id': post_id, 'title': title, 'status': 'sent'})
                continue

            print(f'⚠️ 連盟サイトお知らせ通知: 送信失敗 post_id={post_id} {reason}')
            if not await _release_post(post_id, stamp):
                # 戻せないと「未送信なのに記録済み」で二度と通知されないため、気づけるよう結果に出す
                reason += '（記録を戻せませんでした。次回も通知されません）'
            results.append({'post_id': post_id, 'title': title, 'status': 'failed', 'reason': reason})

    sent_count = sum(1 for r in results if r['status'] == 'sent')
    failed_count = sum(1 for r in results if r['status'] == 'failed')
    return {'success': True, 'seeded': False, 'fetched': len(posts), 'new_count': len(results),
            'sent_count': sent_count, 'failed_count': failed_count, 'results': results}
