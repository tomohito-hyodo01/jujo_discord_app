#!/bin/bash
# 練習予約通知cron用スクリプト
# 毎日9:00に実行して、2日後の練習予約をDiscordチャンネルに通知
curl -s -X POST http://localhost:8000/api/practice/notify-upcoming-reservations >> ~/api.jujo-softtennis.com/notify_practice.log 2>&1
echo "" >> ~/api.jujo-softtennis.com/notify_practice.log
echo "--- $(date) 完了 ---" >> ~/api.jujo-softtennis.com/notify_practice.log
