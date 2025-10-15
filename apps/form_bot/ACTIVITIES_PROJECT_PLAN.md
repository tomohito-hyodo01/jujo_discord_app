# Discord Activities 実装プロジェクト計画

## ⚠️ 最終確認

Discord Activitiesの実装は、**現在のBotプロジェクトとは全く別の新規プロジェクト**になります。

---

## 📊 プロジェクト規模

### 開発工数
```
総工数: 150〜250時間
期間: 4〜6週間（フルタイム）
     または 2〜3ヶ月（週末のみ）
```

### 必要なスキル

#### すぐに学習が必要なもの
```
❌ JavaScript/TypeScript（必須）
❌ React（必須）
❌ Discord Embedded App SDK（必須）
❌ Vite（ビルドツール）
❌ WebSocket通信
❌ REST API設計
```

#### 既にあるもの
```
✅ Python
✅ データベース設計
✅ Discord Botの理解
```

---

## 🏗️ 技術スタック

### フロントエンド（完全新規）
```javascript
- React 18
- TypeScript
- Discord Embedded App SDK
- Tailwind CSS（スタイリング）
- React Hook Form（フォーム管理）
- Vite（ビルド）
```

### バックエンド（新規API作成）
```python
- FastAPI（REST API）
- Python 3.13
- Supabase（既存）
- CORS設定
- JWT認証
```

### インフラ
```
- Fly.io（バックエンド）
- Cloudflare Pages（フロントエンド）
- Supabase（データベース）
```

---

## 📁 プロジェクト構造（完全新規）

```
jujo_discord_app/
├── apps/
│   ├── form_bot/                    # 既存Bot（継続）
│   └── tournament_activity/         # 新規Activities
│       ├── frontend/                # フロントエンド（新規）
│       │   ├── src/
│       │   │   ├── App.tsx
│       │   │   ├── components/
│       │   │   │   ├── TournamentForm.tsx
│       │   │   │   ├── PlayerRegistration.tsx
│       │   │   │   └── Confirmation.tsx
│       │   │   ├── hooks/
│       │   │   │   └── useDiscordSDK.ts
│       │   │   ├── services/
│       │   │   │   └── api.ts
│       │   │   └── main.tsx
│       │   ├── package.json
│       │   ├── vite.config.ts
│       │   └── tsconfig.json
│       │
│       └── backend/                 # バックエンドAPI（新規）
│           ├── api/
│           │   ├── main.py
│           │   ├── routers/
│           │   │   ├── tournaments.py
│           │   │   ├── players.py
│           │   │   └── registrations.py
│           │   └── models/
│           ├── requirements.txt
│           └── Dockerfile

総ファイル数: 50〜80ファイル（新規）
総コード行数: 5,000〜10,000行
```

---

## 📅 詳細スケジュール

### Week 1-2: 学習・セットアップ
```
□ React チュートリアル完了
□ TypeScript 基礎学習
□ Discord Embedded App SDK ドキュメント読破
□ サンプルアプリの動作確認
□ 開発環境構築
```

### Week 3: フォームUI開発
```
□ 選手登録フォームコンポーネント作成
□ バリデーション実装
□ エラーハンドリング
□ スタイリング
```

### Week 4: バックエンドAPI開発
```
□ FastAPI セットアップ
□ REST API エンドポイント作成
□ Supabase連携
□ CORS設定
□ 認証実装
```

### Week 5: 統合・テスト
```
□ フロント・バックエンド統合
□ Discord SDK統合
□ E2Eテスト
□ バグ修正
```

### Week 6: デプロイ・審査
```
□ 本番環境デプロイ
□ Discord審査申請
□ ドキュメント作成
□ 審査対応
```

---

## 💰 実装コスト試算

### 時間コスト
```
学習: 50〜100時間（React未経験の場合）
開発: 100〜150時間
テスト: 20〜30時間
---
合計: 170〜280時間
```

### 金銭コスト
```
サーバー: 0円（無料プラン内）
学習リソース: 0円（無料教材）
---
合計: 0円
```

---

## 🎯 開始前のチェックリスト

実装を開始する前に、以下を確認してください：

### スキルチェック
```
□ JavaScript は書けますか？
  → いいえの場合: +2週間の学習が必要

□ React は使ったことがありますか？
  → いいえの場合: +2週間の学習が必要

□ Web開発の経験はありますか？
  → いいえの場合: +1週間の学習が必要
```

### 時間チェック
```
□ 今後4〜6週間、週20〜30時間確保できますか？
  → いいえの場合: 完成まで2〜3ヶ月かかります

□ 学習に時間を使えますか？
  → React等の学習に最初の2週間必要です
```

---

## 🔄 代替案の再提示

もし上記のチェックリストで不安がある場合、以下をおすすめします：

### プランA: まず簡易版で運用開始
```
1. モーダル1枚版で今すぐ開始（30分）
2. 実際に運用してみる
3. 本当に必要か判断
4. 必要ならActivitiesを開発
```

### プランB: 段階的アプローチ
```
1. 外部Webフォームで改善（1〜2日）
2. しばらく運用
3. さらに改善が必要ならActivities検討
```

---

## ✅ 最終質問

以下を教えてください：

1. **JavaScript/React の経験はありますか？**
   - ある → すぐ開始可能
   - ない → 2〜4週間の学習が先に必要

2. **開発に週何時間使えますか？**
   - 30時間以上 → 4〜6週間で完成
   - 10〜20時間 → 2〜3ヶ月で完成
   - 5時間以下 → 4〜6ヶ月かかります

3. **本当にActivitiesが必要ですか？**
   - フォームの使い勝手を改善したいだけなら、モーダル1枚版で十分かもしれません

---

それでもDiscord Activitiesで進めますか？

または、まずは**モーダル1枚版**（30分）で試してみて、それでも不満があればActivitiesを検討する、という方が現実的だと思いますが、いかがでしょうか？
