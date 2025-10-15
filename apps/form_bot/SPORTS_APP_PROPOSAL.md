# スポーツ大会申込アプリ 実装提案書

## 📋 要件整理

### 機能要件
1. **大会チャンネルごとにボタン配置**
   - 各チャンネルに「大会申込」ボタンを設置
   - ボタンクリックで申込フォーム表示

2. **大会ごとに異なるフォーム**
   - 大会IDごとにフォーム定義
   - 動的にフォームを生成

3. **データ保存**
   - Googleスプレッドシートに保存
   - または データベースに保存

4. **マスターデータ連携**
   - プルダウン項目をスプレッドシート/DBから取得
   - 動的に選択肢を表示

---

## 🏗️ システム設計

### アーキテクチャ

```
Discord UI
    ↓
Bot (Python)
    ↓
┌─────────────────────────┐
│ Form Config Manager     │ ← 大会設定管理
│ (大会ごとのフォーム定義) │
└─────────────────────────┘
    ↓
┌─────────────────────────┐
│ Dynamic Form Generator  │ ← 動的フォーム生成
│ (設定に基づいてフォーム作成)│
└─────────────────────────┘
    ↓
┌─────────────────────────┐
│ Data Storage Layer      │ ← データ保存
│ ・Google Sheets API     │
│ ・Database (SQLite/PG)  │
└─────────────────────────┘
```

---

## 📁 ディレクトリ構成（拡張版）

```
apps/form_bot/
├── bot.py
├── cogs/
│   ├── tournament_registration.py  # 大会申込Cog
│   └── tournament_admin.py         # 大会管理Cog (管理者用)
├── modals/
│   ├── dynamic_tournament_modal.py # 動的フォーム
│   └── tournament_modal_factory.py # フォーム生成ファクトリー
├── views/
│   ├── tournament_buttons.py       # 大会申込ボタン
│   └── tournament_button_factory.py # ボタン生成ファクトリー
├── models/
│   ├── tournament.py               # 大会モデル
│   ├── registration.py             # 申込データモデル
│   └── field_config.py             # フィールド設定モデル
├── services/
│   ├── google_sheets_service.py    # スプレッドシート連携
│   ├── database_service.py         # DB連携
│   └── master_data_service.py      # マスターデータ取得
├── config/
│   ├── tournaments.json            # 大会設定ファイル
│   └── field_definitions.json      # フィールド定義
└── utils/
    ├── form_validator.py           # バリデーション
    └── data_formatter.py           # データ整形
```

---

## 🔧 実装方式の提案

### 方式1: 設定ファイルベース（推奨）

**特徴:**
- 大会設定をJSONファイルで管理
- コード変更なしで大会追加可能
- 開発が比較的簡単

**大会設定例 (`config/tournaments.json`):**

```json
{
  "tournaments": [
    {
      "id": "basketball_2025_spring",
      "name": "バスケットボール春季大会2025",
      "channel_id": "1234567890",
      "form_fields": [
        {
          "id": "team_name",
          "label": "チーム名",
          "type": "text",
          "required": true,
          "max_length": 50
        },
        {
          "id": "category",
          "label": "参加カテゴリー",
          "type": "select",
          "required": true,
          "options_source": "sheet",
          "options_sheet": "categories",
          "options_column": "A"
        },
        {
          "id": "member_count",
          "label": "参加人数",
          "type": "number",
          "required": true,
          "min": 5,
          "max": 15
        },
        {
          "id": "remarks",
          "label": "備考",
          "type": "textarea",
          "required": false,
          "max_length": 500
        }
      ],
      "storage": {
        "type": "google_sheets",
        "spreadsheet_id": "YOUR_SPREADSHEET_ID",
        "sheet_name": "basketball_2025_spring"
      }
    },
    {
      "id": "soccer_2025_summer",
      "name": "サッカー夏季大会2025",
      "channel_id": "0987654321",
      "form_fields": [
        {
          "id": "team_name",
          "label": "チーム名",
          "type": "text",
          "required": true
        },
        {
          "id": "division",
          "label": "ディビジョン",
          "type": "select",
          "required": true,
          "options": ["1部", "2部", "3部"]
        }
      ],
      "storage": {
        "type": "database",
        "table": "soccer_registrations"
      }
    }
  ]
}
```

---

### 方式2: データベーススキーマベース

**特徴:**
- 大会設定をDBで管理
- Web管理画面で設定変更可能
- より柔軟だが実装が複雑

**テーブル設計:**

```sql
-- 大会テーブル
CREATE TABLE tournaments (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    channel_id VARCHAR(50) NOT NULL,
    storage_type VARCHAR(20),
    storage_config JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- フォームフィールド定義
CREATE TABLE form_fields (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tournament_id VARCHAR(100),
    field_id VARCHAR(50),
    label VARCHAR(100),
    field_type VARCHAR(20),
    required BOOLEAN,
    options JSON,
    validation_rules JSON,
    display_order INT,
    FOREIGN KEY (tournament_id) REFERENCES tournaments(id)
);

-- 申込データ
CREATE TABLE registrations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tournament_id VARCHAR(100),
    user_id VARCHAR(50),
    user_name VARCHAR(100),
    form_data JSON,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tournament_id) REFERENCES tournaments(id)
);

-- マスターデータ（プルダウン用）
CREATE TABLE master_data (
    id INT AUTO_INCREMENT PRIMARY KEY,
    category VARCHAR(50),
    value VARCHAR(100),
    display_order INT
);
```

