# 技術スタック詳細

## 📊 システム全体像

```
フロントエンド → バックエンド → データベース
     ↓              ↓              ↓
   Fly.io        Fly.io       Supabase
   (React)      (FastAPI)   (PostgreSQL)
```

---

## 🎨 フロントエンド

### コア技術

| 技術 | バージョン | 用途 |
|------|-----------|------|
| **React** | 19.2.0 | UIライブラリ |
| **TypeScript** | 5.9.3 | 型安全な開発 |
| **Vite** | 7.1.10 | ビルドツール・開発サーバー |

### 開発ツール

| ツール | バージョン | 用途 |
|--------|-----------|------|
| @vitejs/plugin-react | 5.0.4 | React用Viteプラグイン |
| @types/react | 19.2.2 | React型定義 |
| @types/react-dom | 19.2.2 | ReactDOM型定義 |

### インフラ

| 項目 | 設定 |
|------|------|
| **ホスティング** | Fly.io |
| **Webサーバー** | Nginx (Alpine) |
| **ビルド方式** | Multi-stage Docker build |
| **ポート** | 80（HTTP）→ 443（HTTPS自動） |
| **リージョン** | Tokyo, Japan (nrt) |
| **メモリ** | 256MB |
| **CPU** | shared-cpu-1x |

### ディレクトリ構成

```
frontend/
├── src/
│   ├── main.tsx              # エントリーポイント
│   ├── App.tsx               # メインコンポーネント
│   ├── index.css             # グローバルスタイル
│   ├── vite-env.d.ts         # Vite型定義
│   └── components/
│       ├── TournamentApplicationForm.tsx  # 大会申込フォーム
│       ├── PlayerRegistrationForm.tsx     # 選手登録フォーム
│       ├── PlayerRegistrationFormInline.tsx  # インライン選手登録
│       └── CompletePage.tsx               # 完了画面
├── index.html                # HTMLテンプレート
├── package.json              # npm依存関係
├── tsconfig.json             # TypeScript設定
├── vite.config.ts            # Vite設定
├── Dockerfile                # Docker設定
└── fly.toml                  # Fly.io設定
```

---

## 🔧 バックエンド

### コア技術

| 技術 | バージョン | 用途 |
|------|-----------|------|
| **Python** | 3.13 | プログラミング言語 |
| **FastAPI** | 0.119.0 | WebフレームワークRESTAPI |
| **Uvicorn** | 0.37.0 | ASGIサーバー |
| **Pydantic** | 2.12.2 | データバリデーション |

### データベース連携

| ライブラリ | バージョン | 用途 |
|-----------|-----------|------|
| **supabase** | 2.22.0 | Supabase Python SDK |
| **asyncpg** | 0.30.0 | PostgreSQL非同期ドライバー |
| **postgrest** | 2.22.0 | PostgREST Python クライアント |

### HTTP通信

| ライブラリ | バージョン | 用途 |
|-----------|-----------|------|
| **httpx** | 0.28.1 | 非同期HTTPクライアント |
| **httpcore** | 1.0.9 | HTTP/2サポート |
| **h2** | 4.3.0 | HTTP/2実装 |
| **certifi** | 2025.10.5 | SSL証明書 |

### ユーティリティ

| ライブラリ | バージョン | 用途 |
|-----------|-----------|------|
| python-dotenv | 1.1.1 | 環境変数管理 |
| python-dateutil | 2.9.0 | 日付処理 |

### インフラ

| 項目 | 設定 |
|------|------|
| **ホスティング** | Fly.io |
| **コンテナ** | Docker（python:3.13-slim） |
| **ポート** | 8000 |
| **リージョン** | Tokyo, Japan (nrt) |
| **メモリ** | 256MB |
| **CPU** | shared-cpu-1x |
| **CORS** | 全許可（本番環境では要制限） |

### APIエンドポイント

```
認証系:
POST   /api/session              # セッション作成
GET    /api/session/{id}         # セッション取得

選手系:
GET    /api/players              # 全選手取得
POST   /api/players              # 選手登録
GET    /api/players/{id}         # 選手取得
GET    /api/players/discord/{id} # Discord IDで選手取得

大会系:
GET    /api/tournaments                  # 全大会取得
GET    /api/tournaments/{id}             # 大会取得
GET    /api/tournaments/available/{id}   # 申込可能な大会取得

申込系:
POST   /api/registrations                # 申込登録
GET    /api/registrations/user/{id}      # ユーザーの申込一覧

通知系:
POST   /api/notify/registration          # Discord通知送信
```

