-- 選手の大会参加制限フラグ
-- ONの選手は解除されるまで大会申込ができない（過去に大会を棄権した選手向け）
ALTER TABLE player_mst
  ADD COLUMN IF NOT EXISTS entry_restriction_flg TINYINT(1) DEFAULT 0
  COMMENT '大会参加制限(1=制限中,0=通常)';
