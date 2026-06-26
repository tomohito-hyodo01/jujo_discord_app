#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Tournament Activity Backend API

Discord Activitiesのバックエンド
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
import os
import json
from dotenv import load_dotenv

load_dotenv()

from api.routers import players, tournaments, registrations, auth, session, available_tournaments, notification, oauth2, excel_generation, practice, app_logs, referee_training, events, sheets_import, comments, audit, game_scores

app = FastAPI(title="Tournament Activity API")

# CORS設定
frontend_url = os.getenv('FRONTEND_URL', '*')
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url] if frontend_url != '*' else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 監査ログ: 全変更系API操作(POST/PUT/DELETE/PATCH)を自動記録
_AUDIT_METHODS = {"POST", "PUT", "DELETE", "PATCH"}


def _extract_actor(body_bytes: bytes, request: Request) -> str | None:
    """リクエストから実行者discord_idを推定（body優先、無ければquery）"""
    try:
        if body_bytes:
            data = json.loads(body_bytes)
            if isinstance(data, dict):
                did = data.get("discord_id") or data.get("created_by")
                if did:
                    return str(did)
    except Exception:
        pass
    qid = request.query_params.get("discord_id")
    return str(qid) if qid else None


@app.middleware("http")
async def audit_middleware(request: Request, call_next):
    path = request.url.path
    method = request.method
    is_target = method in _AUDIT_METHODS and path.startswith("/api")
    body_bytes = b""
    # JSONボディのみキャプチャ（multipart等の大容量アップロードは読まない）
    content_type = request.headers.get("content-type", "")
    capture_body = is_target and "application/json" in content_type
    if capture_body:
        try:
            body_bytes = await request.body()
            async def _receive():
                return {"type": "http.request", "body": body_bytes, "more_body": False}
            request._receive = _receive
        except Exception:
            body_bytes = b""

    response = await call_next(request)

    if is_target:
        try:
            from api.routers.audit import record_request
            actor = _extract_actor(body_bytes, request)
            body_str = None
            if body_bytes:
                try:
                    body_str = body_bytes.decode("utf-8", errors="replace")
                except Exception:
                    body_str = None
            full_path = path
            if request.url.query:
                full_path = f"{path}?{request.url.query}"
            await record_request(
                actor_discord_id=actor, method=method, path=full_path,
                status_code=response.status_code, request_body=body_str,
            )
        except Exception as e:
            print(f"⚠️ 監査ミドルウェア記録失敗: {e}")

    return response

# データベース初期化
@app.on_event("startup")
async def startup_event():
    """起動時にデータベース接続を初期化"""
    from api.database import db
    await db.initialize()
    print("✅ データベース接続を初期化しました")

    # OAuth2設定の確認（デバッグ用）
    oauth_redirect = os.getenv('OAUTH_REDIRECT_URI', 'NOT_SET')
    discord_client_id = os.getenv('DISCORD_CLIENT_ID', 'NOT_SET')
    print(f"🔐 OAuth2設定: OAUTH_REDIRECT_URI={oauth_redirect}")
    print(f"🔐 OAuth2設定: DISCORD_CLIENT_ID={discord_client_id}")

@app.on_event("shutdown")
async def shutdown_event():
    """終了時にデータベース接続をクローズ"""
    from api.database import db
    await db.close()
    print("✅ データベース接続をクローズしました")

# ルーター登録
app.include_router(auth.router, prefix="/api", tags=["auth"])
app.include_router(oauth2.router, prefix="/api", tags=["oauth2"])
app.include_router(session.router, prefix="/api", tags=["session"])
app.include_router(players.router, prefix="/api", tags=["players"])
app.include_router(tournaments.router, prefix="/api", tags=["tournaments"])
app.include_router(available_tournaments.router, prefix="/api", tags=["tournaments"])
app.include_router(registrations.router, prefix="/api", tags=["registrations"])
app.include_router(notification.router, prefix="/api", tags=["notification"])
app.include_router(excel_generation.router, prefix="/api", tags=["excel"])
app.include_router(practice.router, prefix="/api", tags=["practice"])
app.include_router(app_logs.router, prefix="/api", tags=["logs"])
app.include_router(referee_training.router, prefix="/api", tags=["referee_training"])
app.include_router(events.router, prefix="/api", tags=["events"])
app.include_router(sheets_import.router, prefix="/api", tags=["sheets_import"])
app.include_router(comments.router, prefix="/api", tags=["comments"])
app.include_router(audit.router, prefix="/api", tags=["audit"])
app.include_router(game_scores.router, prefix="/api", tags=["game_scores"])


@app.get("/")
async def root():
    return {"message": "Tournament Activity API", "status": "running"}


@app.get("/health")
async def health():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

