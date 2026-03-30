import { useState, useEffect } from 'react'

interface MyRegistrationsProps {
  discordId: string
  onNavigate: (page: string, tournamentId?: string) => void
}

export default function MyRegistrations({ discordId, onNavigate }: MyRegistrationsProps) {
  const [registrations, setRegistrations] = useState<any[]>([])
  const [tournaments, setTournaments] = useState<any[]>([])
  const [players, setPlayers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [cancellingId, setCancellingId] = useState<number | null>(null)
  const [editingPairId, setEditingPairId] = useState<number | null>(null)
  const [updatingPairId, setUpdatingPairId] = useState<number | null>(null)

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  const loadData = async () => {
    try {
      const [regRes, tourRes, playerRes] = await Promise.all([
        fetch(`${apiUrl}/api/registrations/user/${discordId}`),
        fetch(`${apiUrl}/api/tournaments`),
        fetch(`${apiUrl}/api/players`),
      ])

      if (regRes.ok) setRegistrations(await regRes.json())
      if (tourRes.ok) setTournaments(await tourRes.json())
      if (playerRes.ok) setPlayers(await playerRes.json())
    } catch {
      // エラー時は空
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [discordId])

  const getTournament = (id: string) => tournaments.find(t => t.tournament_id === id)
  const getPlayer = (id: number) => players.find(p => p.player_id === id)

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    const d = new Date(dateStr)
    return `${d.getMonth() + 1}/${d.getDate()}`
  }

  const isBeforeDeadline = (tournament: any) => {
    if (!tournament?.deadline_date) return false
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const deadline = new Date(tournament.deadline_date)
    deadline.setHours(0, 0, 0, 0)
    return today <= deadline
  }

  const handlePairChange = async (registrationId: number, newPairId: number) => {
    setUpdatingPairId(registrationId)
    try {
      const res = await fetch(`${apiUrl}/api/registrations/${registrationId}/pair`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pair1: newPairId })
      })
      if (res.ok) {
        setRegistrations(prev => prev.map(r => r.id === registrationId ? { ...r, pair1: newPairId } : r))
        setEditingPairId(null)
      } else {
        const err = await res.json()
        alert(`ペア変更に失敗しました: ${err.detail || ''}`)
      }
    } catch {
      alert('通信エラーが発生しました')
    } finally {
      setUpdatingPairId(null)
    }
  }

  const handleCancel = async (registrationId: number, tournamentName: string) => {
    if (!confirm(`「${tournamentName}」の申込をキャンセルしますか？`)) return

    setCancellingId(registrationId)
    try {
      const res = await fetch(`${apiUrl}/api/registrations/${registrationId}`, { method: 'DELETE' })
      if (res.ok) {
        setRegistrations(prev => prev.filter(r => r.id !== registrationId))
      } else {
        const err = await res.json()
        alert(`キャンセルに失敗しました: ${err.detail || ''}`)
      }
    } catch {
      alert('通信エラーが発生しました')
    } finally {
      setCancellingId(null)
    }
  }

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>読み込み中...</div>
  }

  const cellStyle = {
    padding: '10px 12px',
    borderBottom: '1px solid #1e293b',
    fontSize: '13px',
    color: '#e2e8f0',
    whiteSpace: 'nowrap' as const,
  }

  const headerCellStyle = {
    ...cellStyle,
    color: '#64748b',
    fontSize: '12px',
    fontWeight: '600' as const,
    backgroundColor: '#070e1b',
    borderBottom: '2px solid #1e293b',
  }

  return (
    <div>
      <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#e2e8f0', marginBottom: '20px' }}>
        申込履歴
      </h2>

      {registrations.length === 0 ? (
        <div style={{
          padding: '40px', textAlign: 'center', color: '#94a3b8',
          backgroundColor: '#0c1220', borderRadius: '12px', border: '1px solid #1e293b'
        }}>
          <p>申込履歴はありません</p>
          <button
            onClick={() => onNavigate('apply')}
            style={{
              marginTop: '16px', padding: '8px 20px', borderRadius: '6px',
              backgroundColor: '#1e3a8a', color: '#93c5fd', border: '1px solid #2563eb',
              fontSize: '13px', cursor: 'pointer',
            }}
          >
            大会に申し込む
          </button>
        </div>
      ) : (
        <>
          {/* PC: テーブル */}
          <div className="reg-table" style={{
            borderRadius: '10px', border: '1px solid #1e293b',
            overflow: 'auto', backgroundColor: '#0c1220',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={headerCellStyle}>大会名</th>
                  <th style={headerCellStyle}>種別</th>
                  <th style={headerCellStyle}>開催日</th>
                  <th style={headerCellStyle}>ペア</th>
                  <th style={{ ...headerCellStyle, textAlign: 'center' }}></th>
                </tr>
              </thead>
              <tbody>
                {registrations.map(reg => {
                  const tournament = getTournament(reg.tournament_id)
                  const pair = getPlayer(reg.pair1)
                  const tournamentName = tournament?.tournament_name || reg.tournament_id
                  const isPast = tournament && new Date(tournament.tournament_date) < new Date()
                  const canEdit = !isPast && isBeforeDeadline(tournament) && reg.is_applicant !== false
                  const isEditingThis = editingPairId === reg.id
                  const isApplicant = reg.is_applicant !== false

                  return (
                    <tr key={reg.id}>
                      <td style={{ ...cellStyle, fontWeight: '500', whiteSpace: 'normal', minWidth: '140px' }}>
                        {tournamentName}
                        {!isApplicant && (
                          <span style={{
                            marginLeft: '6px', fontSize: '11px', color: '#60a5fa',
                            backgroundColor: '#1e3a8a', padding: '1px 6px', borderRadius: '4px',
                          }}>ペア</span>
                        )}
                      </td>
                      <td style={cellStyle}>{reg.type}</td>
                      <td style={cellStyle}>
                        {tournament ? formatDate(tournament.tournament_date) : '-'}
                      </td>
                      <td style={cellStyle}>
                        {isEditingThis ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <select
                              defaultValue={reg.pair1}
                              onChange={(e) => handlePairChange(reg.id, parseInt(e.target.value))}
                              disabled={updatingPairId === reg.id}
                              style={{
                                padding: '4px 8px', borderRadius: '5px',
                                backgroundColor: '#0f172a', color: '#e2e8f0',
                                border: '1px solid #334155', fontSize: '12px',
                                maxWidth: '120px',
                              }}
                            >
                              {players.map(p => (
                                <option key={p.player_id} value={p.player_id}>{p.player_name}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => setEditingPairId(null)}
                              style={{
                                padding: '3px 8px', borderRadius: '5px',
                                backgroundColor: 'transparent', color: '#94a3b8',
                                border: '1px solid #334155', fontSize: '11px', cursor: 'pointer',
                              }}
                            >
                              戻る
                            </button>
                          </div>
                        ) : (
                          pair?.player_name || '-'
                        )}
                      </td>
                      <td style={{ ...cellStyle, textAlign: 'center' }}>
                        {isPast ? (
                          <span style={{ fontSize: '12px', color: '#64748b' }}>終了</span>
                        ) : isApplicant ? (
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                            {canEdit && !isEditingThis && (
                              <button
                                onClick={() => setEditingPairId(reg.id)}
                                style={{
                                  padding: '4px 10px', borderRadius: '5px',
                                  backgroundColor: 'transparent', color: '#60a5fa',
                                  border: '1px solid #1e3a8a', fontSize: '12px', cursor: 'pointer',
                                }}
                              >
                                ペア変更
                              </button>
                            )}
                            <button
                              onClick={() => handleCancel(reg.id, tournamentName)}
                              disabled={cancellingId === reg.id}
                              style={{
                                padding: '4px 12px', borderRadius: '5px',
                                backgroundColor: 'transparent', color: '#f87171',
                                border: '1px solid #7f1d1d', fontSize: '12px',
                                cursor: cancellingId === reg.id ? 'not-allowed' : 'pointer',
                                opacity: cancellingId === reg.id ? 0.5 : 1,
                              }}
                            >
                              {cancellingId === reg.id ? '...' : 'キャンセル'}
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: '12px', color: '#64748b' }}>-</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* スマホ: カード */}
          <div className="reg-cards" style={{ display: 'none', flexDirection: 'column', gap: '10px' }}>
            {registrations.map(reg => {
              const tournament = getTournament(reg.tournament_id)
              const pair = getPlayer(reg.pair1)
              const tournamentName = tournament?.tournament_name || reg.tournament_id
              const isPast = tournament && new Date(tournament.tournament_date) < new Date()
              const isApplicant = reg.is_applicant !== false
              const canEdit = !isPast && isBeforeDeadline(tournament) && isApplicant
              const isEditingThis = editingPairId === reg.id

              return (
                <div key={reg.id} style={{
                  padding: '14px 16px', backgroundColor: '#0c1220',
                  borderRadius: '10px', border: '1px solid #1e293b',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#f1f5f9', margin: 0, flex: 1 }}>
                      {tournamentName}
                      {!isApplicant && (
                        <span style={{
                          marginLeft: '6px', fontSize: '11px', color: '#60a5fa',
                          backgroundColor: '#1e3a8a', padding: '1px 6px', borderRadius: '4px',
                          fontWeight: '400',
                        }}>ペア</span>
                      )}
                    </h3>
                    {isPast ? (
                      <span style={{ fontSize: '12px', color: '#64748b', marginLeft: '8px' }}>終了</span>
                    ) : isApplicant ? (
                      <div style={{ display: 'flex', gap: '6px', marginLeft: '8px', flexShrink: 0 }}>
                        {canEdit && !isEditingThis && (
                          <button
                            onClick={() => setEditingPairId(reg.id)}
                            style={{
                              padding: '4px 10px', borderRadius: '5px',
                              backgroundColor: 'transparent', color: '#60a5fa',
                              border: '1px solid #1e3a8a', fontSize: '12px', cursor: 'pointer',
                            }}
                          >
                            ペア変更
                          </button>
                        )}
                        <button
                          onClick={() => handleCancel(reg.id, tournamentName)}
                          disabled={cancellingId === reg.id}
                          style={{
                            padding: '4px 10px', borderRadius: '5px',
                            backgroundColor: 'transparent', color: '#f87171',
                            border: '1px solid #7f1d1d', fontSize: '12px', cursor: 'pointer',
                          }}
                        >
                          キャンセル
                        </button>
                      </div>
                    ) : null}
                  </div>
                  {isEditingThis && (
                    <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <select
                        defaultValue={reg.pair1}
                        onChange={(e) => handlePairChange(reg.id, parseInt(e.target.value))}
                        disabled={updatingPairId === reg.id}
                        style={{
                          padding: '6px 10px', borderRadius: '6px', flex: 1,
                          backgroundColor: '#0f172a', color: '#e2e8f0',
                          border: '1px solid #334155', fontSize: '13px',
                        }}
                      >
                        {players.map(p => (
                          <option key={p.player_id} value={p.player_id}>{p.player_name}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => setEditingPairId(null)}
                        style={{
                          padding: '5px 10px', borderRadius: '5px',
                          backgroundColor: 'transparent', color: '#94a3b8',
                          border: '1px solid #334155', fontSize: '12px', cursor: 'pointer',
                        }}
                      >
                        戻る
                      </button>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '14px', fontSize: '13px', color: '#94a3b8' }}>
                    <span><span style={{ color: '#64748b' }}>種別 </span>{reg.type}</span>
                    <span><span style={{ color: '#64748b' }}>開催 </span>{tournament ? formatDate(tournament.tournament_date) : '-'}</span>
                    <span><span style={{ color: '#64748b' }}>ペア </span>{pair?.player_name || '-'}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      <style>{`
        @media (max-width: 640px) {
          .reg-table { display: none !important; }
          .reg-cards { display: flex !important; }
        }
      `}</style>
    </div>
  )
}