### ディレクトリ構成

```
backend/
├── api/
│   ├── main.py               # FastAPIアプリ
│   ├── database.py           # Supabase接続
│   ├── routers/
│   │   ├── auth.py           # OAuth2認証
│   │   ├── session.py        # セッション管理
│   │   ├── players.py        # 選手API
│   │   ├── tournaments.py    # 大会API
│   │   ├── available_tournaments.py  # 申込可能大会API
│   │   ├── registrations.py  # 申込API
│   │   └── notification.py   # Discord通知API
│   └── models/
│       └── __init__.py
├── requirements.txt          # Python依存関係
├── Dockerfile                # Docker設定
├── fly.toml                  # Fly.io設定
└── .env                      # 環境変数（ローカル）
```

---

## 🤖 Discord Bot

### コア技術

| 技術 | バージョン | 用途 |
|------|-----------|------|
| **Python** | 3.13 | プログラミング言語 |
| **discord.py** | 2.6.4 | Discord API ライブラリ |
| **aiohttp** | 3.13.0 | 非同期HTTP（通知サーバー） |
| **asyncio** | 標準ライブラリ | 非同期処理 |

### データベース連携

| ライブラリ | バージョン | 用途 |
|-----------|-----------|------|
| supabase | 2.22.0 | Supabase Python SDK |
| asyncpg | 0.30.0 | PostgreSQL非同期接続 |

### HTTP通信

| ライブラリ | バージョン | 用途 |
|-----------|-----------|------|
| httpx | 0.28.1 | バックエンドAPI呼び出し |
| aiohttp | 3.13.0 | 通知サーバー |

### 機能

```
スラッシュコマンド:
/test          - テストフォーム
/feedback      - フィードバック
/setup_forms   - フォームボタン設置
/apply         - 大会申込フォーム開く

通知サーバー:
POST /notify/registration  # Discord通知受信（port 8001）
```

### インフラ

| 項目 | 設定 |
|------|------|
| **ホスティング** | Fly.io |
| **コンテナ** | Docker（python:3.13-slim） |
| **ポート** | 8001（通知サーバー） |
| **リージョン** | Tokyo, Japan (nrt) |
| **メモリ** | 1GB |
| **CPU** | shared-cpu-1x |
| **常時起動** | Yes（min_machines_running = 1） |

### ディレクトリ構成

```
form_bot/
├── bot.py                    # メインBot
├── cogs/                     # 機能拡張
│   ├── test_form.py
│   ├── feedback_form.py
│   ├── setup_forms.py
│   ├── tournament_application.py
│   └── web_form_setup.py     # /apply コマンド
├── modals/                   # モーダルフォーム
│   ├── base_modal.py
│   ├── test_modal.py
│   ├── feedback_modal.py
│   └── player_registration_modal.py
├── views/                    # UIコンポーネント
│   ├── form_buttons.py
│   ├── tournament_application_view.py
│   ├── player_registration_flow.py
│   └── web_form_button.py
├── api/                      # 通知サーバー
│   └── notification_server.py
├── services/                 # ビジネスロジック
│   ├── database.py
│   ├── tournament_service.py
│   ├── player_service.py
│   └── postal_service.py     # 郵便番号API
├── requirements.txt
├── Dockerfile
└── fly.toml
```

---

## 🗄️ データベース（Supabase PostgreSQL）

### バージョン

| 項目 | 値 |
|------|---|
| **PostgreSQL** | 15.x |
| **Supabase** | 無料プラン |
| **容量** | 500MB |
| **転送量** | 5GB/月 |
| **接続数** | 60同時接続 |
| **バックアップ** | 7日間自動 |

### テーブル構造

