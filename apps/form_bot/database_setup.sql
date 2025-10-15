-- ===================================================================
-- スポーツ大会申込システム データベーステーブル作成
-- ユーザー指定のテーブル構成
-- ===================================================================

-- 0. 区マスタテーブル（ward_mst）
-- 区の情報を管理
CREATE TABLE IF NOT EXISTS ward_mst (
    ward_id INTEGER PRIMARY KEY,
    ward_name VARCHAR NOT NULL
);

-- 1. 選手マスタテーブル（player_mst）
-- 選手の基本情報を管理
CREATE TABLE IF NOT EXISTS player_mst (
    player_id SERIAL PRIMARY KEY,
    discord_id TEXT UNIQUE,
    jsta_number TEXT,
    player_name TEXT NOT NULL,
    post_number TEXT,
    address TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    birth_date DATE NOT NULL,
    sex INTEGER NOT NULL CHECK (sex IN (0, 1)),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- 2. 大会情報マスタテーブル（tournament_mst）
-- 大会の情報を管理
CREATE TABLE IF NOT EXISTS tournament_mst (
    tournament_id TEXT PRIMARY KEY,
    registrated_ward INTEGER NOT NULL,
    tournament_name TEXT NOT NULL,
    classification INTEGER NOT NULL CHECK (classification IN (0, 1, 2)),
    mix_flg BOOLEAN NOT NULL,
    type TEXT[] NOT NULL,
    tournament_date DATE NOT NULL,
    deadline_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- 3. 大会申込情報テーブル（tournament_registration）
-- 大会への申込情報を管理
CREATE TABLE IF NOT EXISTS tournament_registration (
    registration_id SERIAL PRIMARY KEY,
    discord_id TEXT NOT NULL,
    tournament_id TEXT NOT NULL REFERENCES tournament_mst(tournament_id),
    type TEXT NOT NULL,
    sex INTEGER NOT NULL CHECK (sex IN (0, 1)),
    pair1 INTEGER NOT NULL REFERENCES player_mst(player_id),
    pair2 INTEGER[],
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    
    -- 同じユーザーが同じ大会に同じ種別で複数回申し込めないようにする
    UNIQUE(discord_id, tournament_id, type)
);

-- ===================================================================
-- インデックス作成（検索を高速化）
-- ===================================================================

-- player_mst のインデックス
CREATE INDEX IF NOT EXISTS idx_player_discord_id 
    ON player_mst(discord_id);

CREATE INDEX IF NOT EXISTS idx_player_jsta_number 
    ON player_mst(jsta_number);

-- tournament_mst のインデックス
CREATE INDEX IF NOT EXISTS idx_tournament_ward 
    ON tournament_mst(registrated_ward);

CREATE INDEX IF NOT EXISTS idx_tournament_classification 
    ON tournament_mst(classification);

CREATE INDEX IF NOT EXISTS idx_tournament_date 
    ON tournament_mst(tournament_date);

-- tournament_registration のインデックス
CREATE INDEX IF NOT EXISTS idx_registration_discord_id 
    ON tournament_registration(discord_id);

CREATE INDEX IF NOT EXISTS idx_registration_tournament_id 
    ON tournament_registration(tournament_id);

CREATE INDEX IF NOT EXISTS idx_registration_pair1 
    ON tournament_registration(pair1);

-- ===================================================================
-- トリガー作成（updated_at自動更新）
-- ===================================================================

-- トリガー関数を作成
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc', NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- player_mst のトリガー
DROP TRIGGER IF EXISTS update_player_mst_updated_at ON player_mst;
CREATE TRIGGER update_player_mst_updated_at 
    BEFORE UPDATE ON player_mst
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- tournament_mst のトリガー
DROP TRIGGER IF EXISTS update_tournament_mst_updated_at ON tournament_mst;
CREATE TRIGGER update_tournament_mst_updated_at 
    BEFORE UPDATE ON tournament_mst
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- tournament_registration のトリガー
DROP TRIGGER IF EXISTS update_tournament_registration_updated_at ON tournament_registration;
CREATE TRIGGER update_tournament_registration_updated_at 
    BEFORE UPDATE ON tournament_registration
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

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
ON CONFLICT (ward_id) DO NOTHING;

-- テスト用選手データ
INSERT INTO player_mst (
    discord_id, jsta_number, player_name, post_number, 
    address, phone_number, birth_date, sex
) VALUES 
    ('123456789', 'JSTA001', '山田太郎', '123-4567', 
     '東京都荒川区1-2-3', '090-1234-5678', '1990-01-15', 0),
    ('987654321', 'JSTA002', '佐藤花子', '123-4567', 
     '東京都江戸川区4-5-6', '080-9876-5432', '1992-05-20', 1)
ON CONFLICT (discord_id) DO NOTHING;

-- テスト用大会データ
INSERT INTO tournament_mst (
    tournament_id, registrated_ward, tournament_name, 
    classification, mix_flg, type, tournament_date, deadline_date
) VALUES 
    ('arakawa_2025_singles', 18, '荒川区シングルス大会2025', 
     2, false, ARRAY['一般', '35'], '2025-06-01', '2025-05-31'),
    ('edogawa_2025_doubles', 23, '江戸川区ダブルス大会2025', 
     0, false, ARRAY['一般', '45'], '2025-07-15', '2025-07-10')
ON CONFLICT (tournament_id) DO NOTHING;

-- ===================================================================
-- 確認用クエリ
-- ===================================================================

-- テーブル一覧を表示
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
    AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- 各テーブルのレコード数とカラム情報を確認
SELECT 
    'ward_mst' as table_name, COUNT(*) as record_count 
FROM ward_mst
UNION ALL
SELECT 
    'player_mst' as table_name, COUNT(*) as record_count 
FROM player_mst
UNION ALL
SELECT 
    'tournament_mst' as table_name, COUNT(*) as record_count 
FROM tournament_mst
UNION ALL
SELECT 
    'tournament_registration' as table_name, COUNT(*) as record_count 
FROM tournament_registration;

-- カラム情報を確認
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
    AND table_name IN ('ward_mst', 'player_mst', 'tournament_mst', 'tournament_registration')
ORDER BY table_name, ordinal_position;
