#!/bin/bash
# 大会申込締切通知cron用スクリプト
# 毎日9:10に実行して、昨日が締切日の大会の申込一覧をDiscordチャンネルに通知
curl -s -X POST http://localhost:8000/api/notify/deadline-closed >> ~/api.jujo-softtennis.com/notify_deadline.log 2>&1
echo "" >> ~/api.jujo-softtennis.com/notify_deadline.log
echo "--- $(date) 完了 ---" >> ~/api.jujo-softtennis.com/notify_deadline.log
