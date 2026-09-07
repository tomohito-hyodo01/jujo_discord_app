-- 東京都ソフトテニス連盟サイト「お知らせ」の通知済み投稿
-- 新着判定（このテーブルに無い post_id が新着）と二重送信の防止に使う。
-- 初回実行時は現在の投稿を notified_at = NULL で登録するだけで通知しない（過去分が一気に流れるのを防ぐ）。

CREATE TABLE IF NOT EXISTS site_notice_posts (
    post_id INT NOT NULL PRIMARY KEY,                -- WordPress の投稿ID
    title VARCHAR(255) NOT NULL,
    link VARCHAR(500) NOT NULL,
    published_at DATETIME NOT NULL,                  -- サイト上の公開日時（JST）
    notified_at DATETIME NULL,                       -- Discord へ通知した日時（JST）。初回シード分は NULL
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