---

## 💾 データ保存方式の比較

### A. Googleスプレッドシート

**メリット:**
- ✅ 管理者が簡単に閲覧・編集できる
- ✅ 初期セットアップが簡単
- ✅ バックアップ不要（Google管理）
- ✅ 共有が簡単

**デメリット:**
- ❌ API制限がある（1分間に60リクエスト）
- ❌ 大量データに弱い
- ❌ 複雑な検索・集計が難しい

**実装難易度:** ⭐⭐⭐☆☆

**推奨ケース:**
- 大会数が少ない（10大会以下）
- 申込件数が少ない（各大会100件以下）
- すぐに始めたい

---

### B. データベース（SQLite / PostgreSQL）

**メリット:**
- ✅ 高速
- ✅ 大量データに対応
- ✅ 複雑な検索・集計が可能
- ✅ トランザクション対応

**デメリット:**
- ❌ 管理画面が別途必要
- ❌ バックアップが必要
- ❌ セットアップがやや複雑

**実装難易度:** ⭐⭐⭐⭐☆

**推奨ケース:**
- 大会数が多い
- 申込件数が多い
- 複雑な集計が必要

---

### C. ハイブリッド（推奨）

**構成:**
- **マスターデータ（プルダウン項目等）**: Googleスプレッドシート
- **申込データ**: データベース
- **バックアップ**: 定期的にスプレッドシートにエクスポート

**メリット:**
- ✅ 管理者がマスターデータを簡単に編集
- ✅ 申込データは高速処理
- ✅ スプレッドシートでバックアップ・閲覧

---

## 🚀 実装ステップ

### Phase 1: 基本システム構築（1週間）

1. **大会設定ファイルの作成**
   - `config/tournaments.json`
   - 初期データ投入

2. **動的フォーム生成機能**
   - `modals/dynamic_tournament_modal.py`
   - 設定に基づいてフォームを動的生成

3. **大会申込ボタン**
   - `views/tournament_buttons.py`
   - チャンネルIDに応じたボタン表示

4. **データ保存（スプレッドシート）**
   - Google Sheets API連携
   - 基本的な保存機能

### Phase 2: マスターデータ連携（3日）

1. **マスターデータ取得機能**
   - スプレッドシートからプルダウン項目取得
   - キャッシュ機能

2. **Select Menuの実装**
   - Discordの`Select Menu`コンポーネント使用
   - 動的に選択肢を表示

### Phase 3: DB対応（1週間）

1. **データベース設計**
   - テーブル作成
   - マイグレーション

2. **DB保存機能**
   - SQLAlchemy or asyncpg使用
   - トランザクション対応

3. **管理コマンド**
   - `/tournament_list` - 大会一覧
   - `/tournament_stats` - 申込状況確認

### Phase 4: 高度な機能（オプション）

1. **申込確認・編集**
   - ユーザーが自分の申込を確認
   - 申込内容の修正

2. **締切管理**
   - 申込期限の設定
   - 期限後は自動でボタン無効化

3. **通知機能**
   - 申込完了通知
   - 管理者への新規申込通知

---

## 💡 推奨実装プラン

### 最小構成（まず試す）

```
Phase 1のみ実装
↓
設定ファイル + Googleスプレッドシート
↓
1〜2大会で試験運用
↓
問題なければ拡張
```

**期間:** 1週間
**難易度:** ⭐⭐⭐☆☆

### 本格運用

```
Phase 1 → Phase 2 → Phase 3
↓
ハイブリッド方式
（マスター: Sheet / データ: DB）
↓
管理コマンド実装
↓
本番運用
```

**期間:** 3週間
**難易度:** ⭐⭐⭐⭐☆

---

## 🔐 セキュリティ考慮事項

1. **権限管理**
   - 申込ボタンは誰でも押せる
   - 管理コマンドは管理者のみ

2. **データ検証**
   - 入力値のバリデーション
   - SQLインジェクション対策

3. **個人情報保護**
   - 必要最小限の情報のみ取得
   - 保存データの暗号化検討

---

## 📊 技術スタック

### 必須
- Python 3.8+
- discord.py 2.6+
- python-dotenv

### Googleスプレッドシート使用時
- gspread
- google-auth
- google-auth-oauthlib

### データベース使用時
- SQLAlchemy (ORM)
- alembic (マイグレーション)
- PostgreSQL or SQLite

---

## 📝 次のアクション

1. **要件の詳細確認**
   - 大会数の見込み
   - 申込件数の見込み
   - 必要なフォーム項目

2. **データ保存方式の決定**
   - スプレッドシート / DB / ハイブリッド

3. **実装開始**
   - Phase 1から段階的に実装

実装を進めますか？どの方式で進めるか教えてください！

