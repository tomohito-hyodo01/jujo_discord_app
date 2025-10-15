# ユーザーマスター管理機能 設計書

## 📋 要件整理（補足反映）

### ユーザーマスター情報（共通項目）
全大会で共通して必要な個人情報：
- 氏名
- 住所
- 電話番号
- 生年月日

### 大会固有情報
大会ごとに異なる項目（例：テニスダブルス）：
- ペア相手の名前
- 参加カテゴリー
- 過去の実績
- その他大会特有の情報

---

## 🏗️ システム設計

### データフロー

```
【初回利用時】
ユーザーがDiscord参加
    ↓
/register_profile コマンド実行
    ↓
プロフィール登録フォーム表示
    ↓
氏名・住所・電話番号・生年月日を入力
    ↓
ユーザーマスターDBに保存
    ↓
登録完了


【大会申込時】
ボタンクリック
    ↓
バックエンドでuser_idからマスター情報を取得
    ↓
マスター情報が存在する？
    ├─ YES → 大会固有項目のみのフォーム表示
    └─ NO  → 「先にプロフィール登録してください」メッセージ
    ↓
ユーザーが大会固有項目を入力
    ↓
マスター情報 + 大会固有情報 を結合して保存
    ↓
申込完了
```

---

## 💾 データベース設計

### テーブル構成

#### 1. users（ユーザーマスター）

```sql
CREATE TABLE users (
    discord_user_id VARCHAR(50) PRIMARY KEY,      -- Discord User ID
    discord_username VARCHAR(100) NOT NULL,       -- Discordユーザー名
    full_name VARCHAR(100) NOT NULL,              -- 氏名
    postal_code VARCHAR(10),                      -- 郵便番号
    address VARCHAR(255) NOT NULL,                -- 住所
    phone_number VARCHAR(20) NOT NULL,            -- 電話番号
    birth_date DATE NOT NULL,                     -- 生年月日
    email VARCHAR(100),                           -- メールアドレス（オプション）
    emergency_contact VARCHAR(100),               -- 緊急連絡先（オプション）
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_discord_user_id (discord_user_id)
);
```

#### 2. tournaments（大会マスター）

```sql
CREATE TABLE tournaments (
    id VARCHAR(100) PRIMARY KEY,                  -- 大会ID
    name VARCHAR(255) NOT NULL,                   -- 大会名
    sport_type VARCHAR(50) NOT NULL,              -- スポーツ種別
    channel_id VARCHAR(50) NOT NULL,              -- Discord チャンネルID
    start_date DATE,                              -- 開催日
    deadline_date DATETIME,                       -- 申込締切
    max_participants INT,                         -- 最大参加者数
    config JSON,                                  -- フォーム設定（JSON）
    storage_config JSON,                          -- 保存先設定
    status VARCHAR(20) DEFAULT 'active',          -- ステータス
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_channel_id (channel_id)
);
```

#### 3. registrations（大会申込データ）

```sql
CREATE TABLE registrations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tournament_id VARCHAR(100) NOT NULL,          -- 大会ID
    discord_user_id VARCHAR(50) NOT NULL,         -- Discord User ID
    
    -- マスター情報のスナップショット（申込時点の情報を保持）
    full_name VARCHAR(100) NOT NULL,
    address VARCHAR(255) NOT NULL,
    phone_number VARCHAR(20) NOT NULL,
    birth_date DATE NOT NULL,
    
    -- 大会固有情報（JSON形式で柔軟に対応）
    tournament_specific_data JSON NOT NULL,
    
    -- メタ情報
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'submitted',       -- 申込ステータス
    
    FOREIGN KEY (tournament_id) REFERENCES tournaments(id),
    FOREIGN KEY (discord_user_id) REFERENCES users(discord_user_id),
    UNIQUE KEY unique_tournament_user (tournament_id, discord_user_id),
    INDEX idx_tournament_id (tournament_id),
    INDEX idx_discord_user_id (discord_user_id)
);
```

