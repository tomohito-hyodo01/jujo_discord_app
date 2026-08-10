#!/bin/bash
# 練習前日リマインドcron用スクリプト
# 毎日19:00(JST)に実行して、翌日の練習の参加予定者をメンションしてDiscordのinfoチャンネルへ通知
#
# cron 登録（サーバのタイムゾーンがJSTの場合）:
#   0 19 * * * /bin/bash $HOME/api.jujo-softtennis.com/backend/scripts/notify_practice_reminder.sh
# サーバがUTCの場合は 19:00 JST = 10:00 UTC:
#   0 10 * * * /bin/bash $HOME/api.jujo-softtennis.com/backend/scripts/notify_practice_reminder.sh
# 対象日の判定はAPI側でJST固定なので、ずれるのは「実行時刻」だけ。`date` で確認してから登録すること
curl -s -X POST http://localhost:8000/api/practice/notify-tomorrow-participants >> ~/api.jujo-softtennis.com/notify_practice_reminder.log 2>&1
echo "" >> ~/api.jujo-softtennis.com/notify_practice_reminder.log
echo "--- $(date) 完了 ---" >> ~/api.jujo-softtennis.com/notify_practice_reminder.log
