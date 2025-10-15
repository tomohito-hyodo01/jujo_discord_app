# テスト用大会申込機能 使い方ガイド

## ✅ 実装完了した機能

### 1. 大会申込フロー（Select Menu方式）

```
ボタンクリック
    ↓
大会を選択（プルダウン）
    ↓
種別を選択（プルダウン）
    ↓
ペアを選択（プルダウン）
    ↓
確認画面
    ↓
[申込] または [キャンセル]
```

---

## 🏗️ アーキテクチャ

### 作成したファイル（効率的な設計）

```
services/                           # ビジネスロジック層（共通化）
├── database.py                     # DB接続（シングルトン）
├── tournament_service.py           # 大会関連の操作
└── player_service.py               # 選手関連の操作

views/                              # UI層
└── tournament_application_view.py  # 申込フロー全体
    ├── TournamentApplicationView   # 最初のボタン
    ├── TournamentSelectView        # 大会選択
    ├── TypeSelectView              # 種別選択
    ├── PairSelectView              # ペア選択
    └── ConfirmView                 # 確認・送信

cogs/                               # コマンド層
└── tournament_application.py       # /setup_application コマンド
```

### 設計の特徴

✅ **DB接続の共通化**
- `services/database.py` で一元管理
- シングルトンパターンで効率的

✅ **ビジネスロジックの分離**
- `TournamentService`: 大会関連の処理
- `PlayerService`: 選手関連の処理
- どこからでも再利用可能

✅ **UI層とロジック層の分離**
- ViewはUIのみ担当
- データ取得はServiceに委譲

---

## 🚀 使い方

### Step 1: Botを起動

```bash
cd /Users/hyodo/discord/jujo_discord_app
source venv/bin/activate
cd apps/form_bot
python3 bot.py
```

### Step 2: 申込ボタンを設置

Discordで以下のコマンドを実行：

```
/setup_application
```

### Step 3: ボタンをクリック

表示された「大会に申し込む」ボタンをクリック

### Step 4: 大会を選択

プルダウンから大会を選択：
- 荒川区シングルス大会2025
- 江戸川区ダブルス大会2025

### Step 5: 種別を選択

プルダウンから種別を選択：
- 一般
- 35
- 45 など

### Step 6: ペアを選択

プルダウンからペアを選択：
- 山田太郎
- 佐藤花子
- その他

### Step 7: 確認して申込

確認画面で内容を確認して：
- ✅ 申込ボタン → 申込完了
- ❌ キャンセルボタン → キャンセル

---

## 📊 動作確認ポイント

### 確認事項

1. ✅ ボタンが表示される
2. ✅ 大会のプルダウンにtournament_mstのデータが表示される
3. ✅ 種別のプルダウンにtypeの配列データが表示される
4. ✅ ペアのプルダウンにplayer_mstのデータが表示される
5. ✅ 「その他」オプションが表示される
6. ✅ 確認画面に選択内容が表示される
7. ✅ 申込ボタンで完了メッセージが表示される
8. ✅ キャンセルボタンで中断できる

### コンソールログ

正常に動作すると以下のようなログが表示されます：

```
📝 申込ボタンクリック: hyodo_san
📋 大会選択: 荒川区シングルス大会2025 by hyodo_san
📋 種別選択: 一般 by hyodo_san
👥 ペア選択: 1 by hyodo_san
✅ 申込確定: hyodo_san
   大会ID: arakawa_2025_singles
   種別: 一般
   ペア: 1
```

---

## 🔍 トラブルシューティング

### エラー: SUPABASE_URL and SUPABASE_KEY must be set

`.env`ファイルを確認：
```bash
SUPABASE_URL=https://tyjccdnccioagwfamtof.supabase.co
SUPABASE_KEY=eyJhbGciOiJ...
```

### プルダウンに何も表示されない

Supabaseのテーブルにテストデータが入っているか確認：
```sql
SELECT * FROM tournament_mst;
SELECT * FROM player_mst;
```

### ボタンをクリックしても反応しない

Botを再起動してください。

---

## 💡 次の実装予定

現在は「申込ボタン」を押しても**テストメッセージのみ**です。

次に実装する内容：
- [ ] 実際にtournament_registrationテーブルに保存
- [ ] 選手登録機能（/register_player）
- [ ] 申込一覧確認（/my_applications）

---

まずはこのテスト機能を動かしてみてください！