### データ例

**users テーブル:**

| discord_user_id | discord_username | full_name | address | phone_number | birth_date |
|----------------|------------------|-----------|---------|--------------|------------|
| 123456789 | hyodo_san | 兵藤太郎 | 東京都渋谷区... | 090-1234-5678 | 1990-01-15 |

**registrations テーブル:**

| id | tournament_id | discord_user_id | full_name | tournament_specific_data |
|----|---------------|-----------------|-----------|--------------------------|
| 1 | tennis_doubles_2025 | 123456789 | 兵藤太郎 | `{"partner_name": "山田花子", "category": "一般"}` |

---

## 🔄 実装フロー詳細

### 1. プロフィール登録フロー

```python
# ユーザーが /register_profile を実行
↓
# 既に登録済みかチェック
if user_exists(user_id):
    return "既に登録済みです。/my_profile で確認できます"
↓
# プロフィール登録フォームを表示
ProfileRegistrationModal(
    - 氏名
    - 郵便番号
    - 住所
    - 電話番号
    - 生年月日
)
↓
# フォーム送信
↓
# バリデーション
- 氏名：必須、2-50文字
- 電話番号：形式チェック
- 生年月日：YYYY-MM-DD形式、18歳以上
↓
# DBに保存
users.insert({
    discord_user_id: interaction.user.id,
    discord_username: interaction.user.name,
    full_name: form_data.full_name,
    ...
})
↓
# 完了メッセージ
"✅ プロフィール登録が完了しました！"
```

---

### 2. 大会申込フロー（改善版）

```python
# ユーザーが大会申込ボタンをクリック
↓
# マスター情報を取得
user_profile = get_user_profile(interaction.user.id)
↓
# 登録済みかチェック
if not user_profile:
    return """
    ❌ プロフィールが未登録です
    先に /register_profile で登録してください
    """
↓
# 大会固有項目のみのフォームを表示
TournamentSpecificModal(
    tournament_config,
    user_profile  # マスター情報を渡す
)
↓
# フォーム内容:
# ========================================
# 【あなたのプロフィール】（表示のみ）
# 氏名: 兵藤太郎
# 電話: 090-1234-5678
# 生年月日: 1990-01-15
# ※変更は /update_profile から
# ========================================
# 
# 【テニスダブルス固有情報】（入力）
# - ペア相手の名前: [ 入力欄 ]
# - 参加カテゴリー: [ 選択 ]
# - 過去の実績: [ 入力欄 ]
# ========================================
↓
# フォーム送信
↓
# データを結合して保存
registrations.insert({
    tournament_id: tournament_id,
    discord_user_id: interaction.user.id,
    
    # マスター情報のスナップショット
    full_name: user_profile.full_name,
    address: user_profile.address,
    phone_number: user_profile.phone_number,
    birth_date: user_profile.birth_date,
    
    # 大会固有情報
    tournament_specific_data: {
        partner_name: form_data.partner_name,
        category: form_data.category,
        experience: form_data.experience
    }
})
↓
# Googleスプレッドシートにも保存（オプション）
save_to_spreadsheet({
    ...user_profile,
    ...tournament_specific_data
})
↓
# 完了メッセージ
"""
✅ 申込完了
【登録情報】
氏名: 兵藤太郎
ペア: 山田花子
カテゴリー: 一般
"""
```

---

## 💻 実装コード例

### 1. プロフィール登録モーダル

