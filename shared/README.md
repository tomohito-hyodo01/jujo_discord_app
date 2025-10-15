# Shared Utilities

各アプリで共通して使用するユーティリティモジュールです。

## モジュール一覧

### config.py
環境変数や共通設定を管理します。

**使用例:**
```python
from shared.config import config

# トークンを取得
token = config.bot_token

# 設定の検証
is_valid, errors = config.validate()
if not is_valid:
    for error in errors:
        print(f'エラー: {error}')
```

### logger.py
アプリケーション全体で使用するロガーを提供します。

**使用例:**
```python
from shared.logger import setup_logger

# ロガーを作成
logger = setup_logger('my_app', log_file='app.log')

logger.info('情報メッセージ')
logger.warning('警告メッセージ')
logger.error('エラーメッセージ')
```

### utils.py
便利な共通関数を提供します。

**使用例:**
```python
from shared.utils import create_embed, format_user_info, truncate_text
import discord

# Embedを簡単に作成
embed = create_embed(
    title='タイトル',
    description='説明文',
    fields=[
        ('フィールド1', '値1', True),
        ('フィールド2', '値2', False)
    ]
)

# ユーザー情報を整形
user_info = format_user_info(interaction.user)

# テキストを切り詰め
short_text = truncate_text('長いテキスト...', max_length=50)
```

## 使用方法

各アプリから以下のようにインポートして使用します：

```python
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '../..'))

from shared.config import config
from shared.logger import setup_logger
from shared.utils import create_embed
```

## 新しいユーティリティの追加

共通で使用する機能があれば、このディレクトリに追加してください。

