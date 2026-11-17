import { useEffect, useState } from 'react'

/**
 * 練習のゲスト（会員名簿にいない人を名前だけで加える）
 *
 * - 参加者一覧の下に「ゲスト（n名）」として出す
 * - canEdit のときだけ、名前を入れて追加・外すができる（サーバー側でも管理者に限る）
 * - 前日のお知らせにはメンションなしで「名前（ゲスト）」と載る
 */

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const NAME_MAX = 50

interface Guest { id: number; guest_name: string }

interface PracticeGuestsProps {
  practiceId: number
  discordId?: string
  canEdit?: boolean
  /** 追加・削除のあと（練習一覧の人数を取り直す） */
  onChanged?: () => void
}

export default function PracticeGuests({ practiceId, discordId, canEdit = false, onChanged }: PracticeGuestsProps) {
  const [guests, setGuests] = useState<Guest[]>([])
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/practice/${practiceId}/guests`)
      if (res.ok) setGuests(await res.json())
    } catch { /* 取れなくても参加者一覧は出す */ }
  }

  useEffect(() => { setGuests([]); setName(''); load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [practiceId])

  const handleAdd = async () => {
    const trimmed = name.trim()
    if (!trimmed || busy) return
    setBusy(true)
    try {
      const res = await fetch(`${apiUrl}/api/practice/${practiceId}/guests`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guest_name: trimmed, actor_discord_id: discordId }),
      })
      if (res.ok) {
        setName('')
        await load()
        onChanged?.()
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.detail || 'ゲストを追加できませんでした')
      }
    } catch { alert('通信エラー') }
    finally { setBusy(false) }
  }

  const handleRemove = async (guest: Guest) => {
    if (!confirm(`ゲストの${guest.guest_name}さんを外しますか？`)) return
    try {
      const res = await fetch(`${apiUrl}/api/practice/guests/${guest.id}?discord_id=${encodeURIComponent(discordId || '')}`, { method: 'DELETE' })
      if (res.ok) {
        setGuests(prev => prev.filter(g => g.id !== guest.id))
        onChanged?.()
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.detail || 'ゲストを外せませんでした')
      }
    } catch { alert('通信エラー') }
  }

  if (!canEdit && guests.length === 0) return null

  return (
    <div style={{ marginTop: '16px' }}>
      <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#e2e8f0', margin: '0 0 10px' }}>
        ゲスト（{guests.length}名）
      </h4>
      {guests.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {guests.map(g => (
            <div key={g.id} style={{
              padding: '8px 12px', backgroundColor: '#0c1220', borderRadius: '6px',
              border: '1px solid #1e293b', fontSize: '14px', color: '#e2e8f0',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px',
            }}>
              <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{g.guest_name}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>ゲスト</span>
                {canEdit && (
                  <button type="button" onClick={() => handleRemove(g)} style={{
                    padding: '2px 8px', borderRadius: '4px', backgroundColor: 'transparent',
                    color: '#f87171', border: '1px solid #7f1d1d', fontSize: '11px', cursor: 'pointer',
                  }}>削除</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {canEdit && (
        <>
          <div style={{ marginTop: guests.length > 0 ? '10px' : 0, display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="text" value={name} maxLength={NAME_MAX}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); handleAdd() } }}
              placeholder="ゲストの名前"
              aria-label="追加するゲストの名前"
              style={{
                flex: 1, minWidth: 0, padding: '8px 10px', borderRadius: '6px', backgroundColor: '#0c1220',
                color: '#e2e8f0', border: '1px solid #334155', fontSize: '16px',
              }}
            />
            <button type="button" onClick={handleAdd} disabled={!name.trim() || busy} style={{
              padding: '8px 14px', borderRadius: '6px', backgroundColor: '#1e3a8a',
              color: '#93c5fd', border: '1px solid #2563eb', fontSize: '13px', flexShrink: 0,
              cursor: name.trim() && !busy ? 'pointer' : 'not-allowed', opacity: name.trim() && !busy ? 1 : 0.5,
            }}>{busy ? '追加中...' : 'ゲスト追加'}</button>
          </div>
          <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#94a3b8' }}>
            前日のお知らせには、メンションなしで「名前（ゲスト）」と載ります
          </p>
        </>
      )}
    </div>
  )
}
