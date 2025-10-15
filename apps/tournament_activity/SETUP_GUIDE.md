# Discord Activity セットアップガイド

## 📋 事前準備

Discord Activitiesを使用するには、Discord Developer Portalでの設定が必要です。

---

## ステップ1: Discord Developer Portalでの設定

### 1.1 アプリケーションを開く

1. https://discord.com/developers/applications にアクセス
2. 既存のアプリケーション（Bot: testbot）を選択

### 1.2 Activities機能を有効化

1. 左メニュー「Activities」をクリック
2. 「Enable Activity」ボタンをクリック
3. 利用規約に同意

### 1.3 URL Mappingsを設定

**Development（開発用）:**
```
Target: /
Prefix: /
URL: http://localhost:3000
```

**Production（本番用）:**
```
Target: /
Prefix: /
URL: https://your-app.fly.dev
```

### 1.4 OAuth2設定

1. 左メニュー「OAuth2」をクリック
2. 「Redirects」セクションで「Add Redirect」
3. 以下を追加:
   ```
   http://localhost:3000/.proxy
   https://your-app.fly.dev/.proxy
   ```

4. 「Scopes」セクションで以下を選択:
   - `identify`
   - `guilds`
   - `activities.read`
   - `activities.write`

### 1.5 Client IDとSecretを取得

1. 「General Information」に戻る
2. **Application ID** をコピー → これがClient ID
3. 「OAuth2」→「Client Secret」で「Reset Secret」
4. **Client Secret** をコピー（一度しか表示されないので注意！）

---

## ステップ2: 環境変数の設定

### 2.1 バックエンドの.env

```bash
cd /Users/hyodo/discord/jujo_discord_app/apps/tournament_activity/backend
```

`.env`ファイルを作成：
```env
DISCORD_CLIENT_ID=your_application_id_here
DISCORD_CLIENT_SECRET=your_client_secret_here
SUPABASE_URL=https://tyjccdnccioagwfamtof.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 2.2 フロントエンドの.env.local

```bash
cd /Users/hyodo/discord/jujo_discord_app/apps/tournament_activity/frontend
```

`.env.local`ファイルを作成：
```env
VITE_DISCORD_CLIENT_ID=your_application_id_here
VITE_API_URL=http://localhost:8000
```

---

## ステップ3: アプリケーション起動

### 3.1 バックエンド起動（ターミナル1）

```bash
cd /Users/hyodo/discord/jujo_discord_app/apps/tournament_activity/backend
source ../../../venv/bin/activate
pip install -r requirements.txt
python -m uvicorn api.main:app --reload --port 8000
```

起動すると:
```
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     Application startup complete.
```

### 3.2 フロントエンド起動（ターミナル2）

```bash
cd /Users/hyodo/discord/jujo_discord_app/apps/tournament_activity/frontend
npm run dev
```

起動すると:
```
  VITE v5.3.1  ready in 500 ms

  ➜  Local:   http://localhost:3000/
  ➜  Network: use --host to expose
```

---

## ステップ4: Discordでテスト

### 4.1 テストサーバーで起動

1. Discordアプリを開く
2. テストサーバーに参加
3. 任意のチャンネルを開く
4. メッセージ入力欄の左にある「🚀」アイコンをクリック
5. あなたのアプリ（testbot）が表示される
6. クリックして起動！

### 4.2 動作確認

Activitiesが起動すると、Discord内に以下が表示されます：

```
┌─────────────────────────────────┐
│ 🏆 スポーツ大会申込システム     │
│                                 │
│ [選手登録] [大会申込]           │
│                                 │
│ ─── 選手登録フォーム ───        │
│ 姓: [____]  名: [____]         │
│ 性別: [男子 ▼]                 │
│ 生年月日: [📅 カレンダー]      │
│ 連盟番号: [____]                │
│ 郵便番号: [____] [🔍 住所検索]  │
│ 住所: [____]                    │
│ 電話番号: [____]                │
│                                 │
│      [✅ 登録する]              │
└─────────────────────────────────┘
```

---

## 🔧 トラブルシューティング

### Activitiesが表示されない

1. Developer Portalで「Enable Activity」したか確認
2. URL Mappingsが正しいか確認
3. バックエンドとフロントエンドが起動しているか確認

### 認証エラー

1. Client IDとClient Secretが正しいか確認
2. Redirect URIが正しく設定されているか確認

### APIエラー

1. バックエンドのログを確認
2. CORS設定を確認
3. Supabase接続情報を確認

---

## 📝 次のステップ

1. Discord Developer Portalで設定
2. 環境変数を設定
3. バックエンドとフロントエンドを起動
4. Discordでテスト

準備ができたら、Developer Portalで取得したClient IDとClient Secretを教えてください！

