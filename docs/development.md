# 開発ガイド

Discord Botアプリの開発方法を説明します。

## プロジェクト構成

```
jujo_discord_app/
├── apps/                    # 各アプリケーション
│   └── form_bot/           # フォームBot
├── shared/                  # 共有ユーティリティ
├── test_scripts/           # テストスクリプト
├── docs/                   # ドキュメント
├── requirements.txt        # 依存パッケージ
└── .env                    # 環境変数（非公開）
```

## 開発フロー

### 1. 新しいフォーム機能を追加する

#### Step 1: モーダルクラスを作成

`apps/form_bot/modals/your_modal.py`:

```python
import discord
from .base_modal import BaseModal

class YourModal(BaseModal):
    # フォームフィールドを定義
    field1 = discord.ui.TextInput(
        label='フィールド1',
        placeholder='入力してください',
        required=True,
        max_length=100
    )
    
    field2 = discord.ui.TextInput(
        label='フィールド2',
        style=discord.TextStyle.paragraph,  # 複数行
        required=False,
        max_length=1000
    )
    
    def __init__(self):
        super().__init__(title='フォームタイトル')
    
    async def on_submit(self, interaction: discord.Interaction):
        # フォーム送信時の処理
        value1 = self.field1.value
        value2 = self.field2.value
        
        # データを処理（ログ出力、DB保存など）
        print(f'受信: {value1}, {value2}')
        
        # 確認メッセージを送信
        await interaction.response.send_message(
            '✅ 送信完了！',
            ephemeral=True
        )
```

#### Step 2: Cogクラスを作成

`apps/form_bot/cogs/your_cog.py`:

```python
import discord
from discord.ext import commands
from discord import app_commands
import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from modals.your_modal import YourModal

class YourCog(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
    
    @app_commands.command(
        name='yourcommand',
        description='コマンドの説明'
    )
    async def yourcommand(self, interaction: discord.Interaction):
        modal = YourModal()
        await interaction.response.send_modal(modal)

async def setup(bot):
    await bot.add_cog(YourCog(bot))
```

#### Step 3: bot.pyに登録

`apps/form_bot/bot.py`の`load_cogs()`関数を編集：

```python
async def load_cogs():
    await bot.load_extension('cogs.feedback_form')
    await bot.load_extension('cogs.your_cog')  # 追加
```

### 2. 共有ユーティリティを使用する

```python
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '../..'))

from shared.config import config
from shared.utils import create_embed

# 設定を取得
token = config.bot_token

# Embedを作成
embed = create_embed(
    title='タイトル',
    description='説明',
    fields=[('名前', '値', False)]
)
```

### 3. 新しいアプリケーションを追加する

```bash
# 新しいアプリのディレクトリを作成
mkdir -p apps/new_app

# 基本ファイルを作成
touch apps/new_app/bot.py
touch apps/new_app/README.md
touch apps/new_app/.env.example
```

## コーディング規約

### Pythonスタイル

- PEP 8に準拠
- 型ヒントを使用（Python 3.8+）
- Docstringを記述

```python
def function_name(param: str) -> bool:
    """
    関数の説明
    
    Args:
        param: パラメータの説明
    
    Returns:
        戻り値の説明
    """
    return True
```

### ファイル命名規則

- Pythonファイル: `snake_case.py`
- クラス名: `PascalCase`
- 関数名: `snake_case`
- 定数: `UPPER_CASE`

### Gitコミットメッセージ

```
[種別] 簡潔な説明

詳細な説明（必要に応じて）

例:
[feat] フィードバックフォーム機能を追加
[fix] モーダル送信時のエラーを修正
[docs] READMEを更新
[refactor] コード構造を改善
```

## テスト

### 手動テスト

```bash
# テストスクリプトを実行
cd test_scripts
python test_message.py
```

### デバッグ

```python
# ログを有効化
import logging
logging.basicConfig(level=logging.DEBUG)

# または共有ロガーを使用
from shared.logger import setup_logger
logger = setup_logger('debug', level=logging.DEBUG)
```

## デプロイ

### 本番環境へのデプロイ

1. 本番用の`.env`ファイルを作成
2. サーバーにコードをデプロイ
3. 依存パッケージをインストール
4. Botを起動（systemdやsupervisorを推奨）

### 継続的実行

systemdを使用する例：

```ini
# /etc/systemd/system/discord-bot.service
[Unit]
Description=Discord Form Bot
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/path/to/jujo_discord_app/apps/form_bot
ExecStart=/path/to/venv/bin/python bot.py
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
# サービスを有効化
sudo systemctl enable discord-bot
sudo systemctl start discord-bot
```

## 参考リンク

- [discord.py ドキュメント](https://discordpy.readthedocs.io/)
- [Discord Developer Portal](https://discord.com/developers/docs)
- [Discord API リファレンス](https://discord.com/developers/docs/reference)

