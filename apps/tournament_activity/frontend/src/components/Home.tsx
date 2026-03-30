import { useState, useEffect } from 'react'
import { hasPermission, type UserPermissionInfo } from '../utils/permissions'

interface HomeProps {
  discordId: string
  permissionInfo: UserPermissionInfo
  onNavigate: (page: string) => void
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
  { id: 'my-registrations', label: '申込履歴', description: '自分の申込状況を確認', permission: 'view_my_registrations' },
  { id: 'player', label: '選手登録', description: '新規選手の登録', permission: 'view_player' },
  { id: 'admin-tournament', label: '大会登録', description: '新しい大会を登録', permission: 'view_tournament_register' },
  { id: 'admin-tournament-mgmt', label: '大会管理', description: '大会の編集・削除', permission: 'view_tournament_register' },
  { id: 'admin-practice', label: '練習日程管理', description: '練習予定の登録・削除', permission: 'view_practice_manage' },
  { id: 'admin-excel', label: '申込書出力', description: 'Excel申込書の生成', permission: 'view_excel_download' },
  { id: 'admin-members', label: 'メンバー一覧', description: 'メンバー情報の管理', permission: 'view_member_list' },
]

export default function Home({ discordId, permissionInfo, onNavigate }: HomeProps) {
  const [notices, setNotices] = useState<any[]>([])
  const [upcomingRegistrations, setUpcomingRegistrations] = useState<any[]>([])
  const [myPractices, setMyPractices] = useState<any[]>([])
  const [myPlayerId, setMyPlayerId] = useState<number | null>(null)
  const [selectedPractice, setSelectedPractice] = useState<any | null>(null)
  const [practiceParticipants, setPracticeParticipants] = useState<any[]>([])
  const [modalLoading, setModalLoading] = useState(false)
  const [leaving, setLeaving] = useState(false)

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
        }

        // 自分が申込済み＆1週間以内に開催される大会
        const [tRes, regRes] = await Promise.all([
          fetch(`${apiUrl}/api/tournaments`),
          fetch(`${apiUrl}/api/registrations/user/${discordId}`),
        ])
        if (tRes.ok && regRes.ok) {
          const tournaments = await tRes.json()
          const registrations = await regRes.json()
          const regIds = new Set(registrations.map((r: any) => r.tournament_id))
          const today = new Date(); today.setHours(0, 0, 0, 0)
          const upcoming = tournaments.filter((t: any) => {
            if (!regIds.has(t.tournament_id)) return false
            const tDate = new Date(t.tournament_date); tDate.setHours(0, 0, 0, 0)
            const diff = Math.ceil((tDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
            return diff >= 0 && diff <= 7
          }).sort((a: any, b: any) => a.tournament_date.localeCompare(b.tournament_date))
          setUpcomingRegistrations(upcoming)
        }

        // 自分が参加している練習（今日以降）
        if (playerId) {
          const pRes = await fetch(`${apiUrl}/api/practice`)
          if (pRes.ok) {
            const data = await pRes.json()
            const todayStr = new Date().toISOString().split('T')[0]
            const upcoming = data.filter((p: any) => p.practice_date >= todayStr)
              .sort((a: any, b: any) => a.practice_date.localeCompare(b.practice_date))

            // 1週間以内の練習で、自分が参加しているものだけ抽出
            const today = new Date(); today.setHours(0, 0, 0, 0)
            const joined: any[] = []
            for (const p of upcoming) {
              const pDate = new Date(p.practice_date); pDate.setHours(0, 0, 0, 0)
              const diff = Math.ceil((pDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
              if (diff > 7) continue
              const ptRes = await fetch(`${apiUrl}/api/practice/${p.id}/participants`)
              if (ptRes.ok) {
                const pts = await ptRes.json()
                if (pts.some((pt: any) => pt.player_id === playerId)) {
                  joined.push(p)
                }
              }
            }
            setMyPractices(joined)
          }
        }

        setNotices([])
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
    return `${dt.getMonth() + 1}/${dt.getDate()}（${weekdays[dt.getDay()]}）`
  }

  const formatTime = (t: string) => t?.slice(0, 5) || ''

  const openPracticeDetail = async (practice: any) => {
    setSelectedPractice(practice)
    setModalLoading(true)
    try {
      const res = await fetch(`${apiUrl}/api/practice/${practice.id}/participants`)
      if (res.ok) setPracticeParticipants(await res.json())
    } catch {} finally { setModalLoading(false) }
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
        {/* 直近の申込済み大会 */}
        {upcomingRegistrations.length > 0 && (
          <div style={{
            padding: '14px 16px', borderRadius: '10px',
            backgroundColor: '#0c1220', border: '1px solid #1e293b',
          }}>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#e2e8f0', marginBottom: '8px' }}>
              直近の大会予定
            </div>
            {upcomingRegistrations.map(t => {
              const days = (() => {
                const today = new Date(); today.setHours(0, 0, 0, 0)
                const d = new Date(t.tournament_date); d.setHours(0, 0, 0, 0)
                return Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
              })()
              return (
                <div key={t.tournament_id} style={{ fontSize: '13px', color: '#94a3b8', padding: '4px 0', borderBottom: '1px solid #1e293b' }}>
                  {t.tournament_name} - {formatDate(t.tournament_date)}
                  <span style={{ color: days <= 3 ? '#f59e0b' : '#64748b', marginLeft: '8px' }}>
                    {days === 0 ? '今日' : `あと${days}日`}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {/* 参加予定の練習 */}
        {myPractices.length > 0 && (
          <div style={{
            padding: '14px 16px', borderRadius: '10px',
            backgroundColor: '#4a1d96', border: '1px solid #6d28d9',
          }}>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#c4b5fd', marginBottom: '8px' }}>
              参加予定の練習
            </div>
            {myPractices.map(p => {
              const days = (() => {
                const today = new Date(); today.setHours(0, 0, 0, 0)
                const d = new Date(p.practice_date); d.setHours(0, 0, 0, 0)
                return Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
              })()
              return (
                <div key={p.id} onClick={() => openPracticeDetail(p)} style={{
                  fontSize: '13px', color: '#e0e7ff', padding: '6px 0', borderBottom: '1px solid #6d28d9',
                  cursor: 'pointer', transition: 'opacity 0.15s',
                }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                >
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
          {notices.length === 0 ? (
            <div style={{ fontSize: '13px', color: '#64748b' }}>
              現在、お知らせはありません
            </div>
          ) : (
            notices.map((n: any, i: number) => (
              <div key={i} style={{ fontSize: '13px', color: '#94a3b8', padding: '4px 0', borderBottom: '1px solid #475569' }}>
                {n.text}
              </div>
            ))
          )}
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
              </div>

              <div style={{ marginBottom: '20px' }}>
                <button onClick={() => handleLeave(selectedPractice.id)} disabled={leaving} style={{
                  padding: '10px', borderRadius: '6px', backgroundColor: 'transparent',
                  color: '#f87171', border: '1px solid #7f1d1d', fontSize: '14px',
                  fontWeight: '500', cursor: leaving ? 'not-allowed' : 'pointer', width: '100%',
                }}>{leaving ? '処理中...' : '参加をキャンセル'}</button>
              </div>

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
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
