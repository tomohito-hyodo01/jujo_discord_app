import { useState, useEffect } from 'react'

export default function PracticeManagement() {
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
    practice_date: '', start_time: '', end_time: '', location: '', deadline_date: '',
  })
  const [editSaving, setEditSaving] = useState(false)

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  const loadPractices = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/practice`)
      if (res.ok) setPractices(await res.json())
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { loadPractices() }, [])

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

  const openEdit = (p: any) => {
    setEditingPractice(p)
    setEditForm({
      practice_date: p.practice_date?.split('T')[0] || '',
      start_time: p.start_time?.slice(0, 5) || '',
      end_time: p.end_time?.slice(0, 5) || '',
      location: p.location || '',
      deadline_date: p.deadline_date?.split('T')[0] || '',
    })
  }

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingPractice) return
    setEditSaving(true)
    try {
      const res = await fetch(`${apiUrl}/api/practice/${editingPractice.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })
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
    return `${dt.getFullYear()}/${dt.getMonth() + 1}/${dt.getDate()}（${weekdays[dt.getDay()]}）`
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

      {message && (
        <div style={{
          padding: '10px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px',
          backgroundColor: message.includes('エラー') || message.includes('失敗') ? '#7f1d1d' : '#064e3b',
          color: '#e2e8f0',
          border: `1px solid ${message.includes('エラー') || message.includes('失敗') ? '#ef4444' : '#10b981'}`,
        }}>{message}</div>
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
                <td style={cellStyle}>{p.participant_count || 0}名</td>
                <td style={{ ...cellStyle, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => handleDelete(p.id, p.location, p.practice_date)} style={{
                    padding: '4px 10px', borderRadius: '5px', backgroundColor: 'transparent',
                    color: '#f87171', border: '1px solid #7f1d1d', fontSize: '12px', cursor: 'pointer',
                  }}>削除</button>
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
