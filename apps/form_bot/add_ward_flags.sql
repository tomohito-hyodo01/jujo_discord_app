-- player_mstテーブルに各区の登録フラグを追加

ALTER TABLE player_mst 
ADD COLUMN IF NOT EXISTS tokyo_flg BOOLEAN DEFAULT false,    -- 東京都
ADD COLUMN IF NOT EXISTS koto_flg BOOLEAN DEFAULT false,     -- 江東区
ADD COLUMN IF NOT EXISTS edogawa_flg BOOLEAN DEFAULT false,  -- 江戸川区
ADD COLUMN IF NOT EXISTS chuo_flg BOOLEAN DEFAULT false,     -- 中央区
ADD COLUMN IF NOT EXISTS sumida_flg BOOLEAN DEFAULT false;   -- 墨田区

-- インデックス作成（検索高速化）
CREATE INDEX IF NOT EXISTS idx_player_tokyo_flg ON player_mst(tokyo_flg);
CREATE INDEX IF NOT EXISTS idx_player_koto_flg ON player_mst(koto_flg);
CREATE INDEX IF NOT EXISTS idx_player_edogawa_flg ON player_mst(edogawa_flg);
CREATE INDEX IF NOT EXISTS idx_player_chuo_flg ON player_mst(chuo_flg);
CREATE INDEX IF NOT EXISTS idx_player_sumida_flg ON player_mst(sumida_flg);

COMMENT ON COLUMN player_mst.tokyo_flg IS '東京都への登録フラグ';
COMMENT ON COLUMN player_mst.koto_flg IS '江東区への登録フラグ';
COMMENT ON COLUMN player_mst.edogawa_flg IS '江戸川区への登録フラグ';
COMMENT ON COLUMN player_mst.chuo_flg IS '中央区への登録フラグ';
COMMENT ON COLUMN player_mst.sumida_flg IS '墨田区への登録フラグ';

