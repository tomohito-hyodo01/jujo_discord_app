# 実装ロードマップ：Fly.io + Supabase

## 🎯 実装する機能（確認）

### システム構成
```
【サーバー】Fly.io（無料プラン）
【データベース】Supabase（無料プラン）
【バックアップ】Googleスプレッドシート（オプション）
```

### 機能一覧
```
1. ユーザーマスター管理
   - /register_profile: プロフィール登録
   - /my_profile: プロフィール確認
   - /update_profile: プロフィール更新

2. 大会申込機能
   - 各大会チャンネルにボタン設置
   - ボタンクリックでフォーム表示
   - マスター情報 + 大会固有項目を入力
   - Supabaseに保存

3. 管理機能
   - /setup_tournament: 大会ボタン設置（管理者のみ）
   - /tournament_stats: 申込状況確認（管理者のみ）
```

### データ規模
```
年間大会数: 50大会
1大会あたり申込: 3〜10件
年間総申込数: 150〜500件
選手マスター: 100人以下
```

---

## 📅 実装スケジュール

### Phase 1: 環境構築（今日）
```
所要時間: 1時間

1. Supabaseアカウント作成・セットアップ（20分）
2. データベーステーブル作成（20分）
3. プロジェクト構成の整理（20分）
```

### Phase 2: ユーザーマスター機能（1日目）
```
所要時間: 3〜4時間

1. データベース接続設定（30分）
2. /register_profile 実装（1時間）
3. /my_profile 実装（30分）
4. /update_profile 実装（1時間）
5. テスト（1時間）
```

### Phase 3: 大会申込機能（2日目）
```
所要時間: 4〜5時間

1. 大会設定ファイルの作成（30分）
2. 動的フォーム生成機能（2時間）
3. 大会ボタン機能（1時間）
4. データ保存機能（1時間）
5. テスト（1時間）
```

### Phase 4: Fly.ioデプロイ（3日目）
```
所要時間: 2〜3時間

1. Fly.ioアカウント作成（10分）
2. fly.toml設定（30分）
3. Dockerfile作成（30分）
4. 環境変数設定（20分）
5. デプロイ（30分）
6. 動作確認（1時間）
```

### Phase 5: 本番運用準備（4日目）
```
所要時間: 2〜3時間

1. Googleスプレッドシート連携（1時間）
2. エラーハンドリング強化（1時間）
3. ログ機能追加（30分）
4. ドキュメント作成（30分）
```

**総所要時間: 10〜15時間（3〜4日間）**

---

## 🗂️ ディレクトリ構成

### 完成形
```
apps/form_bot/
├── bot.py                           # メインBot
├── config/
│   ├── tournaments/                 # 大会設定ファイル
│   │   ├── tennis_doubles_2025.json
│   │   └── basketball_2025.json
│   └── database.py                  # DB接続設定
├── cogs/
│   ├── user_profile.py             # ユーザーマスター管理
│   ├── tournament_registration.py   # 大会申込
│   └── tournament_admin.py         # 管理者機能
├── modals/
│   ├── profile_registration_modal.py  # プロフィール登録
│   ├── profile_update_modal.py       # プロフィール更新
│   └── dynamic_tournament_modal.py   # 動的大会フォーム
├── views/
│   └── tournament_button_view.py    # 大会申込ボタン
├── services/
│   ├── user_service.py              # ユーザー関連処理
│   ├── tournament_service.py        # 大会関連処理
│   └── supabase_service.py          # Supabase操作
├── models/
│   ├── user.py                      # ユーザーモデル
│   └── registration.py              # 申込モデル
├── utils/
│   ├── validators.py                # バリデーション
│   └── formatters.py                # データ整形
├── requirements.txt                 # 依存パッケージ
├── fly.toml                         # Fly.io設定
├── Dockerfile                       # Dockerコンテナ設定
├── .env.example                     # 環境変数テンプレート
└── README.md                        # 説明書
```

---

## 📝 実装手順（詳細）

### Step 1: Supabaseセットアップ

