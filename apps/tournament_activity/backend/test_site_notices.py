#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
連盟サイトお知らせ新着通知（/api/notify/site-notices）の動作確認

DB・Discord・連盟サイトのいずれにも接続せず、HTML→Markdown変換・本文の切り詰め・
埋め込みの組み立て・応答の検証・発行SQL・初回シード・二重送信防止・失敗時の巻き戻しを検証する。

実行:
    cd apps/tournament_activity/backend
    python test_site_notices.py
"""

import asyncio
import os
import sys
import types
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

# Windowsの既定コンソール(cp932)でも絵文字を出せるようにする
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, 'reconfigure'):
        _stream.reconfigure(encoding='utf-8', errors='replace')

# 依存が入っていない環境（ローカルWindows等）でも動かせるよう、未導入のものだけ差し替える
for _name in ('aiomysql', 'httpx'):
    try:
        __import__(_name)
    except ImportError:  # pragma: no cover
        _stub = types.ModuleType(_name)
        _stub.DictCursor = object
        _stub.Pool = object
        _stub.AsyncClient = object
        sys.modules[_name] = _stub

import api.routers.site_notices as S  # noqa: E402

_failures = []


def check(label, actual, expected):
    if actual == expected:
        print(f"  ✅ {label}")
    else:
        _failures.append(f"{label}\n     actual  : {actual!r}\n     expected: {expected!r}")
        print(f"  ❌ {label}")


def _run(coro):
    return asyncio.run(coro)


# ===== HTML → Markdown =====
print("\n▼ HTML → Markdown 変換")
_text_html = (
    "タイトル行<br />&#8220;1行目<br />2行目<br /><br />段落2　全角字下げ<br /><br />"
    "●項目 <br />　　　　字下げ行&#8221;<br />"
)
_body, _imgs, _pdfs = S.html_to_markdown(_text_html)
check("<br><br> は空行として残る", "2行目\n\n段落2　全角字下げ" in _body, True)
check("全角スペースの字下げを残す", "\n　　　　字下げ行" in _body, True)
check("行末の半角スペースを落とす", "●項目\n" in _body, True)
check("HTMLエンティティを戻す", _body.startswith("タイトル行\n“1行目"), True)
check("文字だけの記事に画像・PDFは無い", (_imgs, _pdfs), ([], []))

_rich_html = (
    '<figure class="wp-block-image"><img src="https://example.com/up/2026/08/秋季 大会.jpg" width="1200"></figure>'
    '<p><a href="https://example.com/up/2026/08/R8秋季.pdf">R8秋季プログラム'
    '<img src="https://example.com/up/pdf200x200.png" width="24px"></a></p>'
    '<p><strong>太字</strong>と<em>強調</em>、<a href="https://example.com/x">リンク</a>、'
    '<a href="https://example.com/y">https://example.com/y</a></p>'
    '<h3>見出し</h3><ul><li>項目A</li><li>項目B</li></ul><hr />'
    '<p>末尾&nbsp;&amp;&nbsp;おわり</p>'
)
_body, _imgs, _pdfs = S.html_to_markdown(_rich_html)
check("画像URLは日本語をエンコードして返す", _imgs, ["https://example.com/up/2026/08/%E7%A7%8B%E5%AD%A3%20%E5%A4%A7%E4%BC%9A.jpg"])
check("PDFリンク内のアイコン画像は画像として拾わない", any("pdf200x200" in u for u in _imgs), False)
check("PDFは (名前, URL) で返す", _pdfs, [("R8秋季プログラム", "https://example.com/up/2026/08/R8%E7%A7%8B%E5%AD%A3.pdf")])
check("PDFは本文では表示文字だけ（リンクは添付欄に載せる）", (_body.startswith("R8秋季プログラム\n"), "R8%E7%A7%8B" in _body), (True, False))
check("画像タグは本文から消える", "<img" in _body or "figure" in _body, False)
check("太字・強調", "**太字**と*強調*" in _body, True)
check("リンクは Markdown リンク", "[リンク](https://example.com/x)" in _body, True)
check("表示文字がURLそのものならURLだけ", "https://example.com/y" in _body and "[https://example.com/y]" not in _body, True)
check("見出しは太字の独立行", "\n**見出し**\n" in _body, True)
check("リストは・", "・項目A\n・項目B" in _body, True)
check("区切り線", "──────────" in _body, True)
check("nbsp と &amp;", "末尾 & おわり" in _body, True)
check("タグが残らない", "<" in _body, False)
check("3行以上の空行は2行に詰める", "\n\n\n" in _body, False)

_b2, _i2, _p2 = S.html_to_markdown('<a href="https://example.com/big.jpg"><img src="https://example.com/thumb.jpg"></a><p>本文</p>')
check("画像へのリンク付き画像は本文に残さない", _b2, "本文")
check("画像へのリンク付き画像は画像として拾う", _i2, ["https://example.com/thumb.jpg"])

_b3, _i3, _ = S.html_to_markdown('<img src="https://example.com/a.jpg"><img src="https://example.com/a.jpg"><img src="https://example.com/b.png">')
check("同じ画像は1回だけ", _i3, ["https://example.com/a.jpg", "https://example.com/b.png"])

_pdf_only = S.html_to_markdown('<a href="https://example.com/up/要項.pdf"><img src="https://example.com/up/pdf200x200.png"></a>')
check("表示文字が無いPDFはファイル名を名前にする", _pdf_only[2], [("要項.pdf", "https://example.com/up/%E8%A6%81%E9%A0%85.pdf")])

# ===== タイトル行の省略 =====
print("\n▼ タイトル行の省略")
check("先頭行がタイトルと同じなら省く", S._drop_title_line("題名\n本文", "題名"), "本文")
check("前後の空白は無視して比較", S._drop_title_line(" 題名 \n\n本文", "題名"), "本文")
check("違えばそのまま", S._drop_title_line("別の行\n本文", "題名"), "別の行\n本文")
check("空文字でも壊れない", S._drop_title_line("", "題名"), "")

# ===== 本文の切り詰め =====
print("\n▼ 本文の切り詰め")
check("上限以内はそのまま", S._truncate("短い本文", 400), "短い本文")
_long = "\n".join(f"{i:02d}行目の本文テキストです" for i in range(60))   # 約780文字
_cut = S._truncate(_long, 400)
check("上限以内に収まる", len(_cut) <= 400, True)
check("省略記号で終わる", _cut.endswith("\n………"), True)
check("行の途中で切らない", _cut[: -len(S.TRUNCATE_SUFFIX)].endswith("行目の本文テキストです"), True)
check("案内文は付けない", "続き" in _cut, False)
_one_line = "あ" * 1000
_cut1 = S._truncate(_one_line, 400)
check("改行が無ければ文字数で切る", (len(_cut1) <= 400, _cut1.endswith("………")), (True, True))
check("ちょうど上限は切らない", S._truncate("x" * 400, 400), "x" * 400)
_early_break = "先頭行\n" + "い" * 1000
_cut2 = S._truncate(_early_break, 400)
check("直近の改行が手前すぎるときは文字数で切る", len(_cut2) > 100 and len(_cut2) <= 400, True)

os.environ['SITE_NOTICE_BODY_LIMIT'] = '250'
check("上限は環境変数で変えられる", S._body_limit(), 250)
os.environ['SITE_NOTICE_BODY_LIMIT'] = '99999'
check("Discordの上限(4096)は超えない", S._body_limit(), 4096)
os.environ['SITE_NOTICE_BODY_LIMIT'] = 'abc'
check("不正値は既定(400)", S._body_limit(), 400)
os.environ['SITE_NOTICE_BODY_LIMIT'] = '1'
check("小さすぎる値は下限に丸める", S._body_limit() >= len(S.TRUNCATE_SUFFIX) + 50, True)
os.environ.pop('SITE_NOTICE_BODY_LIMIT', None)
check("未設定は既定(400)", S._body_limit(), 400)

# ===== 日時整形 =====
print("\n▼ 日時整形")
check("公開日時", S._format_published("2026-09-04T16:59:13"), "2026/09/04(金) 16:59")
check("変換不能はそのまま", S._format_published("不明"), "不明")
check("Noneでも壊れない", S._format_published(None), "None")
for _i in range(7):
    _d = datetime(2026, 8, 10 + _i)  # 8/10=月曜
    check(f"曜日 {_d.date()}", S._format_published(_d.isoformat())[11], "月火水木金土日"[_d.weekday()])

# ===== 埋め込みの組み立て =====
print("\n▼ 埋め込みの組み立て")
_post_rich = {
    'id': 6659, 'date': '2026-08-21T14:51:58',
    'link': 'https://softtennis-tokyo.com/01_infomation/6659/',
    'title': {'rendered': '令和8年度 秋季クラブ対抗戦プログラム'},
    'content': {'rendered': _rich_html},
}
_embeds = S.build_embeds(_post_rich)
_e = _embeds[0]
check("先頭の見出し", _e['author'], {'name': '📢 新しいお知らせ', 'url': S.SITE_NOTICE_PAGE_URL})
check("タイトルは記事へのリンク", (_e['title'], _e['url']), ('令和8年度 秋季クラブ対抗戦プログラム', _post_rich['link']))
check("公開日時はフッター", _e['footer']['text'], 'softtennis-tokyo.com ・ 公開 2026/08/21(金) 14:51')
check("本文", _e['description'].startswith('R8秋季プログラム\n\n**太字**'), True)
check("添付ファイル欄", _e['fields'], [{'name': '📎 添付ファイル',
                                   'value': '・[R8秋季プログラム (PDF)](https://example.com/up/2026/08/R8%E7%A7%8B%E5%AD%A3.pdf)'}])
check("1枚目の画像", _e['image'], {'url': _imgs[0]})
check("画像1枚なら embed は1つ", len(_embeds), 1)
check("色", _e['color'], S.EMBED_COLOR)

_post_text = {
    'id': 6675, 'date': '2026-09-04T16:59:13',
    'link': 'https://softtennis-tokyo.com/01_infomation/6675/',
    'title': {'rendered': 'TOKYO縁ジョイシニア追加申込のご案内'},
    'content': {'rendered': 'TOKYO縁ジョイシニア追加申込のご案内<br />' + '本文行<br />' * 150},   # 約600文字
}
_et = S.build_embeds(_post_text)[0]
check("タイトルと同じ先頭行は本文から省く", _et['description'].startswith('本文行'), True)
check("既定の上限(400)で切って省略記号を付ける", (len(_et['description']) <= 400, _et['description'].endswith('………')), (True, True))
check("上限を指定できる", len(S.build_embeds(_post_text, body_limit=100)[0]['description']) <= 100, True)
check("文字だけの記事に添付欄・画像は無い", ('fields' in _et, 'image' in _et), (False, False))

_imgs_html = ''.join(f'<img src="https://example.com/{i}.jpg">' for i in range(6))
_em = S.build_embeds({**_post_rich, 'content': {'rendered': _imgs_html}})
check("画像は最大4枚（ギャラリー）", len(_em), 4)
check("ギャラリー用 embed は同じ url を持つ", all(e['url'] == _post_rich['link'] for e in _em), True)
check("2枚目以降は画像だけの embed", _em[1], {'url': _post_rich['link'], 'image': {'url': 'https://example.com/1.jpg'}})

_pdf_only_post = S.build_embeds({**_post_rich, 'content': {'rendered':
    '<figure><img src="https://example.com/a.jpg"></figure><p><a href="https://example.com/a.pdf">要項</a></p>'}})[0]
check("本文がPDF名だけなら本文欄を省く（添付欄と重複するため）", 'description' in _pdf_only_post, False)
check("その場合も添付欄と画像は付く", ('fields' in _pdf_only_post, 'image' in _pdf_only_post), (True, True))
_pdf_with_text = S.build_embeds({**_post_rich, 'content': {'rendered':
    '<p>下記をご確認ください</p><p><a href="https://example.com/a.pdf">要項</a></p>'}})[0]
check("説明文があれば本文欄を残す", _pdf_with_text['description'], '下記をご確認ください\n\n要項')

_many_pdf = ''.join(f'<p><a href="https://example.com/{i}.pdf">資料{i}</a></p>' for i in range(25))
_ep = S.build_embeds({**_post_rich, 'content': {'rendered': _many_pdf}})[0]
check("添付ファイルは最大20件", sum(f['value'].count('\n') + 1 for f in _ep['fields']), 20)
_long_pdf = ''.join(f'<a href="https://example.com/{"x" * 350}{i}.pdf">資料{i}</a>' for i in range(5))   # 1行約390文字 → 1欄2行
_el = S.build_embeds({**_post_rich, 'content': {'rendered': _long_pdf}})[0]
check("添付欄は1024文字を超えない", all(len(f['value']) <= 1024 for f in _el['fields']), True)
check("溢れた分は（続き）欄に分ける", [f['name'] for f in _el['fields']], ['📎 添付ファイル', '📎 添付ファイル（続き）', '📎 添付ファイル（続き）'])
check("分けても取りこぼさない", sum(f['value'].count('\n') + 1 for f in _el['fields']), 5)
_huge = S.build_embeds({**_post_rich, 'content': {'rendered': ''.join(
    f'<a href="https://example.com/{"x" * 350}{i}.pdf">資料{i}</a>' for i in range(12))}})[0]
check("添付欄は最大3欄", len(_huge['fields']), 3)
check("1行で1024文字を超えるPDFは載せない", 'fields' in S.build_embeds({**_post_rich, 'content': {'rendered':
    f'<a href="https://example.com/{"x" * 1100}.pdf">巨大</a>'}})[0], False)
_bracket = S.build_embeds({**_post_rich, 'content': {'rendered': '<a href="https://example.com/a.pdf">[重要]要項</a>'}})[0]
check("名前の角括弧はリンク記法を壊さない", _bracket['fields'][0]['value'], '・[［重要］要項 (PDF)](https://example.com/a.pdf)')

_e_long_title = S.build_embeds({**_post_rich, 'title': {'rendered': 'あ' * 300}})[0]
check("タイトルは256文字まで", len(_e_long_title['title']), 256)
check("タイトルのエンティティを戻す", S._post_title({'title': {'rendered': 'A &#8211; B'}}), 'A – B')
check("タイトル欠落は（無題）", S._post_title({}), '（無題）')
_e_nobody = S.build_embeds({**_post_rich, 'content': {'rendered': ''}})[0]
check("本文が無ければ description を付けない", 'description' in _e_nobody, False)

_payload = S.build_payload(_post_rich)
check("表示名とアイコン", (_payload['username'], _payload['avatar_url']), (S.SITE_NAME, S.SITE_ICON_URL))
check("メンションは一切発火させない", _payload['allowed_mentions'], {'parse': []})
check("content は付けない（埋め込みのみ）", 'content' in _payload, False)

# ===== 応答の検証 =====
print("\n▼ 連盟サイト応答の検証")
_ok_items = [
    {'id': 2, 'date': '2026-09-04T16:59:13', 'link': 'https://x/2/', 'title': {'rendered': 'b'}, 'content': {'rendered': ''}},
    {'id': 1, 'date': '2026-09-01T09:02:47', 'link': 'https://x/1/', 'title': {'rendered': 'a'}, 'content': {'rendered': ''}},
    {'id': 3, 'date': '2026-09-01T09:02:47', 'link': 'https://x/3/', 'title': {'rendered': 'c'}, 'content': {'rendered': ''}},
]
check("公開が古い順（同時刻はID順）に並べる", [p['id'] for p in S._validate_posts(_ok_items)], [1, 3, 2])


def _raises(fn):
    try:
        fn()
        return None
    except S.SiteFetchError as e:
        return str(e)


check("リスト以外はエラー", _raises(lambda: S._validate_posts({'code': 'rest_forbidden'})) is not None, True)
check("0件はエラー（サイト側の異常とみなす）", _raises(lambda: S._validate_posts([])) is not None, True)
check("IDが数値でなければエラー", _raises(lambda: S._validate_posts([{**_ok_items[0], 'id': '2'}])) is not None, True)
check("linkが無ければエラー", _raises(lambda: S._validate_posts([{**_ok_items[0], 'link': ''}])) is not None, True)
check("titleが辞書でなければエラー", _raises(lambda: S._validate_posts([{**_ok_items[0], 'title': 'x'}])) is not None, True)


class _FakeResponse:
    def __init__(self, status_code, json_data=None, text='', headers=None, json_error=False):
        self.status_code = status_code
        self._json = json_data
        self.text = text
        self.headers = headers or {}
        self._json_error = json_error

    def json(self):
        if self._json_error:
            raise ValueError('bad json')
        return self._json


class _FakeClient:
    def __init__(self, get_response=None, post_responses=None, get_error=None, post_error=None):
        self.get_response = get_response
        self.post_responses = list(post_responses or [])
        self.get_error = get_error
        self.post_error = post_error
        self.gets = []
        self.posts = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def get(self, url, headers=None, timeout=None):
        self.gets.append((url, headers))
        if self.get_error:
            raise self.get_error
        return self.get_response

    async def post(self, url, json=None, timeout=None):
        self.posts.append((url, json))
        if self.post_error:
            raise self.post_error
        return self.post_responses.pop(0)


_cl = _FakeClient(get_response=_FakeResponse(200, _ok_items))
check("取得は検証済みの一覧を返す", [p['id'] for p in _run(S.fetch_latest_posts(_cl))], [1, 3, 2])
check("取得元URL", _cl.gets[0][0], S.SITE_NOTICE_SOURCE_URL)
check("User-Agent を名乗る", _cl.gets[0][1], {'User-Agent': S.USER_AGENT})
check("HTTPエラーは SiteFetchError", _raises(lambda: _run(S.fetch_latest_posts(_FakeClient(get_response=_FakeResponse(503, text='down'))))) is not None, True)
check("JSONでない応答は SiteFetchError", _raises(lambda: _run(S.fetch_latest_posts(_FakeClient(get_response=_FakeResponse(200, json_error=True))))) is not None, True)
check("接続失敗は SiteFetchError", _raises(lambda: _run(S.fetch_latest_posts(_FakeClient(get_error=Exception('timeout'))))) is not None, True)

# ===== 発行SQL（DBの代わりに偽カーソルを使う） =====
print("\n▼ 発行SQL")


class _FakeCursor:
    def __init__(self, rows=None, row=None, rowcount=0, error=None):
        self.rows = rows or []
        self.row = row
        self.rowcount = rowcount
        self.error = error
        self.executed = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def execute(self, sql, params=None):
        self.executed.append((' '.join(sql.split()), params))
        if self.error:
            raise self.error

    async def fetchall(self):
        return self.rows

    async def fetchone(self):
        return self.row


class _FakeConn:
    def __init__(self, cursor):
        self._cursor = cursor

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    def cursor(self, *a, **kw):
        return self._cursor


class _FakePool:
    def __init__(self, cursor):
        self._cursor = cursor

    def acquire(self):
        return _FakeConn(self._cursor)


def _with_cursor(cursor, fn):
    orig = S.db
    S.db = types.SimpleNamespace(pool=_FakePool(cursor))
    try:
        return _run(fn())
    finally:
        S.db = orig


_stamp = datetime(2026, 9, 7, 10, 0, 0)

_cur = _FakeCursor(row={'n': 12})
check("記録件数", _with_cursor(_cur, lambda: S._count_recorded()), 12)
check("記録件数のSQL", _cur.executed[0][0], "SELECT COUNT(*) AS n FROM site_notice_posts")
_cur = _FakeCursor(error=Exception(1146, "Table 'x.site_notice_posts' doesn't exist"))
try:
    _with_cursor(_cur, lambda: S._count_recorded())
    check("テーブル未作成は送出する（送信を止めるため）", "例外なし", "例外")
except Exception as _e:
    check("テーブル未作成は送出する（送信を止めるため）", _e.args[0], 1146)

_cur = _FakeCursor(rows=[{'post_id': 1}, {'post_id': 3}])
check("記録済みIDの取得", _with_cursor(_cur, lambda: S._recorded_ids([1, 2, 3])), {1, 3})
check("記録済みIDのSQL", _cur.executed[0], ("SELECT post_id FROM site_notice_posts WHERE post_id IN (%s, %s, %s)", [1, 2, 3]))
check("ID指定なしはDBを見ない", _with_cursor(_FakeCursor(), lambda: S._recorded_ids([])), set())

_cur = _FakeCursor(rowcount=1)
check("記録できれば True", _with_cursor(_cur, lambda: S._record_post(_post_rich, _stamp)), True)
check("記録は INSERT IGNORE（並行実行でも二重送信しない）", _cur.executed[0][0],
      "INSERT IGNORE INTO site_notice_posts (post_id, title, link, published_at, notified_at) VALUES (%s, %s, %s, %s, %s)")
check("記録のパラメータ", _cur.executed[0][1],
      (6659, '令和8年度 秋季クラブ対抗戦プログラム', _post_rich['link'], datetime(2026, 8, 21, 14, 51, 58), _stamp))
_cur = _FakeCursor(rowcount=0)
check("既に記録があれば False", _with_cursor(_cur, lambda: S._record_post(_post_rich, _stamp)), False)
_cur = _FakeCursor(rowcount=1)
_with_cursor(_cur, lambda: S._record_post({**_post_rich, 'title': {'rendered': 'あ' * 300}, 'date': '不明'}, None))
check("タイトルは255文字に収める", len(_cur.executed[0][1][1]), 255)
check("公開日時が読めなければ現在時刻(JST)", isinstance(_cur.executed[0][1][3], datetime), True)
check("初回シードは notified_at=NULL", _cur.executed[0][1][4], None)

_cur = _FakeCursor(rowcount=1)
check("巻き戻し成功", _with_cursor(_cur, lambda: S._release_post(6659, _stamp)), True)
check("巻き戻しは自分が書いた行だけ", _cur.executed[0],
      ("DELETE FROM site_notice_posts WHERE post_id = %s AND notified_at = %s", (6659, _stamp)))
check("巻き戻しが空振りなら False", _with_cursor(_FakeCursor(rowcount=0), lambda: S._release_post(6659, _stamp)), False)
check("巻き戻しのDBエラーは握って False", _with_cursor(_FakeCursor(error=Exception(2013, "Lost connection")),
                                            lambda: S._release_post(6659, _stamp)), False)
check("記録日時は秒精度", S._now_jst().microsecond, 0)
check("記録日時はJST", S._now_jst().hour, datetime.now(S.JST).hour)

# ===== Discordへの送信 =====
print("\n▼ Discordへの送信")
_hook = 'https://discord.com/api/webhooks/1/abc'
_cl = _FakeClient(post_responses=[_FakeResponse(200)])
check("成功", _run(S._send_to_discord(_cl, _hook, {'x': 1})), (True, ''))
check("wait=true で結果を受け取る", _cl.posts[0][0], _hook + '?wait=true')
check("payload をそのまま送る", _cl.posts[0][1], {'x': 1})
_cl = _FakeClient(post_responses=[_FakeResponse(200)])
_run(S._send_to_discord(_cl, _hook + '?thread_id=9', {}))
check("既にクエリがあれば & で繋ぐ", _cl.posts[0][0], _hook + '?thread_id=9&wait=true')
_cl = _FakeClient(post_responses=[_FakeResponse(400, text='Invalid Form Body')])
_ok, _reason = _run(S._send_to_discord(_cl, _hook, {}))
check("4xx は失敗", (_ok, 'status=400' in _reason), (False, True))
_orig_sleep = S.asyncio.sleep
S.asyncio = types.SimpleNamespace(sleep=lambda s: _orig_sleep(0))
try:
    _cl = _FakeClient(post_responses=[_FakeResponse(429, headers={'Retry-After': '0.1'}), _FakeResponse(200)])
    check("429 は1度だけ待って再送", (_run(S._send_to_discord(_cl, _hook, {})), len(_cl.posts)), ((True, ''), 2))
    _cl = _FakeClient(post_responses=[_FakeResponse(429, headers={'Retry-After': '0.1'}), _FakeResponse(429)])
    check("再送も 429 なら失敗", _run(S._send_to_discord(_cl, _hook, {}))[0], False)
finally:
    S.asyncio = asyncio
check("例外は失敗として返す", _run(S._send_to_discord(_FakeClient(post_error=Exception('boom')), _hook, {}))[0], False)

# ===== エンドポイントの流れ =====
print("\n▼ エンドポイント（notify_site_notices）")


class _FakeStore:
    """DBとDiscordを差し替えた状態でエンドポイントを呼ぶ"""

    def __init__(self, recorded_ids, fetch_items=None, fetch_error=None, send_fail_ids=(), release_fail_ids=(),
                 record_error_ids=(), count_error=None):
        self.recorded = set(recorded_ids)
        self.fetch_items = fetch_items
        self.fetch_error = fetch_error
        self.send_fail_ids = set(send_fail_ids)
        self.release_fail_ids = set(release_fail_ids)
        self.record_error_ids = set(record_error_ids)
        self.count_error = count_error
        self.records = []      # (post_id, notified_at)
        self.releases = []
        self.sent = []         # payload
        self.sleeps = 0

    async def fetch(self, client):
        if self.fetch_error:
            raise S.SiteFetchError(self.fetch_error)
        return S._validate_posts(self.fetch_items)

    async def count(self):
        if self.count_error:
            raise self.count_error
        return len(self.recorded)

    async def recorded_ids(self, ids):
        return {i for i in ids if i in self.recorded}

    async def record(self, post, notified_at):
        if post['id'] in self.record_error_ids:
            raise Exception(2013, 'Lost connection')
        if post['id'] in self.recorded:
            return False
        self.recorded.add(post['id'])
        self.records.append((post['id'], notified_at))
        return True

    async def release(self, post_id, notified_at):
        self.releases.append((post_id, notified_at))
        if post_id in self.release_fail_ids:
            return False
        self.recorded.discard(post_id)
        return True

    async def send(self, client, webhook_url, payload):
        self.sent.append(payload)
        pid = int(payload['embeds'][0]['url'].rstrip('/').rsplit('/', 1)[-1])
        return (False, 'status=400') if pid in self.send_fail_ids else (True, '')


def _call_endpoint(store, webhook='https://discord.com/api/webhooks/1/abc', dry_run=False):
    saved = {k: getattr(S, k) for k in ('fetch_latest_posts', '_count_recorded', '_recorded_ids',
                                         '_record_post', '_release_post', '_send_to_discord', 'httpx', 'asyncio')}
    saved_env = os.environ.get('SITE_NOTICE_WEBHOOK_URL')
    if webhook is None:
        os.environ.pop('SITE_NOTICE_WEBHOOK_URL', None)
    else:
        os.environ['SITE_NOTICE_WEBHOOK_URL'] = webhook

    async def _sleep(sec):
        store.sleeps += 1

    S.fetch_latest_posts = store.fetch
    S._count_recorded = store.count
    S._recorded_ids = store.recorded_ids
    S._record_post = store.record
    S._release_post = store.release
    S._send_to_discord = store.send
    S.httpx = types.SimpleNamespace(AsyncClient=lambda: _FakeClient())
    S.asyncio = types.SimpleNamespace(sleep=_sleep)
    try:
        return _run(S.notify_site_notices(dry_run=dry_run))
    except S.HTTPException as e:
        return {'http_error': e.status_code, 'detail': e.detail}
    finally:
        for k, v in saved.items():
            setattr(S, k, v)
        if saved_env is None:
            os.environ.pop('SITE_NOTICE_WEBHOOK_URL', None)
        else:
            os.environ['SITE_NOTICE_WEBHOOK_URL'] = saved_env


def _items(*ids):
    return [{'id': i, 'date': f'2026-09-0{i}T10:00:00', 'link': f'https://softtennis-tokyo.com/01_infomation/{i}/',
             'title': {'rendered': f'お知らせ{i}'}, 'content': {'rendered': f'<p>本文{i}</p>'}} for i in ids]


_st = _FakeStore(recorded_ids=[], fetch_items=_items(3, 1, 2))
_res = _call_endpoint(_st)
check("初回はシードのみ（通知しない）", (_res['seeded'], _res['seeded_count'], _res['sent_count'], _st.sent), (True, 3, 0, []))
check("シードは notified_at=NULL で記録", _st.records, [(1, None), (2, None), (3, None)])

_st = _FakeStore(recorded_ids=[1], fetch_items=_items(3, 1, 2))
_res = _call_endpoint(_st)
check("未記録の投稿だけ送る", [r['post_id'] for r in _res['results']], [2, 3])
check("公開が古い順に送る", [p['embeds'][0]['title'] for p in _st.sent], ['お知らせ2', 'お知らせ3'])
check("件数", (_res['fetched'], _res['new_count'], _res['sent_count'], _res['failed_count']), (3, 2, 2, 0))
check("送る前に記録する（送信権の獲得）", [r[0] for r in _st.records], [2, 3])
check("記録日時は秒精度のJST", all(isinstance(r[1], datetime) and r[1].microsecond == 0 for r in _st.records), True)
check("2件目の前だけ間隔を空ける", _st.sleeps, 1)
check("送った内容は build_payload と同じ", _st.sent[0], S.build_payload(_items(2)[0]))
check("結果にタイトルを含める", _res['results'][0], {'post_id': 2, 'title': 'お知らせ2', 'status': 'sent'})

_st = _FakeStore(recorded_ids=[1, 2, 3], fetch_items=_items(3, 1, 2))
_res = _call_endpoint(_st)
check("新着なしは何もしない", (_res['new_count'], _res['sent_count'], _st.sent, _st.records), (0, 0, [], []))

_st = _FakeStore(recorded_ids=[1], fetch_items=_items(3, 1, 2), send_fail_ids=[2])
_res = _call_endpoint(_st)
check("送信失敗は記録を戻す（次回再送）", _st.releases[0][0], 2)
check("巻き戻しは自分の記録日時で行う", _st.releases[0][1], _st.records[0][1])
check("失敗しても他の投稿は送る", [r['status'] for r in _res['results']], ['failed', 'sent'])
check("失敗件数", _res['failed_count'], 1)
check("失敗理由", _res['results'][0]['reason'], 'status=400')

_st = _FakeStore(recorded_ids=[1], fetch_items=_items(2, 1), send_fail_ids=[2], release_fail_ids=[2])
_res = _call_endpoint(_st)
check("記録を戻せないときは理由に出す", '記録を戻せませんでした' in _res['results'][0]['reason'], True)

_st = _FakeStore(recorded_ids=[1], fetch_items=_items(3, 1, 2), record_error_ids=[2])
_res = _call_endpoint(_st)
check("記録のDBエラーは失敗にして次へ進む", [(r['post_id'], r['status']) for r in _res['results']], [(2, 'failed'), (3, 'sent')])
check("記録できなかった投稿は送らない", [p['embeds'][0]['title'] for p in _st.sent], ['お知らせ3'])

_st = _FakeStore(recorded_ids=[1], fetch_items=_items(2, 1))
_res = _call_endpoint(_st, webhook=None)
check("Webhook未設定は500（記録もしない）", (_res.get('http_error'), _st.records), (500, []))

_st = _FakeStore(recorded_ids=[1], fetch_error='timeout')
_res = _call_endpoint(_st)
check("サイト取得失敗は502（記録もしない）", (_res.get('http_error'), _st.records, _st.sent), (502, [], []))

_st = _FakeStore(recorded_ids=[1], fetch_items=_items(2, 1), count_error=Exception(1146, "Table doesn't exist"))
_res = _call_endpoint(_st)
check("テーブル未作成は500（送信しない）", (_res.get('http_error'), _st.sent), (500, []))

_st = _FakeStore(recorded_ids=[1], fetch_items=_items(3, 1, 2))
_res = _call_endpoint(_st, dry_run=True)
check("dry_run は新着一覧だけ返す", [n['post_id'] for n in _res['new']], [2, 3])
check("dry_run は記録も送信もしない", (_st.records, _st.sent), ([], []))
_st = _FakeStore(recorded_ids=[], fetch_items=_items(1))
_res = _call_endpoint(_st, dry_run=True)
check("dry_run で初回ならシード予定を返す", (_res['would_seed'], _st.records), (True, []))
_st = _FakeStore(recorded_ids=[1], fetch_items=_items(2, 1))
_res = _call_endpoint(_st, webhook=None, dry_run=True)
check("dry_run は Webhook 未設定でも動く", _res.get('new_count'), 1)

# ===== 設定 =====
print("\n▼ 設定")
check("取得元はお知らせカテゴリ(3)", 'categories=3' in S.SITE_NOTICE_SOURCE_URL, True)
check("取得は必要な項目だけ", '_fields=id,date,link,title,content' in S.SITE_NOTICE_SOURCE_URL, True)
check("JSTは+9時間固定", S.JST.utcoffset(None).total_seconds(), 9 * 3600)
check("画像は最大4枚", S.MAX_IMAGES, 4)
check("本文の既定上限は400文字", S.DEFAULT_BODY_LIMIT, 400)

print()
if _failures:
    print(f"❌ {len(_failures)}件失敗")
    for f in _failures:
        print(f"  - {f}")
    sys.exit(1)
print("✅ すべて成功")
