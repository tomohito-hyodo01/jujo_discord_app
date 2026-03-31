import { useState, useEffect, useMemo } from 'react'
import TournamentCalendar from './TournamentCalendar'
import { filterPairCandidates } from '../utils/playerFilter'

interface EventListProps {
  discordId: string
  onNavigate: (page: string, tournamentId?: string) => void
  guestMode?: boolean
}

export default function EventList({ discordId, onNavigate, guestMode = false }: EventListProps) {
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
  const [selectedTournament, setSelectedTournament] = useState<any>(null)
  const [tournamentReg, setTournamentReg] = useState<any>(null)
  const [players, setPlayers] = useState<any[]>([])
  const [editingPair, setEditingPair] = useState(false)
  const [updatingPair, setUpdatingPair] = useState(false)
  const [cancellingReg, setCancellingReg] = useState(false)
  const [selectedPractice, setSelectedPractice] = useState<any>(null)
  const [practiceParticipants, setPracticeParticipants] = useState<any[]>([])
  const [modalLoading, setModalLoading] = useState(false)

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
            const today = new Date().toISOString().split('T')[0]
            const upcoming = data
              .filter((t: any) => t.tournament_date >= today)
              .sort((a: any, b: any) => a.tournament_date.localeCompare(b.tournament_date))
            setTournaments(upcoming)
          }

          if (wardRes.ok) setWards(await wardRes.json())
          if (regRes.ok) setRegistrations(await regRes.json())
          const plRes = await fetch(`${apiUrl}/api/players`)
          if (plRes.ok) setPlayers(await plRes.json())
          if (practRes.ok) {
            practiceData = await practRes.json()
            setPractices(practiceData)
          }
        }

        // プレイヤー情報と練習参加状況
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
    return `${d.getMonth() + 1}/${d.getDate()}（${weekdays[d.getDay()]}）`
  }

  const formatTime = (t: string) => t?.slice(0, 5) || ''

  const apiUrlRef = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  const openTournamentModal = (t: any) => {
    setSelectedTournament(t)
    setEditingPair(false)
    // 自分の申込情報を探す
    const reg = registrations.find(r => r.tournament_id === t.tournament_id)
    setTournamentReg(reg || null)
  }
  const handleRegPairChange = async (registrationId: number, newPairId: number) => {
    setUpdatingPair(true)
    try {
      const res = await fetch(`${apiUrlRef}/api/registrations/${registrationId}/pair`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pair1: newPairId }),
      })
      if (res.ok) {
        setTournamentReg((prev: any) => prev ? { ...prev, pair1: newPairId } : prev)
        setRegistrations(prev => prev.map(r => r.registration_id === registrationId ? { ...r, pair1: newPairId } : r))
        setEditingPair(false)
      } else {
        const err = await res.json()
        alert(`ペア変更に失敗しました: ${err.detail || ''}`)
      }
    } catch { alert('通信エラー') }
    finally { setUpdatingPair(false) }
  }

  const handleRegCancel = async (registrationId: number, tournamentName: string) => {
    if (!confirm(`「${tournamentName}」の申込をキャンセルしますか？`)) return
    setCancellingReg(true)
    try {
      const res = await fetch(`${apiUrlRef}/api/registrations/${registrationId}`, { method: 'DELETE' })
      if (res.ok) {
        setRegistrations(prev => prev.filter(r => r.registration_id !== registrationId))
        setSelectedTournament(null)
      } else {
        const err = await res.json()
        alert(`キャンセルに失敗しました: ${err.detail || ''}`)
      }
    } catch { alert('通信エラー') }
    finally { setCancellingReg(false) }
  }

  const openPracticeModal = async (p: any) => {
    setSelectedPractice(p)
    setModalLoading(true)
    try {
      const res = await fetch(`${apiUrlRef}/api/practice/${p.id}/participants`)
      if (res.ok) setPracticeParticipants(await res.json())
    } catch {} finally { setModalLoading(false) }
  }

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
        const pRes = await fetch(`${apiUrlRef}/api/practice`)
        if (pRes.ok) setPractices(await pRes.json())
      }
    } catch { alert('通信エラー') }
    finally { setJoiningId(null) }
  }

  const handlePracticeLeave = async (practiceId: number) => {
    if (!myPlayerId) return
    try {
      const res = await fetch(`${apiUrlRef}/api/practice/${practiceId}/leave/${myPlayerId}`, { method: 'DELETE' })
      if (res.ok) {
        setJoinedPracticeIds(prev => { const n = new Set(prev); n.delete(practiceId); return n })
        const pRes = await fetch(`${apiUrlRef}/api/practice`)
        if (pRes.ok) setPractices(await pRes.json())
      }
    } catch { alert('通信エラー') }
  }

  const getDaysUntil = (dateStr: string) => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const target = new Date(dateStr); target.setHours(0, 0, 0, 0)
    return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  }

  // 申込済み大会IDのSet
  const registeredTournamentIds = useMemo(() => {
    return new Set(registrations.map(r => r.tournament_id))
  }, [registrations])

  // 大会と練習を統合して日付順にソート
  const upcomingPractices = useMemo(() => {
    const today = new Date().toISOString().split('T')[0]
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
          onPracticeLeave={handlePracticeLeave}
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
          <div style={{
            borderRadius: '10px', border: '1px solid #1e293b',
            backgroundColor: '#0c1220', overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {allEvents.map((ev, i) => ev.kind === 'tournament' ? (() => {
                const t = ev.data
                const isRegistered = registeredTournamentIds.has(t.tournament_id)
                const deadlineClosed = t.deadline_date && new Date(t.deadline_date) < new Date()
                const clickable = !deadlineClosed

                let tagText = '大会申込'
                let tagBg = '#1e3a8a'
                let tagColor = '#93c5fd'
                let tagBorder = '#2563eb'
                if (isRegistered && deadlineClosed) {
                  tagText = '大会（申込済）'; tagBg = '#1e293b'; tagColor = '#64748b'; tagBorder = '#334155'
                } else if (isRegistered) {
                  tagText = '大会（申込済）'; tagBg = '#1e293b'; tagColor = '#64748b'; tagBorder = '#334155'
                } else if (deadlineClosed) {
                  tagText = '受付終了'; tagBg = '#1e293b'; tagColor = '#475569'; tagBorder = '#334155'
                }

                return (
                <div
                  key={`t-${t.tournament_id}-${i}`}
                  onClick={() => clickable && openTournamentModal(t)}
                  style={{
                    padding: '12px 16px', borderBottom: '1px solid #1e293b',
                    cursor: clickable ? 'pointer' : 'default',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    transition: 'background-color 0.15s',
                    opacity: deadlineClosed ? 0.6 : 1,
                  }}
                  onMouseEnter={e => clickable && (e.currentTarget.style.backgroundColor = '#162032')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '12px', color: '#64748b', flexShrink: 0 }}>{formatDate(ev.date)}</span>
                      <span style={{ fontSize: '14px', fontWeight: '500', color: '#e2e8f0' }}>
                        {t.tournament_name}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {(Array.isArray(t.type) ? t.type : []).map((tp: string) => (
                        <span key={tp} style={{
                          padding: '1px 7px', borderRadius: '6px', fontSize: '11px',
                          backgroundColor: '#1e293b', color: '#94a3b8',
                        }}>{tp}</span>
                      ))}
                    </div>
                  </div>
                  <span style={{
                    padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '500',
                    backgroundColor: tagBg, color: tagColor, border: `1px solid ${tagBorder}`,
                    flexShrink: 0, marginLeft: '12px',
                  }}>{tagText}</span>
                </div>
                )
              })() : (() => {
                const p = ev.data
                const pDeadlinePassed = p.deadline_date && new Date(p.deadline_date) < new Date()
                const pClickable = !pDeadlinePassed
                return (
                <div
                  key={`p-${p.id}-${i}`}
                  onClick={() => pClickable && openPracticeModal(p)}
                  style={{
                    padding: '12px 16px', borderBottom: '1px solid #1e293b',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    cursor: pClickable ? 'pointer' : 'default', transition: 'background-color 0.15s',
                    opacity: pDeadlinePassed ? 0.6 : 1,
                  }}
                  onMouseEnter={e => pClickable && (e.currentTarget.style.backgroundColor = '#162032')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '12px', color: '#64748b', flexShrink: 0 }}>{formatDate(ev.date)}</span>
                      <span style={{ fontSize: '14px', fontWeight: '500', color: '#e2e8f0' }}>
                        {ev.data.location}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                      {formatTime(ev.data.start_time)} - {formatTime(ev.data.end_time)} / {ev.data.participant_count || 0}名参加
                      {ev.data.participant_names && ev.data.participant_names.length > 0 && (
                        <span style={{ color: '#64748b', marginLeft: '8px' }}>{ev.data.participant_names.join('、')}</span>
                      )}
                    </div>
                  </div>
                  <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0, marginLeft: '12px' }}>
                    {(() => {
                      const p = ev.data
                      const deadlinePassed = p.deadline_date && new Date(p.deadline_date) < new Date()
                      if (joinedPracticeIds.has(p.id)) {
                        return <span style={{ padding: '3px 10px', borderRadius: '6px', fontSize: '12px', color: '#64748b', backgroundColor: '#1e293b' }}>練習（参加済）</span>
                      }
                      if (deadlinePassed) {
                        return <span style={{ padding: '3px 10px', borderRadius: '6px', fontSize: '12px', color: '#475569', backgroundColor: '#1e293b' }}>練習（申込終了）</span>
                      }
                      return (
                        <button onClick={() => handlePracticeJoin(p.id)} disabled={joiningId === p.id || !myPlayerId} style={{
                          padding: '3px 10px', borderRadius: '6px', fontSize: '12px',
                          backgroundColor: '#4a1d96', color: '#c4b5fd',
                          border: '1px solid #6d28d9', cursor: !myPlayerId ? 'not-allowed' : 'pointer',
                          opacity: !myPlayerId ? 0.5 : 1,
                        }}>{joiningId === p.id ? '...' : '練習参加'}</button>
                      )
                    })()}
                  </div>
                </div>
                )
              })())}
            </div>
          </div>
        )}
      </>
      )}

      {/* 大会詳細モーダル */}
      {selectedTournament && (
        <div onClick={() => setSelectedTournament(null)} style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            backgroundColor: '#0f172a', borderRadius: '12px', border: '1px solid #1e293b',
            maxWidth: '500px', width: '100%', maxHeight: '80vh', overflowY: 'auto',
          }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#f1f5f9', margin: 0 }}>{selectedTournament.tournament_name}</h3>
              <button onClick={() => setSelectedTournament(null)} style={{ padding: '4px 10px', borderRadius: '5px', fontSize: '12px', backgroundColor: 'transparent', color: '#94a3b8', border: '1px solid #334155', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ padding: '16px 20px' }}>
              {[
                ['開催日', formatDate(selectedTournament.tournament_date)],
                ['締切日', formatDate(selectedTournament.deadline_date)],
                ['主催', wards.find((w: any) => w.ward_id === selectedTournament.registrated_ward)?.ward_name || ''],
                ['形式', selectedTournament.classification === 0 ? '個人戦' : '団体戦'],
              ].map(([label, val]) => (
                <div key={String(label)} style={{ display: 'flex', padding: '8px 0', borderBottom: '1px solid #1e293b', fontSize: '14px' }}>
                  <span style={{ width: '80px', flexShrink: 0, color: '#64748b', fontSize: '13px' }}>{label}</span>
                  <span style={{ color: '#e2e8f0' }}>{val}</span>
                </div>
              ))}
              <div style={{ display: 'flex', padding: '8px 0', borderBottom: '1px solid #1e293b', fontSize: '14px' }}>
                <span style={{ width: '80px', flexShrink: 0, color: '#64748b', fontSize: '13px' }}>種別</span>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {(Array.isArray(selectedTournament.type) ? selectedTournament.type : []).map((tp: string) => (
                    <span key={tp} style={{ padding: '1px 7px', borderRadius: '6px', fontSize: '11px', backgroundColor: '#1e293b', color: '#94a3b8' }}>{tp}</span>
                  ))}
                </div>
              </div>

              {tournamentReg ? (
                <div style={{ marginTop: '16px' }}>
                  <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: '#0c1220', border: '1px solid #1e293b', marginBottom: '12px' }}>
                    <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '6px' }}>申込情報</div>
                    <div style={{ fontSize: '14px', color: '#e2e8f0', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                      <span>種別: {tournamentReg.type}</span>
                      <span>ペア: {(() => {
                        const isApplicant = tournamentReg.is_applicant !== false
                        const p = isApplicant
                          ? players.find(pl => pl.player_id === tournamentReg.pair1)
                          : players.find(pl => pl.discord_id === tournamentReg.discord_id)
                        return p?.player_name || '-'
                      })()}</span>
                    </div>
                  </div>

                  {/* ペア変更 */}
                  {tournamentReg.is_applicant !== false && (
                    editingPair ? (
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                        <select
                          defaultValue={tournamentReg.pair1}
                          onChange={e => handleRegPairChange(tournamentReg.registration_id, parseInt(e.target.value))}
                          disabled={updatingPair}
                          style={{ flex: 1, padding: '8px', borderRadius: '6px', backgroundColor: '#0c1220', color: '#e2e8f0', border: '1px solid #334155', fontSize: '13px' }}
                        >
                          {(() => {
                            const me = players.find(pl => pl.discord_id === discordId)
                            return filterPairCandidates(
                              players, discordId, me?.sex ?? null,
                              tournamentReg.type, selectedTournament?.tournament_date
                            ).map(p => (
                              <option key={p.player_id} value={p.player_id}>{p.player_name}</option>
                            ))
                          })()}
                        </select>
                        <button onClick={() => setEditingPair(false)} style={{
                          padding: '8px 12px', borderRadius: '6px', backgroundColor: 'transparent',
                          color: '#94a3b8', border: '1px solid #334155', fontSize: '13px', cursor: 'pointer',
                        }}>戻る</button>
                      </div>
                    ) : (
                      <button onClick={() => setEditingPair(true)} style={{
                        width: '100%', padding: '10px', borderRadius: '6px', marginBottom: '8px',
                        backgroundColor: '#1e3a8a', color: '#93c5fd', border: '1px solid #2563eb',
                        fontSize: '14px', cursor: 'pointer',
                      }}>ペア変更</button>
                    )
                  )}

                  {/* キャンセル */}
                  <button
                    onClick={() => handleRegCancel(tournamentReg.registration_id, selectedTournament.tournament_name)}
                    disabled={cancellingReg}
                    style={{
                      width: '100%', padding: '10px', borderRadius: '6px',
                      backgroundColor: 'transparent', color: '#f87171', border: '1px solid #7f1d1d',
                      fontSize: '14px', cursor: cancellingReg ? 'not-allowed' : 'pointer',
                    }}
                  >{cancellingReg ? 'キャンセル中...' : '申込をキャンセル'}</button>
                </div>
              ) : (
                <button onClick={() => { setSelectedTournament(null); onNavigate('apply', selectedTournament.tournament_id) }} style={{
                  marginTop: '16px', width: '100%', padding: '10px', borderRadius: '8px',
                  backgroundColor: '#1e3a8a', color: '#93c5fd', border: '1px solid #2563eb',
                  fontSize: '14px', fontWeight: '600', cursor: 'pointer',
                }}>この大会に申し込む</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 練習詳細モーダル */}
      {selectedPractice && (
        <div onClick={() => setSelectedPractice(null)} style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            backgroundColor: '#0f172a', borderRadius: '12px', border: '1px solid #1e293b',
            maxWidth: '480px', width: '100%', maxHeight: '80vh', overflowY: 'auto',
          }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#f1f5f9', margin: 0 }}>練習詳細</h3>
              <button onClick={() => setSelectedPractice(null)} style={{ padding: '4px 10px', borderRadius: '5px', fontSize: '12px', backgroundColor: 'transparent', color: '#94a3b8', border: '1px solid #334155', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ padding: '16px 20px' }}>
              {[
                ['日付', formatDate(selectedPractice.practice_date)],
                ['時間', `${formatTime(selectedPractice.start_time)} - ${formatTime(selectedPractice.end_time)}`],
                ['場所', selectedPractice.location],
                ...(selectedPractice.deadline_date ? [['回答期限', (() => {
                  const d = new Date(selectedPractice.deadline_date)
                  const wd = ['日','月','火','水','木','金','土'][d.getDay()]
                  return `${d.getMonth() + 1}/${d.getDate()}(${wd}) ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
                })()]] : []),
              ].map(([label, val]) => (
                <div key={String(label)} style={{ display: 'flex', padding: '8px 0', borderBottom: '1px solid #1e293b', fontSize: '14px' }}>
                  <span style={{ width: '60px', flexShrink: 0, color: '#64748b', fontSize: '13px' }}>{label}</span>
                  <span style={{ color: '#e2e8f0' }}>{val}</span>
                </div>
              ))}

              {/* 参加/キャンセルボタン */}
              {myPlayerId && (() => {
                const deadlinePassed = selectedPractice.deadline_date && new Date(selectedPractice.deadline_date) < new Date()
                if (joinedPracticeIds.has(selectedPractice.id)) {
                  return <button onClick={() => { handlePracticeLeave(selectedPractice.id); setSelectedPractice(null) }} style={{
                    marginTop: '16px', width: '100%', padding: '10px', borderRadius: '6px',
                    backgroundColor: 'transparent', color: '#f87171', border: '1px solid #7f1d1d',
                    fontSize: '14px', fontWeight: '500', cursor: 'pointer',
                  }}>参加をキャンセル</button>
                }
                if (deadlinePassed) {
                  return <div style={{ marginTop: '16px', padding: '10px', borderRadius: '8px', backgroundColor: '#1e293b', textAlign: 'center', fontSize: '14px', color: '#64748b' }}>申込終了</div>
                }
                return <button onClick={() => { handlePracticeJoin(selectedPractice.id); setSelectedPractice(null) }} disabled={joiningId === selectedPractice.id} style={{
                  marginTop: '16px', width: '100%', padding: '10px', borderRadius: '6px',
                  backgroundColor: '#3b82f6', color: '#fff', border: 'none',
                  fontSize: '14px', fontWeight: '600', cursor: 'pointer',
                }}>参加する</button>
              })()}

              {/* 参加者一覧 */}
              <div style={{ marginTop: '20px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#e2e8f0', marginBottom: '10px' }}>
                  参加者（{practiceParticipants.length}名）
                </h4>
                {modalLoading ? (
                  <p style={{ color: '#94a3b8', fontSize: '13px' }}>読み込み中...</p>
                ) : practiceParticipants.length === 0 ? (
                  <p style={{ color: '#64748b', fontSize: '13px' }}>まだ参加者がいません</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {practiceParticipants.map((pt: any) => (
                      <div key={pt.player_id} style={{
                        padding: '8px 12px', backgroundColor: '#0c1220', borderRadius: '6px',
                        border: '1px solid #1e293b', fontSize: '14px', color: '#e2e8f0',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      }}>
                        <span>{pt.player_name}</span>
                        {pt.player_id === myPlayerId && <span style={{ fontSize: '11px', color: '#64748b' }}>あなた</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
