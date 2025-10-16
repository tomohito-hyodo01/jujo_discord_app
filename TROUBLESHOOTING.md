# トラブルシューティングガイド

## ❓ コマンドが表示されない

### 症状
Discordで `/setup_web_form` が候補に表示されない

### 原因と対処法

#### 1. Botが起動していない（最も可能性高い）

**確認方法:**
```bash
flyctl status -a jujo-discord-bot
```

**STATE列が `stopped` の場合:**
```bash
flyctl machines start 683d3d3ae55948 -a jujo-discord-bot
```

**または、常時起動設定を確認:**
```bash
flyctl scale count 1 --yes -a jujo-discord-bot
```

---

#### 2. Discord接続が切れている

**確認方法:**
```bash
flyctl logs -a jujo-discord-bot | grep "gateway"
```

**「has connected to Gateway」が最近表示されていない場合:**

Botを再起動：
```bash
flyctl machines restart 683d3d3ae55948 -a jujo-discord-bot
```

---

#### 3. Discordのコマンドキャッシュ

**対処法:**
1. Discordアプリを完全終了（Command + Q）
2. 30秒待つ
3. Discordアプリを再起動
4. `/` と入力してコマンド候補を確認

---

#### 4. Botのデプロイが失敗している

**確認方法:**

GitHub Actions:
https://github.com/tomohito-hyodo01/jujo_discord_app/actions

最新のデプロイが ✅ になっているか確認

**失敗している場合:**
エラーログを確認して修正

---

## ❓ フォームにアクセスできない

### 症状
リンクをクリックしても「エラー」や「読み込み中...」のまま

### 原因と対処法

#### 1. フロントエンドが停止している

**確認:**
```bash
flyctl status -a tournament-form-jujo
```

**起動:**
```bash
flyctl machines start -a tournament-form-jujo
```

---

#### 2. バックエンドが停止している

**確認:**
```bash
flyctl status -a tournament-api-jujo
```

**起動:**
```bash
flyctl machines start -a tournament-api-jujo
```

---

#### 3. Supabase接続エラー

**確認:**

ブラウザのコンソール（F12）でエラーを確認

**対処:**

Supabase Dashboard:
https://supabase.com/dashboard

プロジェクトが一時停止していないか確認

---

## ❓ Discord通知が届かない

### 症状
大会申込後、Discordチャンネルにメッセージが送信されない

### 原因と対処法

#### Webhook URLが正しく設定されているか確認

```bash
flyctl secrets list -a tournament-api-jujo
```

`DISCORD_WEBHOOK_URL` が設定されているか確認

**設定し直す:**
```bash
flyctl secrets set DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/... -a tournament-api-jujo
```

---

## 🔄 全サーバーの状態確認

### ワンライナー確認コマンド

```bash
echo "=== Bot ===" && flyctl status -a jujo-discord-bot && \
echo "\n=== API ===" && flyctl status -a tournament-api-jujo && \
echo "\n=== Frontend ===" && flyctl status -a tournament-form-jujo
```

---

## 🚨 緊急時の完全再起動

全てのサーバーを再起動：

```bash
# Bot
flyctl machines restart -a jujo-discord-bot --force

# API
flyctl machines restart -a tournament-api-jujo --force

# Frontend
flyctl machines restart -a tournament-form-jujo --force
```

---

## 📊 ログ確認コマンド

### Bot
```bash
flyctl logs -a jujo-discord-bot
```

### API
```bash
flyctl logs -a tournament-api-jujo
```

### Frontend
```bash
flyctl logs -a tournament-form-jujo
```

---

## 💡 よくある質問

### Q: GitHub Actionsが失敗する

**A:** 
1. GitHub Actionsのログを確認
2. FLY_API_TOKENが正しく設定されているか確認
3. リポジトリがパブリックか確認

### Q: デプロイに時間がかかる

**A:** 
GitHub Actions経由は5〜10分かかります。
手動デプロイより遅いですが、自動化のメリットが大きいです。

### Q: コストが発生する？

**A:** 
現在の構成（Bot 1GB + API 256MB + Frontend 256MB = 1.5GB）は
Fly.io無料枠（3GB）内なので、完全無料です。

