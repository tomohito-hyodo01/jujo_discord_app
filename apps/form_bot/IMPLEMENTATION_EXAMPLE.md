# 実装例：動的フォーム生成

## 🎯 シンプルな実装例

以下は、設定ファイルベースで動的にフォームを生成する実装例です。

---

## 📄 設定ファイル例

**`config/tournaments/basketball_2025.json`:**

```json
{
  "id": "basketball_2025_spring",
  "name": "バスケットボール春季大会2025",
  "description": "2025年春季バスケットボール大会の申込フォーム",
  "channel_id": "1234567890",
  "deadline": "2025-03-31T23:59:59",
  "fields": [
    {
      "id": "team_name",
      "label": "チーム名",
      "type": "short_text",
      "placeholder": "例：〇〇高校バスケ部",
      "required": true,
      "max_length": 50
    },
    {
      "id": "representative",
      "label": "代表者名",
      "type": "short_text",
      "placeholder": "例：山田太郎",
      "required": true,
      "max_length": 30
    },
    {
      "id": "email",
      "label": "メールアドレス",
      "type": "short_text",
      "placeholder": "例：team@example.com",
      "required": true,
      "max_length": 100
    },
    {
      "id": "phone",
      "label": "電話番号",
      "type": "short_text",
      "placeholder": "例：090-1234-5678",
      "required": true,
      "max_length": 20
    },
    {
      "id": "remarks",
      "label": "備考・特記事項",
      "type": "long_text",
      "placeholder": "その他ご連絡事項があれば記入してください",
      "required": false,
      "max_length": 500
    }
  ],
  "storage": {
    "type": "google_sheets",
    "spreadsheet_id": "1ABC...XYZ",
    "sheet_name": "basketball_2025_spring",
    "columns": ["timestamp", "user_id", "user_name", "team_name", "representative", "email", "phone", "remarks"]
  }
}
```

---

## 💻 コード実装例

### 1. 動的モーダル生成

**`modals/dynamic_tournament_modal.py`:**

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
動的大会申込モーダル
"""

import discord
from datetime import datetime
from typing import List, Dict, Any


class DynamicTournamentModal(discord.ui.Modal):
    """
    設定ファイルに基づいて動的に生成される大会申込フォーム
    """
    
    def __init__(self, tournament_config: Dict[str, Any]):
        """
        Args:
            tournament_config: 大会設定辞書
        """
        super().__init__(title=tournament_config['name'][:45])  # Discordの制限
        self.tournament_config = tournament_config
        self.tournament_id = tournament_config['id']
        
        # 動的にフィールドを追加（最大5つまで）
        for field_config in tournament_config['fields'][:5]:
            self._add_field(field_config)
    
    def _add_field(self, field_config: Dict[str, Any]):
        """フィールドを動的に追加"""
        field_type = field_config['type']
        
        # テキストスタイルを決定
        if field_type == 'long_text':
            style = discord.TextStyle.paragraph
        else:
            style = discord.TextStyle.short
        
        # TextInputを作成して追加
        text_input = discord.ui.TextInput(
            label=field_config['label'],
            placeholder=field_config.get('placeholder', ''),
            required=field_config.get('required', False),
            max_length=field_config.get('max_length', 100),
            style=style
        )
        
        # フィールドIDを保存（後で値を取得するため）
        text_input.custom_id = field_config['id']
        
        # モーダルに追加
        self.add_item(text_input)
    
    async def on_submit(self, interaction: discord.Interaction):
        """フォーム送信時の処理"""
        # 入力値を収集
        form_data = {}
        for child in self.children:
            if isinstance(child, discord.ui.TextInput):
                form_data[child.custom_id] = child.value
        
        # メタデータを追加
        submission_data = {
            'tournament_id': self.tournament_id,
            'tournament_name': self.tournament_config['name'],
            'user_id': str(interaction.user.id),
            'user_name': interaction.user.name,
            'timestamp': datetime.now().isoformat(),
            'form_data': form_data
        }
        
        # データを保存
        from services.storage_service import StorageService
        storage = StorageService(self.tournament_config['storage'])
        
        try:
            await storage.save(submission_data)
            
            # 成功メッセージ
            embed = discord.Embed(
                title='✅ 申込完了',
                description=f'**{self.tournament_config["name"]}** への申込を受け付けました！',
                color=discord.Color.green()
            )
            
            # 入力内容を表示
            for field_id, value in form_data.items():
                field_label = self._get_field_label(field_id)
                embed.add_field(
                    name=field_label,
                    value=value if value else '（未入力）',
                    inline=False
                )
            
            embed.set_footer(text='確認メールをお送りしました')
            
            await interaction.response.send_message(embed=embed, ephemeral=True)
            
            print(f'✅ 申込受付: {self.tournament_id} / {interaction.user.name}')
            
        except Exception as e:
            print(f'❌ 保存エラー: {e}')
            await interaction.response.send_message(
                '❌ エラーが発生しました。もう一度お試しください。',
                ephemeral=True
            )
    
    def _get_field_label(self, field_id: str) -> str:
        """フィールドIDからラベルを取得"""
        for field in self.tournament_config['fields']:
            if field['id'] == field_id:
                return field['label']
        return field_id
```

---

### 2. ボタンView

**`views/tournament_button_view.py`:**

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
大会申込ボタン
"""

