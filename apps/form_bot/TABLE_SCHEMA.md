# データベーステーブル定義書

## 📊 テーブル構成

---

## 1️⃣ player_mst（選手マスタ）

### 用途
選手の基本情報を管理するマスターテーブル

### カラム定義

| カラム名 | 型 | 制約 | 説明 | 入力元 |
|---------|---|------|------|--------|
| **player_id** | SERIAL | PRIMARY KEY, NOT NULL | 選手ID（自動採番） | 自動 |
| **discord_id** | TEXT | UNIQUE | Discord User ID（nullable） | Discord |
| jsta_number | TEXT | - | 日本連盟登録番号 | フォーム |
| **player_name** | TEXT | NOT NULL | 氏名 | フォーム |
| post_number | TEXT | - | 郵便番号 | フォーム |
| **address** | TEXT | NOT NULL | 住所 | フォーム |
| **phone_number** | TEXT | NOT NULL | 電話番号 | フォーム |
| **birth_date** | DATE | NOT NULL | 生年月日 | フォーム |
| **sex** | INTEGER | NOT NULL, CHECK (0 or 1) | 性別（0:男子, 1:女子） | フォーム |
| affiliated_club | VARCHAR(100) | - | 所属クラブ名 | フォーム |
| **tokyo_flg** | BOOLEAN | DEFAULT false | 東京都への登録フラグ | 管理画面 |
| **koto_flg** | BOOLEAN | DEFAULT false | 江東区への登録フラグ | 管理画面 |
| **edogawa_flg** | BOOLEAN | DEFAULT false | 江戸川区への登録フラグ | 管理画面 |
| **chuo_flg** | BOOLEAN | DEFAULT false | 中央区への登録フラグ | 管理画面 |
| **sumida_flg** | BOOLEAN | DEFAULT false | 墨田区への登録フラグ | 管理画面 |
| created_at | TIMESTAMP | - | 作成日時 | 自動 |
| updated_at | TIMESTAMP | - | 更新日時 | 自動 |

### データ例

```sql
player_id | discord_id  | player_name | affiliated_club | edogawa_flg | koto_flg | tokyo_flg
----------|-------------|-------------|-----------------|-------------|----------|----------
1         | 123456789   | 山田太郎    | 十条クラブ      | true        | false    | true
2         | 987654321   | 佐藤花子    | 江戸川TC        | true        | true     | false
3         | NULL        | 鈴木一郎    | NULL            | false       | false    | false
```

**例の説明:**
- 山田太郎: 十条クラブ所属、江戸川区と東京都に登録
- 佐藤花子: 江戸川TC所属、江戸川区と江東区に登録
- 鈴木一郎: クラブ未所属、どこにも登録していない（ペア選手として追加）

---

## 2️⃣ tournament_mst（大会情報マスタ）

### 用途
大会の情報を管理するマスターテーブル

### カラム定義

| カラム名 | 型 | 制約 | 説明 | 設定値 |
|---------|---|------|------|--------|
| **tournament_id** | TEXT | PRIMARY KEY | 大会ID | 命名規則あり |
| **registrated_ward** | INTEGER | NOT NULL | 登録区 | 0:荒川区, 1:江戸川区, ... |
| **tournament_name** | TEXT | NOT NULL | 大会名 | "荒川区テニス大会2025" |
| **classification** | INTEGER | NOT NULL, CHECK (0/1/2) | 区分 | 0:個人戦, 1:団体戦, 2:シングルス |
| **mix_flg** | BOOLEAN | NOT NULL | ミックスフラグ | true/false |
| **type** | TEXT[] | NOT NULL | 種別（配列） | ["一般", "35", "45"] |
| **tournament_date** | DATE | NOT NULL | 大会期日 | 2025-06-01 |
| **deadline_date** | DATE | NOT NULL | 申込締切 | 2025-05-31 |
| created_at | TIMESTAMP | - | 作成日時 | 自動 |
| updated_at | TIMESTAMP | - | 更新日時 | 自動 |

### データ例

```sql
tournament_id         | registrated_ward | tournament_name        | classification | type
---------------------|------------------|------------------------|----------------|-------------
arakawa_2025_singles | 0                | 荒川区シングルス2025   | 2              | ["一般", "35"]
edogawa_2025_doubles | 1                | 江戸川区ダブルス2025   | 0              | ["一般", "45"]
```

### 補足説明

**classification（区分）:**
- 0: 個人戦（ダブルス等）
- 1: 団体戦
- 2: シングルス

**type（種別）:**
- ARRAY型で複数の種別を格納
- 例: `["一般", "35", "45"]` → 一般の部、35歳以上の部、45歳以上の部

---

## 3️⃣ tournament_registration（大会申込情報）

### 用途
大会への申込情報を管理するトランザクションテーブル

### カラム定義

| カラム名 | 型 | 制約 | 説明 | 値 |
|---------|---|------|------|---|
| **registration_id** | SERIAL | PRIMARY KEY, NOT NULL | 申込ID（自動採番） | 自動 |
| **discord_id** | TEXT | NOT NULL | 申込者のDiscord ID | Discord |
| **tournament_id** | TEXT | NOT NULL, FK | 大会ID | tournament_mst参照 |
| **type** | TEXT | NOT NULL | 申込種別 | "一般", "35" 等 |
| **sex** | INTEGER | NOT NULL, CHECK (0 or 1) | 性別（0:男子, 1:女子） | フォーム |
| **pair1** | INTEGER | NOT NULL, FK | 出場者1 | player_mst.player_id |
| pair2 | INTEGER[] | - | 出場者2（複数可） | player_mst.player_id の配列 |
| submitted_at | TIMESTAMP | - | 申込日時 | 自動 |
| updated_at | TIMESTAMP | - | 更新日時 | 自動 |

