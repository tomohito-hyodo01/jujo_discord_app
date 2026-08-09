#!/bin/bash
# Discord Bot 生存チェック - bot.py が停止していたら自動起動
#
# 2026-08-06 のサーバー再起動で bot が停止し、自動復旧の手段が無いまま
# 3日間停止し続けたため追加。backend 側の keepalive_backend.sh と同じ方式。
#
# cron 登録（5分ごと）:
#   */5 * * * * /bin/bash $HOME/api.jujo-softtennis.com/form_bot/scripts/keepalive_bot.sh

# cron の既定 PATH でも find/pgrep/date/nohup/flock を確実に引けるようにする
PATH=/usr/bin:/bin:$PATH

BOT_DIR="$HOME/api.jujo-softtennis.com/form_bot"
LOG="$HOME/api.jujo-softtennis.com/keepalive.log"
LOCKFILE="$HOME/api.jujo-softtennis.com/.bot.lock"
# 'venv/bin/python bot.py' にマッチする。'python cleanup_bot.py' のような
# 別の *bot.py を bot 稼働中と誤認しないよう、直前が / か空白の場合のみ一致させる
PATTERN="python.*[/ ]bot\.py"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"; }

# デプロイ（および他の keepalive 実行）と排他する。
# デプロイの「停止〜起動」の隙間に割り込むと bot が二重起動するため、
# 確認から起動完了までロックを保持したままにする。
# flock はプロセス終了時にカーネルが解放するので、強制終了してもロックが残らない。
exec 9>"$LOCKFILE" || exit 1
flock -n 9 || exit 0

pgrep -f "$PATTERN" > /dev/null && exit 0

# 一時的な停止（再起動途中など）での誤検知を避けるため、少し待って再確認
sleep 10
pgrep -f "$PATTERN" > /dev/null && exit 0

cd "$BOT_DIR" || { log "Discord Bot再起動: 失敗（$BOT_DIR に移動できません）"; exit 1; }
# 上書き（>）ではなく追記（>>）。クラッシュ時のログを残して原因調査できるようにする。
# 9>&- でロックのFDを子に継承させない（継承すると bot が動いている間ずっと
# ロックが保持され、次のデプロイがロック待ちで失敗する）
nohup venv/bin/python bot.py >> bot.log 2>&1 9>&- &

# 実際に起動できたかを確認して記録する。
# 無条件に「再起動」と書くと、起動失敗が続いていても復旧したように見えてしまう。
sleep 10
if pgrep -f "$PATTERN" > /dev/null; then
    log "Discord Bot再起動: 成功"
else
    log "Discord Bot再起動: 失敗（form_bot/bot.log を確認してください）"
    exit 1
fi
