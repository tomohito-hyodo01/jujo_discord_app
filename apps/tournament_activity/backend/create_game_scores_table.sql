-- ゲームスコア（利用者間で共有するランキング）テーブル
-- 「エビ走」などのミニゲームのベストスコアをアカウント単位で保持する。
-- 1ユーザー1ゲームにつき1行（ベストスコアのみ保持＝upsertで更新）。

CREATE TABLE IF NOT EXISTS game_scores (
    id INT AUTO_INCREMENT PRIMARY KEY,
    game VARCHAR(40) NOT NULL,                 -- ゲーム識別子（例: 'ebi_run'）
    discord_id VARCHAR(255) NOT NULL,          -- プレイヤーのDiscord ID
    display_name VARCHAR(255),                 -- 表示名（player_mst優先、無ければ送信されたusername）
    best_score INT NOT NULL DEFAULT 0,         -- ベストスコア（距離m + コイン×10）
    best_coins INT NOT NULL DEFAULT 0,         -- ベストスコア達成時のコイン数
    play_count INT NOT NULL DEFAULT 0,         -- プレイ回数
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_game_user (game, discord_id),
    INDEX idx_game_score (game, best_score DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
