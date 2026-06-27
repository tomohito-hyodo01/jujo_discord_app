import { useState, useEffect } from 'react'
import { hasPermission, type UserPermissionInfo } from '../utils/permissions'
import CommentSection from './CommentSection'

interface HomeProps {
  discordId: string
  permissionInfo: UserPermissionInfo
  onNavigate: (page: string, tournamentId?: string) => void
}

interface MenuCard {
  id: string
  label: string
  description: string
  permission: string
}

const MENU_CARDS: MenuCard[] = [
  { id: 'event-list', label: 'イベント一覧', description: '大会・練習の予定を確認', permission: 'view_event_list' },
  { id: 'apply', label: '大会申込', description: '大会への参加申込', permission: 'view_apply' },
  { id: 'referee-training', label: '審判講習', description: '審判講習の申込', permission: 'view_referee_training' },
  { id: 'my-registrations', label: '申込履歴', description: '自分の申込状況を確認', permission: 'view_my_registrations' },
  { id: 'player', label: '選手登録', description: '新規選手の登録', permission: 'view_player' },
  { id: 'admin-tournament', label: '大会登録', description: '新しい大会を登録', permission: 'view_tournament_register' },
  { id: 'admin-tournament-mgmt', label: '大会管理', description: '大会の編集・削除', permission: 'view_tournament_register' },
  { id: 'admin-practice', label: '練習日程管理', description: '練習予定の登録・削除', permission: 'view_practice_manage' },
  { id: 'admin-excel', label: '申込書出力', description: 'Excel申込書の生成', permission: 'view_excel_download' },
  { id: 'admin-members', label: 'メンバー一覧', description: 'メンバー情報の管理', permission: 'view_member_list' },
  { id: 'profile-notify', label: 'プロフィール不備通知', description: '不備通知の送信', permission: 'view_app_logs' },
  { id: 'account-merge', label: 'アカウント統合', description: '重複アカウントの統合', permission: 'view_app_logs' },
  { id: 'game', label: '⚔️ ゲーム(試作)', description: 'エビ走であそぶ（試作）', permission: 'view_dashboard' },  // ハブは全員公開。RPGはGameHub内で管理者のみ
]

