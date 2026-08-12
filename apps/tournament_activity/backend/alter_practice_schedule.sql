-- practice_schedule に前日リマインドの送信済み日時を追加
-- 二重送信（cronの重複実行・手動再実行）で参加者へメンションが複数回飛ぶのを防ぐ
--
-- 適用方法（X-Serverにsshして手動実行）:
--   mysql -u <DB_USER> -p <DB_NAME> < alter_practice_schedule.sql
--
-- 未適用でもAPIは動作する（送信済み判定をスキップし、二重送信の可能性だけが残る）
ALTER TABLE practice_schedule
  ADD COLUMN IF NOT EXISTS reminder_sent_at DATETIME DEFAULT NULL
  COMMENT '前日リマインド送信日時(NULL=未送信)';

-- 手動で再送したい場合は該当練習のフラグを戻す
--   UPDATE practice_schedule SET reminder_sent_at = NULL WHERE id = <practice_id>;
-- もしくは API を force=true で叩く
--   curl -X POST 'http://localhost:8000/api/practice/notify-tomorrow-participants?target_date=2026-08-11&force=true'
