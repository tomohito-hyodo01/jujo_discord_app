# 機能一覧（Features）

このドキュメントでは、Discord Bot Application Collection の全機能を詳細に説明します。

---

## 📱 アプリケーション機能

### 1. Form Bot（フォーム機能Bot）

スラッシュコマンドでモーダルフォームを表示し、ユーザー入力を受け付けるBotです。

**スラッシュコマンド:**

| コマンド | 説明 |
|---------|------|
| `/feedback` | フィードバックフォームを表示 |

**機能詳細:**
- ✅ スラッシュコマンドによるフォーム表示
- ✅ モーダルUIでの入力受付
- ✅ Cogsによる機能の分離・拡張
- ✅ 再利用可能なモーダル基底クラス
- ✅ 拡張可能なアーキテクチャ

**アーキテクチャ:**
- `cogs/` - 機能ごとのCog（拡張機能）
- `modals/` - モーダルクラス（フォームUI）
- `views/` - ボタン・セレクトメニュー
- `handlers/` - データ処理

---

### 2. Tournament Activity（大会申込システム）

Discord内に埋め込まれるWebアプリケーションで、選手登録と大会申込を1つのフォームで完結できます。

**主要機能:**
- ✅ Discord内で完結（外部遷移なし）
- ✅ 1つのフォームで全項目入力
- ✅ カレンダーUIで生年月日選択
- ✅ 郵便番号から住所自動入力
- ✅ リアルタイムバリデーション
- ✅ Discord風のダークテーマUI

**フロントエンド（React + TypeScript）:**
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

**バックエンド（FastAPI）:**
- ✅ REST API
- ✅ Supabase連携
- ✅ OAuth2認証
- ✅ CORS設定
- ✅ APIエンドポイント
  - `POST /api/token` - 認証
  - `GET/POST /api/players` - 選手管理
  - `GET /api/tournaments` - 大会取得
  - `POST /api/registrations` - 申込登録

---

## 🌐 大会申込システム（/apply コマンド）

Discord Botを通じて大会申込ができるシステムです。

**申込フロー:**
1. ユーザーが `/apply` コマンドを実行
2. Discord Botがセッションを作成
3. 申込フォームのリンクをユーザーに送信
4. ユーザーがブラウザでフォーム入力
5. データがSupabaseに保存
6. Discord Webhookで完了通知

**システム構成:**
- **Discord Bot（Fly.io）** - コマンド受付、通知サーバー
- **バックエンドAPI（Fly.io）** - セッション管理、データ処理
- **フロントエンド（Fly.io）** - 申込フォームUI
- **Supabase PostgreSQL** - データ永続化

**データベーステーブル:**
| テーブル | 用途 |
|---------|------|
| `player_mst` | 選手マスタ |
| `tournament_mst` | 大会マスタ |
| `tournament_registration` | 申込データ |

---

## 🛠️ 共有ユーティリティ（Shared Utilities）

各アプリで共通して使用するモジュール群です。

### config.py - 設定管理

- ✅ 環境変数の読み込み
- ✅ トークン管理
- ✅ 設定の検証機能

```python
from shared.config import config
token = config.bot_token
is_valid, errors = config.validate()
```

### logger.py - ロギング

- ✅ アプリケーション全体で使用するロガー
- ✅ ファイル出力対応
- ✅ ログレベル別出力（info, warning, error）

```python
from shared.logger import setup_logger
logger = setup_logger('my_app', log_file='app.log')
```

### utils.py - 便利関数

- ✅ Discord Embed簡単作成
- ✅ ユーザー情報整形
- ✅ テキスト切り詰め

```python
from shared.utils import create_embed, format_user_info, truncate_text
embed = create_embed(title='タイトル', description='説明文')
```

---

## 🧪 テストスクリプト

開発・検証用のテストスクリプト集です。

### simple_bot.py - シンプルBot

| コマンド | 説明 |
|---------|------|
| `!test` | テストメッセージ |
| `!hello` | 挨拶 |
| `!info` | 情報表示 |

**機能:**
- Bot起動時に指定チャンネルへメッセージ送信
- 基本的なコマンド機能

### auto_reply_bot.py - 自動返信Bot

| コマンド | 説明 |
|---------|------|
| `!echo` | メッセージをエコーバック |
| `!おみくじ` | おみくじを引く |
| `!ping` | 疎通確認 |

**機能:**
- キーワード検知（挨拶、感謝など）
- Botメンションへの反応
- DM対応

### test_message.py - テストメッセージ送信

- 指定チャンネルにテストメッセージを送信
- 送信後に自動終了

---

## 🏗️ インフラ機能

### Fly.io デプロイメント

| アプリ | 用途 | ポート | 状態 |
|-------|------|-------|------|
| jujo-discord-bot | Discord Bot | 8001 | 常時起動 |
| tournament-api-jujo | バックエンドAPI | 8000 | オンデマンド |
| tournament-form-jujo | フロントエンド | 80 | オンデマンド |

### システム特徴

- ✅ 完全クラウド（ローカルサーバー不要）
- ✅ 24時間365日稼働
- ✅ 月額0円（無料枠内運用）
- ✅ どこからでもアクセス可能
- ✅ 自動スケール
- ✅ 自動バックアップ（Supabase 7日分）
- ✅ Discord完全統合

---

## 🔒 セキュリティ機能

- ✅ 環境変数による機密情報管理
- ✅ `.env`ファイルのgitignore設定
- ✅ Fly.io Secrets による安全な設定管理
- ✅ OAuth2認証（Tournament Activity）
- ✅ セッションベースの認証フロー

---

## 🔧 技術スタック

| カテゴリ | 技術 |
|---------|------|
| 言語 | Python 3.8+ / 3.13 |
| Botフレームワーク | discord.py 2.6+ |
| バックエンド | FastAPI |
| フロントエンド | React + TypeScript + Vite |
| データベース | Supabase PostgreSQL |
| 環境管理 | python-dotenv |
| インフラ | Fly.io |
| アーキテクチャ | Cogs（拡張機能）パターン |

---

## 📈 今後の拡張予定

### 全体
- [ ] データベース連携の強化
- [ ] ロギング機能の強化
- [ ] ユニットテストの追加
- [ ] CI/CDパイプライン
- [ ] Docker対応

### Form Bot
- [ ] フォーム送信結果の通知機能
- [ ] 管理者用コマンド
- [ ] 複数ページのフォーム
- [ ] 選択式フォーム（Select Menu）

---

## 📚 関連ドキュメント

- [README](../README.md) - プロジェクト概要
- [セットアップガイド](setup_guide.md) - 初回セットアップ方法
- [開発ガイド](development.md) - 開発フロー・コーディング規約
- [システム構成図](../SYSTEM_ARCHITECTURE.md) - システムアーキテクチャ詳細
- [共有ユーティリティ](../shared/README.md) - 共通モジュールの使い方
- [Form Bot](../apps/form_bot/README.md) - Form Bot詳細
- [Tournament Activity](../apps/tournament_activity/README.md) - Tournament Activity詳細
