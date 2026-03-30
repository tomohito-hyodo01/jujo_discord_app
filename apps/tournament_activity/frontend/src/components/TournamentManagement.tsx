import { useState, useEffect } from 'react'

export default function TournamentManagement() {
  const [tournaments, setTournaments] = useState<any[]>([])
  const [wards, setWards] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTournament, setSelectedTournament] = useState<any>(null)
  const [modalMode, setModalMode] = useState<'detail' | 'edit'>('detail')
  const [editData, setEditData] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [registrations, setRegistrations] = useState<any[]>([])
  const [regLoading, setRegLoading] = useState(false)
  const [excelGenerating, setExcelGenerating] = useState(false)

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  useEffect(() => {
    const load = async () => {
      try {
        const [tRes, wRes] = await Promise.all([
          fetch(`${apiUrl}/api/tournaments`),
          fetch(`${apiUrl}/api/wards`),
        ])
        if (tRes.ok) setTournaments(await tRes.json())
        if (wRes.ok) setWards(await wRes.json())
      } catch {} finally { setLoading(false) }
    }
    load()
  }, [])

  const getWardName = (id: number) => wards.find(w => w.ward_id === id)?.ward_name || `ID:${id}`

  const formatDate = (d: string | null) => {
    if (!d) return '-'
    const dt = new Date(d)
    return `${dt.getFullYear()}/${dt.getMonth() + 1}/${dt.getDate()}`
  }

  const openDetail = async (t: any) => {
    setSelectedTournament(t)
    setModalMode('detail')
    setMessage('')
    setRegistrations([])
    setRegLoading(true)
    try {
      const res = await fetch(`${apiUrl}/api/registrations/tournament/${t.tournament_id}`)
      if (res.ok) setRegistrations(await res.json())
    } catch {} finally { setRegLoading(false) }
  }

  const openEdit = (t: any) => {
    setEditData({
      tournament_name: t.tournament_name,
      registrated_ward: t.registrated_ward,
      deadline_date: t.deadline_date?.split('T')[0] || '',
      tournament_date: t.tournament_date?.split('T')[0] || '',
      classification: t.classification,
      type: Array.isArray(t.type) ? t.type.join(', ') : '',
    })
    setModalMode('edit')
    setMessage('')
  }

  const handleSave = async () => {
    if (!selectedTournament) return
    setSaving(true); setMessage('')
    try {
      const typeArr = editData.type.split(/[,、]/).map((s: string) => s.trim()).filter(Boolean)
      const res = await fetch(`${apiUrl}/api/tournaments/${selectedTournament.tournament_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editData, type: typeArr }),
      })
      if (res.ok) {
        setMessage('更新しました')
        setTournaments(prev => prev.map(t =>
          t.tournament_id === selectedTournament.tournament_id
            ? { ...t, ...editData, type: typeArr } : t
        ))
        setSelectedTournament({ ...selectedTournament, ...editData, type: typeArr })
        setModalMode('detail')
      } else {
        const err = await res.json()
        setMessage(`エラー: ${err.detail || '更新失敗'}`)
      }
    } catch { setMessage('通信エラー') }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!selectedTournament) return
    if (!confirm(`「${selectedTournament.tournament_name}」を削除しますか？この操作は取り消せません。`)) return
    try {
      const res = await fetch(`${apiUrl}/api/tournaments/${selectedTournament.tournament_id}`, { method: 'DELETE' })
      if (res.ok) {
        setTournaments(prev => prev.filter(t => t.tournament_id !== selectedTournament.tournament_id))
        setSelectedTournament(null)
      } else {
        const err = await res.json()
        alert(`削除失敗: ${err.detail || ''}`)
      }
    } catch { alert('通信エラー') }
  }

  const handleExcelGenerate = async () => {
    if (!selectedTournament) return
    setExcelGenerating(true); setMessage('')
    try {
      const res = await fetch(`${apiUrl}/api/excel/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournament_id: selectedTournament.tournament_id }),
      })
      const result = await res.json()
      if (res.ok && result.success) {
        setMessage('申込書を生成しました。Discordチャンネルに送信されました。')
      } else {
        setMessage(`生成失敗: ${result.detail || result.error || ''}`)
      }
    } catch { setMessage('通信エラー') }
    finally { setExcelGenerating(false) }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>読み込み中...</div>

  const cellStyle = { padding: '10px 12px', borderBottom: '1px solid #1e293b', fontSize: '13px', color: '#e2e8f0', whiteSpace: 'nowrap' as const, cursor: 'pointer' }
  const headerCellStyle = { ...cellStyle, color: '#64748b', fontSize: '12px', fontWeight: '600' as const, backgroundColor: '#070e1b', borderBottom: '2px solid #1e293b', cursor: 'default' }
  const inputStyle = { width: '100%', padding: '8px 12px', backgroundColor: '#0c1220', border: '1px solid #1e293b', borderRadius: '6px', color: '#e2e8f0', fontSize: '13px' }

  return (
    <div>
      <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#e2e8f0', marginBottom: '16px' }}>
        大会管理
      </h2>

      <div className="tm-table" style={{ borderRadius: '10px', border: '1px solid #1e293b', overflow: 'auto', backgroundColor: '#0c1220' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={headerCellStyle}>大会名</th>
            <th style={headerCellStyle}>主催</th>
            <th style={headerCellStyle}>開催日</th>
            <th style={headerCellStyle}>締切</th>
            <th style={headerCellStyle}>形式</th>
          </tr></thead>
          <tbody>
            {tournaments.map(t => (
              <tr key={t.tournament_id} onClick={() => openDetail(t)}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#111b2e')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}>
                <td style={{ ...cellStyle, fontWeight: '500', whiteSpace: 'normal', minWidth: '140px' }}>{t.tournament_name}</td>
                <td style={cellStyle}>{getWardName(t.registrated_ward)}</td>
                <td style={cellStyle}>{formatDate(t.tournament_date)}</td>
                <td style={cellStyle}>{formatDate(t.deadline_date)}</td>
                <td style={cellStyle}>{t.classification === 0 ? '個人戦' : '団体戦'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* スマホ用カード */}
      <div className="tm-cards" style={{ display: 'none', flexDirection: 'column', gap: '10px' }}>
        {tournaments.map(t => (
          <div key={t.tournament_id} onClick={() => openDetail(t)} style={{
            padding: '14px 16px', backgroundColor: '#0c1220', borderRadius: '10px', border: '1px solid #1e293b', cursor: 'pointer',
          }}>
            <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#f1f5f9', margin: '0 0 6px 0' }}>{t.tournament_name}</h3>
            <div style={{ display: 'flex', gap: '12px', fontSize: '13px', color: '#94a3b8', flexWrap: 'wrap' }}>
              <span>{getWardName(t.registrated_ward)}</span>
              <span>{formatDate(t.tournament_date)}</span>
              <span>{t.classification === 0 ? '個人戦' : '団体戦'}</span>
            </div>
          </div>
        ))}
      </div>

      {/* モーダル */}
      {selectedTournament && (
        <div onClick={() => setSelectedTournament(null)} style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            backgroundColor: '#0f172a', borderRadius: '12px', border: '1px solid #1e293b',
            width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #1e293b' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#f1f5f9', margin: 0 }}>
                {modalMode === 'edit' ? '大会を編集' : '大会詳細'}
              </h3>
              <button onClick={() => setSelectedTournament(null)} style={{
                padding: '4px 10px', borderRadius: '6px', backgroundColor: '#1e293b', color: '#94a3b8',
                border: '1px solid #334155', fontSize: '13px', cursor: 'pointer',
              }}>閉じる</button>
            </div>

            <div style={{ padding: '16px 20px' }}>
              {message && (
                <div style={{ padding: '10px', borderRadius: '6px', marginBottom: '12px', fontSize: '13px',
                  backgroundColor: message.includes('エラー') || message.includes('失敗') ? '#7f1d1d' : '#064e3b',
                  color: '#e2e8f0', border: `1px solid ${message.includes('エラー') || message.includes('失敗') ? '#ef4444' : '#10b981'}` }}>
                  {message}
                </div>
              )}

              {modalMode === 'edit' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div><label style={{ fontSize: '12px', color: '#64748b' }}>大会名</label>
                    <input value={editData.tournament_name} onChange={e => setEditData({ ...editData, tournament_name: e.target.value })} style={inputStyle} /></div>
                  <div><label style={{ fontSize: '12px', color: '#64748b' }}>開催日</label>
                    <input type="date" value={editData.tournament_date} onChange={e => setEditData({ ...editData, tournament_date: e.target.value })} style={inputStyle} /></div>
                  <div><label style={{ fontSize: '12px', color: '#64748b' }}>締切日</label>
                    <input type="date" value={editData.deadline_date} onChange={e => setEditData({ ...editData, deadline_date: e.target.value })} style={inputStyle} /></div>
                  <div><label style={{ fontSize: '12px', color: '#64748b' }}>種別（カンマ区切り）</label>
                    <input value={editData.type} onChange={e => setEditData({ ...editData, type: e.target.value })} style={inputStyle} placeholder="一般, 35, 45" /></div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    <button onClick={handleSave} disabled={saving} style={{
                      padding: '8px 20px', borderRadius: '6px', backgroundColor: '#1e3a8a', color: '#93c5fd',
                      border: '1px solid #2563eb', fontSize: '13px', cursor: 'pointer',
                    }}>{saving ? '保存中...' : '保存'}</button>
                    <button onClick={() => setModalMode('detail')} style={{
                      padding: '8px 20px', borderRadius: '6px', backgroundColor: 'transparent', color: '#94a3b8',
                      border: '1px solid #334155', fontSize: '13px', cursor: 'pointer',
                    }}>戻る</button>
                  </div>
                </div>
              ) : (
                <>
                  {/* 詳細表示 */}
                  <div style={{ fontSize: '14px', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                    {[
                      ['大会名', selectedTournament.tournament_name],
                      ['主催', getWardName(selectedTournament.registrated_ward)],
                      ['開催日', formatDate(selectedTournament.tournament_date)],
                      ['締切', formatDate(selectedTournament.deadline_date)],
                      ['形式', selectedTournament.classification === 0 ? '個人戦' : '団体戦'],
                      ['種別', Array.isArray(selectedTournament.type) ? selectedTournament.type.join('・') : ''],
                    ].map(([label, val]) => (
                      <div key={String(label)} style={{ display: 'flex', padding: '6px 0', borderBottom: '1px solid #1e293b' }}>
                        <span style={{ width: '80px', flexShrink: 0, color: '#64748b', fontSize: '13px' }}>{label}</span>
                        <span style={{ color: '#e2e8f0' }}>{val}</span>
                      </div>
                    ))}
                  </div>

                  {/* 操作ボタン */}
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
                    <button onClick={() => openEdit(selectedTournament)} style={{
                      padding: '6px 16px', borderRadius: '6px', backgroundColor: '#1e3a8a', color: '#93c5fd',
                      border: '1px solid #2563eb', fontSize: '13px', cursor: 'pointer',
                    }}>編集</button>
                    <button onClick={handleExcelGenerate} disabled={excelGenerating} style={{
                      padding: '6px 16px', borderRadius: '6px', backgroundColor: '#064e3b', color: '#6ee7b7',
                      border: '1px solid #10b981', fontSize: '13px', cursor: 'pointer',
                    }}>{excelGenerating ? '生成中...' : '申込書出力'}</button>
                    <button onClick={handleDelete} style={{
                      padding: '6px 16px', borderRadius: '6px', backgroundColor: 'transparent', color: '#f87171',
                      border: '1px solid #7f1d1d', fontSize: '13px', cursor: 'pointer',
                    }}>削除</button>
                  </div>

                  {/* 申込一覧 */}
                  <div style={{ borderTop: '1px solid #1e293b', paddingTop: '12px' }}>
                    <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#e2e8f0', marginBottom: '10px' }}>
                      申込一覧（{registrations.length}件）
                    </h4>
                    {regLoading ? (
                      <p style={{ color: '#94a3b8', fontSize: '13px' }}>読み込み中...</p>
                    ) : registrations.length === 0 ? (
                      <p style={{ color: '#64748b', fontSize: '13px' }}>申込はありません</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {registrations.map((r: any, i: number) => (
                          <div key={i} style={{
                            padding: '8px 12px', backgroundColor: '#0c1220', borderRadius: '6px',
                            border: '1px solid #1e293b', fontSize: '13px',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          }}>
                            <div>
                              <span style={{ color: '#e2e8f0', fontWeight: '500' }}>{r.applicant_name || r.discord_id}</span>
                              <span style={{ color: '#64748b' }}> / </span>
                              <span style={{ color: '#94a3b8' }}>{r.pair_name || '-'}</span>
                            </div>
                            <span style={{ padding: '1px 8px', borderRadius: '6px', fontSize: '11px', backgroundColor: '#1e293b', color: '#94a3b8' }}>
                              {r.type}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 640px) {
          .tm-table { display: none !important; }
          .tm-cards { display: flex !important; }
        }
      `}</style>
    </div>
  )
}
