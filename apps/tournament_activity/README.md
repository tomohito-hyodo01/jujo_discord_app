# Discord Activity: スポーツ大会申込システム

Discord内に埋め込まれるWebアプリケーションで、1つのフォームで選手登録と大会申込が可能です。

## 🎯 特徴

- ✅ Discord内で完結（外部遷移なし）
- ✅ 1つのフォームで全項目入力
- ✅ カレンダーUIで生年月日選択
- ✅ 郵便番号から住所自動入力
- ✅ リアルタイムバリデーション
- ✅ モダンなUI

## 🏗️ プロジェクト構造

```
tournament_activity/
├── frontend/              # React + TypeScript + Vite
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── PlayerRegistrationForm.tsx
│   │   │   └── TournamentApplicationForm.tsx
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
│
└── backend/               # FastAPI
    ├── api/
    │   ├── main.py
    │   ├── database.py
    │   └── routers/
    │       ├── auth.py
    │       ├── players.py
    │       ├── tournaments.py
    │       └── registrations.py
    └── requirements.txt
```

## 📋 セットアップ手順

### Step 1: Discord Developer Portalでアプリ設定

1. https://discord.com/developers/applications にアクセス
2. 既存のアプリケーション（Bot）を選択
3. 左メニュー「Activities」をクリック
4. 「Enable Activity」をクリック
5. Activity URLを設定（後で更新）
6. OAuth2の設定
   - Redirect URIs を追加
   - Scopesに `activities.read`, `activities.write` を追加

### Step 2: バックエンド起動

```bash
cd apps/tournament_activity/backend

# 仮想環境（プロジェクトルートのvenvを使用）
source ../../../venv/bin/activate

# 依存パッケージインストール
pip install -r requirements.txt

# 環境変数設定
cp .env.example .env
# .envを編集してSupabase情報とDiscord情報を設定

# 起動
python -m uvicorn api.main:app --reload --port 8000
```

### Step 3: フロントエンド起動

```bash
cd apps/tournament_activity/frontend

# 依存パッケージインストール（既に実行済み）
# npm install

# 環境変数設定
cp .env.example .env.local
# VITE_DISCORD_CLIENT_IDを設定

# 開発サーバー起動
npm run dev
```

### Step 4: Discord Activityとして起動

1. Discord Developer Portalで「URL Mappings」を設定
   - Development URL: `http://localhost:3000`
2. Discordアプリでサーバーに参加
3. ボイスチャンネルまたはテキストチャンネルで「Activities」ボタンをクリック
4. あなたのアプリを選択
5. アプリがDiscord内で起動！

## 🚀 実装済み機能

### フロントエンド
- ✅ React + TypeScript
- ✅ Discord Embedded App SDK統合
- ✅ 選手登録フォーム（1ページ完結）
  - 姓・名
  - 性別（セレクトボックス）
  - 生年月日（カレンダー選択）
  - 日本連盟登録番号
  - 郵便番号
  - 住所（郵便番号APIで自動入力）
  - 電話番号
- ✅ 大会申込フォーム
  - 大会選択
  - 種別選択
  - ペア選択
- ✅ Discord風のダークテーマUI

### バックエンド
- ✅ FastAPI REST API
- ✅ Supabase連携
- ✅ OAuth2認証
- ✅ CORS設定
- ✅ エンドポイント
  - POST /api/token - 認証
  - GET/POST /api/players - 選手管理
  - GET /api/tournaments - 大会取得
  - POST /api/registrations - 申込登録

## 📝 次のステップ

### 1. Discord Developer Portalで設定

以下の情報が必要です：

```
Client ID: （Developer Portalから取得）
Client Secret: （Developer Portalから取得）
Redirect URI: http://localhost:3000/.proxy
```

### 2. 環境変数の設定

**backend/.env:**
```env
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
SUPABASE_URL=https://tyjccdnccioagwfamtof.supabase.co
SUPABASE_KEY=your_supabase_key
```

**frontend/.env.local:**
```env
VITE_DISCORD_CLIENT_ID=your_client_id
VITE_API_URL=http://localhost:8000
```

### 3. 起動してテスト

```bash
# ターミナル1: バックエンド
cd apps/tournament_activity/backend
source ../../../venv/bin/activate
python -m uvicorn api.main:app --reload --port 8000

# ターミナル2: フロントエンド
cd apps/tournament_activity/frontend
npm run dev
```

### 4. Discordでテスト

1. Discord Developer Portalで「URL Mappings」設定
2. Discordアプリでサーバーに参加
3. チャンネルで「Activities」を選択
4. あなたのアプリを起動

## 📖 ドキュメント

- [Discord Activities ドキュメント](https://discord.com/developers/docs/activities/overview)
- [Embedded App SDK](https://github.com/discord/embedded-app-sdk)
- [FastAPI ドキュメント](https://fastapi.tiangolo.com/)

---

実装が完了しました！
次はDiscord Developer Portalでの設定手順を説明します。