import discord
from modals.dynamic_tournament_modal import DynamicTournamentModal
from config.tournament_loader import TournamentLoader


class TournamentButtonView(discord.ui.View):
    """大会申込ボタンのView"""
    
    def __init__(self, tournament_id: str):
        super().__init__(timeout=None)
        self.tournament_id = tournament_id
        
        # 大会設定を読み込み
        self.tournament_config = TournamentLoader.load(tournament_id)
        
        # ボタンのラベルを設定
        self.register_button.label = f'{self.tournament_config["name"]}に申し込む'
    
    @discord.ui.button(
        label='大会に申し込む',
        style=discord.ButtonStyle.primary,
        emoji='📝',
        custom_id='tournament_register'
    )
    async def register_button(
        self,
        interaction: discord.Interaction,
        button: discord.ui.Button
    ):
        """申込ボタンがクリックされた時"""
        print(f'📝 申込ボタンクリック: {self.tournament_id} / {interaction.user.name}')
        
        # 動的にモーダルを生成
        modal = DynamicTournamentModal(self.tournament_config)
        await interaction.response.send_modal(modal)


def create_tournament_embed(tournament_config: dict) -> discord.Embed:
    """大会案内のEmbedを作成"""
    embed = discord.Embed(
        title=f'📋 {tournament_config["name"]}',
        description=tournament_config.get('description', '大会への申込はこちら'),
        color=discord.Color.blue()
    )
    
    if 'deadline' in tournament_config:
        embed.add_field(
            name='📅 申込締切',
            value=tournament_config['deadline'],
            inline=False
        )
    
    embed.add_field(
        name='📝 申込方法',
        value='下のボタンをクリックして申込フォームに入力してください',
        inline=False
    )
    
    embed.set_footer(text='お問い合わせは運営チームまで')
    
    return embed
```

---

### 3. セットアップコマンド

**`cogs/tournament_setup.py`:**

```python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
大会セットアップCog
"""

import discord
from discord.ext import commands
from discord import app_commands
from views.tournament_button_view import TournamentButtonView, create_tournament_embed
from config.tournament_loader import TournamentLoader


class TournamentSetupCog(commands.Cog):
    """大会セットアップ機能"""
    
    def __init__(self, bot: commands.Bot):
        self.bot = bot
    
    @app_commands.command(
        name='setup_tournament',
        description='大会申込ボタンを設置します'
    )
    @app_commands.describe(
        tournament_id='大会ID（例：basketball_2025_spring）'
    )
    @app_commands.default_permissions(administrator=True)
    async def setup_tournament(
        self,
        interaction: discord.Interaction,
        tournament_id: str
    ):
        """大会申込ボタンを設置"""
        try:
            # 大会設定を読み込み
            tournament_config = TournamentLoader.load(tournament_id)
            
            # Embedとボタンを作成
            embed = create_tournament_embed(tournament_config)
            view = TournamentButtonView(tournament_id)
            
            # 設置完了メッセージ
            await interaction.response.send_message(
                f'✅ **{tournament_config["name"]}** の申込ボタンを設置しました！',
                ephemeral=True
            )
            
            # ボタン付きメッセージを送信
            await interaction.channel.send(embed=embed, view=view)
            
            print(f'📌 大会ボタン設置: {tournament_id} / {interaction.channel.name}')
            
        except FileNotFoundError:
            await interaction.response.send_message(
                f'❌ 大会ID `{tournament_id}` が見つかりません',
                ephemeral=True
            )
        except Exception as e:
            print(f'❌ エラー: {e}')
            await interaction.response.send_message(
                '❌ エラーが発生しました',
                ephemeral=True
            )


async def setup(bot: commands.Bot):
    await bot.add_cog(TournamentSetupCog(bot))
```

---

## 📊 使用イメージ

### 管理者の操作

```
1. 大会設定ファイルを作成
   config/tournaments/basketball_2025.json

2. Discordで大会チャンネルに移動

3. コマンド実行
   /setup_tournament tournament_id:basketball_2025_spring

4. ボタン付きメッセージが表示される
```

### ユーザーの操作

```
1. チャンネルでボタンを発見

2. 「バスケットボール春季大会2025に申し込む」ボタンをクリック

3. フォームが表示される（5項目）
   - チーム名
   - 代表者名
   - メールアドレス
   - 電話番号
   - 備考

4. 入力して送信

5. 完了メッセージが表示される
```

---

## 🔄 フロー図

```
大会設定ファイル作成
    ↓
/setup_tournament 実行
    ↓
チャンネルにボタン配置
    ↓
ユーザーがボタンクリック
    ↓
動的にフォーム生成・表示
    ↓
ユーザーが入力・送信
    ↓
データ保存（Sheet or DB）
    ↓
確認メッセージ表示
```

---

## 💡 拡張ポイント

### 1. Select Menuの実装

プルダウンが必要な場合：

```python
# フィールド設定にselectタイプを追加
{
  "id": "category",
  "label": "参加カテゴリー",
  "type": "select",
  "options": ["一般", "学生", "シニア"]
}
```

→ モーダルの前にSelect Menuを表示

### 2. 複数ページフォーム

5項目以上の場合は複数ページに分割

### 3. 申込確認機能

```
/my_registrations → 自分の申込一覧表示
```

---

この実装例を基に、実際のコードを作成しますか？

