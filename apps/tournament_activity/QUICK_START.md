# Discord Activity クイックスタート

## 🚀 すぐに始める

### 前提条件

- ✅ Node.js（npm）がインストール済み
- ✅ Python 3.8+
- ✅ Supabaseプロジェクト作成済み
- ✅ Discord Developer Portal にアクセス可能

---

## ⚡ 3ステップで起動

### Step 1: 環境変数設定（5分）

#### バックエンド
```bash
cd /Users/hyodo/discord/jujo_discord_app/apps/tournament_activity/backend
cat > .env << EOF
DISCORD_CLIENT_ID=1427563635773018182
DISCORD_CLIENT_SECRET=（Developer Portalから取得）
SUPABASE_URL=https://tyjccdnccioagwfamtof.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
EOF
```

#### フロントエンド
```bash
cd /Users/hyodo/discord/jujo_discord_app/apps/tournament_activity/frontend
cat > .env.local << EOF
VITE_DISCORD_CLIENT_ID=1427563635773018182
VITE_API_URL=http://localhost:8000
EOF
```

---

### Step 2: アプリ起動（5分）

#### ターミナル1: バックエンド起動
```bash
cd /Users/hyodo/discord/jujo_discord_app/apps/tournament_activity/backend
source ../../../venv/bin/activate
pip install -r requirements.txt
python -m uvicorn api.main:app --reload --port 8000
```

**起動確認:**
```
✅ http://localhost:8000/health にアクセス
   → {"status": "healthy"} が表示される
```

#### ターミナル2: フロントエンド起動
```bash
cd /Users/hyodo/discord/jujo_discord_app/apps/tournament_activity/frontend
npm run dev
```

**起動確認:**
```
✅ http://localhost:3000 にアクセス
   → 「認証中...」と表示される（正常）
```

---

### Step 3: Discord Developer Portal設定（10分）

#### 3.1 Activities有効化

1. https://discord.com/developers/applications/1427563635773018182 を開く
2. 左メニュー「Activities」をクリック
3. 「Enable Activity」をクリック

#### 3.2 URL Mappingsを追加

```
Target: /
Prefix: /
URL: http://localhost:3000
```

「Add Mapping」をクリック

#### 3.3 OAuth2設定

1. 左メニュー「OAuth2」→「General」
2. 「Redirects」セクションで「Add Redirect」
3. 追加:
   ```
   http://localhost:3000/.proxy
   ```

---

## 🎮 Discordで起動

### 起動方法

1. **Discordアプリを開く**（ブラウザ版ではなくアプリ）
2. テストサーバーに参加
3. 任意のボイスチャンネルに参加、またはテキストチャンネルを開く
4. **画面下部または右上の「🚀 Activities」ボタンをクリック**
5. あなたのアプリ「testbot」が表示される
6. **クリックして起動！**

### 表示される画面

```
┌──────────────────────────────────┐
│ 🏆 スポーツ大会申込システム      │
│                                  │
│ [選手登録] [大会申込]            │
│                                  │
│ ━━━ 選手登録 ━━━                │
│                                  │
│ 姓: [____]  名: [____]          │
│ 性別: [男子 ▼]                  │
│ 生年月日: [📅 1990-01-15]       │
│ 連盟番号: [____]                 │
│ 郵便番号: [____] [🔍 住所検索]   │
│ 住所: [____]                     │
│ 電話番号: [____]                 │
│                                  │
│      [✅ 登録する]               │
└──────────────────────────────────┘
```

---

## ✅ 動作確認

### 選手登録をテスト

1. 「選手登録」タブを選択
2. 全項目を入力
3. 郵便番号を入力して「🔍 住所検索」をクリック
   → 住所が自動入力される
4. 「✅ 登録する」をクリック
5. 成功メッセージが表示される

### Supabaseで確認

1. Supabaseダッシュボードを開く
2. 「Table Editor」→「player_mst」
3. 新しい選手が登録されている ✅

---

## 🔧 トラブルシューティング

### Activitiesボタンが表示されない

- Developer Portalで「Enable Activity」したか確認
- Discordアプリを再起動

### 「認証中...」のまま進まない

- .env.localのDISCORD_CLIENT_IDが正しいか確認
- バックエンドが起動しているか確認
- ブラウザのコンソールでエラーを確認（F12）

### 住所検索が動かない

- 郵便番号を正しい形式で入力（123-4567）
- ネット接続を確認

---

## 📊 システム構成

```
Discord App
    ↓
Activities起動
    ↓
Frontend (React)
http://localhost:3000
    ↓ API呼び出し
Backend (FastAPI)
http://localhost:8000
    ↓ データ保存
Supabase
```

---

準備ができましたか？

Discord Developer Portalの設定が完了したら教えてください！

