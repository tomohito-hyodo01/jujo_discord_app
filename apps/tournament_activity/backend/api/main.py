#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Tournament Activity Backend API

Discord Activitiesのバックエンド
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from dotenv import load_dotenv

load_dotenv()

from api.routers import players, tournaments, registrations, auth, session, available_tournaments, notification, oauth2, excel_generation

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


@app.get("/")
async def root():
    return {"message": "Tournament Activity API", "status": "running"}


@app.get("/health")
async def health():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

