import { useState, useEffect } from 'react'

export default function AppLogViewer() {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchId, setSearchId] = useState('')

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  const loadLogs = async (discordId?: string) => {
    setLoading(true)
    try {
      const url = discordId
        ? `${apiUrl}/api/logs/search?discord_id=${encodeURIComponent(discordId)}`
        : `${apiUrl}/api/logs`
      const res = await fetch(url)
      if (res.ok) setLogs(await res.json())
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { loadLogs() }, [])

  const handleSearch = () => {
    if (searchId.trim()) {
      loadLogs(searchId.trim())
    } else {
      loadLogs()
    }
  }

  const formatDateTime = (d: string) => {
    const dt = new Date(d)
    return `${dt.getMonth() + 1}/${dt.getDate()} ${dt.getHours()}:${String(dt.getMinutes()).padStart(2, '0')}:${String(dt.getSeconds()).padStart(2, '0')}`
  }

  const levelColors: Record<string, { bg: string; color: string }> = {
    INFO: { bg: '#064e3b', color: '#6ee7b7' },
    WARN: { bg: '#78350f', color: '#fbbf24' },
    ERROR: { bg: '#7f1d1d', color: '#fca5a5' },
  }

  const cellStyle = {
    padding: '8px 10px', borderBottom: '1px solid #1e293b',
    fontSize: '12px', color: '#e2e8f0', whiteSpace: 'nowrap' as const,
  }
  const headerCellStyle = {
    ...cellStyle, color: '#64748b', fontWeight: '600' as const,
    backgroundColor: '#070e1b', borderBottom: '2px solid #1e293b',
  }

  return (
    <div>
      <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#e2e8f0', marginBottom: '16px' }}>
        アプリケーションログ
      </h2>

      {/* 検索 */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Discord IDで検索"
          value={searchId}
          onChange={e => setSearchId(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          style={{
            padding: '8px 12px', backgroundColor: '#0c1220', border: '1px solid #1e293b',
            borderRadius: '6px', color: '#e2e8f0', fontSize: '13px', width: '220px',
          }}
        />
        <button onClick={handleSearch} style={{
          padding: '8px 14px', borderRadius: '6px', backgroundColor: '#1e3a8a', color: '#93c5fd',
          border: '1px solid #2563eb', fontSize: '13px', cursor: 'pointer',
        }}>検索</button>
        {searchId && (
          <button onClick={() => { setSearchId(''); loadLogs() }} style={{
            padding: '8px 12px', borderRadius: '6px', backgroundColor: 'transparent', color: '#94a3b8',
            border: '1px solid #334155', fontSize: '13px', cursor: 'pointer',
          }}>クリア</button>
        )}
        <button onClick={() => loadLogs(searchId.trim() || undefined)} style={{
          padding: '8px 12px', borderRadius: '6px', backgroundColor: 'transparent', color: '#94a3b8',
          border: '1px solid #334155', fontSize: '13px', cursor: 'pointer',
        }}>更新</button>
        <span style={{ fontSize: '12px', color: '#64748b', alignSelf: 'center' }}>{logs.length}件</span>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>読み込み中...</div>
      ) : logs.length === 0 ? (
        <div style={{
          padding: '40px', textAlign: 'center', color: '#94a3b8',
          backgroundColor: '#0c1220', borderRadius: '12px', border: '1px solid #1e293b',
        }}>ログはありません</div>
      ) : (
        <>
          {/* PC: テーブル */}
          <div className="log-table" style={{
            borderRadius: '10px', border: '1px solid #1e293b', overflow: 'auto', backgroundColor: '#0c1220',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={headerCellStyle}>日時</th>
                <th style={headerCellStyle}>レベル</th>
                <th style={headerCellStyle}>Discord ID</th>
                <th style={headerCellStyle}>ユーザー名</th>
                <th style={headerCellStyle}>イベント</th>
                <th style={headerCellStyle}>権限</th>
                <th style={headerCellStyle}>会員</th>
                <th style={headerCellStyle}>詳細</th>
              </tr></thead>
              <tbody>
                {logs.map(log => {
                  const lc = levelColors[log.level] || levelColors.INFO
                  return (
                    <tr key={log.id}>
                      <td style={cellStyle}>{formatDateTime(log.timestamp)}</td>
                      <td style={cellStyle}>
                        <span style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '11px', backgroundColor: lc.bg, color: lc.color }}>{log.level}</span>
                      </td>
                      <td style={{ ...cellStyle, fontFamily: 'monospace', fontSize: '11px' }}>{log.discord_id || '-'}</td>
                      <td style={cellStyle}>{log.username || '-'}</td>
                      <td style={cellStyle}>{log.event}</td>
                      <td style={cellStyle}>{log.admin_role || '-'}</td>
                      <td style={cellStyle}>{log.member_level_name || '-'}</td>
                      <td style={{ ...cellStyle, whiteSpace: 'normal' as const, maxWidth: '300px', fontSize: '11px', color: '#94a3b8' }}>{log.detail || '-'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* スマホ: カード */}
          <div className="log-cards" style={{ display: 'none', flexDirection: 'column', gap: '8px' }}>
            {logs.map(log => {
              const lc = levelColors[log.level] || levelColors.INFO
              return (
                <div key={log.id} style={{
                  padding: '12px 14px', backgroundColor: '#0c1220', borderRadius: '8px', border: '1px solid #1e293b',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>{formatDateTime(log.timestamp)}</span>
                    <span style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '11px', backgroundColor: lc.bg, color: lc.color }}>{log.level}</span>
                  </div>
                  <div style={{ fontSize: '13px', color: '#e2e8f0', fontWeight: '500', marginBottom: '2px' }}>
                    {log.event} {log.username && <span style={{ color: '#94a3b8', fontWeight: '400' }}>- {log.username}</span>}
                  </div>
                  {log.discord_id && <div style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>{log.discord_id}</div>}
                  {(log.admin_role || log.member_level_name) && (
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                      {log.admin_role && <span>権限: {log.admin_role}</span>}
                      {log.admin_role && log.member_level_name && <span> / </span>}
                      {log.member_level_name && <span>会員: {log.member_level_name}</span>}
                    </div>
                  )}
                  {log.detail && <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>{log.detail}</div>}
                </div>
              )
            })}
          </div>
        </>
      )}

      <style>{`
        @media (max-width: 640px) {
          .log-table { display: none !important; }
          .log-cards { display: flex !important; }
        }
      `}</style>
    </div>
  )
}
