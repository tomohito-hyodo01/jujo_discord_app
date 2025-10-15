-- セッションテーブルを作成

CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    discord_id TEXT NOT NULL,
    username TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_sessions_discord_id ON sessions(discord_id);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at);