export default function Home({ discordId, permissionInfo, onNavigate }: HomeProps) {
  const [upcomingRegistrations, setUpcomingRegistrations] = useState<any[]>([])
  const [myRegistrations, setMyRegistrations] = useState<any[]>([])
  const [wards, setWards] = useState<any[]>([])
  const [myPractices, setMyPractices] = useState<any[]>([])
  const [todayPractices, setTodayPractices] = useState<any[]>([])
  const [myEvents, setMyEvents] = useState<any[]>([])
  const [myPlayerId, setMyPlayerId] = useState<number | null>(null)
  const [selectedTournament, setSelectedTournament] = useState<any | null>(null)
  const [selectedPractice, setSelectedPractice] = useState<any | null>(null)
  const [practiceParticipants, setPracticeParticipants] = useState<any[]>([])
  const [modalLoading, setModalLoading] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [courtInput, setCourtInput] = useState('')
  const [savingCourt, setSavingCourt] = useState(false)
  const [editingCourt, setEditingCourt] = useState(false)
  const [refereeExpiring, setRefereeExpiring] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null)
  const [eventParticipants, setEventParticipants] = useState<any[]>([])
  const [eventModalLoading, setEventModalLoading] = useState(false)
  const [eventLeaving, setEventLeaving] = useState(false)

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  useEffect(() => {
    const load = async () => {
      try {
        // 自分のplayer_idを取得
        const meRes = await fetch(`${apiUrl}/api/players/discord/${discordId}`)
        let playerId: number | null = null
        if (meRes.ok) {
          const me = await meRes.json()
          if (me?.player_id) {
            playerId = me.player_id
            setMyPlayerId(playerId)
          }
          // 審判資格の有効期限チェック
          if (me?.referee_expiry && me?.referee_qualification) {
            const now = new Date()
            const fiscalYearEnd = now.getMonth() >= 3
              ? `${now.getFullYear() + 1}-03`
              : `${now.getFullYear()}-03`
            if (me.referee_expiry <= fiscalYearEnd) {
              // 審判講習に申込済みか確認
              let alreadyApplied = false
              try {
                const rtRes = await fetch(`${apiUrl}/api/referee-training`)
                if (rtRes.ok) {
                  const trainings = await rtRes.json()
                  for (const t of trainings) {
                    const pRes = await fetch(`${apiUrl}/api/referee-training/${t.id}/participants`)
                    if (pRes.ok) {
                      const pts = await pRes.json()
                      if (pts.some((p: any) => p.discord_id === discordId)) {
                        alreadyApplied = true
                        break
                      }
                    }
                  }
                }
              } catch {}
              if (!alreadyApplied) {
                setRefereeExpiring(true)
              }
            }
          }
        }

        // 自分が申込済み＆1週間以内に開催される大会
        const [tRes, regRes, wardRes] = await Promise.all([
          fetch(`${apiUrl}/api/tournaments`),
          fetch(`${apiUrl}/api/registrations/user/${discordId}`),
          fetch(`${apiUrl}/api/wards`),
        ])
        if (wardRes.ok) setWards(await wardRes.json())
        if (tRes.ok && regRes.ok) {
          const tournaments = await tRes.json()
          const registrations = await regRes.json()
          setMyRegistrations(registrations)
          const regIds = new Set(registrations.map((r: any) => r.tournament_id))
          const today = new Date(); today.setHours(0, 0, 0, 0)
          const upcoming = tournaments.filter((t: any) => {
            if (!regIds.has(t.tournament_id)) return false
            const tDate = new Date(t.tournament_date); tDate.setHours(0, 0, 0, 0)
            const diff = Math.ceil((tDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
            return diff === 0 || diff === 1
          }).sort((a: any, b: any) => a.tournament_date.localeCompare(b.tournament_date))
          setUpcomingRegistrations(upcoming)
        }

        // 練習データ取得
        {
          const pRes = await fetch(`${apiUrl}/api/practice`)
          if (pRes.ok) {
            const rawData = await pRes.json()
            const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
            const todayStr = ymd(new Date())

            // 公開設定による閲覧制御（限定公開練習の漏洩防止）
            const ml = permissionInfo?.memberLevel
            const canView = (p: any): boolean => {
              const v = p.visibility
              if (!v || v === 'public') return true
              if (v === 'members_all') return ml === 0 || ml === 1
              if (v === 'members_regular') return ml === 0
              if (v === 'invited') return playerId != null && (p.invited_player_ids || []).includes(playerId)
              return true
            }
            const data = (rawData as any[]).filter(canView)

            // お知らせ用: 本日のコート番号 + 中止は練習日当日まで表示
            setTodayPractices(data.filter((p: any) =>
              p.practice_date === todayStr ||
              (p.status === 'cancelled' && p.practice_date >= todayStr)
            ))

            // 当日と明日の練習を取得
            const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
            const tomorrowStr = ymd(tomorrow)
            const targetDates = new Set([todayStr, tomorrowStr])
            const upcoming = data.filter((p: any) => targetDates.has(p.practice_date))
              .sort((a: any, b: any) => a.practice_date.localeCompare(b.practice_date))

            // 当日・明日で、自分が参加している練習を抽出
            if (playerId) {
              const joined: any[] = []
              for (const p of upcoming) {
                const ptRes = await fetch(`${apiUrl}/api/practice/${p.id}/participants`)
                if (ptRes.ok) {
                  const pts = await ptRes.json()
                  if (pts.some((pt: any) => pt.player_id === playerId)) {
                    joined.push(p)
                  }
                }
              }
              setMyPractices(joined)

              // 当日・明日のイベントで、自分が参加しているものを抽出
              const evRes = await fetch(`${apiUrl}/api/events`)
              if (evRes.ok) {
                const events = await evRes.json()
                const evUpcoming = events.filter((e: any) =>
                  targetDates.has(e.event_date) && e.status !== 'cancelled'
                ).sort((a: any, b: any) => a.event_date.localeCompare(b.event_date))

                const joinedEvents: any[] = []
                for (const e of evUpcoming) {
                  const ptRes = await fetch(`${apiUrl}/api/events/${e.id}/participants`)
                  if (ptRes.ok) {
                    const pts = await ptRes.json()
                    if (pts.some((pt: any) => pt.player_id === playerId)) {
                      joinedEvents.push(e)
                    }
                  }
                }
                setMyEvents(joinedEvents)
              }
            }
          }
        }

      } catch {}
    }
    load()
  }, [discordId])

  const visibleCards = MENU_CARDS.filter(card =>
    hasPermission(permissionInfo, card.permission as any)
  )

  const formatDate = (d: string) => {
    const dt = new Date(d)
    const weekdays = ['日', '月', '火', '水', '木', '金', '土']
    return `${dt.getMonth() + 1}/${dt.getDate()}(${weekdays[dt.getDay()]})`
  }

  const formatTime = (t: string) => t?.slice(0, 5) || ''

  const getWardName = (wardId: number) => {
    const w = wards.find((wd: any) => wd.ward_id === wardId)
    return w?.ward_name || ''
  }

  const getMyRegistration = (tournamentId: string) =>
    myRegistrations.find(r => r.tournament_id === tournamentId)

  const openPracticeDetail = async (practice: any) => {
    setSelectedPractice(practice)
    setCourtInput(practice.court_number || '')
    setEditingCourt(false)
    setModalLoading(true)
    try {
      const res = await fetch(`${apiUrl}/api/practice/${practice.id}/participants`)
      if (res.ok) setPracticeParticipants(await res.json())
    } catch {} finally { setModalLoading(false) }
  }

  const openEventDetail = async (event: any) => {
    setSelectedEvent(event)
    setEventModalLoading(true)
    try {
      const res = await fetch(`${apiUrl}/api/events/${event.id}/participants`)
      if (res.ok) setEventParticipants(await res.json())
    } catch {} finally { setEventModalLoading(false) }
  }

  const handleEventLeave = async (eventId: number) => {
    if (!myPlayerId) return
    if (!confirm('参加をキャンセルしますか？')) return
    setEventLeaving(true)
    try {
      const res = await fetch(`${apiUrl}/api/events/${eventId}/leave/${myPlayerId}`, { method: 'DELETE' })
      if (res.ok) {
        setMyEvents(prev => prev.filter(e => e.id !== eventId))
        setSelectedEvent(null)
      }
    } catch { alert('通信エラー') }
    finally { setEventLeaving(false) }
  }

  const handleSaveCourt = async (practiceId: number) => {
    setSavingCourt(true)
    try {
      const res = await fetch(`${apiUrl}/api/practice/${practiceId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ court_number: courtInput }),
      })
      if (res.ok) {
        setSelectedPractice((prev: any) => prev ? { ...prev, court_number: courtInput || null} : prev)
        setMyPractices(prev => prev.map(p => p.id === practiceId ? { ...p, court_number: courtInput || null} : p))
        setTodayPractices(prev => prev.map(p => p.id === practiceId ? { ...p, court_number: courtInput || null} : p))
        setEditingCourt(false)
      } else {
        alert('保存に失敗しました')
      }
    } catch { alert('通信エラー') }
    finally { setSavingCourt(false) }
  }

  const handleLeave = async (practiceId: number) => {
    if (!myPlayerId) return
    if (!confirm('参加をキャンセルしますか？')) return
    setLeaving(true)
    try {
      const res = await fetch(`${apiUrl}/api/practice/${practiceId}/leave/${myPlayerId}`, { method: 'DELETE' })
      if (res.ok) {
        setMyPractices(prev => prev.filter(p => p.id !== practiceId))
        setSelectedPractice(null)
      }
    } catch { alert('通信エラー') }
    finally { setLeaving(false) }
  }

  return (
    <div>
      {/* 通知エリア */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
        {/* 審判資格失効通知 */}
        {refereeExpiring && (
          <div style={{
            padding: '14px 16px', borderRadius: '10px',
            backgroundColor: '#7f1d1d', border: '1px solid #dc2626',
          }}>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#fca5a5', marginBottom: '6px' }}>
              審判資格が本年度で失効します
            </div>
            <div style={{ fontSize: '13px', color: '#fecaca', marginBottom: '10px' }}>
              更新講習への申し込みを行ってください。
            </div>
            <button onClick={() => onNavigate('referee-training')} style={{
              padding: '8px 16px', borderRadius: '6px', backgroundColor: '#dc2626', color: '#fff',
              border: 'none', fontSize: '13px', fontWeight: '500', cursor: 'pointer',
            }}>審判講習を確認する</button>
          </div>
        )}

        {/* 直近の申込済み大会 */}
        {upcomingRegistrations.length > 0 && (
          <div style={{
            padding: '14px 16px', borderRadius: '10px',
            backgroundColor: '#0c1220', border: '1px solid #1e293b',
          }}>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#e2e8f0', marginBottom: '8px' }}>
              直近の大会予定
            </div>
            {upcomingRegistrations.filter(t => {
              const today = new Date(); today.setHours(0, 0, 0, 0)
              const d = new Date(t.tournament_date); d.setHours(0, 0, 0, 0)
              return d.getTime() >= today.getTime()
            }).map(t => {
              const days = (() => {
                const today = new Date(); today.setHours(0, 0, 0, 0)
                const d = new Date(t.tournament_date); d.setHours(0, 0, 0, 0)
                return Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
              })()
              return (
                <div key={t.tournament_id} onClick={() => setSelectedTournament(t)} style={{
                  fontSize: '13px', color: '#94a3b8', padding: '6px 0', borderBottom: '1px solid #1e293b',
                  cursor: 'pointer', transition: 'opacity 0.15s',
                }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                >
                  {t.tournament_name} - {formatDate(t.tournament_date)}
                  <span style={{ color: days <= 3 ? '#f59e0b' : '#64748b', marginLeft: '8px' }}>
                    {days === 0 ? '今日' : `あと${days}日`}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {/* 参加予定の練習・イベント */}
        {(myPractices.length > 0 || myEvents.length > 0) && (
          <div style={{
            padding: '14px 16px', borderRadius: '10px',
            backgroundColor: '#4a1d96', border: '1px solid #6d28d9',
          }}>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#c4b5fd', marginBottom: '8px' }}>
              参加予定の練習・イベント
            </div>
            {myPractices.filter(p => {
              const today = new Date(); today.setHours(0, 0, 0, 0)
              const d = new Date(p.practice_date); d.setHours(0, 0, 0, 0)
              return d.getTime() >= today.getTime()
            }).map(p => {
              const days = (() => {
                const today = new Date(); today.setHours(0, 0, 0, 0)
                const d = new Date(p.practice_date); d.setHours(0, 0, 0, 0)
                return Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
              })()
              return (
                <div key={`p-${p.id}`} onClick={() => openPracticeDetail(p)} style={{
                  fontSize: '13px', color: '#e0e7ff', padding: '6px 0', borderBottom: '1px solid #6d28d9',
                  cursor: 'pointer', transition: 'opacity 0.15s',
                }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                >
                  <span style={{
                    padding: '1px 6px', borderRadius: '3px', fontSize: '10px',
                    backgroundColor: '#1e1b4b', color: '#c4b5fd', marginRight: '6px',
                  }}>練習</span>
                  {formatDate(p.practice_date)} {formatTime(p.start_time)}-{formatTime(p.end_time)} / {p.location}
                  {p.participant_count > 0 && (
                    <span style={{ color: '#a5b4fc' }}> ({p.participant_count}名)</span>
                  )}
                  <span style={{ color: days <= 3 ? '#fbbf24' : '#a5b4fc', marginLeft: '8px' }}>
                    {days === 0 ? '今日' : `あと${days}日`}
                  </span>
                </div>
              )
            })}
            {myEvents.filter(e => {
              const today = new Date(); today.setHours(0, 0, 0, 0)
              const d = new Date(e.event_date); d.setHours(0, 0, 0, 0)
              return d.getTime() >= today.getTime()
            }).map(e => {
              const days = (() => {
                const today = new Date(); today.setHours(0, 0, 0, 0)
                const d = new Date(e.event_date); d.setHours(0, 0, 0, 0)
                return Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
              })()
              return (
                <div key={`e-${e.id}`} onClick={() => openEventDetail(e)} style={{
                  fontSize: '13px', color: '#e0e7ff', padding: '6px 0', borderBottom: '1px solid #6d28d9',
                  cursor: 'pointer', transition: 'opacity 0.15s',
                }}
                  onMouseEnter={ev => (ev.currentTarget.style.opacity = '0.7')}
                  onMouseLeave={ev => (ev.currentTarget.style.opacity = '1')}
                >
                  <span style={{
                    padding: '1px 6px', borderRadius: '3px', fontSize: '10px',
                    backgroundColor: '#0e4429', color: '#6ee7b7', marginRight: '6px',
                  }}>イベント</span>
                  {formatDate(e.event_date)}
                  {e.start_time && ` ${formatTime(e.start_time)}${e.end_time ? `-${formatTime(e.end_time)}` : ''}`}
                  {' / '}{e.title}
                  {e.location && <span style={{ color: '#a5b4fc' }}> ({e.location})</span>}
                  <span style={{ color: days <= 3 ? '#fbbf24' : '#a5b4fc', marginLeft: '8px' }}>
                    {days === 0 ? '今日' : `あと${days}日`}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {/* お知らせ */}
        <div style={{
          padding: '16px', borderRadius: '10px',
          backgroundColor: '#1e293b', border: '1px solid #334155',
        }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#cbd5e1', marginBottom: '8px' }}>
            お知らせ
          </div>
          {(() => {
            const cancelledToday = todayPractices.filter(p => p.status === 'cancelled')
            const courtToday = todayPractices.filter(p => p.court_number && p.status !== 'cancelled')
            const hasNotice = cancelledToday.length > 0 || courtToday.length > 0

            if (!hasNotice) return <div style={{ fontSize: '13px', color: '#64748b' }}>現在、お知らせはありません</div>

            return <>
              {cancelledToday.map(p => {
                const isToday = p.practice_date === new Date().toLocaleDateString('sv-SE')
                return (
                  <div key={`cancel-${p.id}`} style={{ fontSize: '13px', color: '#fca5a5', padding: '6px 0', borderBottom: '1px solid #475569' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: '4px', backgroundColor: '#7f1d1d',
                      color: '#fca5a5', fontSize: '12px', fontWeight: '600', marginRight: '8px',
                    }}>中止</span>
                    {isToday ? '本日' : formatDate(p.practice_date)}の{p.location} {formatTime(p.start_time)}-{formatTime(p.end_time)} は中止になりました
                  </div>
                )
              })}
              {courtToday.map(p => (
                <div key={`court-${p.id}`} style={{ fontSize: '13px', color: '#e2e8f0', padding: '6px 0', borderBottom: '1px solid #475569' }}>
                  <span style={{ color: '#c4b5fd', fontWeight: '600' }}>本日の練習</span>
                  <span style={{ marginLeft: '8px' }}>{formatTime(p.start_time)}</span>
                  <span style={{ marginLeft: '8px' }}>{p.location}</span>
                  <span style={{
                    marginLeft: '10px', padding: '2px 8px', borderRadius: '4px',
                    backgroundColor: '#4a1d96', color: '#c4b5fd', fontSize: '12px', fontWeight: '600',
                  }}>{p.court_number}番コート</span>
                </div>
              ))}
            </>
          })()}
        </div>
      </div>

      {/* メニューカード */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: '12px',
      }}>
        {visibleCards.map(card => (
          <button
            key={card.id}
            onClick={() => onNavigate(card.id)}
            style={{
              padding: '20px 16px', borderRadius: '10px',
              backgroundColor: '#0c1220', border: '1px solid #1e293b',
              color: '#e2e8f0', cursor: 'pointer', textAlign: 'left',
              display: 'flex', flexDirection: 'column', gap: '6px',
            }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#1e293b'; e.currentTarget.style.borderColor = '#334155' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#0c1220'; e.currentTarget.style.borderColor = '#1e293b' }}
          >
            <div style={{ fontSize: '15px', fontWeight: '600' }}>{card.label}</div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>{card.description}</div>
          </button>
        ))}
      </div>

      {/* 大会詳細モーダル */}
      {selectedTournament && (() => {
        const t = selectedTournament
        const reg = getMyRegistration(t.tournament_id)
        return (
          <div onClick={() => setSelectedTournament(null)} style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 200,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '12px', boxSizing: 'border-box',
          }}>
            <div onClick={e => e.stopPropagation()} style={{
              backgroundColor: '#0f172a', borderRadius: '12px', border: '1px solid #1e293b',
              maxWidth: '500px', width: '100%', maxHeight: '80vh', overflowY: 'auto', boxSizing: 'border-box',
            }}>
              <div style={{
                padding: '16px 20px', borderBottom: '1px solid #1e293b',
                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              }}>
                <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#e2e8f0', margin: 0 }}>{t.tournament_name}</h3>
                <button onClick={() => setSelectedTournament(null)} style={{
                  padding: '4px 10px', borderRadius: '5px', fontSize: '12px',
                  backgroundColor: 'transparent', color: '#94a3b8', border: '1px solid #334155', cursor: 'pointer',
                }}>✕</button>
              </div>
              <div style={{ padding: '16px 20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '8px 12px', fontSize: '13px' }}>
                  <span style={{ color: '#64748b', fontWeight: '500' }}>開催日</span>
                  <span style={{ color: '#e2e8f0' }}>{formatDate(t.tournament_date)}</span>
                  <span style={{ color: '#64748b', fontWeight: '500' }}>締切日</span>
                  <span style={{ color: '#e2e8f0' }}>{formatDate(t.deadline_date)}</span>
                  <span style={{ color: '#64748b', fontWeight: '500' }}>主催</span>
                  <span style={{ color: '#e2e8f0' }}>{getWardName(t.registrated_ward)}</span>
                  <span style={{ color: '#64748b', fontWeight: '500' }}>種別</span>
                  <span style={{ color: '#e2e8f0' }}>
                    <span style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {(Array.isArray(t.type) ? t.type : []).map((tp: string) => (
                        <span key={tp} style={{ padding: '1px 7px', borderRadius: '6px', fontSize: '11px', backgroundColor: '#1e293b', color: '#94a3b8' }}>{tp}</span>
                      ))}
                    </span>
                  </span>
                  <span style={{ color: '#64748b', fontWeight: '500' }}>形式</span>
                  <span style={{ color: '#e2e8f0' }}>{t.classification === 0 ? '個人戦' : '団体戦'}</span>
                  {t.venue && (<><span style={{ color: '#64748b', fontWeight: '500' }}>会場</span><span style={{ color: '#e2e8f0' }}>{t.venue}</span></>)}
                  {(t.reception_time || t.opening_time || t.match_start_time) && (<>
                    <span style={{ color: '#64748b', fontWeight: '500' }}>時刻</span>
                    <span style={{ color: '#e2e8f0' }}>{[
                      t.reception_time && `受付 ${formatTime(t.reception_time)}`,
                      t.opening_time && `開会式 ${formatTime(t.opening_time)}`,
                      t.match_start_time && `試合開始 ${formatTime(t.match_start_time)}`,
                    ].filter(Boolean).join(' / ')}</span>
                  </>)}
                  {t.entry_fee && (<><span style={{ color: '#64748b', fontWeight: '500' }}>参加費</span><span style={{ color: '#e2e8f0' }}>{t.entry_fee}</span></>)}
                  <span style={{ color: '#64748b', fontWeight: '500' }}>申込数</span>
                  <span style={{ color: '#e2e8f0' }}>{t.entry_count || 0}{t.max_entries != null ? ` / ${t.max_entries}` : ''}</span>
                </div>
                {(() => {
                  const hasPdf = !!t.has_guideline
                  const url = hasPdf ? `${apiUrl}/api/tournaments/guideline/${encodeURIComponent(t.tournament_id)}` : ''
                  return (
                    <div style={{ marginTop: '12px' }}>
                      <a
                        href={hasPdf ? url : undefined}
                        target={hasPdf ? '_blank' : undefined}
                        rel="noreferrer"
                        onClick={hasPdf ? undefined : (e) => e.preventDefault()}
                        style={{
                          display: 'inline-block', padding: '8px 16px', borderRadius: '6px',
                          fontSize: '13px', fontWeight: '500', textAlign: 'center',
                          textDecoration: 'none',
                          backgroundColor: hasPdf ? '#1e3a8a' : '#1e293b',
                          color: hasPdf ? '#93c5fd' : '#475569',
                          border: `1px solid ${hasPdf ? '#2563eb' : '#334155'}`,
                          cursor: hasPdf ? 'pointer' : 'not-allowed',
                        }}
                      >{hasPdf ? '要項の確認' : '要項なし'}</a>
                    </div>
                  )
                })()}
                {reg && (
                  <div style={{ marginTop: '16px', padding: '12px 14px', borderRadius: '8px', backgroundColor: '#1e3a8a20', border: '1px solid #1e3a8a' }}>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#93c5fd', marginBottom: '6px' }}>あなたの申込情報</div>
                    <div style={{ fontSize: '13px', color: '#cbd5e1' }}>種別: {reg.type}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* 練習詳細モーダル */}
      {selectedPractice && (
        <div onClick={() => setSelectedPractice(null)} style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '12px', boxSizing: 'border-box',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            backgroundColor: '#0f172a', borderRadius: '12px', border: '1px solid #1e293b',
            maxWidth: '480px', width: '100%', maxHeight: '80vh', overflowY: 'auto',
            boxSizing: 'border-box',
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '16px 20px', borderBottom: '1px solid #1e293b',
            }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#f1f5f9', margin: 0 }}>練習詳細</h3>
              <button onClick={() => setSelectedPractice(null)} style={{
                padding: '4px 10px', borderRadius: '5px', fontSize: '12px',
                backgroundColor: 'transparent', color: '#94a3b8', border: '1px solid #334155', cursor: 'pointer',
              }}>✕</button>
            </div>
            <div style={{ padding: '16px 20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr', gap: '8px 12px', fontSize: '14px', marginBottom: '20px' }}>
                <span style={{ color: '#64748b', fontWeight: '500' }}>日付</span>
                <span style={{ color: '#e2e8f0' }}>{formatDate(selectedPractice.practice_date)}</span>
                <span style={{ color: '#64748b', fontWeight: '500' }}>時間</span>
                <span style={{ color: '#e2e8f0' }}>{formatTime(selectedPractice.start_time)} - {formatTime(selectedPractice.end_time)}</span>
                <span style={{ color: '#64748b', fontWeight: '500' }}>場所</span>
                <span style={{ color: '#e2e8f0' }}>{selectedPractice.location}</span>
                {selectedPractice.deadline_date && (<>
                  <span style={{ color: '#64748b', fontWeight: '500' }}>回答期限</span>
                  <span style={{ color: '#e2e8f0' }}>{(() => {
                    const d = new Date(selectedPractice.deadline_date)
                    const wd = ['日','月','火','水','木','金','土'][d.getDay()]
                    return `${d.getMonth() + 1}/${d.getDate()}(${wd}) ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
                  })()}</span>
                </>)}
              </div>

              {/* コート番号 */}
              <div style={{ display: 'flex', padding: '8px 0', borderBottom: '1px solid #1e293b', fontSize: '14px', alignItems: 'center' }}>
                <span style={{ width: '80px', flexShrink: 0, color: '#64748b', fontSize: '13px', fontWeight: '500' }}>コート</span>
                {editingCourt ? (
                  <div style={{ display: 'flex', gap: '6px', flex: 1, alignItems: 'center' }}>
                    <input type="text" value={courtInput} onChange={e => setCourtInput(e.target.value)}
                      autoFocus placeholder="例: 3"
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveCourt(selectedPractice.id); if (e.key === 'Escape') setEditingCourt(false) }}
                      style={{ flex: 1, padding: '4px 8px', borderRadius: '4px', backgroundColor: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', fontSize: '14px', boxSizing: 'border-box' }} />
                    <button onClick={() => handleSaveCourt(selectedPractice.id)} disabled={savingCourt} style={{
                      padding: '4px 10px', borderRadius: '4px', backgroundColor: '#1e3a8a', color: '#93c5fd', border: '1px solid #2563eb', fontSize: '12px', cursor: 'pointer',
                    }}>{savingCourt ? '...' : '保存'}</button>
                    <button onClick={() => setEditingCourt(false)} style={{
                      padding: '4px 8px', borderRadius: '4px', backgroundColor: 'transparent', color: '#94a3b8', border: '1px solid #334155', fontSize: '12px', cursor: 'pointer',
                    }}>戻る</button>
                  </div>
                ) : (
                  <span onClick={() => setEditingCourt(true)} style={{ color: selectedPractice.court_number ? '#e2e8f0' : '#475569', cursor: 'pointer', padding: '4px 8px', borderRadius: '4px', transition: 'background 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#1e293b')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    {selectedPractice.court_number ? `${selectedPractice.court_number}番` : '未設定（タップで入力）'}
                  </span>
                )}
              </div>

              {(() => {
                const dlPassed = selectedPractice.deadline_date && new Date(selectedPractice.deadline_date) < new Date()
                if (dlPassed) {
                  return <div style={{ marginBottom: '20px', padding: '10px', borderRadius: '8px', backgroundColor: '#1e293b', textAlign: 'center', fontSize: '14px', color: '#64748b' }}>参加済(締切済)</div>
                }
                return (
                  <div style={{ marginBottom: '20px' }}>
                    <button onClick={() => handleLeave(selectedPractice.id)} disabled={leaving} style={{
                      padding: '10px', borderRadius: '6px', backgroundColor: 'transparent',
                      color: '#f87171', border: '1px solid #7f1d1d', fontSize: '14px',
                      fontWeight: '500', cursor: leaving ? 'not-allowed' : 'pointer', width: '100%',
                    }}>{leaving ? '処理中...' : '参加をキャンセル'}</button>
                  </div>
                )
              })()}

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
                      {pt.player_id === myPlayerId && (
                        <span style={{ fontSize: '11px', color: '#64748b' }}>あなた</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <CommentSection targetType="practice" targetId={selectedPractice.id} discordId={discordId} />
            </div>
          </div>
        </div>
      )}

      {/* イベント詳細モーダル */}
      {selectedEvent && (
        <div onClick={() => setSelectedEvent(null)} style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '12px', boxSizing: 'border-box',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            backgroundColor: '#0f172a', borderRadius: '12px', border: '1px solid #1e293b',
            maxWidth: '480px', width: '100%', maxHeight: '80vh', overflowY: 'auto', boxSizing: 'border-box',
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '16px 20px', borderBottom: '1px solid #1e293b',
            }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#f1f5f9', margin: 0 }}>{selectedEvent.title}</h3>
              <button onClick={() => setSelectedEvent(null)} style={{
                padding: '4px 10px', borderRadius: '5px', fontSize: '12px',
                backgroundColor: 'transparent', color: '#94a3b8', border: '1px solid #334155', cursor: 'pointer',
              }}>✕</button>
            </div>
            <div style={{ padding: '16px 20px' }}>
              {[
                ['日付', formatDate(selectedEvent.event_date)],
                ...(selectedEvent.start_time ? [['時間', `${formatTime(selectedEvent.start_time)}${selectedEvent.end_time ? ` - ${formatTime(selectedEvent.end_time)}` : ''}`]] : []),
                ...(selectedEvent.location ? [['場所', selectedEvent.location]] : []),
                ...(selectedEvent.deadline_date ? [['締切', (() => {
                  const d = new Date(selectedEvent.deadline_date)
                  const wd = ['日','月','火','水','木','金','土'][d.getDay()]
                  return `${d.getMonth() + 1}/${d.getDate()}(${wd}) ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
                })()]] : []),
              ].map(([label, val]) => (
                <div key={String(label)} style={{ display: 'flex', padding: '8px 0', borderBottom: '1px solid #1e293b', fontSize: '14px' }}>
                  <span style={{ width: '60px', flexShrink: 0, color: '#64748b', fontSize: '13px' }}>{label}</span>
                  <span style={{ color: '#e2e8f0' }}>{val}</span>
                </div>
              ))}

              {(() => {
                const dlPassed = selectedEvent.deadline_date && new Date(selectedEvent.deadline_date) < new Date()
                if (dlPassed) {
                  return <div style={{ marginTop: '16px', padding: '10px', borderRadius: '8px', backgroundColor: '#1e293b', textAlign: 'center', fontSize: '14px', color: '#64748b' }}>参加済(締切済)</div>
                }
                return (
                  <div style={{ marginTop: '16px' }}>
                    <button onClick={() => handleEventLeave(selectedEvent.id)} disabled={eventLeaving} style={{
                      padding: '10px', borderRadius: '6px', backgroundColor: 'transparent',
                      color: '#f87171', border: '1px solid #7f1d1d', fontSize: '14px',
                      fontWeight: '500', cursor: eventLeaving ? 'not-allowed' : 'pointer', width: '100%',
                    }}>{eventLeaving ? '処理中...' : '参加をキャンセル'}</button>
                  </div>
                )
              })()}

              <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#e2e8f0', marginTop: '20px', marginBottom: '10px' }}>
                参加者({eventParticipants.length}名)
              </h4>
              {eventModalLoading ? (
                <p style={{ color: '#94a3b8', fontSize: '13px' }}>読み込み中...</p>
              ) : eventParticipants.length === 0 ? (
                <p style={{ color: '#64748b', fontSize: '13px' }}>まだ参加者がいません</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {eventParticipants.map((pt: any) => (
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

              <CommentSection targetType="event" targetId={selectedEvent.id} discordId={discordId} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
