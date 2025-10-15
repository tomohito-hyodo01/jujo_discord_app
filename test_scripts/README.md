# Test Scripts

Discord Bot開発用のテストスクリプト集です。

## ファイル一覧

### simple_bot.py
シンプルなメッセージ投稿Botです。

**機能:**
- Bot起動時に指定チャンネルへメッセージ送信
- 基本的なコマンド機能（`!test`, `!hello`, `!info`）

**実行方法:**
```bash
cd test_scripts
python simple_bot.py
```

### auto_reply_bot.py
メッセージに自動返信するBotです。

**機能:**
- キーワード検知（挨拶、感謝など）
- Botメンションへの反応
- DM対応
- 追加コマンド（`!echo`, `!おみくじ`, `!ping`）

**実行方法:**
```bash
cd test_scripts
python auto_reply_bot.py
```

### test_message.py
一度だけメッセージを送信して終了するテストスクリプトです。

**機能:**
- 指定チャンネルにテストメッセージを送信
- 送信後に自動終了

**実行方法:**
```bash
cd test_scripts
python test_message.py
```

## 環境変数

これらのスクリプトは、プロジェクトルートの`.env`ファイルを使用します。

```bash
DISCORD_BOT_TOKEN=your_bot_token_here
DISCORD_CHANNEL_ID=your_channel_id_here
```

## 注意事項

⚠️ これらはテスト用のスクリプトです。本番環境では`apps/`ディレクトリ内のアプリを使用してください。

