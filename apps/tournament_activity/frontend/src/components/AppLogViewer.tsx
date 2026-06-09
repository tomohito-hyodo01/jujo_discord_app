import { useState, useEffect } from 'react'

export default function AppLogViewer() {
  const [activeTab, setActiveTab] = useState<'login' | 'audit'>('login')

  // --- ログイン履歴 ---
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchId, setSearchId] = useState('')

  // --- 操作ログ（監査） ---
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditKind, setAuditKind] = useState<'' | 'request' | 'change'>('')

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

  const loadAudit = async (kind?: string) => {
    setAuditLoading(true)
    try {
      const url = kind ? `${apiUrl}/api/audit-logs?kind=${kind}` : `${apiUrl}/api/audit-logs`
      const res = await fetch(url)
      if (res.ok) setAuditLogs(await res.json())
    } catch {} finally { setAuditLoading(false) }
  }

  useEffect(() => { loadLogs() }, [])
  useEffect(() => {
    if (activeTab === 'audit') loadAudit(auditKind || undefined)
  }, [activeTab, auditKind])

  const handleSearch = () => {
    if (searchId.trim()) loadLogs(searchId.trim())
    else loadLogs()
  }

  const formatDateTime = (d: string) => {
    if (!d) return ''
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

  const statusColor = (code: number) => {
    if (!code) return { bg: '#1e293b', color: '#94a3b8' }
    if (code >= 500) return { bg: '#7f1d1d', color: '#fca5a5' }
    if (code >= 400) return { bg: '#78350f', color: '#fbbf24' }
    if (code >= 200 && code < 300) return { bg: '#064e3b', color: '#6ee7b7' }
    return { bg: '#1e293b', color: '#94a3b8' }
  }

  const tabBtn = (active: boolean) => ({
    padding: '8px 18px', borderRadius: '8px 8px 0 0', fontSize: '13px',
    fontWeight: '600' as const, cursor: 'pointer', border: 'none',
    backgroundColor: active ? '#0c1220' : 'transparent',
    color: active ? '#60a5fa' : '#94a3b8',
    borderBottom: active ? '2px solid #3b82f6' : '2px solid transparent',
  })

  return (
    <div>
      <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#e2e8f0', marginBottom: '12px' }}>
        ログ
      </h2>

      {/* タブ */}
      <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid #1e293b', marginBottom: '16px' }}>
        <button onClick={() => setActiveTab('login')} style={tabBtn(activeTab === 'login')}>ログイン履歴</button>
        <button onClick={() => setActiveTab('audit')} style={tabBtn(activeTab === 'audit')}>操作ログ</button>
      </div>

      {activeTab === 'login' && (
        <>
          {/* 検索 */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <input
              type="text" placeholder="Discord IDで検索" value={searchId}
              onChange={e => setSearchId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              style={{ padding: '8px 12px', backgroundColor: '#0c1220', border: '1px solid #1e293b', borderRadius: '6px', color: '#e2e8f0', fontSize: '13px', width: '220px' }}
            />
            <button onClick={handleSearch} style={{ padding: '8px 14px', borderRadius: '6px', backgroundColor: '#1e3a8a', color: '#93c5fd', border: '1px solid #2563eb', fontSize: '13px', cursor: 'pointer' }}>検索</button>
            {searchId && (
              <button onClick={() => { setSearchId(''); loadLogs() }} style={{ padding: '8px 12px', borderRadius: '6px', backgroundColor: 'transparent', color: '#94a3b8', border: '1px solid #334155', fontSize: '13px', cursor: 'pointer' }}>クリア</button>
            )}
            <button onClick={() => loadLogs(searchId.trim() || undefined)} style={{ padding: '8px 12px', borderRadius: '6px', backgroundColor: 'transparent', color: '#94a3b8', border: '1px solid #334155', fontSize: '13px', cursor: 'pointer' }}>更新</button>
            <span style={{ fontSize: '12px', color: '#64748b', alignSelf: 'center' }}>{logs.length}件</span>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>読み込み中...</div>
          ) : logs.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', backgroundColor: '#0c1220', borderRadius: '12px', border: '1px solid #1e293b' }}>ログはありません</div>
          ) : (
            <div style={{ borderRadius: '10px', border: '1px solid #1e293b', overflow: 'auto', backgroundColor: '#0c1220' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={headerCellStyle}>日時</th>
                  <th style={headerCellStyle}>レベル</th>
                  <th style={headerCellStyle}>選手名</th>
                  <th style={headerCellStyle}>Discord表示名</th>
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
                        <td style={cellStyle}><span style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '11px', backgroundColor: lc.bg, color: lc.color }}>{log.level}</span></td>
                        <td style={cellStyle}>{log.player_name || '-'}</td>
                        <td style={cellStyle}>{log.display_name || '-'}</td>
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
          )}
        </>
      )}

      {activeTab === 'audit' && (
        <>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
            {([['', '全て'], ['request', '操作(API)'], ['change', 'データ変更']] as const).map(([k, label]) => (
              <button key={k} onClick={() => setAuditKind(k as any)} style={{
                padding: '6px 14px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer',
                backgroundColor: auditKind === k ? '#1e3a8a' : 'transparent',
                color: auditKind === k ? '#93c5fd' : '#94a3b8',
                border: `1px solid ${auditKind === k ? '#2563eb' : '#334155'}`,
              }}>{label}</button>
            ))}
            <button onClick={() => loadAudit(auditKind || undefined)} style={{ padding: '6px 12px', borderRadius: '6px', backgroundColor: 'transparent', color: '#94a3b8', border: '1px solid #334155', fontSize: '13px', cursor: 'pointer' }}>更新</button>
            <span style={{ fontSize: '12px', color: '#64748b' }}>{auditLogs.length}件</span>
          </div>

          {auditLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>読み込み中...</div>
          ) : auditLogs.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', backgroundColor: '#0c1220', borderRadius: '12px', border: '1px solid #1e293b' }}>操作ログはありません</div>
          ) : (
            <div style={{ borderRadius: '10px', border: '1px solid #1e293b', overflow: 'auto', backgroundColor: '#0c1220' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={headerCellStyle}>日時</th>
                  <th style={headerCellStyle}>種別</th>
                  <th style={headerCellStyle}>実行者</th>
                  <th style={headerCellStyle}>操作</th>
                  <th style={headerCellStyle}>対象</th>
                  <th style={headerCellStyle}>状態</th>
                  <th style={headerCellStyle}>内容</th>
                </tr></thead>
                <tbody>
                  {auditLogs.map(a => {
                    const isChange = a.kind === 'change'
                    const kindBadge = isChange ? { bg: '#3730a3', color: '#c7d2fe', label: 'データ変更' } : { bg: '#0c4a6e', color: '#7dd3fc', label: '操作' }
                    const sc = statusColor(a.status_code)
                    return (
                      <tr key={a.id}>
                        <td style={cellStyle}>{formatDateTime(a.timestamp)}</td>
                        <td style={cellStyle}><span style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '11px', backgroundColor: kindBadge.bg, color: kindBadge.color }}>{kindBadge.label}</span></td>
                        <td style={cellStyle}>{a.actor_name || a.actor_discord_id || '-'}</td>
                        <td style={{ ...cellStyle, fontWeight: '600' }}>{isChange ? a.action : a.method}</td>
                        <td style={{ ...cellStyle, fontFamily: 'monospace', fontSize: '11px', whiteSpace: 'normal' as const, maxWidth: '240px' }}>
                          {isChange ? `${a.target_type || ''}${a.target_id ? ':' + a.target_id : ''}` : a.path}
                        </td>
                        <td style={cellStyle}>{a.status_code ? <span style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '11px', backgroundColor: sc.bg, color: sc.color }}>{a.status_code}</span> : '-'}</td>
                        <td style={{ ...cellStyle, whiteSpace: 'normal' as const, maxWidth: '380px', fontSize: '11px', color: '#94a3b8' }}>
                          {isChange ? (
                            <div>
                              {a.summary && <div style={{ color: '#cbd5e1', marginBottom: '2px' }}>{a.summary}</div>}
                              {a.before_json && <div><span style={{ color: '#f87171' }}>前:</span> <span style={{ fontFamily: 'monospace' }}>{a.before_json}</span></div>}
                              {a.after_json && <div><span style={{ color: '#6ee7b7' }}>後:</span> <span style={{ fontFamily: 'monospace' }}>{a.after_json}</span></div>}
                            </div>
                          ) : (
                            <span style={{ fontFamily: 'monospace' }}>{a.request_body || '-'}</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
