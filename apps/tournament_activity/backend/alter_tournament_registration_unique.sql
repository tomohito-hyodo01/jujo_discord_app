-- 同じ大会・種別への複数申込を許可する（管理者が代理申込で同じ大会に複数チームを作るため）
--
-- 変更前: UNIQUE (discord_id, tournament_id, type)
--   → 同じ申込者は同じ大会・種別に1件しか登録できず、2チーム目で
--     「Duplicate entry ... for key 'unique_registration'」になっていた
-- 変更後: UNIQUE (discord_id, tournament_id, type, pair1)
--   → 先頭メンバー(pair1)が違えば複数登録できる。まったく同じ内容の二重登録だけはDBでも防ぐ
--
-- 一般会員の「同じ大会への複数申込」は API 側（registrations.py）で止める。
-- 本番（X-Server）には 2026-09-07 に適用済み。

ALTER TABLE tournament_registration DROP INDEX unique_registration;
ALTER TABLE tournament_registration ADD UNIQUE KEY unique_registration (discord_id, tournament_id, type, pair1);
