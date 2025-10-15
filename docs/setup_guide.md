# Discord Bot セットアップガイド

このドキュメントでは、Discord Botの初期設定方法を説明します。

## 1. Discord Developer Portalでの設定

### 1.1 アプリケーションの作成

1. [Discord Developer Portal](https://discord.com/developers/applications)にアクセス
2. 「New Application」ボタンをクリック
3. アプリケーション名を入力して作成

### 1.2 Botの作成

1. 左メニューから「Bot」を選択
2. 「Add Bot」をクリック
3. Bot Tokenを取得（「Reset Token」→コピー）

⚠️ **重要**: トークンは絶対に他人に共有しないでください！

### 1.3 権限の設定

「Bot」セクションで以下を有効化：

- ✅ **MESSAGE CONTENT INTENT** - メッセージ内容の読み取り
- ✅ **SERVER MEMBERS INTENT** - サーバーメンバー情報の取得（オプション）
- ✅ **PRESENCE INTENT** - プレゼンス情報の取得（オプション）

### 1.4 OAuth2設定

1. 左メニューから「OAuth2」→「URL Generator」を選択
2. **SCOPES**で以下を選択：
   - ✅ `bot`
   - ✅ `applications.commands`
3. **BOT PERMISSIONS**で以下を選択：
   - ✅ Send Messages（メッセージを送信）
   - ✅ Send Messages in Threads（スレッドでメッセージを送信）
   - ✅ Read Message History（メッセージ履歴を読む）
   - ✅ Use Slash Commands（スラッシュコマンドを使用）
4. 生成されたURLをコピー

### 1.5 Botをサーバーに招待

1. コピーしたURLをブラウザで開く
2. Botを追加したいサーバーを選択
3. 権限を確認して「認証」をクリック

## 2. ローカル環境の設定

### 2.1 Pythonのインストール

Python 3.8以上が必要です。

```bash
# バージョン確認
python --version
```

### 2.2 仮想環境の作成

```bash
# プロジェクトディレクトリに移動
cd jujo_discord_app

# 仮想環境を作成（既存の場合はスキップ）
python -m venv venv

# 仮想環境を有効化
# macOS/Linux:
source venv/bin/activate
# Windows:
venv\Scripts\activate
```

### 2.3 依存パッケージのインストール

```bash
pip install -r requirements.txt
```

### 2.4 環境変数の設定

プロジェクトルートに`.env`ファイルを作成：

```bash
DISCORD_BOT_TOKEN=your_bot_token_here
DISCORD_CHANNEL_ID=your_channel_id_here
```

**チャンネルIDの取得方法:**
1. Discordの「設定」→「詳細設定」→「開発者モード」を有効化
2. チャンネルを右クリック→「IDをコピー」

## 3. Botの起動

```bash
# Form Botを起動
cd apps/form_bot
python bot.py
```

## 4. 動作確認

1. Discordサーバーで`/`を入力
2. Botのコマンドが表示されることを確認
3. `/feedback`などのコマンドを実行
4. モーダルが表示されることを確認

## トラブルシューティング

### エラー: ログインに失敗しました

- `.env`ファイルのトークンが正しいか確認
- トークンの前後にスペースがないか確認

### コマンドが表示されない

- Bot権限で`applications.commands`が有効か確認
- Botを再起動
- 数分待ってから再度確認（同期に時間がかかる場合あり）

### モーダルが表示されない

- Discord Developer Portalで「MESSAGE CONTENT INTENT」が有効か確認
- Botの権限が十分か確認

## 次のステップ

- [開発ガイド](development.md)を読む
- 新しいフォーム機能を追加する
- データベース連携を実装する

