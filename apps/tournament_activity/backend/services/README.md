# Excel編集サービス

区別の大会申込Excelファイルを生成するサービス群

## ディレクトリ構成

```
services/
├── excel_service_base.py          # 基底クラス（全区共通）
├── excel_service_factory.py       # ファクトリークラス（区に応じたサービスを返す）
└── wards/                          # 区別サービス
    ├── __init__.py
    └── edogawa_excel_service.py   # 江戸川区専用サービス
```

## 使い方

### 基本的な使用方法

```python
from services.excel_service_factory import ExcelServiceFactory

# 大会情報を取得
tournament = {
    'tournament_id': 'edogawa_2025_autumn',
    'tournament_name': '江戸川区秋季ダブルス大会',
    'registrated_ward': 23,  # 江戸川区
    ...
}

# 申込データを取得
registrations = [...]

# ファクトリーから適切なサービスを取得
ward_id = tournament['registrated_ward']
excel_service = ExcelServiceFactory.create(ward_id)

# Excelファイルを生成
result = excel_service.generate_tournament_files(tournament, registrations)

# 結果
# {
#     "member_registration": "output/江戸川区秋季ダブルス大会_会員登録表_20251118_010000.xlsx",
#     "individual_application": "output/江戸川区秋季ダブルス大会_個人戦申込書_20251118_010000.xlsx"
# }
```

### 対応している区を確認

```python
from services.excel_service_factory import ExcelServiceFactory

supported_wards = ExcelServiceFactory.get_supported_wards()
print(supported_wards)  # [23]
```

## 新しい区を追加する方法

### ステップ1: テンプレートファイルを配置

```bash
mkdir -p templates/wards/18_荒川区
# Excelテンプレートファイルを配置
```

### ステップ2: 区専用サービスクラスを作成

```python
# services/wards/arakawa_excel_service.py

from services.excel_service_base import BaseExcelService
import openpyxl

class ArakawaExcelService(BaseExcelService):
    """荒川区専用のExcel生成サービス"""

    def __init__(self):
        super().__init__(ward_id=18, ward_name="荒川区")

    def generate_member_registration(self, tournament_name, registrations, timestamp):
        """荒川区の会員登録表を生成"""
        # 荒川区固有の処理を実装
        pass

    def generate_individual_application(self, tournament, registrations, timestamp):
        """荒川区の個人戦申込書を生成"""
        # 荒川区固有の処理を実装
        pass
```

### ステップ3: ファクトリーに登録

```python
# services/excel_service_factory.py

from services.wards.arakawa_excel_service import ArakawaExcelService

class ExcelServiceFactory:
    _services = {
        23: EdogawaExcelService,
        18: ArakawaExcelService,  # 追加
    }
```

### ステップ4: __init__.pyに追加

```python
# services/wards/__init__.py

from services.wards.edogawa_excel_service import EdogawaExcelService
from services.wards.arakawa_excel_service import ArakawaExcelService  # 追加

__all__ = [
    'EdogawaExcelService',
    'ArakawaExcelService',  # 追加
]
```

## 実装済みの区

### 江戸川区（ward_id: 23）

**テンプレートファイル:**
- `会員登録表フォーマット.xlsx`
- `個人戦_申込書フォーマット.xlsx`

**特徴:**
- 会員登録表: 6行目からデータ記入、edogawa_flg=False の選手のみ
- 個人戦申込書: 10行目からデータ記入、カスタムソート（一般男子→35男子→...）

**実装クラス:**
`services/wards/edogawa_excel_service.py` - `EdogawaExcelService`

## エラーハンドリング

```python
from services.excel_service_factory import ExcelServiceFactory

try:
    excel_service = ExcelServiceFactory.create(ward_id=99)  # 未対応の区
except ValueError as e:
    print(e)  # "Ward ID 99 is not supported yet. Available wards: 23"
```

## 注意事項

1. **テンプレートファイル名**: 各区で異なるファイル名でもOK（サービスクラス内で指定）
2. **データ構造**: registrations は各区のサービスで期待する形式で渡すこと
3. **エラーハンドリング**: テンプレートファイルが存在しない場合は `FileNotFoundError` が発生

## 開発ガイドライン

### 各区サービスの責務

- テンプレートファイルのコピー
- 区固有のデータマッピング
- 区固有のフォーマット処理（日付、種別など）
- Excelへのデータ書き込み

### 基底クラスの責務

- 共通的なファイル操作（コピー、パス管理）
- インターフェースの定義
- 共通エラーハンドリング

### ファクトリーの責務

- ward_idに応じた適切なサービスインスタンスの生成
- 対応区の管理
