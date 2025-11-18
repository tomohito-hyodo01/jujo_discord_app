-- player_mstテーブルに所属クラブカラムを追加

ALTER TABLE player_mst 
ADD COLUMN IF NOT EXISTS affiliated_club VARCHAR(100);

COMMENT ON COLUMN player_mst.affiliated_club IS '所属クラブ名';

-- インデックス作成（検索用）
CREATE INDEX IF NOT EXISTS idx_player_affiliated_club ON player_mst(affiliated_club);

