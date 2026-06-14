#!/bin/bash
# 大会申込締切リマインドcron用スクリプト
# 毎日9:15に実行して、締切が1週間後の大会に @everyone リマインドをDiscordへ通知
curl -s -X POST http://localhost:8000/api/notify/deadline-reminder >> ~/api.jujo-softtennis.com/notify_deadline_reminder.log 2>&1
echo "" >> ~/api.jujo-softtennis.com/notify_deadline_reminder.log
echo "--- $(date) 完了 ---" >> ~/api.jujo-softtennis.com/notify_deadline_reminder.log
