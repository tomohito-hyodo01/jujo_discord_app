# Discord Bot Application Collection

複数のDiscord Botアプリケーションを管理するプロジェクトです。

## 📁 プロジェクト構成

```
jujo_discord_app/
├── apps/                          # 各アプリケーション
│   └── form_bot/                 # フォーム機能Bot
│       ├── bot.py                # メインBot
│       ├── cogs/                 # 機能ごとのCog
│       ├── modals/               # モーダルクラス
│       ├── views/                # ボタン・セレクトメニュー
│       ├── handlers/             # データ処理
│       └── README.md
├── shared/                        # 共有ユーティリティ
│   ├── config.py                 # 設定管理
│   ├── logger.py                 # ロガー
│   ├── utils.py                  # 便利関数
│   └── README.md
├── test_scripts/                  # テスト用スクリプト
│   ├── simple_bot.py             # シンプルなBot
│   ├── auto_reply_bot.py         # 自動返信Bot
│   ├── test_message.py           # メッセージ送信テスト
│   └── README.md
├── docs/                          # ドキュメント
│   ├── setup_guide.md            # セットアップガイド
│   └── development.md            # 開発ガイド
├── requirements.txt               # 依存パッケージ
├── .gitignore
├── .env                          # 環境変数（非公開）
└── README.md                     # このファイル
```

## 🚀 クイックスタート

### 1. セットアップ

```bash
# リポジトリをクローン
cd jujo_discord_app

# 仮想環境を有効化（既に作成済み）
source venv/bin/activate  # macOS/Linux
# または
venv\Scripts\activate     # Windows

# 依存パッケージをインストール
pip install -r requirements.txt

# 環境変数を設定
cp apps/form_bot/.env.example .env
# .envファイルを編集してトークンを設定
```

### 2. Botを起動

```bash
# Form Botを起動
cd apps/form_bot
python bot.py
```

詳細は [セットアップガイド](docs/setup_guide.md) を参照してください。

## 📱 アプリケーション一覧

### Form Bot (`apps/form_bot/`)

スラッシュコマンドでモーダルを表示し、フォーム入力を受け付けるBotです。

**機能:**
- ✅ `/feedback` - フィードバックフォーム
- ✅ Cogsによる機能拡張
- ✅ 再利用可能なモーダル基底クラス

**詳細:** [Form Bot README](apps/form_bot/README.md)

## 🛠️ 開発

### 新しいフォーム機能を追加

1. `apps/form_bot/modals/`にモーダルクラスを作成
2. `apps/form_bot/cogs/`にCogクラスを作成
3. `bot.py`の`load_cogs()`に登録

詳細は [開発ガイド](docs/development.md) を参照してください。

### 新しいアプリを追加

```bash
# 新しいアプリのディレクトリを作成
mkdir -p apps/your_new_app

# 必要なファイルを作成
cd apps/your_new_app
touch bot.py README.md .env.example
```

## 📚 ドキュメント

- [セットアップガイド](docs/setup_guide.md) - 初回セットアップ方法
- [開発ガイド](docs/development.md) - 開発フロー・コーディング規約
- [共有ユーティリティ](shared/README.md) - 共通モジュールの使い方

## 🔧 技術スタック

- **言語:** Python 3.8+
- **ライブラリ:** discord.py 2.6+
- **環境管理:** python-dotenv
- **アーキテクチャ:** Cogs（拡張機能）パターン

## 📦 依存パッケージ

```
discord.py>=2.6.0
python-dotenv>=1.0.0
```

インストール:
```bash
pip install -r requirements.txt
```

## ⚙️ 環境変数

`.env`ファイルに以下を設定：

```bash
DISCORD_BOT_TOKEN=your_bot_token_here
DISCORD_CHANNEL_ID=your_channel_id_here  # オプション
```

⚠️ **重要:** `.env`ファイルは絶対にGitにコミットしないでください！

## 🔐 セキュリティ

- `.env`ファイルはgitignoreに含まれています
- Botトークンは絶対に公開しないでください
- 各アプリに`.env.example`を用意しています

## 📝 ライセンス

このプロジェクトはプライベート使用を目的としています。

## 🤝 コントリビューション

このプロジェクトは個人用です。

## 📞 トラブルシューティング

### よくある問題

**Q: Botがログインできない**
- `.env`ファイルのトークンが正しいか確認
- トークンの前後にスペースがないか確認

**Q: スラッシュコマンドが表示されない**
- Discord Developer Portalで`applications.commands`スコープを確認
- Botを再起動して数分待つ
- サーバーを再招待してみる

**Q: モーダルが表示されない**
- `MESSAGE CONTENT INTENT`が有効か確認
- Bot権限が十分か確認

詳細は [セットアップガイド](docs/setup_guide.md#トラブルシューティング) を参照してください。

## 📈 今後の予定

- [ ] データベース連携
- [ ] ロギング機能の強化
- [ ] ユニットテストの追加
- [ ] CI/CDパイプライン
- [ ] Docker対応

## 🔗 参考リンク

- [Discord Developer Portal](https://discord.com/developers/applications)
- [discord.py Documentation](https://discordpy.readthedocs.io/)
- [Discord API Reference](https://discord.com/developers/docs/reference)
