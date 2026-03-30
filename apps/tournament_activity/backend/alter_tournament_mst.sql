-- tournament_mst に新カラムを追加（全て任意項目）
ALTER TABLE tournament_mst
  ADD COLUMN venue TEXT DEFAULT NULL COMMENT '会場',
  ADD COLUMN reception_time VARCHAR(10) DEFAULT NULL COMMENT '受付時刻',
  ADD COLUMN opening_time VARCHAR(10) DEFAULT NULL COMMENT '開会式時刻',
  ADD COLUMN match_start_time VARCHAR(10) DEFAULT NULL COMMENT '試合開始時刻',
  ADD COLUMN entry_fee VARCHAR(100) DEFAULT NULL COMMENT '参加費',
  ADD COLUMN guideline_pdf_path TEXT DEFAULT NULL COMMENT '要項PDFファイルパス';
