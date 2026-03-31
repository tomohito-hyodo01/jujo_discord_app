import { useState, useEffect } from 'react'

interface MyProfileProps {
  discordId: string
}

export default function MyProfile({ discordId }: MyProfileProps) {
  const [player, setPlayer] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  const loadPlayer = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/players/discord/${discordId}`)
      if (res.ok) {
        const p = await res.json()
        if (p && p.player_id) setPlayer(p)
      }
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { loadPlayer() }, [discordId])

  const startEdit = (field: string, value: string) => {
    setEditingField(field)
    setEditValue(value || '')
    setMessage('')
  }

  const cancelEdit = () => {
    setEditingField(null)
    setEditValue('')
  }

  const saveField = async () => {
    if (!editingField) return
    setSaving(true); setMessage('')

    // フィールド名のマッピング
    const fieldMap: Record<string, string> = {
      player_name: 'player_name',
      player_name_kana: 'player_name_kana',
      jsta_number: 'jsta_number',
      post_number: 'post_number',
      address: 'address',
      phone_number: 'phone_number',
      birth_date: 'birth_date',
      sex: 'sex',
      affiliated_club: 'affiliated_club',
    }

    const apiField = fieldMap[editingField]
    if (!apiField) { setSaving(false); return }

    let val: any = editValue || null
    if (editingField === 'sex') val = parseInt(editValue)

    try {
      const res = await fetch(`${apiUrl}/api/players/discord/${discordId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [apiField]: val }),
      })
      if (res.ok) {
        setMessage('更新しました')
        setEditingField(null)
        loadPlayer()
      } else {
        const err = await res.json()
        setMessage(`エラー: ${err.detail || '更新失敗'}`)
      }
    } catch { setMessage('通信エラー') }
    finally { setSaving(false) }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') saveField()
    if (e.key === 'Escape') cancelEdit()
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>読み込み中...</div>
  if (!player) return <div style={{ padding: '40px', color: '#94a3b8' }}>選手情報が見つかりません</div>

  const formatDate = (d: string | null) => {
    if (!d) return '-'
    const dt = new Date(d)
    return `${dt.getFullYear()}/${dt.getMonth() + 1}/${dt.getDate()}`
  }

  const inputStyle = {
    padding: '6px 10px', borderRadius: '5px', border: '1px solid #334155',
    backgroundColor: '#0c1220', color: '#e2e8f0', fontSize: '14px', width: '100%',
  }

  const fields: { key: string; label: string; value: string; display?: string; type?: string }[] = [
    { key: 'player_name', label: '名前', value: player.player_name || '' },
    { key: 'player_name_kana', label: 'フリガナ', value: player.player_name_kana || '' },
    { key: 'sex', label: '性別', value: String(player.sex ?? 0), display: player.sex === 0 ? '男子' : '女子', type: 'select' },
    { key: 'birth_date', label: '生年月日', value: player.birth_date ? player.birth_date.split('T')[0] : '', display: formatDate(player.birth_date), type: 'date' },
    { key: 'jsta_number', label: '連盟番号', value: player.jsta_number || '' },
    { key: 'post_number', label: '郵便番号', value: player.post_number || '' },
    { key: 'address', label: '住所', value: player.address || '' },
    { key: 'phone_number', label: '電話番号', value: player.phone_number || '' },
    { key: 'affiliated_club', label: '所属クラブ', value: player.affiliated_club || '' },
  ]

  return (
    <div>
      <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#e2e8f0', marginBottom: '20px' }}>
        マイページ
      </h2>

      {message && (
        <div style={{
          padding: '10px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px',
          backgroundColor: message.includes('エラー') ? '#7f1d1d' : '#064e3b', color: '#e2e8f0',
          border: `1px solid ${message.includes('エラー') ? '#ef4444' : '#10b981'}`,
        }}>{message}</div>
      )}

      <div style={{ backgroundColor: '#0c1220', borderRadius: '10px', border: '1px solid #1e293b' }}>
        {fields.map((f, i) => {
          const isEditing = editingField === f.key
          return (
            <div
              key={f.key}
              style={{
                display: 'flex', alignItems: 'center', padding: '12px 20px',
                borderBottom: i < fields.length - 1 ? '1px solid #1e293b' : 'none',
                minHeight: '48px',
              }}
            >
              <span style={{ width: '110px', flexShrink: 0, color: '#64748b', fontSize: '13px' }}>
                {f.label}
              </span>

              {isEditing ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {f.type === 'select' ? (
                    <select value={editValue} onChange={e => setEditValue(e.target.value)}
                      onKeyDown={handleKeyDown} autoFocus style={inputStyle}>
                      <option value="0">男子</option>
                      <option value="1">女子</option>
                    </select>
                  ) : (
                    <input
                      type={f.type || 'text'}
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onKeyDown={handleKeyDown}
                      autoFocus
                      style={inputStyle}
                    />
                  )}
                  <button onClick={saveField} disabled={saving} style={{
                    padding: '4px 10px', borderRadius: '5px', backgroundColor: '#1e3a8a',
                    color: '#93c5fd', border: '1px solid #2563eb', fontSize: '12px',
                    cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                  }}>{saving ? '...' : '保存'}</button>
                  <button onClick={cancelEdit} style={{
                    padding: '4px 8px', borderRadius: '5px', backgroundColor: 'transparent',
                    color: '#94a3b8', border: '1px solid #334155', fontSize: '12px',
                    cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                  }}>戻る</button>
                </div>
              ) : (
                <div
                  onClick={() => startEdit(f.key, f.value)}
                  style={{
                    flex: 1, color: '#e2e8f0', fontSize: '14px', cursor: 'pointer',
                    padding: '4px 8px', borderRadius: '4px', minHeight: '24px',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#1e293b')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  {f.display || f.value || <span style={{ color: '#475569' }}>未設定</span>}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p style={{ fontSize: '12px', color: '#475569', marginTop: '12px' }}>
        各項目をタップして編集できます
      </p>

      <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#e2e8f0', marginTop: '32px', marginBottom: '12px' }}>
        登録区
      </h3>
      <div style={{ backgroundColor: '#0c1220', borderRadius: '10px', border: '1px solid #1e293b' }}>
        {[
          { key: 'tokyo_flg', label: '東京都' },
          { key: 'edogawa_flg', label: '江戸川区' },
          { key: 'koto_flg', label: '江東区' },
          { key: 'chuo_flg', label: '中央区' },
          { key: 'sumida_flg', label: '墨田区' },
          { key: 'arakawa_flg', label: '荒川区' },
          { key: 'adachi_flg', label: '足立区' },
          { key: 'itabashi_flg', label: '板橋区' },
        ].map((w, i, arr) => (
          <div key={w.key} style={{
            display: 'flex', alignItems: 'center', padding: '12px 20px',
            borderBottom: i < arr.length - 1 ? '1px solid #1e293b' : 'none',
            minHeight: '40px',
          }}>
            <span style={{ width: '110px', flexShrink: 0, color: '#64748b', fontSize: '13px' }}>
              {w.label}
            </span>
            <span style={{ fontSize: '14px', color: player[w.key] ? '#10b981' : '#475569' }}>
              {player[w.key] ? '登録済み' : '未登録'}
            </span>
          </div>
        ))}
      </div>
      <p style={{ fontSize: '12px', color: '#475569', marginTop: '8px' }}>
        登録区の変更は管理者にお問い合わせください
      </p>
    </div>
  )
}
