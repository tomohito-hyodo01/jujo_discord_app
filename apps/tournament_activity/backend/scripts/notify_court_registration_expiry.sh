#!/bin/bash
# コート予約システムの利用登録の有効期限お知らせ cron用スクリプト
# コート予約の表（I列の有効期限、M列の Discord ユーザーID）を読み、期限が近いアカウントを DM で知らせる。
#   本人へ: 有効期限の1か月前・2週間前・1週間前から期限日の当日までは毎日
#   管理者（兵頭さん）へ: 新しく1か月以内に入った人が出た日に、1か月以内の全員の一覧
# どの日に何を送るかの判定と二重送信の防止は API 側（DB）で行う。1日1回の実行でよい。
#
# cron 登録（サーバのタイムゾーンが JST の場合）:
#   0 9 * * * /bin/bash $HOME/api.jujo-softtennis.com/backend/scripts/notify_court_registration_expiry.sh
#
# 事前準備:
#   - コート予約の表の M 列に、本人の Discord ユーザーIDを文字列（書式なしテキスト）で入れる
#   - 送信記録のテーブル（court_registration_expiry_notices）は API が初回に自動で作る
#   - 管理者の宛先は既定で兵頭さん。変える場合は backend/.env に COURT_EXPIRY_ADMIN_DISCORD_ID を設定して再起動する
#   - 有効にする前に、送る予定の内容を確かめる（記録も送信もしない）:
#       curl -s -X POST 'http://localhost:8000/api/notify/court-registration-expiry?dry_run=true'
LOG=~/api.jujo-softtennis.com/notify_court_registration_expiry.log

# 無人運用なので、HTTPステータスと failed_count を見て失敗をログに残す
response=$(curl -s -S --max-time 300 -w '\n%{http_code}' \
  -X POST http://localhost:8000/api/notify/court-registration-expiry 2>&1)
status=$(printf '%s' "$response" | tail -n 1)
body=$(printf '%s' "$response" | sed '$d')

echo "$body" >> "$LOG"
if [ "$status" != "200" ]; then
  echo "❌ $(date) 有効期限お知らせAPIの呼び出しに失敗しました (HTTP=$status)" >> "$LOG"
  exit 1
elif printf '%s' "$body" | grep -qE '"failed_count": *[1-9]'; then
  echo "⚠️ $(date) 一部のお知らせを送信できませんでした" >> "$LOG"
  exit 1
else
  echo "--- $(date) 完了 ---" >> "$LOG"
fi
