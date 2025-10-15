# Fly.io デプロイガイド

## 🚀 デプロイの準備

### 必要なもの

- ✅ Fly.ioアカウント（無料）
- ✅ Fly CLI
- ✅ 動作確認済みのアプリケーション

---

## 📋 デプロイ手順

### Step 1: Fly CLIのインストール

```bash
# macOS
brew install flyctl

# またはスクリプトで
curl -L https://fly.io/install.sh | sh
```

### Step 2: Fly.ioにログイン

```bash
flyctl auth login
```

### Step 3: バックエンドのデプロイ

#### 3.1 Dockerfileを作成

```bash
cd /Users/hyodo/discord/jujo_discord_app/apps/tournament_activity/backend
```

`Dockerfile`:
```dockerfile
FROM python:3.13-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

#### 3.2 Fly.ioアプリ作成

```bash
flyctl launch
```

質問に答える：
- App name: `tournament-api-jujo` (または任意)
- Region: `Tokyo, Japan (nrt)`
- PostgreSQL: No
- Redis: No

#### 3.3 環境変数設定

```bash
flyctl secrets set SUPABASE_URL=https://tyjccdnccioagwfamtof.supabase.co
flyctl secrets set SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
flyctl secrets set DISCORD_CLIENT_ID=1427563635773018182
flyctl secrets set DISCORD_CLIENT_SECRET=your_secret
```

#### 3.4 デプロイ

```bash
flyctl deploy
```

完了後、URLが表示される：
```
https://tournament-api-jujo.fly.dev
```

---

### Step 4: フロントエンドのデプロイ

#### 4.1 Dockerfileを作成

```bash
cd /Users/hyodo/discord/jujo_discord_app/apps/tournament_activity/frontend
```

`Dockerfile`:
```dockerfile
FROM node:20-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .

ARG VITE_API_URL
ARG VITE_DISCORD_CLIENT_ID

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_DISCORD_CLIENT_ID=$VITE_DISCORD_CLIENT_ID

RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

#### 4.2 Fly.ioアプリ作成

```bash
flyctl launch
```

- App name: `tournament-form-jujo`
- Region: `Tokyo, Japan (nrt)`

#### 4.3 環境変数設定

```bash
flyctl secrets set VITE_API_URL=https://tournament-api-jujo.fly.dev
flyctl secrets set VITE_DISCORD_CLIENT_ID=1427563635773018182
```

#### 4.4 デプロイ

```bash
flyctl deploy
```

完了後：
```
https://tournament-form-jujo.fly.dev
```

---

### Step 5: Discord Botの設定更新

#### 5.1 .envファイル更新

```bash
cd /Users/hyodo/discord/jujo_discord_app/apps/form_bot
```

`.env`に追加：
```env
FORM_URL=https://tournament-form-jujo.fly.dev
```

#### 5.2 コードを修正

`cogs/web_form_setup.py`で本番URLを使用

---

### Step 6: 動作確認

1. Discordで `/apply` を実行
2. 本番URLのフォームが開く
3. 申込テスト
4. Discordに通知が届く

---

## 💰 コスト

Fly.io無料枠：
- RAM: 256MB × 3 = 768MB
- バックエンド: 256MB
- フロントエンド: 256MB
- 合計: 512MB（無料枠内！）

**月額: 0円**

---

デプロイを開始しますか？

