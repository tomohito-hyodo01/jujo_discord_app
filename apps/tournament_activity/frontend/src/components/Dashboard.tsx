import { useState, useEffect, useMemo } from 'react'
import TournamentCalendar from './TournamentCalendar'

interface DashboardProps {
  discordId: string
  onNavigate: (page: string, tournamentId?: string) => void
  guestMode?: boolean
}

export default function Dashboard({ discordId, onNavigate, guestMode = false }: DashboardProps) {
  const [allTournaments, setAllTournaments] = useState<any[]>([])
  const [tournaments, setTournaments] = useState<any[]>([])
  const [wards, setWards] = useState<any[]>([])
  const [registrations, setRegistrations] = useState<any[]>([])
  const [practices, setPractices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [eventFilter, setEventFilter] = useState<'all' | 'tournament' | 'practice'>(guestMode ? 'practice' : 'all')
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list')
  const [myPlayerId, setMyPlayerId] = useState<number | null>(null)
  const [joinedPracticeIds, setJoinedPracticeIds] = useState<Set<number>>(new Set())
  const [joiningId, setJoiningId] = useState<number | null>(null)

  useEffect(() => {
    const loadData = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'

        let practiceData: any[] = []

        if (guestMode) {
          const practRes = await fetch(`${apiUrl}/api/practice`)
          if (practRes.ok) {
            practiceData = await practRes.json()
            setPractices(practiceData)
          }
        } else {
          const [tourRes, wardRes, regRes, practRes] = await Promise.all([
            fetch(`${apiUrl}/api/tournaments`),
            fetch(`${apiUrl}/api/wards`),
            fetch(`${apiUrl}/api/registrations/user/${discordId}`),
            fetch(`${apiUrl}/api/practice`),
          ])

          if (tourRes.ok) {
            const data = await tourRes.json()
            setAllTournaments(data)
            const today = new Date().toLocaleDateString('sv-SE')
            const upcoming = data
              .filter((t: any) => t.tournament_date >= today)
              .sort((a: any, b: any) => a.tournament_date.localeCompare(b.tournament_date))
            setTournaments(upcoming)
          }

          if (wardRes.ok) setWards(await wardRes.json())
          if (regRes.ok) setRegistrations(await regRes.json())
          if (practRes.ok) {
            practiceData = await practRes.json()
            setPractices(practiceData)
          }
        }

        // プレイヤー情報と練習参加状況（ゲスト・通常共通）
        if (discordId) {
          const meRes = await fetch(`${apiUrl}/api/players/discord/${discordId}`)
          if (meRes.ok) {
            const me = await meRes.json()
            if (me?.player_id) {
              setMyPlayerId(me.player_id)
              if (practiceData.length > 0) {
                const joined = new Set<number>()
                await Promise.all(practiceData.map(async (p: any) => {
                  const pRes = await fetch(`${apiUrl}/api/practice/${p.id}/participants`)
                  if (pRes.ok) {
                    const pts = await pRes.json()
                    if (pts.some((pt: any) => pt.player_id === me.player_id)) joined.add(p.id)
                  }
                }))
                setJoinedPracticeIds(joined)
              }
            }
          }
        }
      } catch {} finally { setLoading(false) }
    }

    loadData()
  }, [discordId])

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    const weekdays = ['日', '月', '火', '水', '木', '金', '土']
    return `${d.getMonth() + 1}/${d.getDate()}(${weekdays[d.getDay()]})`
  }

  const formatTime = (t: string) => t?.slice(0, 5) || ''

  const apiUrlRef = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  const handlePracticeJoin = async (practiceId: number) => {
    if (!myPlayerId || joinedPracticeIds.has(practiceId)) return
    setJoiningId(practiceId)
    try {
      const res = await fetch(`${apiUrlRef}/api/practice/${practiceId}/join`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: myPlayerId }),
      })
      if (res.ok) {
        setJoinedPracticeIds(prev => new Set(prev).add(practiceId))
        // 練習一覧を再取得して参加者数を更新
        const pRes = await fetch(`${apiUrlRef}/api/practice`)
        if (pRes.ok) setPractices(await pRes.json())
      }
    } catch { alert('通信エラー') }
    finally { setJoiningId(null) }
  }

  const getDaysUntil = (dateStr: string) => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const target = new Date(dateStr); target.setHours(0, 0, 0, 0)
    return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  }

  // 大会と練習を統合して日付順にソート
  const upcomingPractices = useMemo(() => {
    const today = new Date().toLocaleDateString('sv-SE')
    return practices
      .filter(p => p.practice_date >= today)
      .sort((a, b) => a.practice_date.localeCompare(b.practice_date))
  }, [practices])

  type EventItem = { kind: 'tournament'; date: string; data: any } | { kind: 'practice'; date: string; data: any }

  const allEvents = useMemo(() => {
    const items: EventItem[] = []
    if (eventFilter !== 'practice') {
      tournaments.forEach(t => items.push({ kind: 'tournament', date: t.tournament_date, data: t }))
    }
    if (eventFilter !== 'tournament') {
      upcomingPractices.forEach(p => items.push({ kind: 'practice', date: p.practice_date, data: p }))
    }
    items.sort((a, b) => a.date.localeCompare(b.date))
    return items
  }, [tournaments, upcomingPractices, eventFilter])

  // 締切間近の大会（3日以内）
  const urgentDeadlines = tournaments.filter(t => {
    const days = getDaysUntil(t.deadline_date)
    return days >= 0 && days <= 3
  })

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>読み込み中...</div>
  }

  const cellStyle = {
    padding: '12px 14px', borderBottom: '1px solid #1e293b',
    fontSize: '13px', color: '#e2e8f0', whiteSpace: 'nowrap' as const,
  }
  const headerCellStyle = {
    ...cellStyle, color: '#64748b', fontSize: '12px', fontWeight: '600' as const,
    backgroundColor: '#070e1b', borderBottom: '2px solid #1e293b',
  }

  const filterBtnStyle = (active: boolean) => ({
    padding: '5px 12px', borderRadius: '14px', fontSize: '12px',
    border: `1px solid ${active ? '#2563eb' : '#334155'}`,
    backgroundColor: active ? '#1e3a8a' : 'transparent',
    color: active ? '#93c5fd' : '#94a3b8',
    cursor: 'pointer' as const,
  })

  return (
    <div>
      {/* 締切リマインダー */}
      {!guestMode && urgentDeadlines.length > 0 && (
        <div style={{
          padding: '14px 16px', marginBottom: '16px', borderRadius: '10px',
          backgroundColor: '#7f1d1d', border: '1px solid #dc2626',
        }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#fca5a5', marginBottom: '6px' }}>
            締切間近の大会があります
          </div>
          {urgentDeadlines.map(t => (
            <div key={t.tournament_id} style={{ fontSize: '13px', color: '#fecaca', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
              <span>{t.tournament_name} - 締切 {formatDate(t.deadline_date)}</span>
              <button onClick={() => onNavigate('apply', t.tournament_id)} style={{
                padding: '3px 10px', borderRadius: '4px', backgroundColor: '#dc2626', color: '#fff',
                border: 'none', fontSize: '12px', cursor: 'pointer', flexShrink: 0, marginLeft: '8px',
              }}>申込</button>
            </div>
          ))}
        </div>
      )}

      {/* タイトル + タブ切替 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#e2e8f0', margin: 0 }}>
          {viewMode === 'list' ? 'イベント一覧' : 'カレンダー'}
        </h2>
        <div style={{ display: 'flex', borderRadius: '6px', border: '1px solid #334155', overflow: 'hidden' }}>
          <button onClick={() => setViewMode('list')} style={{
            padding: '6px 14px', fontSize: '13px', border: 'none', cursor: 'pointer',
            backgroundColor: viewMode === 'list' ? '#1e3a8a' : '#0f172a',
            color: viewMode === 'list' ? '#93c5fd' : '#64748b',
          }}>一覧</button>
          <button onClick={() => setViewMode('calendar')} style={{
            padding: '6px 14px', fontSize: '13px', border: 'none', cursor: 'pointer',
            backgroundColor: viewMode === 'calendar' ? '#1e3a8a' : '#0f172a',
            color: viewMode === 'calendar' ? '#93c5fd' : '#64748b',
          }}>カレンダー</button>
        </div>
      </div>

      {viewMode === 'calendar' ? (
        <TournamentCalendar
          tournaments={guestMode ? [] : allTournaments}
          registrations={guestMode ? [] : registrations}
          practices={practices}
          wards={guestMode ? [] : wards}
          discordId={discordId}
          myPlayerId={myPlayerId}
          joinedPracticeIds={joinedPracticeIds}
          onPracticeJoin={handlePracticeJoin}
          onPracticeLeave={async (_id) => {}}
          onNavigate={onNavigate}
        />
      ) : (
      <>
        {/* フィルター */}
        {!guestMode && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={() => setEventFilter('all')} style={filterBtnStyle(eventFilter === 'all')}>すべて</button>
          <button onClick={() => setEventFilter('tournament')} style={filterBtnStyle(eventFilter === 'tournament')}>大会のみ</button>
          <button onClick={() => setEventFilter('practice')} style={filterBtnStyle(eventFilter === 'practice')}>練習のみ</button>
          <span style={{ fontSize: '12px', color: '#64748b', marginLeft: '4px' }}>{allEvents.length}件</span>
        </div>
        )}

        {allEvents.length === 0 ? (
          <div style={{
            padding: '40px', textAlign: 'center', color: '#94a3b8',
            backgroundColor: '#0c1220', borderRadius: '12px', border: '1px solid #1e293b'
          }}>
            予定されているイベントはありません
          </div>
        ) : (
          <>
            {/* PC: テーブル */}
            <div className="dashboard-table" style={{
              borderRadius: '10px', border: '1px solid #1e293b', overflow: 'auto', backgroundColor: '#0c1220',
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={headerCellStyle}>種類</th>
                  <th style={headerCellStyle}>名称</th>
                  <th style={headerCellStyle}>日付</th>
                  <th style={headerCellStyle}>詳細</th>
                  <th style={{ ...headerCellStyle, textAlign: 'center' }}></th>
                </tr></thead>
                <tbody>
                  {allEvents.map((ev, i) => {
                    if (ev.kind === 'tournament') {
                      const t = ev.data
                      const daysUntilDeadline = getDaysUntil(t.deadline_date)
                      const isDeadlinePassed = daysUntilDeadline < 0
                      const isDeadlineSoon = daysUntilDeadline >= 0 && daysUntilDeadline <= 7
                      return (
                        <tr key={`t-${t.tournament_id}-${i}`}>
                          <td style={cellStyle}>
                            <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '11px', backgroundColor: '#064e3b', color: '#6ee7b7' }}>大会</span>
                          </td>
                          <td style={{ ...cellStyle, fontWeight: '500', whiteSpace: 'normal' as const, minWidth: '140px' }}>
                            {t.tournament_name}
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '2px' }}>
                              {(Array.isArray(t.type) ? t.type : []).map((tp: string) => (
                                <span key={tp} style={{ padding: '1px 6px', borderRadius: '6px', fontSize: '10px', backgroundColor: '#1e293b', color: '#94a3b8' }}>{tp}</span>
                              ))}
                            </div>
                          </td>
                          <td style={cellStyle}>{formatDate(t.tournament_date)}</td>
                          <td style={{
                            ...cellStyle, fontSize: '12px',
                            color: isDeadlinePassed ? '#ef4444' : isDeadlineSoon ? '#f59e0b' : '#94a3b8',
                          }}>
                            締切 {formatDate(t.deadline_date)}{isDeadlinePassed ? ' 済' : ''}
                          </td>
                          <td style={{ ...cellStyle, textAlign: 'center' }}>
                            {!isDeadlinePassed && (
                              <button onClick={() => onNavigate('apply', t.tournament_id)} style={{
                                padding: '5px 14px', borderRadius: '5px', backgroundColor: '#1e3a8a',
                                color: '#93c5fd', border: '1px solid #2563eb', fontSize: '12px', cursor: 'pointer',
                              }}>申込</button>
                            )}
                          </td>
                        </tr>
                      )
                    } else {
                      const p = ev.data
                      return (
                        <tr key={`p-${p.id}-${i}`}>
                          <td style={cellStyle}>
                            <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '11px', backgroundColor: '#4a1d96', color: '#c4b5fd' }}>練習</span>
                          </td>
                          <td style={{ ...cellStyle, fontWeight: '500', whiteSpace: 'normal' as const, minWidth: '140px' }}>
                            {p.location}
                            {p.participant_names && p.participant_names.length > 0 && (
                              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                                {p.participant_names.join('、')}
                              </div>
                            )}
                          </td>
                          <td style={cellStyle}>{formatDate(p.practice_date)}</td>
                          <td style={{ ...cellStyle, fontSize: '12px', color: '#94a3b8' }}>
                            {formatTime(p.start_time)} - {formatTime(p.end_time)} / {p.participant_count || 0}名
                          </td>
                          <td style={{ ...cellStyle, textAlign: 'center' }}>
                            {joinedPracticeIds.has(p.id) ? (
                              <span style={{ padding: '3px 10px', borderRadius: '5px', fontSize: '12px', color: '#64748b', backgroundColor: '#1e293b' }}>参加済</span>
                            ) : (
                              <button onClick={() => handlePracticeJoin(p.id)} disabled={joiningId === p.id || !myPlayerId} style={{
                                padding: '5px 14px', borderRadius: '5px', backgroundColor: '#4a1d96',
                                color: '#c4b5fd', border: '1px solid #6d28d9', fontSize: '12px',
                                cursor: !myPlayerId ? 'not-allowed' : 'pointer',
                                opacity: !myPlayerId ? 0.5 : 1,
                              }}>{joiningId === p.id ? '...' : '参加'}</button>
                            )}
                          </td>
                        </tr>
                      )
                    }
                  })}
                </tbody>
              </table>
            </div>

            {/* スマホ: カード */}
            <div className="dashboard-cards" style={{ display: 'none', flexDirection: 'column', gap: '10px' }}>
              {allEvents.map((ev, i) => {
                if (ev.kind === 'tournament') {
                  const t = ev.data
                  const daysUntilDeadline = getDaysUntil(t.deadline_date)
                  const isDeadlinePassed = daysUntilDeadline < 0
                  const isDeadlineSoon = daysUntilDeadline >= 0 && daysUntilDeadline <= 7
                  return (
                    <div key={`t-${t.tournament_id}-${i}`} style={{
                      padding: '14px 16px', backgroundColor: '#0c1220', borderRadius: '10px', border: '1px solid #1e293b',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                        <div style={{ flex: 1 }}>
                          <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '11px', backgroundColor: '#064e3b', color: '#6ee7b7', marginRight: '8px' }}>大会</span>
                          <span style={{ fontSize: '14px', fontWeight: '600', color: '#f1f5f9' }}>{t.tournament_name}</span>
                        </div>
                        {!isDeadlinePassed && (
                          <button onClick={() => onNavigate('apply', t.tournament_id)} style={{
                            padding: '4px 12px', borderRadius: '5px', backgroundColor: '#1e3a8a',
                            color: '#93c5fd', border: '1px solid #2563eb', fontSize: '12px', cursor: 'pointer', flexShrink: 0, marginLeft: '8px',
                          }}>申込</button>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '12px', fontSize: '13px', color: '#94a3b8' }}>
                        <span>{formatDate(t.tournament_date)}</span>
                        <span style={{
                          color: isDeadlinePassed ? '#ef4444' : isDeadlineSoon ? '#f59e0b' : '#94a3b8',
                        }}>締切 {formatDate(t.deadline_date)}{isDeadlinePassed ? ' 済' : ''}</span>
                      </div>
                    </div>
                  )
                } else {
                  const p = ev.data
                  return (
                    <div key={`p-${p.id}-${i}`} style={{
                      padding: '14px 16px', backgroundColor: '#0c1220', borderRadius: '10px', border: '1px solid #1e293b',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                        <div style={{ flex: 1 }}>
                          <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '11px', backgroundColor: '#4a1d96', color: '#c4b5fd', marginRight: '8px' }}>練習</span>
                          <span style={{ fontSize: '14px', fontWeight: '600', color: '#f1f5f9' }}>{p.location}</span>
                        </div>
                        {joinedPracticeIds.has(p.id) ? (
                          <span style={{ padding: '3px 10px', borderRadius: '5px', fontSize: '12px', color: '#64748b', backgroundColor: '#1e293b', flexShrink: 0, marginLeft: '8px' }}>参加済</span>
                        ) : (
                          <button onClick={() => handlePracticeJoin(p.id)} disabled={joiningId === p.id || !myPlayerId} style={{
                            padding: '4px 12px', borderRadius: '5px', backgroundColor: '#4a1d96',
                            color: '#c4b5fd', border: '1px solid #6d28d9', fontSize: '12px',
                            cursor: !myPlayerId ? 'not-allowed' : 'pointer', flexShrink: 0, marginLeft: '8px',
                            opacity: !myPlayerId ? 0.5 : 1,
                          }}>{joiningId === p.id ? '...' : '参加'}</button>
                        )}
                      </div>
                      <div style={{ fontSize: '13px', color: '#94a3b8' }}>
                        {formatDate(p.practice_date)} {formatTime(p.start_time)}-{formatTime(p.end_time)} / {p.participant_count || 0}名
                      </div>
                      {p.participant_names && p.participant_names.length > 0 && (
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                          {p.participant_names.join('、')}
                        </div>
                      )}
                    </div>
                  )
                }
              })}
            </div>
          </>
        )}

        <style>{`
          @media (max-width: 640px) {
            .dashboard-table { display: none !important; }
            .dashboard-cards { display: flex !important; }
          }
        `}</style>
      </>
      )}
    </div>
  )
}