#### 1.1 アカウント作成
```
1. https://supabase.com にアクセス
2. 「Start your project」をクリック
3. GitHubアカウントでサインアップ
4. 無料（クレカ登録不要）
```

#### 1.2 プロジェクト作成
```
1. 「New Project」をクリック
2. プロジェクト名: sports-tournament-app
3. Database Password: 強力なパスワードを設定
4. Region: Northeast Asia (Tokyo) を選択
5. 「Create new project」をクリック
6. 数分待つ
```

#### 1.3 接続情報の取得
```
1. 左メニュー「Settings」→「Database」
2. Connection stringをコピー
   postgresql://postgres:[password]@[host]:5432/postgres
3. 左メニュー「Settings」→「API」
4. Project URLとanon keyをコピー
```

---

### Step 2: データベーステーブル作成

#### 2.1 SupabaseのSQL Editorで実行

```sql
-- ユーザーマスターテーブル
CREATE TABLE users (
    discord_user_id TEXT PRIMARY KEY,
    discord_username TEXT NOT NULL,
    full_name TEXT NOT NULL,
    postal_code TEXT,
    address TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    birth_date DATE NOT NULL,
    email TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- 大会マスターテーブル
CREATE TABLE tournaments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sport_type TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    start_date DATE,
    deadline_date TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'active',
    config JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- 申込データテーブル
CREATE TABLE registrations (
    id SERIAL PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES tournaments(id),
    discord_user_id TEXT NOT NULL REFERENCES users(discord_user_id),
    
    -- マスター情報のスナップショット
    full_name TEXT NOT NULL,
    address TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    birth_date DATE NOT NULL,
    
    -- 大会固有情報（JSON）
    tournament_specific_data JSONB NOT NULL,
    
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    status TEXT DEFAULT 'submitted',
    
    UNIQUE(tournament_id, discord_user_id)
);

-- インデックス作成
CREATE INDEX idx_registrations_tournament ON registrations(tournament_id);
CREATE INDEX idx_registrations_user ON registrations(discord_user_id);
CREATE INDEX idx_tournaments_channel ON tournaments(channel_id);

-- updated_at自動更新トリガー
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc', NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_registrations_updated_at BEFORE UPDATE ON registrations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

---

### Step 3: 環境変数設定

#### 3.1 .envファイル作成

```bash
# プロジェクトルートに.envファイルを作成
cd /Users/hyodo/discord/jujo_discord_app/apps/form_bot
```

`.env`ファイル:
```env
# Discord Bot
DISCORD_BOT_TOKEN=your_discord_bot_token

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_anon_key
DATABASE_URL=postgresql://postgres:[password]@db.[project].supabase.co:5432/postgres

# Environment
ENVIRONMENT=development
```

---

### Step 4: 依存パッケージの追加

#### requirements.txt に追加

```txt
# 既存
discord.py>=2.6.0
python-dotenv>=1.0.0

# 新規追加
asyncpg>=0.29.0           # PostgreSQL非同期接続
supabase>=2.3.0           # Supabase Python SDK
python-dateutil>=2.8.0    # 日付処理
```

インストール:
```bash
cd /Users/hyodo/discord/jujo_discord_app
source venv/bin/activate
pip install asyncpg supabase python-dateutil
```

---

## 🚀 次のアクション

### 今すぐやること

1. **Supabaseアカウント作成**
   - https://supabase.com
   - 5分で完了

2. **プロジェクト作成**
   - プロジェクト名を決める
   - Region: Tokyo
   - 10分で完了

3. **接続情報を取得**
   - URLとKeyをコピー
   - .envファイルに設定

準備ができたら次のステップに進みます！

---

## 📚 参考リンク

- [Supabase公式ドキュメント](https://supabase.com/docs)
- [Supabase Python SDK](https://supabase.com/docs/reference/python/introduction)
- [Fly.io公式ドキュメント](https://fly.io/docs/)
- [discord.py ドキュメント](https://discordpy.readthedocs.io/)

---

準備ができたら、Supabaseのセットアップから始めましょう！

