# 📝 ボタン機能の使い方ガイド

ボタンをクリックするだけでフォームを表示できる機能を実装しました！

## 🎯 実装内容

### 作成したファイル

1. **`views/form_buttons.py`** - ボタンViewクラス
2. **`cogs/setup_forms.py`** - ボタン設置コマンド
3. **`bot.py`** - 永続的なボタンサポート追加

## 🚀 使い方

### Step 1: Botを再起動

```bash
cd /Users/hyodo/discord/jujo_discord_app
source venv/bin/activate
cd apps/form_bot
python3 bot.py
```

### Step 2: ボタンを設置

Discordで以下のコマンドを実行：

```
/setup_forms
```

このコマンドを実行すると、現在のチャンネルに以下のようなメッセージが表示されます：

```
┌─────────────────────────────────────┐
│  📋 フォームメニュー                  │
│                                     │
│  利用したいフォームのボタンを        │
│  クリックしてください                │
│                                     │
│  📝 テストフォーム                   │
│  テスト用のフォームです               │
│                                     │
│  💬 フィードバック                   │
│  ご意見・ご要望をお聞かせください     │
│                                     │
│  [📝 テストフォーム] [💬 フィードバック] │
└─────────────────────────────────────┘
```

### Step 3: ボタンをクリック

- 青い「📝 テストフォーム」ボタンをクリック → テストフォームが表示
- 緑の「💬 フィードバック」ボタンをクリック → フィードバックフォームが表示

## ✨ 特徴

### 1. 永続的なボタン
- ✅ Bot再起動後もボタンは動作し続ける
- ✅ ボタンは何度でもクリック可能
- ✅ 複数人が同時にクリックしても問題なし

### 2. 管理者権限が必要
- `/setup_forms` コマンドは管理者のみ実行可能
- 不要なスパムを防止

### 3. どのチャンネルにも設置可能
- `/setup_forms` を実行したチャンネルにボタンが設置される
- 複数のチャンネルに設置することも可能

## 🎨 カスタマイズ

### ボタンのスタイル

`views/form_buttons.py`で変更可能：

```python
@discord.ui.button(
    label='テストフォーム',        # ボタンのラベル
    style=discord.ButtonStyle.primary,  # ボタンの色
    emoji='📝',                    # 絵文字
    custom_id='test_form_button'  # 一意なID
)
```

**利用可能なスタイル:**
- `primary` - 青
- `secondary` - 灰色
- `success` - 緑
- `danger` - 赤
- `link` - リンク（URLが必要）

### 新しいボタンを追加

`views/form_buttons.py`に新しいメソッドを追加：

```python
@discord.ui.button(
    label='新しいフォーム',
    style=discord.ButtonStyle.danger,
    emoji='🆕',
    custom_id='new_form_button'
)
async def new_form_button(
    self, 
    interaction: discord.Interaction, 
    button: discord.ui.Button
):
    modal = YourNewModal()
    await interaction.response.send_modal(modal)
```

## 🔧 トラブルシューティング

### ボタンが動作しない

1. Botが起動しているか確認
2. ログに「✅ 永続的なボタンViewを登録しました」と表示されているか確認
3. Botを再起動してみる

### `/setup_forms` が表示されない

1. コマンド同期に時間がかかる場合があります（最大1時間）
2. Discordを再起動してみる
3. ブラウザ版Discordで試す

### ボタンがクリックできない

1. Bot再起動後、最初のクリック時には少し時間がかかることがあります
2. ボタンを再設置してみる（再度 `/setup_forms` 実行）

## 📊 コマンド一覧

| コマンド | 説明 | 権限 |
|---------|------|------|
| `/test` | テストフォームを表示 | 全員 |
| `/feedback` | フィードバックフォームを表示 | 全員 |
| `/setup_forms` | ボタンを設置 | 管理者のみ |

## 💡 ヒント

- ピン留め機能を使うと、ボタンメッセージが常に見やすい位置に表示されます
- 複数のフォームボタンを1つのメッセージにまとめられます（最大25個まで）
- ボタンは5行まで配置可能（1行最大5個）

