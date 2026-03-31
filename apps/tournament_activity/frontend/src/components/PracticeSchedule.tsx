import { useState, useEffect } from 'react'

interface PracticeScheduleProps {
  discordId: string
}

export default function PracticeSchedule({ discordId }: PracticeScheduleProps) {
  const [practices, setPractices] = useState<any[]>([])
  const [myPlayerId, setMyPlayerId] = useState<number | null>(null)
  const [joinedIds, setJoinedIds] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [selectedPractice, setSelectedPractice] = useState<any>(null)
  const [participants, setParticipants] = useState<any[]>([])
  const [modalLoading, setModalLoading] = useState(false)
  const [joining, setJoining] = useState(false)

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  const loadPractices = async () => {
    const res = await fetch(`${apiUrl}/api/practice`)
    if (res.ok) {
      const data = await res.json()
      setPractices(data)
      return data
    }
    return []
  }

  useEffect(() => {
    const load = async () => {
      try {
        const [practiceData, meRes] = await Promise.all([
          loadPractices(),
          fetch(`${apiUrl}/api/players/discord/${discordId}`),
        ])

        let playerId: number | null = null
        if (meRes.ok) {
          const me = await meRes.json()
          if (me?.player_id) {
            playerId = me.player_id
            setMyPlayerId(playerId)
          }
        }

        // 各練習の参加者を取得して自分が参加済みかチェック
        if (playerId && practiceData.length > 0) {
          const joined = new Set<number>()
          await Promise.all(practiceData.map(async (p: any) => {
            const pRes = await fetch(`${apiUrl}/api/practice/${p.id}/participants`)
            if (pRes.ok) {
              const pts = await pRes.json()
              if (pts.some((pt: any) => pt.player_id === playerId)) {
                joined.add(p.id)
              }
            }
          }))
          setJoinedIds(joined)
        }
      } catch {} finally { setLoading(false) }
    }
    load()
  }, [discordId])

  const openDetail = async (practice: any) => {
    setSelectedPractice(practice)
    setModalLoading(true)
    try {
      const res = await fetch(`${apiUrl}/api/practice/${practice.id}/participants`)
      if (res.ok) setParticipants(await res.json())
    } catch {} finally { setModalLoading(false) }
  }

  const handleJoin = async (practiceId: number) => {
    if (!myPlayerId || joinedIds.has(practiceId)) return
    setJoining(true)
    try {
      const res = await fetch(`${apiUrl}/api/practice/${practiceId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: myPlayerId }),
      })
      if (res.ok) {
        // 参加済みSetに追加
        setJoinedIds(prev => new Set(prev).add(practiceId))
        // 一覧を再取得して正確な参加者数を反映
        await loadPractices()
        // モーダルが開いていたら参加者一覧を再取得
        if (selectedPractice?.id === practiceId) {
          const pRes = await fetch(`${apiUrl}/api/practice/${practiceId}/participants`)
          if (pRes.ok) setParticipants(await pRes.json())
        }
      } else {
        const err = await res.json()
        alert(err.detail || '参加に失敗しました')
      }
    } catch { alert('通信エラー') }
    finally { setJoining(false) }
  }

  const handleLeave = async (practiceId: number) => {
    if (!myPlayerId) return
    if (!confirm('参加をキャンセルしますか？')) return
    try {
      const res = await fetch(`${apiUrl}/api/practice/${practiceId}/leave/${myPlayerId}`, { method: 'DELETE' })
      if (res.ok) {
        // 参加済みSetから削除
        setJoinedIds(prev => {
          const next = new Set(prev)
          next.delete(practiceId)
          return next
        })
        // 一覧を再取得
        await loadPractices()
        if (selectedPractice?.id === practiceId) {
          setParticipants(prev => prev.filter(pt => pt.player_id !== myPlayerId))
        }
      }
    } catch { alert('通信エラー') }
  }

  const formatDate = (d: string) => {
    const dt = new Date(d)
    const weekdays = ['日', '月', '火', '水', '木', '金', '土']
    return `${dt.getMonth() + 1}/${dt.getDate()}（${weekdays[dt.getDay()]}）`
  }

  const formatTime = (t: string) => t?.slice(0, 5) || ''

  const getDaysUntil = (d: string) => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const target = new Date(d); target.setHours(0, 0, 0, 0)
    return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>読み込み中...</div>

  const upcoming = practices.filter(p => getDaysUntil(p.practice_date) >= 0)
    .sort((a, b) => a.practice_date.localeCompare(b.practice_date))

  return (
    <div>
      {upcoming.length === 0 ? (
        <div style={{
          padding: '40px', textAlign: 'center', color: '#94a3b8',
          backgroundColor: '#0c1220', borderRadius: '12px', border: '1px solid #1e293b'
        }}>
          予定されている練習はありません
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {upcoming.map(p => {
            const days = getDaysUntil(p.practice_date)
            const joined = joinedIds.has(p.id)
            return (
              <div key={p.id} style={{
                padding: '16px 20px', backgroundColor: '#0c1220',
                borderRadius: '10px', border: '1px solid #1e293b',
                display: 'flex', alignItems: 'center', gap: '16px', cursor: 'pointer',
              }} onClick={() => openDetail(p)}>
                <div style={{ textAlign: 'center', minWidth: '60px', flexShrink: 0 }}>
                  <div style={{ fontSize: '20px', fontWeight: '700', color: '#e2e8f0' }}>
                    {new Date(p.practice_date).getDate()}
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>
                    {formatDate(p.practice_date).split('（')[1]?.replace('）', '') || ''}
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '15px', fontWeight: '500', color: '#f1f5f9', marginBottom: '4px' }}>
                    {p.location}
                  </div>
                  <div style={{ fontSize: '13px', color: '#94a3b8', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <span>{formatTime(p.start_time)} - {formatTime(p.end_time)}</span>
                    <span>{p.participant_count || 0}名参加</span>
                    {days <= 3 && days >= 0 && (
                      <span style={{ color: '#f59e0b', fontWeight: '600' }}>
                        {days === 0 ? '今日' : `あと${days}日`}
                      </span>
                    )}
                  </div>
                  {p.participant_names && p.participant_names.length > 0 && (
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                      {p.participant_names.join('、')}
                    </div>
                  )}
                </div>
                <div onClick={e => e.stopPropagation()} style={{ flexShrink: 0 }}>
                  {(() => {
                    const deadlinePassed = p.deadline_date && new Date(p.deadline_date) < new Date()
                    if (joined) {
                      return <span style={{ padding: '6px 14px', borderRadius: '6px', fontSize: '13px', color: '#64748b', backgroundColor: '#1e293b' }}>参加済</span>
                    }
                    if (deadlinePassed) {
                      return <span style={{ padding: '6px 14px', borderRadius: '6px', fontSize: '13px', color: '#475569', backgroundColor: '#1e293b' }}>申込終了</span>
                    }
                    return (
                      <button onClick={() => handleJoin(p.id)} disabled={joining} style={{
                        padding: '6px 14px', borderRadius: '6px',
                        backgroundColor: '#1e3a8a', color: '#93c5fd',
                        border: '1px solid #2563eb', fontSize: '13px', cursor: 'pointer',
                      }}>参加</button>
                    )
                  })()}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 詳細モーダル */}
      {selectedPractice && (
        <div onClick={() => setSelectedPractice(null)} style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            backgroundColor: '#0f172a', borderRadius: '12px', border: '1px solid #1e293b',
            width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto',
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '16px 20px', borderBottom: '1px solid #1e293b',
            }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#f1f5f9', margin: 0 }}>練習詳細</h3>
              <button onClick={() => setSelectedPractice(null)} style={{
                padding: '4px 10px', borderRadius: '6px', backgroundColor: '#1e293b',
                color: '#94a3b8', border: '1px solid #334155', fontSize: '13px', cursor: 'pointer',
              }}>閉じる</button>
            </div>

            <div style={{ padding: '16px 20px' }}>
              <div style={{ marginBottom: '20px' }}>
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
                  <div key={String(label)} style={{
                    display: 'flex', padding: '8px 0', borderBottom: '1px solid #1e293b', fontSize: '14px',
                  }}>
                    <span style={{ width: '60px', flexShrink: 0, color: '#64748b', fontSize: '13px' }}>{label}</span>
                    <span style={{ color: '#e2e8f0' }}>{val}</span>
                  </div>
                ))}
              </div>

              {myPlayerId && (
                <div style={{ marginBottom: '20px' }}>
                  {joinedIds.has(selectedPractice.id) ? (
                    <button onClick={() => handleLeave(selectedPractice.id)} style={{
                      padding: '10px 24px', borderRadius: '6px', backgroundColor: 'transparent',
                      color: '#f87171', border: '1px solid #7f1d1d', fontSize: '14px',
                      fontWeight: '500', cursor: 'pointer', width: '100%',
                    }}>参加をキャンセル</button>
                  ) : (
                    <button onClick={() => handleJoin(selectedPractice.id)} disabled={joining} style={{
                      padding: '10px 24px', borderRadius: '6px', backgroundColor: '#3b82f6',
                      color: '#fff', border: 'none', fontSize: '14px',
                      fontWeight: '600', cursor: 'pointer', width: '100%',
                    }}>{joining ? '処理中...' : '参加する'}</button>
                  )}
                </div>
              )}

              <div>
                <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#e2e8f0', marginBottom: '10px' }}>
                  参加者（{participants.length}名）
                </h4>
                {modalLoading ? (
                  <p style={{ color: '#94a3b8', fontSize: '13px' }}>読み込み中...</p>
                ) : participants.length === 0 ? (
                  <p style={{ color: '#64748b', fontSize: '13px' }}>まだ参加者がいません</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {participants.map((pt: any) => (
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
        </div>
      )}
    </div>
  )
}
