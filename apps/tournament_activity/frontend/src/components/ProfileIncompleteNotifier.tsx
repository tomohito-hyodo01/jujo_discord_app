import { useState, useEffect } from 'react'

interface ProfileIncompleteNotifierProps {
  discordId: string
}

interface IncompleteRegistration {
  registration_id: number
  tournament_name: string
  tournament_id: string
  applicant_name: string
  applicant_discord_id: string | null
  applicant_issues: string[]
  pair_name: string
  pair_issues: string[]
}

interface SendResult {
  registration_id: number
  tournament_name: string
  applicant_name: string
  status: string
  dm?: string
  channel?: string
}

export default function ProfileIncompleteNotifier({ discordId: _discordId }: ProfileIncompleteNotifierProps) {
  const [registrations, setRegistrations] = useState<IncompleteRegistration[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [sendChannel, setSendChannel] = useState(false)
  const [sending, setSending] = useState(false)
  const [results, setResults] = useState<SendResult[] | null>(null)

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)
    setResults(null)
    try {
      const res = await fetch(`${apiUrl}/api/notify/incomplete-profiles`)
      if (res.ok) {
        setRegistrations(await res.json())
        setSelectedIds(new Set())
      }
    } catch {} finally { setLoading(false) }
  }

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selectedIds.size === registrations.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(registrations.map(r => r.registration_id)))
    }
  }

  const handleSend = async () => {
    if (selectedIds.size === 0) return
    if (!confirm(`${selectedIds.size}件の申込に対して通知を送信しますか？`)) return
    setSending(true)
    setResults(null)
    try {
      const res = await fetch(`${apiUrl}/api/notify/send-profile-incomplete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registration_ids: Array.from(selectedIds), send_channel: sendChannel }),
      })
      if (res.ok) {
        const data = await res.json()
        setResults(data.results)
      } else { alert('送信に失敗しました') }
    } catch { alert('通信エラー') }
    finally { setSending(false) }
  }

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>読み込み中...</div>

  return (
    <div>
      <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#e2e8f0', marginBottom: '8px' }}>
        プロフィール不備通知
      </h2>
      <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px' }}>
        今後の大会申込で、プロフィール情報に不備がある申込の一覧です。申込者にDMで通知します。
      </p>

      {registrations.length === 0 ? (
        <div style={{
          padding: '40px', textAlign: 'center', borderRadius: '10px',
          backgroundColor: '#0c1220', border: '1px solid #1e293b', color: '#64748b',
        }}>不備のある申込はありません</div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', color: '#94a3b8' }}>
                <input type="checkbox" checked={selectedIds.size === registrations.length} onChange={toggleAll} style={{ accentColor: '#3b82f6' }} />
                全選択 ({selectedIds.size}/{registrations.length})
              </label>
              <button onClick={loadData} style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '12px', backgroundColor: '#1e293b', color: '#94a3b8', border: '1px solid #334155', cursor: 'pointer' }}>更新</button>
            </div>
            <span style={{ fontSize: '13px', color: '#64748b' }}>{registrations.length}件の不備あり</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
            {registrations.map(reg => {
              const isSelected = selectedIds.has(reg.registration_id)
              const sentResult = results?.find(r => r.registration_id === reg.registration_id)
              return (
                <div key={reg.registration_id} onClick={() => toggleSelect(reg.registration_id)} style={{
                  padding: '14px 16px', borderRadius: '10px',
                  backgroundColor: isSelected ? '#1e293b' : '#0c1220',
                  border: `1px solid ${isSelected ? '#334155' : '#1e293b'}`,
                  cursor: 'pointer', transition: 'all 0.15s',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(reg.registration_id)}
                      onClick={e => e.stopPropagation()} style={{ accentColor: '#3b82f6', marginTop: '2px', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* 大会名 */}
                      <div style={{ fontSize: '14px', fontWeight: '600', color: '#e2e8f0', marginBottom: '6px' }}>
                        {reg.tournament_name}
                      </div>
                      {/* 申込者 */}
                      <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '4px' }}>
                        申込者: {reg.applicant_name}
                        {!reg.applicant_discord_id && (
                          <span style={{ marginLeft: '6px', padding: '1px 6px', borderRadius: '4px', fontSize: '11px', backgroundColor: '#7f1d1d', color: '#fca5a5' }}>Discord未連携</span>
                        )}
                      </div>

                      {/* 申込者の不備 */}
                      {reg.applicant_issues.length > 0 && (
                        <div style={{ marginBottom: '6px' }}>
                          <span style={{ fontSize: '12px', color: '#64748b' }}>【{reg.applicant_name}】</span>
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '2px' }}>
                            {reg.applicant_issues.map((issue, i) => (
                              <span key={i} style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', backgroundColor: '#7f1d1d', color: '#fca5a5' }}>{issue}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* ペアの不備 */}
                      {reg.pair_issues.length > 0 && (
                        <div style={{ marginBottom: '6px' }}>
                          <span style={{ fontSize: '12px', color: '#64748b' }}>【{reg.pair_name}（ペア）】</span>
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '2px' }}>
                            {reg.pair_issues.map((issue, i) => (
                              <span key={i} style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', backgroundColor: '#78350f', color: '#fbbf24' }}>{issue}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 送信結果 */}
                      {sentResult && (
                        <div style={{
                          marginTop: '8px', padding: '8px 10px', borderRadius: '6px',
                          backgroundColor: sentResult.status === 'sent' ? '#064e3b' : '#1e293b',
                          fontSize: '12px', color: sentResult.status === 'sent' ? '#6ee7b7' : '#94a3b8',
                        }}>
                          DM: {sentResult.dm === 'sent' ? '送信済' : sentResult.dm === 'no_discord_id' ? 'Discord未連携' : `失敗(${sentResult.dm})`}
                          {sentResult.channel && sentResult.channel !== 'not_requested' && (
                            <> / チャンネル: {sentResult.channel === 'sent' ? '送信済' : `失敗(${sentResult.channel})`}</>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ padding: '16px', borderRadius: '10px', backgroundColor: '#0f172a', border: '1px solid #1e293b' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '14px', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', color: '#94a3b8' }}>
                <input type="checkbox" checked={sendChannel} onChange={e => setSendChannel(e.target.checked)} style={{ accentColor: '#3b82f6' }} />
                Discordチャンネルにも通知する
              </label>
            </div>
            <button onClick={handleSend} disabled={sending || selectedIds.size === 0} style={{
              padding: '12px 24px', borderRadius: '8px', fontSize: '14px', fontWeight: '600',
              backgroundColor: selectedIds.size === 0 ? '#1e293b' : '#1e3a8a',
              color: selectedIds.size === 0 ? '#475569' : '#93c5fd',
              border: `1px solid ${selectedIds.size === 0 ? '#334155' : '#2563eb'}`,
              cursor: selectedIds.size === 0 || sending ? 'not-allowed' : 'pointer', width: '100%',
            }}>{sending ? '送信中...' : `通知を送信（${selectedIds.size}件）`}</button>
          </div>
        </>
      )}
    </div>
  )
}