### UNIQUE制約

```sql
UNIQUE(discord_id, tournament_id, type)
```
→ 同じユーザーが同じ大会の同じ種別に複数回申し込めないようにする

### データ例

**シングルス（個人）の場合:**
```sql
registration_id | discord_id  | tournament_id        | type | sex | pair1 | pair2
----------------|-------------|----------------------|------|-----|-------|-------
1               | 123456789   | arakawa_2025_singles | 一般 | 0   | 1     | NULL
```

**ダブルス（ペア）の場合:**
```sql
registration_id | discord_id  | tournament_id        | type | sex | pair1 | pair2
----------------|-------------|----------------------|------|-----|-------|-------
2               | 123456789   | edogawa_2025_doubles | 一般 | 0   | 1     | {2}
```

**団体戦（複数人）の場合:**
```sql
registration_id | discord_id  | tournament_id        | type | sex | pair1 | pair2
----------------|-------------|----------------------|------|-----|-------|----------
3               | 123456789   | team_2025            | 一般 | 0   | 1     | {2,3,4}
```

---

## 🔄 テーブル間のリレーション

### ER図

```
┌─────────────────────┐
│   player_mst        │
│  (選手マスタ)       │
│  PK: player_id      │
└──────────┬──────────┘
           │
           │ 1人の選手が複数の大会に申込可能
           │
           ↓ (1対多)
┌─────────────────────────┐
│ tournament_registration │
│  (大会申込情報)         │
│  PK: registration_id    │
│  FK: tournament_id      │
│  FK: pair1              │
│  FK: pair2[]            │
└──────────┬──────────────┘
           │
           │ 各申込は1つの大会に紐づく
           │
           ↓ (多対1)
┌─────────────────────┐
│  tournament_mst     │
│  (大会情報マスタ)   │
│  PK: tournament_id  │
└─────────────────────┘
```

---

## 📝 使用例

### シナリオ：山田太郎さんがシングルス大会に申し込む

#### Step 1: 選手登録
```sql
INSERT INTO player_mst (
    discord_id, jsta_number, player_name, post_number,
    address, phone_number, birth_date, sex
) VALUES (
    '123456789', 'JSTA001', '山田太郎', '123-4567',
    '東京都荒川区1-2-3', '090-1234-5678', '1990-01-15', 0
);
```

#### Step 2: 大会申込
```sql
INSERT INTO tournament_registration (
    discord_id, tournament_id, type, sex, pair1
) VALUES (
    '123456789', 'arakawa_2025_singles', '一般', 0, 1
);
```

---

## 🏢 各区登録フラグの使用例

### 江戸川区に登録している選手を検索
```sql
SELECT * FROM player_mst WHERE edogawa_flg = true;
```

### 江戸川区と江東区の両方に登録している選手
```sql
SELECT * FROM player_mst 
WHERE edogawa_flg = true AND koto_flg = true;
```

### どこにも登録していない選手
```sql
SELECT * FROM player_mst 
WHERE NOT (tokyo_flg OR koto_flg OR edogawa_flg OR chuo_flg OR sumida_flg);
```

### 江戸川区への登録を追加
```sql
UPDATE player_mst SET edogawa_flg = true WHERE player_id = 1;
```

### 江戸川区への登録を削除
```sql
UPDATE player_mst SET edogawa_flg = false WHERE player_id = 1;
```

---

## 🔍 便利な検索クエリ

### 1. 特定の大会の申込一覧
```sql
SELECT 
    tr.registration_id,
    p.player_name,
    p.phone_number,
    tr.type,
    tr.submitted_at
FROM tournament_registration tr
JOIN player_mst p ON tr.pair1 = p.player_id
WHERE tr.tournament_id = 'arakawa_2025_singles'
ORDER BY tr.submitted_at;
```

### 2. 特定選手の申込履歴
```sql
SELECT 
    t.tournament_name,
    tr.type,
    tr.submitted_at
FROM tournament_registration tr
JOIN tournament_mst t ON tr.tournament_id = t.tournament_id
WHERE tr.discord_id = '123456789'
ORDER BY tr.submitted_at DESC;
```

### 3. 大会ごとの申込数集計
```sql
SELECT 
    t.tournament_name,
    COUNT(*) as registration_count
FROM tournament_registration tr
JOIN tournament_mst t ON tr.tournament_id = t.tournament_id
GROUP BY t.tournament_name
ORDER BY registration_count DESC;
```

---

## ⚠️ 注意事項

### PostgreSQL特有の型

1. **SERIAL型**
   - AUTO_INCREMENTの代わりに使用
   - 自動で連番を生成

2. **TEXT[]型（配列）**
   - PostgreSQLはネイティブで配列型をサポート
   - `ARRAY['一般', '35']` で配列を作成

3. **BOOLEAN型**
   - `true` / `false` で値を指定

### 制約

1. **CHECK制約**
   - sex: 0（男子）または 1（女子）のみ
   - classification: 0, 1, 2 のみ

2. **UNIQUE制約**
   - discord_id: 1人の選手は1つのアカウントのみ
   - (discord_id, tournament_id, type): 同じ大会の同じ種別に複数回申込不可

---

このテーブル構成で問題ありませんか？

