-- ===================================================================
-- スポーツ大会申込システム データベーステーブル作成（MariaDB版）
-- X-Server環境用
-- ===================================================================

-- 0. 区マスタテーブル（ward_mst）
-- 区の情報を管理
CREATE TABLE IF NOT EXISTS ward_mst (
    ward_id INT PRIMARY KEY,
    ward_name VARCHAR(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 1. 選手マスタテーブル（player_mst）
-- 選手の基本情報を管理
CREATE TABLE IF NOT EXISTS player_mst (
    player_id INT AUTO_INCREMENT PRIMARY KEY,
    discord_id VARCHAR(255) UNIQUE,
    jsta_number VARCHAR(100),
    player_name VARCHAR(255) NOT NULL,
    post_number VARCHAR(20),
    address VARCHAR(500) NOT NULL,
    phone_number VARCHAR(20) NOT NULL,
    birth_date DATE NOT NULL,
    sex INT NOT NULL CHECK (sex IN (0, 1)),
    affiliated_club VARCHAR(100),        -- 所属クラブ名
    tokyo_flg TINYINT(1) DEFAULT 0,      -- 東京都への登録フラグ
    koto_flg TINYINT(1) DEFAULT 0,       -- 江東区への登録フラグ
    edogawa_flg TINYINT(1) DEFAULT 0,    -- 江戸川区への登録フラグ
    chuo_flg TINYINT(1) DEFAULT 0,       -- 中央区への登録フラグ
    sumida_flg TINYINT(1) DEFAULT 0,     -- 墨田区への登録フラグ
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_player_discord_id (discord_id),
    INDEX idx_player_jsta_number (jsta_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. 大会情報マスタテーブル（tournament_mst）
-- 大会の情報を管理
CREATE TABLE IF NOT EXISTS tournament_mst (
    tournament_id VARCHAR(255) PRIMARY KEY,
    registrated_ward INT NOT NULL,
    tournament_name VARCHAR(500) NOT NULL,
    classification INT NOT NULL CHECK (classification IN (0, 1, 2)),
    mix_flg TINYINT(1) NOT NULL,
    type JSON NOT NULL,                  -- ['一般', '35', '45'] などの配列をJSON形式で保存
    tournament_date DATE NOT NULL,
    deadline_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_tournament_ward (registrated_ward),
    INDEX idx_tournament_classification (classification),
    INDEX idx_tournament_date (tournament_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. 大会申込情報テーブル（tournament_registration）
-- 大会への申込情報を管理
CREATE TABLE IF NOT EXISTS tournament_registration (
    registration_id INT AUTO_INCREMENT PRIMARY KEY,
    discord_id VARCHAR(255) NOT NULL,
    tournament_id VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    sex INT NOT NULL CHECK (sex IN (0, 1)),
    pair1 INT NOT NULL,
    pair2 JSON,                          -- [123, 456] などの選手ID配列をJSON形式で保存
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- 同じユーザーが同じ大会に同じ種別で複数回申し込めないようにする
    UNIQUE KEY unique_registration (discord_id, tournament_id, type),

    -- 外部キー制約
    FOREIGN KEY (tournament_id) REFERENCES tournament_mst(tournament_id),
    FOREIGN KEY (pair1) REFERENCES player_mst(player_id),

    -- インデックス
    INDEX idx_registration_discord_id (discord_id),
    INDEX idx_registration_tournament_id (tournament_id),
    INDEX idx_registration_pair1 (pair1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. セッションテーブル（sessions）
-- Discord認証のセッション管理
CREATE TABLE IF NOT EXISTS sessions (
    session_id VARCHAR(255) PRIMARY KEY,
    discord_id VARCHAR(255) NOT NULL,
    username VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_session_discord_id (discord_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===================================================================
-- テストデータ挿入（動作確認用）
-- ===================================================================

-- 東京23区データ
INSERT INTO ward_mst (ward_id, ward_name) VALUES
    (1, '千代田区'),
    (2, '中央区'),
    (3, '港区'),
    (4, '新宿区'),
    (5, '文京区'),
    (6, '台東区'),
    (7, '墨田区'),
    (8, '江東区'),
    (9, '品川区'),
    (10, '目黒区'),
    (11, '大田区'),
    (12, '世田谷区'),
    (13, '渋谷区'),
    (14, '中野区'),
    (15, '杉並区'),
    (16, '豊島区'),
    (17, '北区'),
    (18, '荒川区'),
    (19, '板橋区'),
    (20, '練馬区'),
    (21, '足立区'),
    (22, '葛飾区'),
    (23, '江戸川区')
ON DUPLICATE KEY UPDATE ward_name=VALUES(ward_name);

-- テスト用選手データ
INSERT INTO player_mst (
    discord_id, jsta_number, player_name, post_number,
    address, phone_number, birth_date, sex
) VALUES
    ('123456789', 'JSTA001', '山田太郎', '123-4567',
     '東京都荒川区1-2-3', '090-1234-5678', '1990-01-15', 0),
    ('987654321', 'JSTA002', '佐藤花子', '123-4567',
     '東京都江戸川区4-5-6', '080-9876-5432', '1992-05-20', 1)
ON DUPLICATE KEY UPDATE
    jsta_number=VALUES(jsta_number),
    player_name=VALUES(player_name);

-- テスト用大会データ
INSERT INTO tournament_mst (
    tournament_id, registrated_ward, tournament_name,
    classification, mix_flg, type, tournament_date, deadline_date
) VALUES
    ('arakawa_2025_singles', 18, '荒川区シングルス大会2025',
     2, 0, JSON_ARRAY('一般', '35'), '2025-06-01', '2025-05-31'),
    ('edogawa_2025_doubles', 23, '江戸川区ダブルス大会2025',
     0, 0, JSON_ARRAY('一般', '45'), '2025-07-15', '2025-07-10')
ON DUPLICATE KEY UPDATE
    tournament_name=VALUES(tournament_name),
    tournament_date=VALUES(tournament_date);

-- ===================================================================
-- 確認用クエリ
-- ===================================================================

-- テーブル一覧を表示
SHOW TABLES;

-- 各テーブルのレコード数を確認
SELECT 'ward_mst' as table_name, COUNT(*) as record_count FROM ward_mst
UNION ALL
SELECT 'player_mst' as table_name, COUNT(*) as record_count FROM player_mst
UNION ALL
SELECT 'tournament_mst' as table_name, COUNT(*) as record_count FROM tournament_mst
UNION ALL
SELECT 'tournament_registration' as table_name, COUNT(*) as record_count FROM tournament_registration;

-- カラム情報を確認
SELECT
    TABLE_NAME as table_name,
    COLUMN_NAME as column_name,
    DATA_TYPE as data_type,
    IS_NULLABLE as is_nullable
FROM information_schema.columns
WHERE TABLE_SCHEMA = 'fromround_jtour'
    AND TABLE_NAME IN ('ward_mst', 'player_mst', 'tournament_mst', 'tournament_registration')
ORDER BY TABLE_NAME, ORDINAL_POSITION;
