#!/bin/bash
# 東京都ソフトテニス連盟サイト「お知らせ」新着通知 cron用スクリプト
# 連盟サイト（https://softtennis-tokyo.com/category/01_infomation/）に新しいお知らせが
# 投稿されていたら Discord へ通知する。新着の判定と二重送信の防止は API 側（DB）で行う。
#
# 投稿は月・火・木・金の日中に集中しているため（過去10年の実績）、その曜日の 8〜22 時台に毎時実行する。
# 水・土・日の投稿は次の実行日にまとめて通知される（取りこぼしはしない）。
#
# cron 登録（サーバのタイムゾーンが JST の場合）:
#   0 8-22 * * 1,2,4,5 /bin/bash $HOME/api.jujo-softtennis.com/backend/scripts/notify_site_notices.sh
#
# 事前準備:
#   - create_site_notice_posts_table.sql を DB に適用する
#   - .env.xserver と .env に SITE_NOTICE_WEBHOOK_URL を設定して backend を再起動する
#   - 初回の実行は現在の投稿を登録するだけで通知しない（応答に "seeded": true が出る）
LOG=~/api.jujo-softtennis.com/notify_site_notices.log

# 無人運用なので、HTTPステータスと failed_count を見て失敗をログに残す
response=$(curl -s -S --max-time 120 -w '\n%{http_code}' \
  -X POST http://localhost:8000/api/notify/site-notices 2>&1)
status=$(printf '%s' "$response" | tail -n 1)
body=$(printf '%s' "$response" | sed '$d')

echo "$body" >> "$LOG"
if [ "$status" != "200" ]; then
  echo "❌ $(date) お知らせ通知APIの呼び出しに失敗しました (HTTP=$status)" >> "$LOG"
  exit 1
elif printf '%s' "$body" | grep -qE '"failed_count": *[1-9]'; then
  echo "⚠️ $(date) 一部のお知らせを送信できませんでした" >> "$LOG"
  exit 1
else
  echo "--- $(date) 完了 ---" >> "$LOG"
fi
