#!/bin/bash
# バックエンド生存チェック - uvicornが停止していたら自動起動
if ! pgrep -f "uvicorn api.main:app" > /dev/null; then
    cd ~/api.jujo-softtennis.com/backend
    set -a && source .env && set +a
    nohup ./venv/bin/python3 -m uvicorn api.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips="*" >> ~/api.jujo-softtennis.com/backend.log 2>&1 &
    echo "$(date) バックエンド再起動" >> ~/api.jujo-softtennis.com/keepalive.log
fi
