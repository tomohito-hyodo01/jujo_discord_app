# GitHub Actions → Fly.io 自動デプロイ設定ガイド

## 📊 調査結果

**はい、可能です！**

GitHub Actionsでmainブランチにpushすると、自動的にFly.ioにデプロイできます。

---

## 🔧 実装方法

### 仕組み

```
GitHub（mainブランチ）
    ↓ git push
GitHub Actions起動
    ↓
自動テスト実行（オプション）
    ↓
Fly.ioに自動デプロイ
    ↓
本番環境更新完了
```

---

## 📝 必要な設定

### 1. Fly.io Deploy Token取得

```bash
flyctl auth token
```

このコマンドで表示されるトークンをコピー

### 2. GitHub Secretsに設定

1. GitHubリポジトリを開く
2. Settings → Secrets and variables → Actions
3. 「New repository secret」をクリック
4. 以下を追加：

```
Name: FLY_API_TOKEN
Value: （コピーしたトークン）
```

### 3. GitHub Actionsワークフローを作成

`.github/workflows/deploy.yml` を作成：

```yaml
name: Deploy to Fly.io

on:
  push:
    branches:
      - main

jobs:
  deploy-backend:
    name: Deploy Backend API
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: superfly/flyctl-actions/setup-flyctl@master
      
      - name: Deploy Backend
        run: flyctl deploy --remote-only -a tournament-api-jujo
        working-directory: ./apps/tournament_activity/backend
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}

  deploy-frontend:
    name: Deploy Frontend
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: superfly/flyctl-actions/setup-flyctl@master
      
      - name: Deploy Frontend
        run: flyctl deploy --remote-only -a tournament-form-jujo --build-arg VITE_API_URL=https://tournament-api-jujo.fly.dev --build-arg VITE_DISCORD_CLIENT_ID=1427563635773018182
        working-directory: ./apps/tournament_activity/frontend
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}

  deploy-bot:
    name: Deploy Discord Bot
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: superfly/flyctl-actions/setup-flyctl@master
      
      - name: Deploy Bot
        run: flyctl deploy --remote-only -a jujo-discord-bot
        working-directory: ./apps/form_bot
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

---

## 🎯 デプロイフロー

### 手動デプロイ（現在）

```
1. ローカルでコード変更
2. flyctl deploy を実行
3. 各アプリを1つずつデプロイ
```

### 自動デプロイ（CI/CD）

```
1. ローカルでコード変更
2. git push origin main
3. GitHub Actionsが自動実行
   ├─ Backend自動デプロイ
   ├─ Frontend自動デプロイ
   └─ Bot自動デプロイ
4. 全て完了（5〜10分）
```

---

## ✨ メリット

```
✅ git pushするだけで自動デプロイ
✅ 3つのアプリを並行デプロイ（高速）
✅ デプロイ履歴が残る
✅ デプロイ失敗時は自動でロールバック
✅ チーム開発しやすい
✅ テスト自動化も可能
```

---

## 🔧 オプション設定

### テストを追加

```yaml
test:
  name: Run Tests
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    
    - name: Setup Python
      uses: actions/setup-python@v4
      with:
        python-version: '3.13'
    
    - name: Run Backend Tests
      run: |
        pip install -r requirements.txt
        pytest
      working-directory: ./apps/tournament_activity/backend
```

### 特定のディレクトリ変更時のみデプロイ

```yaml
on:
  push:
    branches:
      - main
    paths:
      - 'apps/tournament_activity/backend/**'
      - 'apps/tournament_activity/frontend/**'
      - 'apps/form_bot/**'
```

---

## 💰 コスト

```
GitHub Actions無料枠:
├─ パブリックリポジトリ: 無制限
└─ プライベートリポジトリ: 2,000分/月

デプロイ1回あたり: 約5分
月100回デプロイしても: 500分（無料枠内）

追加コスト: 0円
```

---

## 📊 デプロイ時間比較

| 方法 | 時間 | 手間 |
|------|------|------|
| 手動 | 各5分 × 3 = 15分 | 高い |
| 自動 | 5〜10分（並行） | git pushのみ |

---

## 🚀 実装するか？

実装する場合：

1. Fly.io Deploy Tokenを取得
2. GitHub Secretsに設定
3. `.github/workflows/deploy.yml` を作成
4. git push

**所要時間: 15〜20分**

---

実装しますか？それとも今は手動デプロイのままで良いですか？