```sql
player_mst
├─ player_id (SERIAL, PRIMARY KEY)
├─ discord_id (TEXT, UNIQUE, NULL可)
├─ jsta_number (TEXT)
├─ player_name (TEXT, NOT NULL)
├─ post_number (TEXT)
├─ address (TEXT, NOT NULL)
├─ phone_number (TEXT, NOT NULL)
├─ birth_date (DATE, NOT NULL)
├─ sex (INTEGER, NOT NULL)
├─ created_at (TIMESTAMP)
└─ updated_at (TIMESTAMP)

tournament_mst
├─ tournament_id (TEXT, PRIMARY KEY)
├─ registrated_ward (INTEGER, NOT NULL)
├─ tournament_name (TEXT, NOT NULL)
├─ classification (INTEGER, NOT NULL)
├─ mix_flg (BOOLEAN, NOT NULL)
├─ type (TEXT[], NOT NULL)
├─ tournament_date (DATE, NOT NULL)
├─ deadline_date (DATE, NOT NULL)
├─ created_at (TIMESTAMP)
└─ updated_at (TIMESTAMP)

tournament_registration
├─ registration_id (SERIAL, PRIMARY KEY)
├─ discord_id (TEXT, NOT NULL)
├─ tournament_id (TEXT, NOT NULL, FK)
├─ type (TEXT, NOT NULL)
├─ sex (INTEGER, NOT NULL)
├─ pair1 (INTEGER, NOT NULL, FK)
├─ pair2 (INTEGER[])
├─ submitted_at (TIMESTAMP)
└─ updated_at (TIMESTAMP)
```

### トリガー

```sql
update_updated_at_column()
├─ player_mst
├─ tournament_mst
└─ tournament_registration
→ UPDATE時にupdated_atを自動更新
```

---

## 🔌 外部サービス・API

### Discord

| 機能 | 詳細 |
|------|------|
| **Bot API** | discord.py 2.6.4 |
| **Gateway** | WebSocket接続 |
| **Slash Commands** | Application Commands API |
| **Webhook** | Incoming Webhooks |
| **Intents** | message_content, guilds |

### zipcloud API

| 項目 | 値 |
|------|---|
| **サービス** | zipcloud（郵便番号検索） |
| **URL** | https://zipcloud.ibsnet.co.jp/api/search |
| **料金** | 無料 |
| **認証** | 不要 |
| **用途** | 郵便番号 → 住所変換 |

---

## 🐳 Docker構成

### フロントエンド Dockerfile

```dockerfile
# ステージ1: ビルド
FROM node:20-slim
- Node.js 20
- npm ci（依存関係インストール）
- npm run build（Vite build）

# ステージ2: 本番
FROM nginx:alpine
- Nginx（軽量）
- ビルド成果物をコピー
- ポート80で配信
```

### バックエンド Dockerfile

```dockerfile
FROM python:3.13-slim
- Python 3.13（slim版）
- pip install（依存関係）
- uvicorn起動（port 8000）
```

### Bot Dockerfile

```dockerfile
FROM python:3.13-slim
- Python 3.13（slim版）
- pip install（依存関係）
- python3 bot.py起動
```

---

## 🌐 Fly.io設定

### リソース配分

```
┌─────────────────────────────────────┐
│ Fly.io 無料枠: 3GB RAM              │
├─────────────────────────────────────┤
│ Bot:      1GB  (40%)                │
│ API:      256MB (8%)                │
│ Frontend: 256MB (8%)                │
├─────────────────────────────────────┤
│ 合計:     1.5GB / 3GB (50%)         │
│ 残り:     1.5GB                     │
└─────────────────────────────────────┘
```

### ネットワーク

```
Bot:
├─ IPv6: 2a09:8280:1::a6:3158:0
├─ IPv4: 66.241.124.46（共有）
└─ 内部ポート: 8001

API:
├─ IPv6: 2a09:8280:1::a6:30d6:0
├─ IPv4: 66.241.125.37（共有）
└─ 内部ポート: 8000

Frontend:
├─ IPv6: 2a09:8280:1::a6:3104:0
├─ IPv4: 66.241.124.79（共有）
└─ 内部ポート: 80
```

### 自動スケーリング

```
Bot:
├─ auto_stop_machines: false（常時起動）
├─ min_machines_running: 1
└─ max_machines: 2

API:
├─ auto_stop_machines: stop（アイドル時停止）
├─ min_machines_running: 0
└─ 自動起動: true

Frontend:
├─ auto_stop_machines: stop
├─ min_machines_running: 0
└─ 自動起動: true
```

---

## 💾 データフロー技術

### セッション管理

```python
# メモリ内辞書
sessions: Dict[str, Dict] = {}

構造:
{
  "session_id": {
    "discord_id": "123456789",
    "username": "user",
    "created_at": datetime,
    "expires_at": None  # 無期限
  }
}
```

### データ取得フロー

