#!/bin/bash
# 練習前日リマインドcron用スクリプト
# 毎日19:00(JST)に実行して、翌日の練習の参加予定者をメンションしてDiscordのinfoチャンネルへ通知
#
# cron 登録（サーバのタイムゾーンがJSTの場合）:
#   0 19 * * * /bin/bash $HOME/api.jujo-softtennis.com/backend/scripts/notify_practice_reminder.sh
# サーバがUTCの場合は 19:00 JST = 10:00 UTC:
#   0 10 * * * /bin/bash $HOME/api.jujo-softtennis.com/backend/scripts/notify_practice_reminder.sh
# 対象日の判定はAPI側でJST固定なので、ずれるのは「実行時刻」だけ。`date` で確認してから登録すること
LOG=~/api.jujo-softtennis.com/notify_practice_reminder.log

# 無人運用なので、HTTPステータスと failed_count を見て失敗をログに残す
# （見ないと、1件も送れていなくてもログには「完了」しか残らない）
response=$(curl -s -S --max-time 120 -w '\n%{http_code}' \
  -X POST http://localhost:8000/api/practice/notify-tomorrow-participants 2>&1)
status=$(printf '%s' "$response" | tail -n 1)
body=$(printf '%s' "$response" | sed '$d')

echo "$body" >> "$LOG"
if [ "$status" != "200" ]; then
  echo "❌ $(date) リマインドAPI呼び出しに失敗しました (HTTP=$status)" >> "$LOG"
  exit 1
elif printf '%s' "$body" | grep -qE '"(failed|partial)_count": *[1-9]'; then
  echo "⚠️ $(date) 一部の練習でリマインドを送信できませんでした" >> "$LOG"
  exit 1
else
  echo "--- $(date) 完了 ---" >> "$LOG"
fi
