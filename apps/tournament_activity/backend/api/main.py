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

from api.routers import players, tournaments, registrations, auth, session, available_tournaments, notification, oauth2

app = FastAPI(title="Tournament Activity API")

# CORS設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 本番環境では制限すること
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ルーター登録
app.include_router(auth.router, prefix="/api", tags=["auth"])
app.include_router(oauth2.router, prefix="/api", tags=["oauth2"])
app.include_router(session.router, prefix="/api", tags=["session"])
app.include_router(players.router, prefix="/api", tags=["players"])
app.include_router(tournaments.router, prefix="/api", tags=["tournaments"])
app.include_router(available_tournaments.router, prefix="/api", tags=["tournaments"])
app.include_router(registrations.router, prefix="/api", tags=["registrations"])
app.include_router(notification.router, prefix="/api", tags=["notification"])


@app.get("/")
async def root():
    return {"message": "Tournament Activity API", "status": "running"}


@app.get("/health")
async def health():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

