import { useState, useEffect } from 'react'

interface PracticeManagementProps {
  discordId: string
}

export default function PracticeManagement({ discordId }: PracticeManagementProps) {
  const [practices, setPractices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [formData, setFormData] = useState({
    practice_date: '', start_time: '', end_time: '', location: '', deadline_date: '',
  })
  const [editingPractice, setEditingPractice] = useState<any | null>(null)
  const [editForm, setEditForm] = useState({
    practice_date: '', start_time: '', end_time: '', location: '', deadline_date: '', court_number: '',
  })
  const [editSaving, setEditSaving] = useState(false)
  const [allPlayers, setAllPlayers] = useState<any[]>([])
  const [editVisibility, setEditVisibility] = useState<string>('public')
  const [editInvitedIds, setEditInvitedIds] = useState<number[]>([])
  const [editParticipants, setEditParticipants] = useState<any[]>([])
  const [courtReservations, setCourtReservations] = useState<any[]>([])
  const [newReservation, setNewReservation] = useState({ start_time: '', end_time: '', reserver_name: '' })
  const [editingReservationId, setEditingReservationId] = useState<number | null>(null)
  const [editReservation, setEditReservation] = useState({ start_time: '', end_time: '', reserver_name: '' })
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<any>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [previewData, setPreviewData] = useState<any[]>([])
  const [previewLoading, setPreviewLoading] = useState(false)

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  const loadPractices = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/practice`)
      if (res.ok) setPractices(await res.json())
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => {
    loadPractices()
    fetch(`${apiUrl}/api/players`).then(r => r.ok ? r.json() : []).then(setAllPlayers).catch(() => {})
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true); setMessage('')
    try {
      const res = await fetch(`${apiUrl}/api/practice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      if (res.ok) {
        setMessage('練習日程を登録しました')
        setFormData({ practice_date: '', start_time: '', end_time: '', location: '', deadline_date: '' })
        setShowForm(false)
        loadPractices()
      } else {
        const err = await res.json()
        setMessage(`エラー: ${err.detail || '登録失敗'}`)
      }
    } catch { setMessage('通信エラー') }
    finally { setSaving(false) }
  }

  const openEdit = async (p: any) => {
    setEditingPractice(p)
    setEditForm({
      practice_date: p.practice_date?.split('T')[0] || '',
      start_time: p.start_time?.slice(0, 5) || '',
      end_time: p.end_time?.slice(0, 5) || '',
      court_number: p.court_number || '',
      location: p.location || '',
      deadline_date: p.deadline_date?.split('T')[0] || '',
    })
    setEditVisibility(p.visibility || 'public')
    setEditInvitedIds(p.invited_player_ids || [])
    setNewReservation({ start_time: '', end_time: '', reserver_name: '' })
    try {
      const res = await fetch(`${apiUrl}/api/practice/${p.id}/reservations`)
      if (res.ok) setCourtReservations(await res.json())
      else setCourtReservations([])
    } catch { setCourtReservations([]) }
    try {
      const ptRes = await fetch(`${apiUrl}/api/practice/${p.id}/participants`)
      if (ptRes.ok) setEditParticipants(await ptRes.json())
      else setEditParticipants([])
    } catch { setEditParticipants([]) }
  }

  const handleAddReservation = async () => {
    if (!editingPractice || !newReservation.start_time || !newReservation.end_time || !newReservation.reserver_name) return
    try {
      const res = await fetch(`${apiUrl}/api/practice/${editingPractice.id}/reservations`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newReservation),
      })
      if (res.ok) {
        const rRes = await fetch(`${apiUrl}/api/practice/${editingPractice.id}/reservations`)
        if (rRes.ok) setCourtReservations(await rRes.json())
        setNewReservation({ start_time: '', end_time: '', reserver_name: '' })
      }
    } catch { alert('通信エラー') }
  }

  const handleUpdateReservation = async (reservationId: number) => {
    if (!editingPractice || !editReservation.start_time || !editReservation.end_time || !editReservation.reserver_name) return
    try {
      const res = await fetch(`${apiUrl}/api/practice/reservations/${reservationId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editReservation),
      })
      if (res.ok) {
        const rRes = await fetch(`${apiUrl}/api/practice/${editingPractice.id}/reservations`)
        if (rRes.ok) setCourtReservations(await rRes.json())
        setEditingReservationId(null)
      }
    } catch { alert('通信エラー') }
  }

  const handleDeleteReservation = async (reservationId: number) => {
    if (!confirm('この予約を削除しますか？')) return
    try {
      const res = await fetch(`${apiUrl}/api/practice/reservations/${reservationId}`, { method: 'DELETE' })
      if (res.ok) setCourtReservations(prev => prev.filter(r => r.id !== reservationId))
    } catch { alert('通信エラー') }
  }

  const handleNotifyReservations = async (practiceId: number) => {
    if (!confirm('この練習の予約者をDiscordチャンネルに通知しますか？')) return
    try {
      const res = await fetch(`${apiUrl}/api/practice/${practiceId}/notify-reservations`, { method: 'POST' })
      if (res.ok) {
        setMessage('予約者通知を送信しました')
      } else {
        const err = await res.json()
        setMessage(`送信失敗: ${err.detail || ''}`)
      }
    } catch { setMessage('通信エラーが発生しました') }
  }

  const handlePreviewSheets = async () => {
    setPreviewLoading(true)
    setImportResult(null)
    try {
      const res = await fetch(`${apiUrl}/api/practice/preview-sheets`)
      if (res.ok) {
        setPreviewData(await res.json())
        setShowPreview(true)
      } else {
        const err = await res.json()
        alert(`プレビュー取得に失敗しました: ${err.detail || ''}`)
      }
    } catch { alert('通信エラー') }
    finally { setPreviewLoading(false) }
  }

  const handleImportSheets = async () => {
    if (!confirm('スプレッドシートから予約を取り込みます。既存の予約情報はスプレッドシートの内容で上書きされます。よろしいですか？')) return
    setImporting(true)
    setImportResult(null)
    try {
      const res = await fetch(`${apiUrl}/api/practice/import-from-sheets`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setImportResult(data)
        setShowPreview(false)
        loadPractices()
      } else {
        const err = await res.json()
        alert(`取り込みに失敗しました: ${err.detail || ''}`)
      }
    } catch { alert('通信エラー') }
    finally { setImporting(false) }
  }

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingPractice) return
    setEditSaving(true)
    try {
      const res = await fetch(`${apiUrl}/api/practice/${editingPractice.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editForm, visibility: editVisibility }),
      })

      // 招待者リストを更新
      if (editVisibility === 'invited') {
        await fetch(`${apiUrl}/api/practice/${editingPractice.id}/invitations`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ player_ids: editInvitedIds }),
        })
      }

      if (res.ok) {
        setMessage('練習日程を更新しました')
        setEditingPractice(null)
        loadPractices()
      } else {
        const err = await res.json()
        setMessage(`エラー: ${err.detail || '更新失敗'}`)
      }
    } catch { setMessage('通信エラー') }
    finally { setEditSaving(false) }
  }

  const handleDelete = async (id: number, location: string, date: string) => {
    if (!confirm(`「${formatDate(date)} ${location}」の練習日程を削除しますか？`)) return
    try {
      const res = await fetch(`${apiUrl}/api/practice/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setPractices(prev => prev.filter(p => p.id !== id))
        setMessage('削除しました')
      } else {
        alert('削除に失敗しました')
      }
    } catch { alert('通信エラー') }
  }

  const formatDate = (d: string) => {
    const dt = new Date(d)
    const weekdays = ['日', '月', '火', '水', '木', '金', '土']
    return `${dt.getFullYear()}/${dt.getMonth() + 1}/${dt.getDate()}(${weekdays[dt.getDay()]})`
  }

  const formatTime = (t: string) => t?.slice(0, 5) || ''

  if (loading) return <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>読み込み中...</div>

  const inputStyle = {
    width: '100%', padding: '10px 14px', borderRadius: '6px',
    border: '1px solid #1e293b', backgroundColor: '#0c1220',
    color: '#e2e8f0', fontSize: '14px', boxSizing: 'border-box' as const,
  }
  const labelStyle = { display: 'block', marginBottom: '6px', fontSize: '13px', color: '#64748b' }

  const cellStyle = {
    padding: '10px 12px', borderBottom: '1px solid #1e293b',
    fontSize: '13px', color: '#e2e8f0', whiteSpace: 'nowrap' as const,
  }
  const headerCellStyle = {
    ...cellStyle, color: '#64748b', fontSize: '12px', fontWeight: '600' as const,
    backgroundColor: '#070e1b', borderBottom: '2px solid #1e293b',
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#e2e8f0', margin: 0 }}>
          練習日程管理
        </h2>
        <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={handlePreviewSheets} disabled={previewLoading || importing} style={{
          padding: '6px 14px', borderRadius: '6px',
          backgroundColor: '#713f12', color: '#fbbf24',
          border: '1px solid #a16207', fontSize: '13px', cursor: 'pointer',
        }}>{previewLoading ? '読込中...' : '予約取り込み'}</button>
        <button onClick={() => { setShowForm(!showForm); setMessage('') }} style={{
          padding: '6px 14px', borderRadius: '6px',
          backgroundColor: showForm ? '#1e293b' : '#1e3a8a',
          color: showForm ? '#94a3b8' : '#93c5fd',
          border: `1px solid ${showForm ? '#334155' : '#2563eb'}`,
          fontSize: '13px', cursor: 'pointer',
        }}>
          {showForm ? '閉じる' : '新規登録'}
        </button>
        </div>
      </div>

      {message && (
        <div style={{
          padding: '10px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px',
          backgroundColor: message.includes('エラー') || message.includes('失敗') ? '#7f1d1d' : '#064e3b',
          color: '#e2e8f0',
          border: `1px solid ${message.includes('エラー') || message.includes('失敗') ? '#ef4444' : '#10b981'}`,
        }}>{message}</div>
      )}

      {/* 取り込み結果 */}
      {importResult && (
        <div style={{ padding: '14px 16px', borderRadius: '10px', marginBottom: '16px', backgroundColor: '#064e3b', border: '1px solid #10b981' }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#6ee7b7', marginBottom: '8px' }}>{importResult.message}</div>
          {importResult.details?.map((d: string, i: number) => (
            <div key={i} style={{ fontSize: '13px', color: '#e2e8f0', padding: '2px 0' }}>{d}</div>
          ))}
        </div>
      )}

      {/* プレビューモーダル */}
      {showPreview && (
        <div onClick={() => setShowPreview(false)} style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            backgroundColor: '#0f172a', borderRadius: '12px', border: '1px solid #1e293b',
            maxWidth: '600px', width: '100%', maxHeight: '80vh', overflowY: 'auto',
          }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#f1f5f9', margin: 0 }}>スプレッドシートの予約データ</h3>
              <button onClick={() => setShowPreview(false)} style={{ padding: '4px 10px', borderRadius: '5px', fontSize: '12px', backgroundColor: 'transparent', color: '#94a3b8', border: '1px solid #334155', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ padding: '16px 20px' }}>
              {previewData.length === 0 ? (
                <p style={{ color: '#64748b', fontSize: '14px' }}>取り込む予約データがありません</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {previewData.map((schedule: any, i: number) => (
                    <div key={i} style={{ padding: '12px', backgroundColor: '#0c1220', borderRadius: '8px', border: '1px solid #1e293b' }}>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: '#e2e8f0', marginBottom: '6px' }}>
                        {schedule.practice_date}　{schedule.location}
                      </div>
                      {schedule.reservations.map((r: any, j: number) => (
                        <div key={j} style={{ fontSize: '13px', color: '#94a3b8', padding: '2px 0' }}>
                          {r.start_time}〜{r.end_time}　{r.reserver_name}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
              <button onClick={handleImportSheets} disabled={importing || previewData.length === 0} style={{
                marginTop: '16px', width: '100%', padding: '12px', borderRadius: '8px',
                backgroundColor: previewData.length === 0 ? '#1e293b' : '#1e3a8a',
                color: previewData.length === 0 ? '#475569' : '#93c5fd',
                border: `1px solid ${previewData.length === 0 ? '#334155' : '#2563eb'}`,
                fontSize: '14px', fontWeight: '600', cursor: previewData.length === 0 ? 'not-allowed' : 'pointer',
              }}>{importing ? '取り込み中...' : '取り込み実行'}</button>
            </div>
          </div>
        </div>
      )}

      {/* 登録フォーム */}
      {showForm && (
        <form onSubmit={handleSubmit} style={{
          padding: '20px', backgroundColor: '#0c1220', borderRadius: '10px',
          border: '1px solid #1e293b', marginBottom: '20px',
          display: 'flex', flexDirection: 'column', gap: '16px',
        }}>
          <div>
            <label style={labelStyle}>日付 *</label>
            <input type="date" value={formData.practice_date} required
              onChange={e => setFormData({ ...formData, practice_date: e.target.value })}
              style={inputStyle} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={labelStyle}>開始時間 *</label>
              <input type="time" value={formData.start_time} required
                onChange={e => setFormData({ ...formData, start_time: e.target.value })}
                style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>終了時間 *</label>
              <input type="time" value={formData.end_time} required
                onChange={e => setFormData({ ...formData, end_time: e.target.value })}
                style={inputStyle} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>場所 *</label>
            <input type="text" value={formData.location} required placeholder="例: 荒川区テニスコート"
              onChange={e => setFormData({ ...formData, location: e.target.value })}
              style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>申込期限</label>
            <input type="date" value={formData.deadline_date}
              onChange={e => setFormData({ ...formData, deadline_date: e.target.value })}
              style={inputStyle} />
          </div>
          <button type="submit" disabled={saving} style={{
            padding: '10px', borderRadius: '6px', backgroundColor: '#3b82f6',
            color: '#fff', border: 'none', fontSize: '14px', fontWeight: '600',
            cursor: saving ? 'not-allowed' : 'pointer',
          }}>
            {saving ? '登録中...' : '登録する'}
          </button>
        </form>
      )}

      {/* 一覧: PC */}
      <div className="pm-table" style={{
        borderRadius: '10px', border: '1px solid #1e293b', overflow: 'auto', backgroundColor: '#0c1220',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={headerCellStyle}>日付</th>
            <th style={headerCellStyle}>時間</th>
            <th style={headerCellStyle}>場所</th>
            <th style={headerCellStyle}>申込期限</th>
            <th style={headerCellStyle}>参加者</th>
            <th style={{ ...headerCellStyle, textAlign: 'center' }}></th>
          </tr></thead>
          <tbody>
            {practices.map(p => (
              <tr key={p.id} onClick={() => openEdit(p)} style={{ cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#111b2e')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
              >
                <td style={cellStyle}>{formatDate(p.practice_date)}</td>
                <td style={cellStyle}>{formatTime(p.start_time)} - {formatTime(p.end_time)}</td>
                <td style={{ ...cellStyle, whiteSpace: 'normal' as const }}>{p.location}</td>
                <td style={cellStyle}>{p.deadline_date ? formatDate(p.deadline_date) : '-'}</td>
                <td style={cellStyle}>
                  {p.status === 'cancelled' ? <span style={{ color: '#ef4444', fontWeight: '600' }}>中止</span> : `${p.participant_count || 0}名`}
                </td>
                <td style={{ ...cellStyle, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                    {(() => {
                      const today = new Date(); today.setHours(0, 0, 0, 0)
                      const pDate = new Date(p.practice_date); pDate.setHours(0, 0, 0, 0)
                      const isPast = pDate < today
                      const disabled = !p.reservation_count || isPast
                      return (
                        <button onClick={() => handleNotifyReservations(p.id)}
                          disabled={disabled}
                          style={{
                            padding: '4px 10px', borderRadius: '5px',
                            backgroundColor: disabled ? '#1e293b' : 'transparent',
                            color: disabled ? '#475569' : '#fbbf24',
                            border: `1px solid ${disabled ? '#334155' : '#a16207'}`,
                            fontSize: '12px', cursor: disabled ? 'not-allowed' : 'pointer',
                          }}>予約者通知</button>
                      )
                    })()}
                    <button onClick={() => handleDelete(p.id, p.location, p.practice_date)} style={{
                      padding: '4px 10px', borderRadius: '5px', backgroundColor: 'transparent',
                      color: '#f87171', border: '1px solid #7f1d1d', fontSize: '12px', cursor: 'pointer',
                    }}>削除</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 一覧: スマホ */}
      <div className="pm-cards" style={{ display: 'none', flexDirection: 'column', gap: '10px' }}>
        {practices.map(p => (
          <div key={p.id} onClick={() => openEdit(p)} style={{
            padding: '14px 16px', backgroundColor: '#0c1220', borderRadius: '10px', border: '1px solid #1e293b', cursor: 'pointer',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: '600', color: '#f1f5f9' }}>{p.location}</div>
                <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>
                  {formatDate(p.practice_date)} {formatTime(p.start_time)}-{formatTime(p.end_time)} / {p.participant_count || 0}名
                </div>
              </div>
              <button onClick={e => { e.stopPropagation(); handleDelete(p.id, p.location, p.practice_date) }} style={{
                padding: '4px 10px', borderRadius: '5px', backgroundColor: 'transparent',
                color: '#f87171', border: '1px solid #7f1d1d', fontSize: '12px', cursor: 'pointer', flexShrink: 0,
              }}>削除</button>
            </div>
          </div>
        ))}
      </div>

      {/* 編集モーダル */}
      {editingPractice && (
        <div onClick={() => setEditingPractice(null)} style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '12px', boxSizing: 'border-box',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            backgroundColor: '#0f172a', borderRadius: '12px', border: '1px solid #1e293b',
            width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto',
            boxSizing: 'border-box',
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '16px 20px', borderBottom: '1px solid #1e293b',
            }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#f1f5f9', margin: 0 }}>練習日程の編集</h3>
              <button onClick={() => setEditingPractice(null)} style={{
                padding: '4px 10px', borderRadius: '6px', backgroundColor: '#1e293b',
                color: '#94a3b8', border: '1px solid #334155', fontSize: '13px', cursor: 'pointer',
              }}>閉じる</button>
            </div>
            <form onSubmit={handleEditSubmit} style={{
              padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px',
            }}>
              <div>
                <label style={labelStyle}>日付</label>
                <input type="date" value={editForm.practice_date} required
                  onChange={e => setEditForm({ ...editForm, practice_date: e.target.value })}
                  style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>開始時間</label>
                  <input type="time" value={editForm.start_time} required
                    onChange={e => setEditForm({ ...editForm, start_time: e.target.value })}
                    style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>終了時間</label>
                  <input type="time" value={editForm.end_time} required
                    onChange={e => setEditForm({ ...editForm, end_time: e.target.value })}
                    style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>場所</label>
                <input type="text" value={editForm.location} required
                  onChange={e => setEditForm({ ...editForm, location: e.target.value })}
                  style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>コート番号</label>
                <input type="text" value={editForm.court_number}
                  onChange={e => setEditForm({ ...editForm, court_number: e.target.value })}
                  placeholder="例: 3" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>申込期限</label>
                <input type="date" value={editForm.deadline_date}
                  onChange={e => setEditForm({ ...editForm, deadline_date: e.target.value })}
                  style={inputStyle} />
              </div>
              {/* コート予約 */}
              <div>
                <label style={labelStyle}>コート予約</label>
                {courtReservations.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' }}>
                    {courtReservations.map((r: any) => (
                      <div key={r.id} style={{
                        padding: '6px 10px', backgroundColor: '#0c1220', borderRadius: '6px',
                        border: '1px solid #1e293b', fontSize: '13px',
                      }}>
                        {editingReservationId === r.id ? (
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                            <input type="time" value={editReservation.start_time}
                              onChange={e => setEditReservation(prev => ({ ...prev, start_time: e.target.value }))}
                              style={{ padding: '4px 6px', borderRadius: '4px', backgroundColor: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', fontSize: '12px' }} />
                            <span style={{ color: '#64748b' }}>〜</span>
                            <input type="time" value={editReservation.end_time}
                              onChange={e => setEditReservation(prev => ({ ...prev, end_time: e.target.value }))}
                              style={{ padding: '4px 6px', borderRadius: '4px', backgroundColor: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', fontSize: '12px' }} />
                            <input type="text" value={editReservation.reserver_name}
                              onChange={e => setEditReservation(prev => ({ ...prev, reserver_name: e.target.value }))}
                              style={{ flex: 1, minWidth: '60px', padding: '4px 6px', borderRadius: '4px', backgroundColor: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', fontSize: '12px' }} />
                            <button type="button" onClick={() => handleUpdateReservation(r.id)} style={{
                              padding: '3px 8px', borderRadius: '4px', backgroundColor: '#1e3a8a', color: '#93c5fd', border: '1px solid #2563eb', fontSize: '11px', cursor: 'pointer',
                            }}>保存</button>
                            <button type="button" onClick={() => setEditingReservationId(null)} style={{
                              padding: '3px 8px', borderRadius: '4px', backgroundColor: 'transparent', color: '#94a3b8', border: '1px solid #334155', fontSize: '11px', cursor: 'pointer',
                            }}>戻る</button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: '#e2e8f0' }}>
                              {r.start_time}〜{r.end_time}　<span style={{ color: '#94a3b8' }}>{r.reserver_name}</span>
                            </span>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button type="button" onClick={() => { setEditingReservationId(r.id); setEditReservation({ start_time: r.start_time, end_time: r.end_time, reserver_name: r.reserver_name }) }} style={{
                                padding: '2px 8px', borderRadius: '4px', backgroundColor: 'transparent', color: '#60a5fa', border: '1px solid #1e3a8a', fontSize: '11px', cursor: 'pointer',
                              }}>編集</button>
                              <button type="button" onClick={() => handleDeleteReservation(r.id)} style={{
                                padding: '2px 8px', borderRadius: '4px', backgroundColor: 'transparent', color: '#f87171', border: '1px solid #7f1d1d', fontSize: '11px', cursor: 'pointer',
                              }}>削除</button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <input type="time" value={newReservation.start_time}
                    onChange={e => setNewReservation(prev => ({ ...prev, start_time: e.target.value }))}
                    style={{ padding: '6px 8px', borderRadius: '5px', backgroundColor: '#0c1220', color: '#e2e8f0', border: '1px solid #334155', fontSize: '13px' }} />
                  <span style={{ color: '#64748b' }}>〜</span>
                  <input type="time" value={newReservation.end_time}
                    onChange={e => setNewReservation(prev => ({ ...prev, end_time: e.target.value }))}
                    style={{ padding: '6px 8px', borderRadius: '5px', backgroundColor: '#0c1220', color: '#e2e8f0', border: '1px solid #334155', fontSize: '13px' }} />
                  <input type="text" value={newReservation.reserver_name}
                    onChange={e => setNewReservation(prev => ({ ...prev, reserver_name: e.target.value }))}
                    placeholder="予約者名"
                    style={{ flex: 1, minWidth: '80px', padding: '6px 8px', borderRadius: '5px', backgroundColor: '#0c1220', color: '#e2e8f0', border: '1px solid #334155', fontSize: '13px' }} />
                  <button type="button" onClick={handleAddReservation}
                    disabled={!newReservation.start_time || !newReservation.end_time || !newReservation.reserver_name}
                    style={{
                      padding: '6px 12px', borderRadius: '5px', backgroundColor: '#1e3a8a', color: '#93c5fd',
                      border: '1px solid #2563eb', fontSize: '13px', cursor: 'pointer',
                      opacity: (!newReservation.start_time || !newReservation.end_time || !newReservation.reserver_name) ? 0.5 : 1,
                    }}>追加</button>
                </div>
              </div>

              {/* 参加者一覧 */}
              <div>
                <label style={labelStyle}>参加者（{editParticipants.length}名）</label>
                {editParticipants.length === 0 ? (
                  <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0' }}>まだ参加者がいません</p>
                ) : (
                  <div style={{
                    maxHeight: '160px', overflowY: 'auto', padding: '8px',
                    backgroundColor: '#0c1220', borderRadius: '6px', border: '1px solid #1e293b',
                    display: 'flex', flexDirection: 'column', gap: '4px',
                  }}>
                    {editParticipants.map((pt: any) => (
                      <div key={pt.player_id} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '4px 6px', fontSize: '13px', color: '#e2e8f0',
                      }}>
                        <span>{pt.player_name}</span>
                        <button type="button" onClick={async () => {
                          if (!confirm(`${pt.player_name}さんを参加者から削除しますか？`)) return
                          try {
                            const res = await fetch(`${apiUrl}/api/practice/${editingPractice.id}/leave/${pt.player_id}?discord_id=${encodeURIComponent(discordId)}`, { method: 'DELETE' })
                            if (res.ok) {
                              setEditParticipants(prev => prev.filter((x: any) => x.player_id !== pt.player_id))
                              loadPractices()
                            } else {
                              const e = await res.json().catch(() => ({}))
                              alert(e.detail || '削除に失敗しました')
                            }
                          } catch { alert('通信エラー') }
                        }} style={{
                          padding: '2px 8px', borderRadius: '4px', backgroundColor: 'transparent',
                          color: '#f87171', border: '1px solid #7f1d1d', fontSize: '11px', cursor: 'pointer',
                        }}>削除</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 公開設定 */}
              <div>
                <label style={labelStyle}>公開設定</label>
                <select value={editVisibility} onChange={e => setEditVisibility(e.target.value)} style={inputStyle}>
                  <option value="public">全体公開</option>
                  <option value="members_all">全会員（正会員・準会員）</option>
                  <option value="members_regular">正会員のみ</option>
                  <option value="invited">メンバー限定（個別指定）</option>
                </select>
              </div>
              {editVisibility === 'invited' && (
                <div>
                  <label style={labelStyle}>招待メンバー（{editInvitedIds.length}名選択中）</label>
                  <div style={{
                    maxHeight: '200px', overflowY: 'auto', padding: '8px',
                    backgroundColor: '#0c1220', borderRadius: '6px', border: '1px solid #1e293b',
                    display: 'flex', flexDirection: 'column', gap: '4px',
                  }}>
                    {allPlayers.map(p => {
                      const checked = editInvitedIds.includes(p.player_id)
                      return (
                        <label key={p.player_id} style={{
                          display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 6px',
                          borderRadius: '4px', cursor: 'pointer', fontSize: '13px', color: '#e2e8f0',
                          backgroundColor: checked ? '#1e3a8a' : 'transparent',
                        }}>
                          <input type="checkbox" checked={checked}
                            onChange={() => {
                              setEditInvitedIds(prev =>
                                checked ? prev.filter(id => id !== p.player_id) : [...prev, p.player_id]
                              )
                            }}
                            style={{ cursor: 'pointer' }} />
                          {p.player_name}
                          <span style={{ fontSize: '11px', color: '#64748b' }}>{p.sex === 0 ? '男' : '女'}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="submit" disabled={editSaving} style={{
                  flex: 1, padding: '10px', borderRadius: '6px', backgroundColor: '#3b82f6',
                  color: '#fff', border: 'none', fontSize: '14px', fontWeight: '600',
                  cursor: editSaving ? 'not-allowed' : 'pointer',
                }}>
                  {editSaving ? '保存中...' : '保存'}
                </button>
                <button type="button" onClick={() => {
                  handleDelete(editingPractice.id, editingPractice.location, editingPractice.practice_date)
                  setEditingPractice(null)
                }} style={{
                  padding: '10px 20px', borderRadius: '6px', backgroundColor: 'transparent',
                  color: '#f87171', border: '1px solid #7f1d1d', fontSize: '14px', cursor: 'pointer',
                }}>削除</button>
              </div>
              {editingPractice.status !== 'cancelled' && (
                <button type="button" onClick={async () => {
                  if (!confirm(`「${formatDate(editingPractice.practice_date)} ${editingPractice.location}」の練習を中止にしますか？`)) return
                  try {
                    const res = await fetch(`${apiUrl}/api/practice/${editingPractice.id}`, {
                      method: 'PUT', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ status: 'cancelled' }),
                    })
                    if (res.ok) {
                      setMessage('練習を中止にしました')
                      setEditingPractice(null)
                      loadPractices()
                    } else { alert('中止に失敗しました') }
                  } catch { alert('通信エラー') }
                }} style={{
                  width: '100%', padding: '10px', marginTop: '10px', borderRadius: '6px',
                  backgroundColor: '#7f1d1d', color: '#fca5a5', border: '1px solid #dc2626',
                  fontSize: '14px', fontWeight: '500', cursor: 'pointer',
                }}>この練習を中止にする</button>
              )}
              {editingPractice.status === 'cancelled' && (
                <div style={{
                  marginTop: '10px', padding: '10px', borderRadius: '6px',
                  backgroundColor: '#7f1d1d', textAlign: 'center', fontSize: '14px', color: '#fca5a5',
                }}>中止済み</div>
              )}
            </form>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 640px) {
          .pm-table { display: none !important; }
          .pm-cards { display: flex !important; }
        }
      `}</style>
    </div>
  )
}
