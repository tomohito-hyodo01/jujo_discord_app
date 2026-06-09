-- 監査ログ（操作ログ）テーブル
-- kind='request': 全変更系API操作の自動記録（middleware）
-- kind='change' : 重要データの変更前後スナップショット（エンドポイント計装）

CREATE TABLE IF NOT EXISTS audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    kind VARCHAR(10) NOT NULL DEFAULT 'request',
    actor_discord_id VARCHAR(50) NULL,
    method VARCHAR(10) NULL,
    path VARCHAR(255) NULL,
    status_code INT NULL,
    action VARCHAR(50) NULL,
    target_type VARCHAR(30) NULL,
    target_id VARCHAR(255) NULL,
    summary TEXT NULL,
    request_body MEDIUMTEXT NULL,
    before_json MEDIUMTEXT NULL,
    after_json MEDIUMTEXT NULL,
    INDEX idx_ts (timestamp),
    INDEX idx_kind (kind),
    INDEX idx_target (target_type, target_id),
    INDEX idx_actor (actor_discord_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