```python
class ProfileRegistrationModal(discord.ui.Modal):
    """ユーザープロフィール登録フォーム"""
    
    full_name = discord.ui.TextInput(
        label='氏名（フルネーム）',
        placeholder='例：山田太郎',
        required=True,
        max_length=50
    )
    
    postal_code = discord.ui.TextInput(
        label='郵便番号',
        placeholder='例：123-4567',
        required=False,
        max_length=10
    )
    
    address = discord.ui.TextInput(
        label='住所',
        placeholder='例：東京都渋谷区〇〇1-2-3',
        style=discord.TextStyle.paragraph,
        required=True,
        max_length=200
    )
    
    phone_number = discord.ui.TextInput(
        label='電話番号',
        placeholder='例：090-1234-5678',
        required=True,
        max_length=20
    )
    
    birth_date = discord.ui.TextInput(
        label='生年月日',
        placeholder='例：1990-01-15',
        required=True,
        max_length=10
    )
    
    def __init__(self):
        super().__init__(title='プロフィール登録')
    
    async def on_submit(self, interaction: discord.Interaction):
        # DBに保存
        user_service = UserService()
        
        try:
            await user_service.create_profile(
                discord_user_id=str(interaction.user.id),
                discord_username=interaction.user.name,
                full_name=self.full_name.value,
                postal_code=self.postal_code.value,
                address=self.address.value,
                phone_number=self.phone_number.value,
                birth_date=self.birth_date.value
            )
            
            embed = discord.Embed(
                title='✅ プロフィール登録完了',
                description='大会への申込が可能になりました！',
                color=discord.Color.green()
            )
            embed.add_field(name='氏名', value=self.full_name.value)
            embed.add_field(name='電話番号', value=self.phone_number.value)
            
            await interaction.response.send_message(embed=embed, ephemeral=True)
            
        except Exception as e:
            await interaction.response.send_message(
                f'❌ エラー: {str(e)}',
                ephemeral=True
            )
```

---

### 2. 大会固有フォーム（マスター情報統合版）

```python
class TournamentRegistrationModal(discord.ui.Modal):
    """大会申込フォーム（マスター情報統合）"""
    
    def __init__(self, tournament_config: dict, user_profile: dict):
        super().__init__(title=tournament_config['name'][:45])
        
        self.tournament_config = tournament_config
        self.user_profile = user_profile
        
        # 大会固有フィールドのみを動的に追加
        for field_config in tournament_config['specific_fields']:
            self._add_field(field_config)
    
    def _add_field(self, field_config: dict):
        """フィールドを追加"""
        text_input = discord.ui.TextInput(
            label=field_config['label'],
            placeholder=field_config.get('placeholder', ''),
            required=field_config.get('required', False),
            max_length=field_config.get('max_length', 100),
            style=discord.TextStyle.paragraph if field_config.get('type') == 'long_text' else discord.TextStyle.short
        )
        text_input.custom_id = field_config['id']
        self.add_item(text_input)
    
    async def on_submit(self, interaction: discord.Interaction):
        # 大会固有データを収集
        specific_data = {}
        for child in self.children:
            if isinstance(child, discord.ui.TextInput):
                specific_data[child.custom_id] = child.value
        
        # 完全なデータを作成（マスター + 固有）
        registration_data = {
            'tournament_id': self.tournament_config['id'],
            'discord_user_id': str(interaction.user.id),
            
            # マスター情報（スナップショット）
            'full_name': self.user_profile['full_name'],
            'address': self.user_profile['address'],
            'phone_number': self.user_profile['phone_number'],
            'birth_date': self.user_profile['birth_date'],
            
            # 大会固有情報
            'tournament_specific_data': specific_data
        }
        
        # 保存
        registration_service = RegistrationService()
        await registration_service.save(registration_data)
        
        # 確認メッセージ
        embed = discord.Embed(
            title='✅ 申込完了',
            description=f'**{self.tournament_config["name"]}** への申込を受け付けました',
            color=discord.Color.green()
        )
        
        # マスター情報を表示
        embed.add_field(name='📋 登録情報', value='', inline=False)
        embed.add_field(name='氏名', value=self.user_profile['full_name'], inline=True)
        embed.add_field(name='電話番号', value=self.user_profile['phone_number'], inline=True)
        
        # 大会固有情報を表示
        embed.add_field(name='🎾 大会情報', value='', inline=False)
        for key, value in specific_data.items():
            field_label = self._get_field_label(key)
            embed.add_field(name=field_label, value=value, inline=False)
        
        await interaction.response.send_message(embed=embed, ephemeral=True)
```

