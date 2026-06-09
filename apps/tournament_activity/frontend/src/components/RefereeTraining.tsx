import { useState, useEffect } from 'react'
import CommentSection from './CommentSection'

interface RefereeTrainingProps {
  discordId: string
}

export default function RefereeTraining({ discordId }: RefereeTrainingProps) {
  const [trainings, setTrainings] = useState<any[]>([])
  const [registeredIds, setRegisteredIds] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [joiningId, setJoiningId] = useState<number | null>(null)
  const [selectedTraining, setSelectedTraining] = useState<any>(null)
  const [participants, setParticipants] = useState<any[]>([])
  const [modalLoading, setModalLoading] = useState(false)

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  const loadData = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/referee-training`)
      if (res.ok) {
        const data = await res.json()
        setTrainings(data)
        const joined = new Set<number>()
        for (const t of data) {
          const pRes = await fetch(`${apiUrl}/api/referee-training/${t.id}/participants`)
          if (pRes.ok) {
            const pts = await pRes.json()
            if (pts.some((p: any) => p.discord_id === discordId)) joined.add(t.id)
          }
        }
        setRegisteredIds(joined)
      }
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { loadData() }, [discordId])

  const handleRegister = async (trainingId: number) => {
    setJoiningId(trainingId)
    try {
      const res = await fetch(`${apiUrl}/api/referee-training/${trainingId}/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discord_id: discordId }),
      })
      if (res.ok) {
        setRegisteredIds(prev => new Set(prev).add(trainingId))
        await loadData()
        if (selectedTraining?.id === trainingId) {
          const pRes = await fetch(`${apiUrl}/api/referee-training/${trainingId}/participants`)
          if (pRes.ok) setParticipants(await pRes.json())
        }
      } else { const err = await res.json(); alert(err.detail || '申込に失敗しました') }
    } catch { alert('通信エラー') }
    finally { setJoiningId(null) }
  }

  const handleCancel = async (trainingId: number) => {
    if (!confirm('申込をキャンセルしますか？')) return
    try {
      const res = await fetch(`${apiUrl}/api/referee-training/${trainingId}/cancel/${discordId}`, { method: 'DELETE' })
      if (res.ok) {
        setRegisteredIds(prev => { const n = new Set(prev); n.delete(trainingId); return n })
        await loadData()
        if (selectedTraining?.id === trainingId) setParticipants(prev => prev.filter(p => p.discord_id !== discordId))
      }
    } catch { alert('通信エラー') }
  }

  const openDetail = async (t: any) => {
    setSelectedTraining(t)
    setModalLoading(true)
    try {
      const res = await fetch(`${apiUrl}/api/referee-training/${t.id}/participants`)
      if (res.ok) setParticipants(await res.json())
    } catch {} finally { setModalLoading(false) }
  }

  const formatDate = (d: string) => {
    const dt = new Date(d)
    const weekdays = ['日', '月', '火', '水', '木', '金', '土']
    return `${dt.getMonth() + 1}/${dt.getDate()}(${weekdays[dt.getDay()]})`
  }

  const formatTime = (t: string | null) => t?.slice(0, 5) || ''
  const isDeadlinePassed = (d: string) => new Date(d + 'T23:59:59') < new Date()

  if (loading) return <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>読み込み中...</div>

  const upcoming = trainings.filter(t => new Date(t.training_date) >= new Date(new Date().toLocaleDateString('sv-SE')))

  return (
    <div>
      <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#e2e8f0', marginBottom: '20px' }}>
        審判講習申込
      </h2>

      {upcoming.length === 0 ? (
        <div style={{
          padding: '40px', textAlign: 'center', color: '#94a3b8',
          backgroundColor: '#0c1220', borderRadius: '12px', border: '1px solid #1e293b',
        }}>予定されている審判講習はありません</div>
      ) : (
        <div style={{ borderRadius: '10px', border: '1px solid #1e293b', backgroundColor: '#0c1220', overflow: 'hidden' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {upcoming.map(t => {
              const joined = registeredIds.has(t.id)
              const expired = isDeadlinePassed(t.deadline_date)

              let tagText = '申込'
              let tagBg = '#1e3a8a'
              let tagColor = '#93c5fd'
              let tagBorder = '#2563eb'
              if (joined) {
                tagText = '申込済'; tagBg = '#1e293b'; tagColor = '#64748b'; tagBorder = '#334155'
              } else if (expired) {
                tagText = '受付終了'; tagBg = '#1e293b'; tagColor = '#475569'; tagBorder = '#334155'
              }

              return (
                <div
                  key={t.id}
                  onClick={() => openDetail(t)}
                  style={{
                    padding: '12px 16px', borderBottom: '1px solid #1e293b',
                    cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    transition: 'background-color 0.15s',
                    opacity: expired && !joined ? 0.6 : 1,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#162032')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '12px', color: '#64748b', flexShrink: 0 }}>{formatDate(t.training_date)}</span>
                      <span style={{ fontSize: '14px', fontWeight: '500', color: '#e2e8f0' }}>
                        {t.grade} {t.session_name}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '12px', color: '#94a3b8' }}>
                      <span>{t.venue}</span>
                      <span>締切 {formatDate(t.deadline_date)}</span>
                      <span>{t.participant_count || 0}名申込</span>
                      {t.total_fee && <span>{t.total_fee.toLocaleString()}円</span>}
                    </div>
                  </div>
                  <div onClick={e => e.stopPropagation()} style={{ flexShrink: 0, marginLeft: '12px' }}>
                    {joined || expired ? (
                      <span style={{
                        padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '500',
                        backgroundColor: tagBg, color: tagColor, border: `1px solid ${tagBorder}`,
                      }}>{tagText}</span>
                    ) : (
                      <button onClick={() => handleRegister(t.id)} disabled={joiningId === t.id} style={{
                        padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '500',
                        backgroundColor: tagBg, color: tagColor, border: `1px solid ${tagBorder}`,
                        cursor: 'pointer',
                      }}>{joiningId === t.id ? '...' : tagText}</button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 詳細モーダル */}
      {selectedTraining && (
        <div onClick={() => setSelectedTraining(null)} style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            backgroundColor: '#0f172a', borderRadius: '12px', border: '1px solid #1e293b',
            maxWidth: '480px', width: '100%', maxHeight: '80vh', overflowY: 'auto',
          }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#f1f5f9', margin: 0 }}>
                {selectedTraining.grade} {selectedTraining.session_name}
              </h3>
              <button onClick={() => setSelectedTraining(null)} style={{
                padding: '4px 10px', borderRadius: '5px', fontSize: '12px', backgroundColor: 'transparent',
                color: '#94a3b8', border: '1px solid #334155', cursor: 'pointer',
              }}>✕</button>
            </div>
            <div style={{ padding: '16px 20px' }}>
              {[
                ['日付', formatDate(selectedTraining.training_date)],
                ['会場', selectedTraining.venue],
                ['受付', formatTime(selectedTraining.reception_time) || '-'],
                ['開始', formatTime(selectedTraining.start_time) || '-'],
                ['締切', formatDate(selectedTraining.deadline_date)],
                ['対象', selectedTraining.target || '-'],
                ['受講料', selectedTraining.tuition_fee ? `${selectedTraining.tuition_fee.toLocaleString()}円` : '-'],
                ['認定料', selectedTraining.certification_fee ? `${selectedTraining.certification_fee.toLocaleString()}円` : '-'],
                ['費用総額', selectedTraining.total_fee ? `${selectedTraining.total_fee.toLocaleString()}円` : '-'],
              ].map(([label, val]) => (
                <div key={String(label)} style={{ display: 'flex', padding: '6px 0', borderBottom: '1px solid #1e293b', fontSize: '14px' }}>
                  <span style={{ width: '80px', flexShrink: 0, color: '#64748b', fontSize: '13px' }}>{label}</span>
                  <span style={{ color: '#e2e8f0' }}>{val}</span>
                </div>
              ))}

              {(() => {
                const joined = registeredIds.has(selectedTraining.id)
                const expired = isDeadlinePassed(selectedTraining.deadline_date)
                if (joined) {
                  return <button onClick={() => handleCancel(selectedTraining.id)} style={{
                    marginTop: '16px', width: '100%', padding: '10px', borderRadius: '6px',
                    backgroundColor: 'transparent', color: '#f87171', border: '1px solid #7f1d1d',
                    fontSize: '14px', cursor: 'pointer',
                  }}>申込をキャンセル</button>
                }
                if (expired) {
                  return <div style={{ marginTop: '16px', padding: '10px', borderRadius: '8px', backgroundColor: '#1e293b', textAlign: 'center', fontSize: '14px', color: '#64748b' }}>受付終了</div>
                }
                return <button onClick={() => handleRegister(selectedTraining.id)} disabled={joiningId === selectedTraining.id} style={{
                  marginTop: '16px', width: '100%', padding: '10px', borderRadius: '6px',
                  backgroundColor: '#3b82f6', color: '#fff', border: 'none', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
                }}>{joiningId === selectedTraining.id ? '処理中...' : '申し込む'}</button>
              })()}

              <div style={{ marginTop: '20px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#e2e8f0', marginBottom: '10px' }}>
                  申込者（{participants.length}名）
                </h4>
                {modalLoading ? (
                  <p style={{ color: '#94a3b8', fontSize: '13px' }}>読み込み中...</p>
                ) : participants.length === 0 ? (
                  <p style={{ color: '#64748b', fontSize: '13px' }}>まだ申込者がいません</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {participants.map((pt: any) => (
                      <div key={pt.discord_id} style={{
                        padding: '8px 12px', backgroundColor: '#0c1220', borderRadius: '6px',
                        border: '1px solid #1e293b', fontSize: '14px', color: '#e2e8f0',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      }}>
                        <span>{pt.player_name || pt.discord_id}</span>
                        {pt.discord_id === discordId && <span style={{ fontSize: '11px', color: '#64748b' }}>あなた</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <CommentSection targetType="referee_training" targetId={selectedTraining.id} discordId={discordId} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
