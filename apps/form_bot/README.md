# Discord Form Bot

複数のフォーム機能を提供するDiscord Botです。スラッシュコマンドでモーダルを表示し、ユーザー入力を受け取ります。

## 機能

- ✅ スラッシュコマンドによるフォーム表示
- ✅ モーダルUIでの入力受付
- ✅ Cogsによる機能の分離
- ✅ 拡張可能なアーキテクチャ

## 現在実装されているコマンド

| コマンド | 説明 |
|---------|------|
| `/feedback` | フィードバックフォームを表示 |

## ディレクトリ構成

```
form_bot/
├── bot.py                   # メインのBotアプリケーション
├── cogs/                    # 機能ごとのCog
│   ├── __init__.py
│   └── feedback_form.py    # フィードバックフォーム機能
├── modals/                  # モーダルクラス
│   ├── __init__.py
│   ├── base_modal.py       # 基底モーダルクラス
│   └── feedback_modal.py   # フィードバックモーダル
├── views/                   # ボタン・セレクトメニュー（将来の拡張用）
│   └── __init__.py
├── handlers/                # データ処理（将来の拡張用）
│   └── __init__.py
├── .env.example            # 環境変数のテンプレート
└── README.md               # このファイル
```

## セットアップ

### 1. 環境変数の設定

`.env`ファイルを作成し、以下の内容を設定してください：

```bash
DISCORD_BOT_TOKEN=your_bot_token_here
DISCORD_CHANNEL_ID=your_channel_id_here  # オプション
```

`.env.example`をコピーして使用することもできます。

### 2. Bot権限の設定

Discord Developer Portalで以下の権限を有効にしてください：

- ✅ `applications.commands` スコープ
- ✅ `bot` スコープ
- ✅ Message Content Intent（メッセージ内容の読み取り）
- ✅ Server Members Intent（オプション）

### 3. Botの実行

```bash
cd apps/form_bot
python bot.py
```

## 新しいフォームの追加方法

### 1. モーダルクラスを作成

`modals/your_form_modal.py`を作成：

```python
from .base_modal import BaseModal
import discord

class YourFormModal(BaseModal):
    field1 = discord.ui.TextInput(
        label='フィールド1',
        placeholder='入力してください',
        required=True
    )
    
    def __init__(self):
        super().__init__(title='あなたのフォーム')
    
    async def on_submit(self, interaction: discord.Interaction):
        # 処理を実装
        pass
```

### 2. Cogクラスを作成

`cogs/your_form_cog.py`を作成：

```python
from discord.ext import commands
from discord import app_commands
from modals.your_form_modal import YourFormModal

class YourFormCog(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
    
    @app_commands.command(name='yourform', description='説明')
    async def yourform(self, interaction):
        await interaction.response.send_modal(YourFormModal())

async def setup(bot):
    await bot.add_cog(YourFormCog(bot))
```

### 3. bot.pyに登録

`bot.py`の`load_cogs()`関数に追加：

```python
async def load_cogs():
    await bot.load_extension('cogs.feedback_form')
    await bot.load_extension('cogs.your_form_cog')  # 追加
```

## トラブルシューティング

### コマンドが表示されない

- Botを再起動してください
- コマンド同期には数分かかる場合があります
- Developer Modeで開発中のサーバーのみに同期することも可能です

### モーダルが表示されない

- Bot権限を確認してください
- インタラクションは3秒以内に応答する必要があります

## 今後の拡張予定

- [ ] データベース連携
- [ ] フォーム送信結果の通知機能
- [ ] 管理者用コマンド
- [ ] 複数ページのフォーム
- [ ] 選択式フォーム（Select Menu）

