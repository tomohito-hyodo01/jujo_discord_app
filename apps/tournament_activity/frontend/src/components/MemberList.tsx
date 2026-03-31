import { useState, useEffect, useMemo } from 'react'

export default function MemberList() {
  const [players, setPlayers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterSex, setFilterSex] = useState('')
  const [selectedPlayer, setSelectedPlayer] = useState<any>(null)
  const [editAdminRole, setEditAdminRole] = useState<number>(2)
  const [editMemberLevel, setEditMemberLevel] = useState<number>(2)
  const [editManagedWard, setEditManagedWard] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [wards, setWards] = useState<any[]>([])
  const [editWardFlags, setEditWardFlags] = useState({
    tokyo_flg: false, edogawa_flg: false, koto_flg: false, chuo_flg: false, sumida_flg: false,
    arakawa_flg: false, adachi_flg: false, itabashi_flg: false,
  })
  const [savingWard, setSavingWard] = useState(false)
  const [wardSaveMessage, setWardSaveMessage] = useState('')
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [savingField, setSavingField] = useState(false)
  const [fieldMessage, setFieldMessage] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'
        const res = await fetch(`${apiUrl}/api/players`)
        if (res.ok) setPlayers(await res.json())
        const wRes = await fetch(`${apiUrl}/api/wards`)
        if (wRes.ok) setWards(await wRes.json())
      } catch {
        // エラー時は空
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const filtered = useMemo(() => {
    return players.filter(p => {
      if (search && !p.player_name?.includes(search)) return false
      if (filterSex !== '' && p.sex !== parseInt(filterSex)) return false
      return true
    })
  }, [players, search, filterSex])

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    const d = new Date(dateStr)
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
  }

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return '-'
    const d = new Date(dateStr)
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  const calcAge = (birthDate: string | null) => {
    if (!birthDate) return '-'
    const birth = new Date(birthDate)
    const today = new Date()
    let age = today.getFullYear() - birth.getFullYear()
    const m = today.getMonth() - birth.getMonth()
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
    return age
  }

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>読み込み中...</div>
  }

  const selectStyle = {
    padding: '8px 12px',
    backgroundColor: '#0c1220',
    border: '1px solid #1e293b',
    borderRadius: '6px',
    color: '#e2e8f0',
    fontSize: '13px',
  }

  const cellStyle = {
    padding: '10px 12px',
    borderBottom: '1px solid #1e293b',
    fontSize: '13px',
    color: '#e2e8f0',
    whiteSpace: 'nowrap' as const,
    cursor: 'pointer',
  }

  const headerCellStyle = {
    ...cellStyle,
    color: '#64748b',
    fontSize: '12px',
    fontWeight: '600' as const,
    backgroundColor: '#070e1b',
    borderBottom: '2px solid #1e293b',
    cursor: 'default',
  }

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  const savePlayerField = async (field: string, value: any) => {
    if (!selectedPlayer) return
    setSavingField(true); setFieldMessage('')
    try {
      const res = await fetch(`${apiUrl}/api/players/${selectedPlayer.player_id}/update`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      if (res.ok) {
        setFieldMessage('更新しました')
        const updated = { ...selectedPlayer, [field]: value }
        setPlayers(prev => prev.map(p => p.player_id === selectedPlayer.player_id ? { ...p, [field]: value } : p))
        setSelectedPlayer(updated)
        setEditingField(null)
      } else {
        setFieldMessage('更新に失敗しました')
      }
    } catch { setFieldMessage('通信エラー') }
    finally { setSavingField(false) }
  }

  const editInputStyle = {
    padding: '6px 10px', borderRadius: '5px', border: '1px solid #334155',
    backgroundColor: '#0c1220', color: '#e2e8f0', fontSize: '13px', width: '100%',
  }

  const editableRow = (label: string, field: string, displayValue: string, opts?: { type?: string }) => (
    <div style={{
      display: 'flex', alignItems: 'center',
      padding: '10px 0', borderBottom: '1px solid #1e293b', fontSize: '14px',
    }}>
      <span style={{ width: '120px', flexShrink: 0, color: '#64748b', fontSize: '13px' }}>{label}</span>
      {editingField === field ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
          {opts?.type === 'select-sex' ? (
            <select value={editValue} onChange={e => setEditValue(e.target.value)}
              style={editInputStyle}>
              <option value="0">男子</option>
              <option value="1">女子</option>
            </select>
          ) : (
            <input
              type={opts?.type || 'text'}
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  let val: any = editValue || null
                  if (field === 'sex') val = parseInt(editValue)
                  savePlayerField(field, val)
                }
                if (e.key === 'Escape') setEditingField(null)
              }}
              autoFocus
              style={editInputStyle}
            />
          )}
          <button onClick={() => {
            let val: any = editValue || null
            if (field === 'sex') val = parseInt(editValue)
            savePlayerField(field, val)
          }} disabled={savingField} style={{
            padding: '4px 10px', borderRadius: '5px', backgroundColor: '#1e3a8a',
            color: '#93c5fd', border: '1px solid #2563eb', fontSize: '12px',
            cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
          }}>{savingField ? '...' : '保存'}</button>
          <button onClick={() => setEditingField(null)} style={{
            padding: '4px 8px', borderRadius: '5px', backgroundColor: 'transparent',
            color: '#94a3b8', border: '1px solid #334155', fontSize: '12px',
            cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
          }}>戻る</button>
        </div>
      ) : (
        <span
          onClick={() => { setEditingField(field); setEditValue(field === 'sex' ? String(selectedPlayer?.[field] ?? 0) : (selectedPlayer?.[field] ?? '')); setFieldMessage('') }}
          style={{
            flex: 1, color: '#e2e8f0', cursor: 'pointer', padding: '4px 8px',
            borderRadius: '4px', minHeight: '24px', transition: 'background 0.15s', wordBreak: 'break-all',
          }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#1e293b')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          {displayValue || <span style={{ color: '#475569' }}>未設定</span>}
        </span>
      )}
    </div>
  )

  const detailRow = (label: string, value: any) => (
    <div style={{
      display: 'flex',
      padding: '10px 0',
      borderBottom: '1px solid #1e293b',
      fontSize: '14px',
    }}>
      <span style={{ width: '120px', flexShrink: 0, color: '#64748b', fontSize: '13px' }}>{label}</span>
      <span style={{ color: '#e2e8f0', wordBreak: 'break-all' }}>{value ?? '-'}</span>
    </div>
  )

  return (
    <div>
      <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#e2e8f0', marginBottom: '16px' }}>
        メンバー一覧
      </h2>

      {/* フィルター */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="名前で検索"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...selectStyle, width: '180px' }}
        />
        <select value={filterSex} onChange={e => setFilterSex(e.target.value)} style={selectStyle}>
          <option value="">すべて</option>
          <option value="0">男子</option>
          <option value="1">女子</option>
        </select>
        {(search || filterSex !== '') && (
          <button
            onClick={() => { setSearch(''); setFilterSex('') }}
            style={{
              padding: '8px 12px', backgroundColor: 'transparent',
              border: '1px solid #334155', borderRadius: '6px',
              color: '#94a3b8', fontSize: '13px', cursor: 'pointer',
            }}
          >
            クリア
          </button>
        )}
        <span style={{ fontSize: '12px', color: '#64748b', alignSelf: 'center' }}>
          {filtered.length}名
        </span>
      </div>

      {/* PC: テーブル */}
      <div className="member-table" style={{
        borderRadius: '10px', border: '1px solid #1e293b',
        overflow: 'auto', backgroundColor: '#0c1220',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={headerCellStyle}>名前</th>
              <th style={headerCellStyle}>性別</th>
              <th style={headerCellStyle}>年齢</th>
              <th style={headerCellStyle}>生年月日</th>
              <th style={headerCellStyle}>連盟番号</th>
              <th style={headerCellStyle}>電話番号</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <tr
                key={p.player_id}
                onClick={() => { setSelectedPlayer(p); setEditAdminRole(p.admin_role ?? 2); setEditMemberLevel(p.member_level ?? 2); setEditManagedWard(p.managed_ward_id ?? null); setSaveMessage(''); setEditWardFlags({ tokyo_flg: !!p.tokyo_flg, edogawa_flg: !!p.edogawa_flg, koto_flg: !!p.koto_flg, chuo_flg: !!p.chuo_flg, sumida_flg: !!p.sumida_flg, arakawa_flg: !!p.arakawa_flg, adachi_flg: !!p.adachi_flg, itabashi_flg: !!p.itabashi_flg }); setWardSaveMessage('') }}
                style={{ cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#111b2e')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
              >
                <td style={{ ...cellStyle, fontWeight: '500' }}>{p.player_name}</td>
                <td style={cellStyle}>{p.sex === 0 ? '男' : '女'}</td>
                <td style={cellStyle}>{calcAge(p.birth_date)}</td>
                <td style={cellStyle}>{formatDate(p.birth_date)}</td>
                <td style={cellStyle}>{p.jsta_number || '-'}</td>
                <td style={cellStyle}>{p.phone_number || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* スマホ: カード */}
      <div className="member-cards" style={{ display: 'none', flexDirection: 'column', gap: '10px' }}>
        {filtered.map(p => (
          <div
            key={p.player_id}
            onClick={() => { setSelectedPlayer(p); setEditAdminRole(p.admin_role ?? 2); setEditMemberLevel(p.member_level ?? 2); setEditManagedWard(p.managed_ward_id ?? null); setSaveMessage(''); setEditWardFlags({ tokyo_flg: !!p.tokyo_flg, edogawa_flg: !!p.edogawa_flg, koto_flg: !!p.koto_flg, chuo_flg: !!p.chuo_flg, sumida_flg: !!p.sumida_flg, arakawa_flg: !!p.arakawa_flg, adachi_flg: !!p.adachi_flg, itabashi_flg: !!p.itabashi_flg }); setWardSaveMessage('') }}
            style={{
              padding: '14px 16px', backgroundColor: '#0c1220',
              borderRadius: '10px', border: '1px solid #1e293b', cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '15px', fontWeight: '600', color: '#f1f5f9' }}>
                {p.player_name}
              </span>
              <span style={{
                padding: '2px 8px', borderRadius: '6px', fontSize: '11px',
                backgroundColor: p.sex === 0 ? '#1e3a5f' : '#5f1e3a',
                color: p.sex === 0 ? '#93c5fd' : '#fda4af',
              }}>
                {p.sex === 0 ? '男' : '女'}
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '13px', color: '#94a3b8' }}>
              <span><span style={{ color: '#64748b' }}>年齢 </span>{calcAge(p.birth_date)}</span>
              <span><span style={{ color: '#64748b' }}>TEL </span>{p.phone_number || '-'}</span>
            </div>
          </div>
        ))}
      </div>

      {/* 詳細モーダル */}
      {selectedPlayer && (
        <div
          onClick={() => setSelectedPlayer(null)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              backgroundColor: '#0f172a', borderRadius: '12px',
              border: '1px solid #1e293b', width: '100%', maxWidth: '480px',
              maxHeight: '90vh', overflowY: 'auto',
            }}
          >
            {/* モーダルヘッダー */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '16px 20px', borderBottom: '1px solid #1e293b',
            }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#f1f5f9', margin: 0 }}>
                メンバー詳細
              </h3>
              <button
                onClick={() => setSelectedPlayer(null)}
                style={{
                  padding: '4px 10px', borderRadius: '6px',
                  backgroundColor: '#1e293b', color: '#94a3b8',
                  border: '1px solid #334155', fontSize: '13px', cursor: 'pointer',
                }}
              >
                閉じる
              </button>
            </div>

            {/* モーダル内容 */}
            <div style={{ padding: '8px 20px 20px' }}>
              {fieldMessage && (
                <div style={{ fontSize: '13px', color: fieldMessage.includes('更新') ? '#10b981' : '#f87171', padding: '6px 0' }}>
                  {fieldMessage}
                </div>
              )}
              {editableRow('名前', 'player_name', selectedPlayer.player_name || '')}
              {editableRow('フリガナ', 'player_name_kana', selectedPlayer.player_name_kana || '')}
              {editableRow('性別', 'sex', selectedPlayer.sex === 0 ? '男子' : '女子', { type: 'select-sex' })}
              {detailRow('年齢', calcAge(selectedPlayer.birth_date))}
              {editableRow('生年月日', 'birth_date', formatDate(selectedPlayer.birth_date), { type: 'date' })}
              {editableRow('連盟番号', 'jsta_number', selectedPlayer.jsta_number || '')}
              {editableRow('郵便番号', 'post_number', selectedPlayer.post_number || '')}
              {editableRow('住所', 'address', selectedPlayer.address || '')}
              {editableRow('電話番号', 'phone_number', selectedPlayer.phone_number || '')}
              {editableRow('所属クラブ', 'affiliated_club', selectedPlayer.affiliated_club || '')}
              {detailRow('Discord ID', selectedPlayer.discord_id)}
              {/* 権限編集 */}
              <div style={{ padding: '12px 0', borderBottom: '1px solid #1e293b', fontSize: '13px', color: '#64748b', marginTop: '12px' }}>
                権限設定
              </div>
              <div style={{ display: 'flex', gap: '12px', padding: '10px 0', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '140px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>権限</label>
                  <select value={editAdminRole} onChange={e => setEditAdminRole(parseInt(e.target.value))}
                    style={{ width: '100%', padding: '6px 8px', backgroundColor: '#0c1220', border: '1px solid #1e293b', borderRadius: '6px', color: '#e2e8f0', fontSize: '13px' }}>
                    <option value={0}>管理者</option>
                    <option value={1}>大会申込管理者</option>
                    <option value={2}>一般</option>
                  </select>
                </div>
                <div style={{ flex: 1, minWidth: '140px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>会員レベル</label>
                  <select value={editMemberLevel} onChange={e => setEditMemberLevel(parseInt(e.target.value))}
                    style={{ width: '100%', padding: '6px 8px', backgroundColor: '#0c1220', border: '1px solid #1e293b', borderRadius: '6px', color: '#e2e8f0', fontSize: '13px' }}>
                    <option value={0}>正会員</option>
                    <option value={1}>準会員</option>
                    <option value={2}>ゲスト</option>
                  </select>
                </div>
                <div style={{ flex: 1, minWidth: '140px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>管理区</label>
                  <select value={editManagedWard ?? ''} onChange={e => setEditManagedWard(e.target.value ? parseInt(e.target.value) : null)}
                    style={{ width: '100%', padding: '6px 8px', backgroundColor: '#0c1220', border: '1px solid #1e293b', borderRadius: '6px', color: '#e2e8f0', fontSize: '13px' }}>
                    <option value="">なし</option>
                    {wards.map(w => (
                      <option key={w.ward_id} value={w.ward_id}>{w.ward_name}</option>
                    ))}
                  </select>
                </div>
              </div>
              {(editAdminRole !== (selectedPlayer.admin_role ?? 2) || editMemberLevel !== (selectedPlayer.member_level ?? 2) || editManagedWard !== (selectedPlayer.managed_ward_id ?? null)) && (
                <div style={{ padding: '8px 0' }}>
                  <button
                    onClick={async () => {
                      setSaving(true); setSaveMessage('')
                      try {
                        const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/players/${selectedPlayer.player_id}/permissions`, {
                          method: 'PUT', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ admin_role: editAdminRole, member_level: editMemberLevel, managed_ward_id: editManagedWard }),
                        })
                        if (res.ok) {
                          setSaveMessage('権限を更新しました')
                          setPlayers(prev => prev.map(p => p.player_id === selectedPlayer.player_id
                            ? { ...p, admin_role: editAdminRole, member_level: editMemberLevel, managed_ward_id: editManagedWard } : p))
                          setSelectedPlayer({ ...selectedPlayer, admin_role: editAdminRole, member_level: editMemberLevel, managed_ward_id: editManagedWard })
                        } else {
                          setSaveMessage('更新に失敗しました')
                        }
                      } catch { setSaveMessage('通信エラー') }
                      finally { setSaving(false) }
                    }}
                    disabled={saving}
                    style={{
                      padding: '6px 16px', borderRadius: '6px', backgroundColor: '#1e3a8a',
                      color: '#93c5fd', border: '1px solid #2563eb', fontSize: '13px',
                      cursor: saving ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {saving ? '保存中...' : '権限を保存'}
                  </button>
                </div>
              )}
              {saveMessage && (
                <div style={{ fontSize: '13px', color: saveMessage.includes('更新') ? '#10b981' : '#f87171', padding: '4px 0' }}>
                  {saveMessage}
                </div>
              )}

              <div style={{
                marginTop: '8px', padding: '12px 0',
                borderBottom: '1px solid #1e293b', fontSize: '13px', color: '#64748b',
              }}>
                区登録状況
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', padding: '10px 0', fontSize: '13px' }}>
                {([
                  { key: 'tokyo_flg' as const, label: '東京都' },
                  { key: 'edogawa_flg' as const, label: '江戸川区' },
                  { key: 'koto_flg' as const, label: '江東区' },
                  { key: 'chuo_flg' as const, label: '中央区' },
                  { key: 'sumida_flg' as const, label: '墨田区' },
                  { key: 'arakawa_flg' as const, label: '荒川区' },
                  { key: 'adachi_flg' as const, label: '足立区' },
                  { key: 'itabashi_flg' as const, label: '板橋区' },
                ]).map(({ key, label }) => (
                  <label key={key} style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    cursor: 'pointer', color: '#e2e8f0',
                  }}>
                    <input
                      type="checkbox"
                      checked={editWardFlags[key]}
                      onChange={e => setEditWardFlags(prev => ({ ...prev, [key]: e.target.checked }))}
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                    {label}
                  </label>
                ))}
              </div>
              {(editWardFlags.tokyo_flg !== !!selectedPlayer.tokyo_flg ||
                editWardFlags.edogawa_flg !== !!selectedPlayer.edogawa_flg ||
                editWardFlags.koto_flg !== !!selectedPlayer.koto_flg ||
                editWardFlags.chuo_flg !== !!selectedPlayer.chuo_flg ||
                editWardFlags.sumida_flg !== !!selectedPlayer.sumida_flg ||
                editWardFlags.arakawa_flg !== !!selectedPlayer.arakawa_flg ||
                editWardFlags.adachi_flg !== !!selectedPlayer.adachi_flg ||
                editWardFlags.itabashi_flg !== !!selectedPlayer.itabashi_flg) && (
                <div style={{ padding: '4px 0' }}>
                  <button
                    onClick={async () => {
                      setSavingWard(true); setWardSaveMessage('')
                      try {
                        const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/players/${selectedPlayer.player_id}/ward-flags`, {
                          method: 'PUT', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(editWardFlags),
                        })
                        if (res.ok) {
                          setWardSaveMessage('区登録状況を更新しました')
                          const updated = { ...selectedPlayer, ...editWardFlags }
                          setPlayers(prev => prev.map(p => p.player_id === selectedPlayer.player_id ? { ...p, ...editWardFlags } : p))
                          setSelectedPlayer(updated)
                        } else {
                          setWardSaveMessage('更新に失敗しました')
                        }
                      } catch { setWardSaveMessage('通信エラー') }
                      finally { setSavingWard(false) }
                    }}
                    disabled={savingWard}
                    style={{
                      padding: '6px 16px', borderRadius: '6px', backgroundColor: '#1e3a8a',
                      color: '#93c5fd', border: '1px solid #2563eb', fontSize: '13px',
                      cursor: savingWard ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {savingWard ? '保存中...' : '区登録を保存'}
                  </button>
                </div>
              )}
              {wardSaveMessage && (
                <div style={{ fontSize: '13px', color: wardSaveMessage.includes('更新') ? '#10b981' : '#f87171', padding: '4px 0' }}>
                  {wardSaveMessage}
                </div>
              )}

              <div style={{ borderTop: '1px solid #1e293b', marginTop: '8px', paddingTop: '10px', fontSize: '12px', color: '#475569' }}>
                <div>登録日: {formatDateTime(selectedPlayer.created_at)}</div>
                <div>更新日: {formatDateTime(selectedPlayer.updated_at)}</div>
                {selectedPlayer.created_by && (
                  <div>登録者: {(() => {
                    const creator = players.find(p => p.discord_id === selectedPlayer.created_by)
                    return creator ? creator.player_name : selectedPlayer.created_by
                  })()}</div>
                )}
              </div>

              <div style={{ borderTop: '1px solid #1e293b', marginTop: '12px', paddingTop: '12px' }}>
                <button
                  onClick={async () => {
                    if (!confirm(`「${selectedPlayer.player_name}」を削除しますか？この操作は取り消せません。`)) return
                    try {
                      const res = await fetch(`${apiUrl}/api/players/${selectedPlayer.player_id}`, { method: 'DELETE' })
                      if (res.ok) {
                        setPlayers(prev => prev.filter(p => p.player_id !== selectedPlayer.player_id))
                        setSelectedPlayer(null)
                      } else {
                        const err = await res.json()
                        alert(`削除に失敗しました: ${err.detail || ''}`)
                      }
                    } catch { alert('通信エラー') }
                  }}
                  style={{
                    padding: '8px 16px', borderRadius: '6px', backgroundColor: 'transparent',
                    color: '#f87171', border: '1px solid #7f1d1d', fontSize: '13px',
                    cursor: 'pointer', width: '100%',
                  }}
                >
                  このメンバーを削除
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 640px) {
          .member-table { display: none !important; }
          .member-cards { display: flex !important; }
        }
      `}</style>
    </div>
  )
}