```
フロントエンド
    ↓ fetch()
バックエンド
    ↓ Supabase Python SDK
Supabase REST API
    ↓ PostgreSQL Protocol
PostgreSQL Database
```

### 通知フロー

```
フロントエンド（申込完了）
    ↓ POST /api/notify/registration
バックエンド
    ↓ POST（Discord Webhook）
Discord CDN
    ↓
チャンネルにメッセージ表示
```

---

## 🔐 セキュリティ

### 環境変数管理

```
開発環境:
├─ .env ファイル
└─ python-dotenv

本番環境:
├─ Fly.io Secrets
└─ flyctl secrets set
```

### 機密情報

```
Bot Secrets:
├─ DISCORD_BOT_TOKEN
├─ SUPABASE_URL
└─ SUPABASE_KEY

API Secrets:
├─ SUPABASE_URL
├─ SUPABASE_KEY
├─ DISCORD_CLIENT_ID
├─ DISCORD_CLIENT_SECRET
└─ DISCORD_WEBHOOK_URL

Frontend Build Args:
├─ VITE_API_URL
└─ VITE_DISCORD_CLIENT_ID
```

### HTTPS/SSL

```
全てのFly.ioアプリ:
├─ 自動HTTPS（Let's Encrypt）
├─ HTTP → HTTPS リダイレクト
└─ force_https: true
```

---

## 📦 依存パッケージ一覧

### フロントエンド（package.json）

```json
{
  "dependencies": {
    "react": "^19.2.0",
    "react-dom": "^19.2.0"
  },
  "devDependencies": {
    "@types/react": "^19.2.2",
    "@types/react-dom": "^19.2.2",
    "@vitejs/plugin-react": "^5.0.4",
    "typescript": "^5.9.3",
    "vite": "^7.1.10"
  }
}
```

### バックエンド（requirements.txt）

```
fastapi>=0.115.0
uvicorn[standard]>=0.32.0
supabase>=2.22.0
python-dotenv>=1.1.0
pydantic>=2.10.0
httpx>=0.28.0
```

### Bot（requirements.txt）

```
discord.py>=2.6.0
python-dotenv>=1.1.0
supabase>=2.22.0
asyncpg>=0.30.0
python-dateutil>=2.9.0
httpx>=0.28.0
aiohttp>=3.13.0
```

---

## 🌍 デプロイ戦略

### CI/CD

```
現在: 手動デプロイ
├─ flyctl deploy（コマンド実行）
└─ Depot（高速ビルド）

将来的:
├─ GitHub Actions
├─ 自動テスト
└─ 自動デプロイ
```

### ビルドツール

| ツール | 用途 |
|--------|------|
| **Depot** | Docker高速ビルド（Fly.io統合） |
| **Docker Multi-stage** | イメージサイズ削減 |
| **Layer Cache** | ビルド時間短縮 |

---

## 📊 パフォーマンス

### レスポンスタイム

```
フロントエンド読み込み: < 1秒
API応答: 50〜100ms
データベースクエリ: 10〜50ms
Discord通知: 1〜2秒
```

### 同時接続

```
想定:
├─ 同時アクセス: 10〜20人
├─ 申込処理: 5〜10件/分
└─ Discord通知: 5〜10件/分

対応可能:
├─ 同時アクセス: 100人
├─ 申込処理: 100件/分
└─ Discord通知: 100件/分
```

---

## 🛠️ 開発ツール

### ローカル開発

```
フロントエンド:
├─ npm run dev（Vite開発サーバー）
└─ http://localhost:3000

バックエンド:
├─ uvicorn --reload
└─ http://localhost:8000

Bot:
├─ python3 bot.py
└─ Discord接続
```

### デプロイツール

```
Fly.io CLI (flyctl)
├─ バージョン: 最新
├─ 認証: flyctl auth login
├─ デプロイ: flyctl deploy
└─ ログ: flyctl logs
```

---

## 📈 監視・ログ

### Fly.io Monitoring

```
各アプリ:
├─ CPU使用率
├─ メモリ使用率
├─ ネットワーク転送量
├─ リクエスト数
└─ エラーレート
```

### ログ管理

```
flyctl logs -a <app-name>
├─ リアルタイムログ
├─ 過去ログ検索
└─ JSONフォーマット対応
```

### Supabase Monitoring

```
Dashboard:
├─ データベースサイズ
├─ API呼び出し数
├─ 転送量
└─ 同時接続数
```

---

これで技術スタックの全容がわかりますね！

