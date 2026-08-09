#!/bin/bash
# Discord Bot 生存チェック - bot.py が停止していたら自動起動
#
# 2026-08-06 のサーバー再起動で bot が停止し、自動復旧の手段が無いまま
# 3日間停止し続けたため追加。backend 側の keepalive_backend.sh と同じ方式。
#
# cron 登録（5分ごと）:
#   */5 * * * * /bin/bash $HOME/api.jujo-softtennis.com/form_bot/scripts/keepalive_bot.sh

BOT_DIR="$HOME/api.jujo-softtennis.com/form_bot"
LOG="$HOME/api.jujo-softtennis.com/keepalive.log"
DEPLOY_LOCK="$HOME/api.jujo-softtennis.com/.bot_deploying"
# 'venv/bin/python bot.py' にマッチ（keepalive_bot.sh 自身にはマッチしない）
PATTERN="python.*bot\.py"

# デプロイ中は触らない（停止→起動の隙間に割り込むと bot が二重起動するため）。
# 5分以上前のロックは異常終了の残骸とみなして無視する。
if [ -n "$(find "$DEPLOY_LOCK" -mmin -5 2>/dev/null)" ]; then
    exit 0
fi

pgrep -f "$PATTERN" > /dev/null && exit 0

# 一時的な停止（デプロイの再起動途中など）での誤検知を避けるため、少し待って再確認
sleep 10
pgrep -f "$PATTERN" > /dev/null && exit 0

cd "$BOT_DIR" || exit 1
# 追記（>）ではなく追加（>>）。クラッシュ時のログを残して原因調査できるようにする
nohup venv/bin/python bot.py >> bot.log 2>&1 &
echo "$(date '+%Y-%m-%d %H:%M:%S') Discord Bot再起動" >> "$LOG"
