# 十条クラブ 大会申込システム - システム構成図

## 🌐 全体構成

```
┌─────────────────────────────────────────────────────────┐
│                     ユーザー                             │
│                   （Discordアプリ）                      │
└───────────────────────┬─────────────────────────────────┘
                        │
                        │ ① /apply コマンド実行
                        ↓
┌─────────────────────────────────────────────────────────┐
│              Discord Bot（Fly.io）                       │
│              https://jujo-discord-bot.fly.dev/           │
│                                                          │
│  ・Python 3.13                                           │
│  ・discord.py                                            │
│  ・通知サーバー（port 8001）                             │
│  ・常時起動（min_machines_running = 1）                  │
└───────────────────────┬─────────────────────────────────┘
                        │
                        │ ② セッション作成リクエスト
                        ↓
┌─────────────────────────────────────────────────────────┐
│           バックエンドAPI（Fly.io）                      │
│           https://tournament-api-jujo.fly.dev/           │
│                                                          │
│  ・Python 3.13 + FastAPI                                 │
│  ・REST API（port 8000）                                 │
│  ・セッション管理                                        │
│  ・Discord Webhook通知                                   │
└───────────┬──────────────────────┬──────────────────────┘
            │                      │
            │ ③ セッションID      │ ⑥ データ読み書き
            ↓                      ↓
┌──────────────────────┐  ┌────────────────────────────────┐
│  Discord（ユーザーへ）│  │  Supabase PostgreSQL           │
│  リンクメッセージ送信 │  │  https://tyjccdnccioagwfamtof │
└───────────┬──────────┘  │                                │
            │              │  ・player_mst（選手マスタ）    │
            │ ④ リンククリック  │  ・tournament_mst（大会マスタ）│
            ↓              │  ・tournament_registration     │
┌─────────────────────────────────────────────────────────┐
│          フロントエンド（Fly.io）                        │
│          https://tournament-form-jujo.fly.dev/           │
│                                                          │
│  ・React + TypeScript                                    │
│  ・Vite                                                  │
│  ・Nginx（port 80）                                      │
│  ・大会申込フォームUI                                    │
│  ・選手登録フォームUI                                    │
└───────────────────────┬─────────────────────────────────┘
                        │
                        │ ⑤ フォーム送信
                        ↓
                  バックエンドAPI
                        │
                        ├─→ Supabase（データ保存）
                        │
                        └─→ ⑦ Discord Webhook
                              ↓
                        ┌─────────────────────┐
                        │  Discord チャンネル  │
                        │  ID: 142785...       │
                        │  【大会申込完了】    │
                        │  メッセージ表示      │
                        └─────────────────────┘
```

---

## 📊 データフロー詳細

### 1. 申込フロー

```
ユーザー
    │
    │ ① /apply コマンド
    ↓
Discord Bot（Fly.io）
    │
    │ ② POST /api/session
    │    {discord_id, username}
    ↓
バックエンドAPI（Fly.io）
    │
    │ ③ セッションID生成
    │    session_id: uuid
    ↓
Discord Bot
    │
    │ ④ リンクメッセージ送信
    │    URL: https://tournament-form-jujo.fly.dev/?session=...
    ↓
ユーザー（ブラウザ）
    │
    │ ⑤ フォームアクセス
    ↓
フロントエンド（Fly.io）
    │
    │ ⑥ GET /api/session/{session_id}
    │    → Discord ID取得
    ↓
フロントエンド
    │
    │ ⑦ 大会申込入力
    │    - 大会選択
    │    - 種別選択
    │    - ペア選択（または選手追加）
    ↓
フロントエンド
    │
    │ ⑧ POST /api/registrations
    │    {discord_id, tournament_id, type, sex, pair1}
    ↓
バックエンドAPI
    │
    ├─→ ⑨ Supabaseに保存
    │      tournament_registration テーブル
    │
    └─→ ⑩ POST（Discord Webhook）
          https://discord.com/api/webhooks/.../
          {content: "【大会申込完了】..."}
              ↓
        Discord チャンネル
          メッセージ表示
```

---

## 🏗️ インフラ構成

### Fly.io Apps（3つ）

| アプリ名 | 用途 | ポート | メモリ | 状態 |
|---------|------|-------|--------|------|
| jujo-discord-bot | Discord Bot | 8001 | 1GB | 常時起動 |
| tournament-api-jujo | バックエンドAPI | 8000 | 256MB | オンデマンド |
| tournament-form-jujo | フロントエンド | 80 | 256MB | オンデマンド |

### Supabase

| テーブル | レコード数 | 用途 |
|---------|-----------|------|
| player_mst | 〜100件 | 選手マスタ |
| tournament_mst | 〜50件/年 | 大会マスタ |
| tournament_registration | 〜500件/年 | 申込データ |

### Discord

| 機能 | 設定 |
|------|------|
| Bot Token | MTQyNzU2... |
| Webhook URL | https://discord.com/api/webhooks/... |
| 通知チャンネル | 1427859106219430011 |

---

## 💰 コスト

```
Fly.io（3アプリ）
├─ Bot: 256MB → 無料枠内
├─ API: 256MB → 無料枠内
└─ Frontend: 256MB → 無料枠内
合計: 768MB / 3GB（無料枠）

Supabase
└─ 5MB / 500MB（無料プラン）

Discord Webhook
└─ 無料

──────────────────
月額合計: 0円
```

---

## 🔒 セキュリティ

### 環境変数（Fly.io Secrets）

**Bot:**
- DISCORD_BOT_TOKEN
- SUPABASE_URL
- SUPABASE_KEY

**API:**
- SUPABASE_URL
- SUPABASE_KEY
- DISCORD_WEBHOOK_URL

**Frontend:**
- VITE_API_URL（ビルド時）
- VITE_DISCORD_CLIENT_ID（ビルド時）

---

## 📈 スケーラビリティ

### 現在の対応規模

```
年間大会数: 50大会
1大会あたり申込: 3〜10件
年間総申込数: 150〜500件
選手マスター: 100人
同時アクセス: 10〜20人

→ 無料枠で10年以上運用可能
```

### 拡張時

```
年間1,000件超え
  → Supabase有料プラン（$25/月）

同時アクセス100人超え
  → Fly.ioのメモリ増強（$5〜/月）
```

---

## 🔄 データ同期

```
Supabase（PostgreSQL）
    ↑ リアルタイム読み書き
    │
    ├─ フロントエンド（申込フォーム）
    ├─ バックエンドAPI（検索・フィルタ）
    └─ Discord Bot（将来の管理コマンド用）
```

---

## 🎯 完成したシステムの特徴

```
✅ 完全クラウド（ローカルサーバー不要）
✅ 24時間365日稼働
✅ 月額0円
✅ どこからでもアクセス可能
✅ PCシャットダウン可能
✅ 自動スケール
✅ 自動バックアップ（Supabase 7日分）
✅ Discord完全統合
```

---

お疲れ様でした！完璧なシステムが完成しました！🎉