---

## 📋 大会設定ファイル例（改善版）

**`config/tournaments/tennis_doubles_2025.json`:**

```json
{
  "id": "tennis_doubles_2025_spring",
  "name": "テニスダブルス春季大会2025",
  "sport_type": "tennis",
  "channel_id": "1234567890",
  "deadline": "2025-03-31T23:59:59",
  
  "requires_user_profile": true,
  
  "specific_fields": [
    {
      "id": "partner_name",
      "label": "ペア相手の氏名",
      "type": "short_text",
      "placeholder": "例：山田花子",
      "required": true,
      "max_length": 50
    },
    {
      "id": "partner_phone",
      "label": "ペア相手の電話番号",
      "type": "short_text",
      "placeholder": "例：080-9876-5432",
      "required": true,
      "max_length": 20
    },
    {
      "id": "category",
      "label": "参加カテゴリー",
      "type": "select",
      "required": true,
      "options_source": "sheet",
      "options": ["一般", "学生", "シニア"]
    },
    {
      "id": "experience",
      "label": "過去の大会実績",
      "type": "long_text",
      "placeholder": "過去の実績があれば記入してください",
      "required": false,
      "max_length": 300
    }
  ],
  
  "storage": {
    "type": "database",
    "backup_to_sheet": true,
    "spreadsheet_id": "1ABC...XYZ",
    "sheet_name": "tennis_doubles_2025"
  }
}
```

---

## 🎯 コマンド一覧

### ユーザー向けコマンド

| コマンド | 説明 | 備考 |
|---------|------|------|
| `/register_profile` | プロフィール新規登録 | 初回のみ |
| `/my_profile` | 自分のプロフィール確認 | - |
| `/update_profile` | プロフィール更新 | - |
| `/my_registrations` | 自分の申込一覧 | - |

### 管理者向けコマンド

| コマンド | 説明 | 備考 |
|---------|------|------|
| `/setup_tournament [id]` | 大会ボタン設置 | 管理者のみ |
| `/tournament_stats [id]` | 申込状況確認 | 管理者のみ |
| `/export_registrations [id]` | 申込データエクスポート | 管理者のみ |

---

## ✅ メリット

### 1. ユーザー体験の向上
- ✅ 一度登録すれば、以降は大会固有項目のみ入力
- ✅ 入力の手間が大幅に削減
- ✅ 入力ミスが減少

### 2. データ管理の効率化
- ✅ ユーザー情報の一元管理
- ✅ データの重複・不整合を防止
- ✅ プロフィール更新が一括反映

### 3. 運営側のメリット
- ✅ 参加者情報の正確性向上
- ✅ 複数大会での参加者管理が容易
- ✅ 統計・分析が簡単

---

## 🔒 セキュリティ・プライバシー

### 個人情報保護

1. **アクセス制御**
   - 自分のプロフィールのみ閲覧・編集可能
   - 管理者も個人情報は最小限のみ閲覧

2. **データ保存**
   - DB接続は暗号化
   - パスワードは環境変数管理

3. **GDPR対応**
   - `/delete_my_data` コマンドで完全削除
   - データ保持期間の設定

---

## 📊 データベース or スプレッドシート？

### 推奨：**データベース（PostgreSQL or MySQL）**

**理由：**
- ✅ ユーザーマスターとの結合が必要
- ✅ リレーション管理が重要
- ✅ 個人情報の安全性
- ✅ 複数大会での検索・集計

**スプレッドシートは補助的に使用：**
- マスターデータ（プルダウン項目）
- バックアップ・閲覧用

---

この設計で実装を進めますか？

