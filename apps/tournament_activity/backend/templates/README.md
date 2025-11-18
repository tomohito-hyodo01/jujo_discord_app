# Excelテンプレート管理ガイド

## ディレクトリ構成

```
templates/
├── wards/                          # 区別テンプレート
│   ├── 18_荒川区/
│   │   ├── 会員登録表.xlsx
│   │   ├── 個人戦申込書.xlsx
│   │   └── 団体戦申込書.xlsx
│   ├── 23_江戸川区/
│   │   ├── 会員登録表.xlsx
│   │   └── 個人戦申込書.xlsx
│   └── ...
├── config.json                     # テンプレート設定
└── README.md                       # このファイル
```

---

## 新しい区のテンプレートを追加する方法

### 1. ディレクトリ作成

```bash
mkdir -p apps/tournament_activity/backend/templates/wards/{ward_id}_{区名}

# 例: 北区（ward_id = 17）の場合
mkdir -p apps/tournament_activity/backend/templates/wards/17_北区
```

### 2. Excelファイル配置

必要なExcelテンプレートファイルをディレクトリに配置します。

```
17_北区/
├── 会員登録表.xlsx
├── 個人戦申込書.xlsx
└── 団体戦申込書.xlsx  # (必要に応じて)
```

### 3. config.json に設定追加

```json
{
  "wards": {
    "17": {
      "ward_name": "北区",
      "templates": {
        "member_registration": "会員登録表.xlsx",
        "individual": "個人戦申込書.xlsx",
        "team": "団体戦申込書.xlsx",
        "singles": null
      },
      "sheet_mapping": {
        "member_registration": {
          "sheet_name": "会員登録表",
          "start_row": 2,
          "columns": {
            "no": "A",
            "name": "B",
            "birth_date": "C",
            "address": "D",
            "phone": "E",
            "jsta_number": "F"
          }
        },
        "individual": {
          "sheet_name": "個人戦申込書",
          "start_row": 2,
          "columns": {
            "no": "A",
            "type": "B",
            "sex": "C",
            "player1_name": "D",
            "player2_name": "E"
          }
        }
      }
    }
  }
}
```

---

## テンプレート設定の説明

### templates セクション

各大会種別のテンプレートファイル名を指定します。

- `member_registration`: 会員登録表のファイル名
- `individual`: 個人戦申込書のファイル名
- `team`: 団体戦申込書のファイル名（不要な場合は `null`）
- `singles`: シングルス申込書のファイル名（不要な場合は `null`）

### sheet_mapping セクション

各Excelファイル内のシート構造を定義します。

- `sheet_name`: シート名
- `start_row`: データ書き込み開始行（ヘッダーの次の行）
- `columns`: 各データ項目とExcel列の対応

**利用可能な項目:**
- `no`: 番号
- `name`: 選手名
- `birth_date`: 生年月日
- `address`: 住所
- `phone`: 電話番号
- `jsta_number`: 日本連盟登録番号
- `type`: 種別（一般/35/45など）
- `sex`: 性別
- `player1_name`, `player2_name`: 選手1, 2の氏名
- `player1_phone`, `player2_phone`: 選手1, 2の電話番号

---

## テンプレートファイルの要件

### 1. ファイル形式
- `.xlsx` 形式（Excel 2007以降）
- マクロは使用不可

### 2. シート構造
- 1行目: ヘッダー行
- 2行目以降: データ行（プログラムが自動追記）

### 3. 列の順序
- `config.json` の `columns` で指定した順序と一致させる必要はありません
- 列の位置（A, B, C...）のみ正確に指定してください

---

## 注意事項

1. **ファイル名の統一**: 同じ種別のテンプレートは、可能な限り同じファイル名にしてください
2. **文字コード**: Excelファイルは UTF-8 で保存
3. **バージョン管理**: テンプレート変更時はGitにコミット
4. **テスト**: 新しいテンプレート追加後は必ずテスト実行

---

## トラブルシューティング

### テンプレートが見つからない

```
エラー: Template not found for ward_id=18, type=individual
```

**解決策:**
1. `wards/{ward_id}_{区名}/` ディレクトリが存在するか確認
2. `config.json` に該当ward_idの設定があるか確認
3. ファイル名が `config.json` の設定と一致するか確認

### シート名が見つからない

```
エラー: Worksheet '会員登録表' not found
```

**解決策:**
1. Excelファイルを開いてシート名を確認
2. `config.json` の `sheet_name` を正しいシート名に修正

---

## 更新履歴

- 2025-01-XX: 初版作成
- 江戸川区テンプレート追加
- 荒川区テンプレート追加
