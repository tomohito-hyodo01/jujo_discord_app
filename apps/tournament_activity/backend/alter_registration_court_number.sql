-- tournament_registration にコート番号カラムを追加
ALTER TABLE tournament_registration
  ADD COLUMN court_number VARCHAR(50) DEFAULT NULL COMMENT 'コート番号';
