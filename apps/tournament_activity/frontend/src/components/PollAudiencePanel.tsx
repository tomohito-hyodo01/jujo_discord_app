import { useEffect, useMemo, useState } from 'react'
import { MEMBER_LEVELS, encodeVisibility, parseLevels } from '../utils/audience'

/**
 * 日程アンケートの対象者と回答状況（管理者だけに出す）
 *
 * - Discord を連携している人を「未回答」「回答済み」「対象外」に分けて出す
 * - 対象者は、会員区分のチェックと個人の追加・削除で変えられる
 * - 回答済みの人を対象から外す変更は保存できない（サーバー側でも断る）
 */

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'

type Status = 'pending' | 'answered' | 'outside'
const STATUS_LABEL: Record<Status, string> = { pending: '未回答', answered: '回答済み', outside: '対象外' }
const STATUS_STYLE: Record<Status, { bg: string; fg: string; border: string }> = {
  pending: { bg: '#422006', fg: '#fcd34d', border: '#a16207' },
  answered: { bg: '#052e16', fg: '#86efac', border: '#16a34a' },
  outside: { bg: '#1e293b', fg: '#94a3b8', border: '#334155' },
}
const LEVEL_LABEL: Record<number, string> = { 0: '正会員', 1: '準会員', 2: 'ゲスト' }

interface PollAudiencePanelProps {
  pollId: number
  discordId: string
  /** 対象者を保存したあと（アンケート一覧を取り直す） */
  onChanged: () => Promise<void> | void
}

export default function PollAudiencePanel({ pollId, discordId, onChanged }: PollAudiencePanelProps) {
  const [data, setData] = useState<any | null>(null)
  const [loadError, setLoadError] = useState('')
  const [visibility, setVisibility] = useState('public')
  const [invitedIds, setInvitedIds] = useState<number[]>([])
  const [filter, setFilter] = useState<Status>('pending')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const load = async () => {
    setLoadError('')
    try {
      const res = await fetch(`${apiUrl}/api/event-polls/${pollId}/audience?actor_discord_id=${encodeURIComponent(discordId)}`)
      const body = await res.json().catch(() => null)
      if (!res.ok) { setLoadError(body?.detail || '対象者を読み込めませんでした'); return }
      setData(body)
      setVisibility(body.visibility || 'public')
      setInvitedIds(body.invited_player_ids || [])
    } catch {
      setLoadError('対象者を読み込めませんでした')
    }
  }

  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [pollId])

  const levels = parseLevels(visibility)
  const everyone = levels.length === MEMBER_LEVELS.length

  const rows = useMemo(() => {
    if (!data) return []
    return (data.players as any[]).map(p => {
      const byLevel = levels.includes(p.member_level)
      const byPerson = !everyone && invitedIds.includes(p.player_id)
      const inTarget = byLevel || byPerson
      const status: Status = p.answered ? 'answered' : inTarget ? 'pending' : 'outside'
      // 回答済みで、もともと対象だった人を対象から外そうとしている
      const blocked = p.answered && p.in_target && !inTarget
      return { ...p, byLevel, byPerson, inTarget, status, blocked }
    }).sort((a, b) => String(a.player_name_kana || a.player_name || '').localeCompare(String(b.player_name_kana || b.player_name || ''), 'ja'))
  }, [data, visibility, invitedIds])

  const counts = { pending: 0, answered: 0, outside: 0 } as Record<Status, number>
  rows.forEach(r => { counts[r.status as Status] += 1 })
  const blockedRows = rows.filter(r => r.blocked)
  const dirty = !!data && (
    encodeVisibility(levels) !== encodeVisibility(parseLevels(data.visibility)) ||
    (!everyone && [...invitedIds].sort().join(',') !== [...(data.invited_player_ids || [])].sort().join(','))
  )

  const toggleLevel = (level: number) => {
    const next = levels.includes(level) ? levels.filter(l => l !== level) : [...levels, level]
    setVisibility(encodeVisibility(next))
    setMessage(null)
  }

  const togglePerson = (playerId: number) => {
    setInvitedIds(prev => prev.includes(playerId) ? prev.filter(x => x !== playerId) : [...prev, playerId])
    setMessage(null)
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch(`${apiUrl}/api/event-polls/${pollId}/audience`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor_discord_id: discordId, visibility, invited_player_ids: everyone ? [] : invitedIds }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) { setMessage({ ok: false, text: body?.detail || '保存できませんでした' }); return }
      await load()
      await onChanged()
      setMessage({ ok: true, text: '対象者を保存しました' })
    } catch {
      setMessage({ ok: false, text: '保存できませんでした' })
    } finally {
      setSaving(false)
    }
  }

  if (loadError) return <p style={{ color: '#fca5a5', fontSize: '13px' }}>{loadError}</p>
  if (!data) return <p style={{ color: '#94a3b8', fontSize: '13px' }}>読み込み中...</p>

  const shown = rows.filter(r => r.status === filter)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0', margin: 0 }}>対象者と回答状況</h4>
        <span style={{ fontSize: '12px', color: '#94a3b8' }}>管理者だけに表示</span>
      </div>

      {/* 会員区分 */}
      <div>
        <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '6px' }}>会員区分で対象にする</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px' }}>
          {MEMBER_LEVELS.map(l => {
            const checked = levels.includes(l.value)
            return (
              <label key={l.value} style={{
                height: '44px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                fontWeight: checked ? 600 : 400,
                backgroundColor: checked ? '#1e3a8a' : '#0c1220',
                color: checked ? '#bfdbfe' : '#94a3b8',
                border: `1px solid ${checked ? '#3b82f6' : '#334155'}`,
              }}>
                <input type="checkbox" checked={checked} onChange={() => toggleLevel(l.value)} style={{ accentColor: '#3b82f6', margin: 0 }} />
                {l.label}
              </label>
            )
          })}
        </div>
        <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#94a3b8' }}>
          {everyone ? '3つとも付いているので全員が対象です。個人で絞るときはチェックを外してください' : '区分に入らない人は、下の一覧から個人で追加できます'}
        </p>
      </div>

      {/* 状態で切り替え */}
      <div role="tablist" aria-label="回答状況" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '6px' }}>
        {(['pending', 'answered', 'outside'] as Status[]).map(s => {
          const active = filter === s
          return (
            <button key={s} role="tab" aria-selected={active} onClick={() => setFilter(s)} style={{
              height: '40px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer',
              fontWeight: active ? 600 : 400,
              backgroundColor: active ? STATUS_STYLE[s].bg : 'transparent',
              color: active ? STATUS_STYLE[s].fg : '#94a3b8',
              border: `1px solid ${active ? STATUS_STYLE[s].border : '#334155'}`,
            }}>{STATUS_LABEL[s]} {counts[s]}人</button>
          )
        })}
      </div>

      <div style={{ borderRadius: '8px', border: '1px solid #1e293b', maxHeight: '320px', overflowY: 'auto' }}>
        {shown.length === 0 ? (
          <p style={{ margin: 0, padding: '14px', fontSize: '13px', color: '#94a3b8', textAlign: 'center' }}>{STATUS_LABEL[filter]}の人はいません</p>
        ) : shown.map(r => (
          <div key={r.player_id} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
            padding: '8px 10px', borderBottom: '1px solid #1e293b',
            backgroundColor: r.blocked ? '#450a0a' : 'transparent',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
              <span style={{ fontSize: '14px', color: '#e2e8f0' }}>{r.player_name || `選手ID ${r.player_id}`}</span>
              <span style={{ fontSize: '11px', color: r.blocked ? '#fca5a5' : '#94a3b8' }}>
                {LEVEL_LABEL[r.member_level] || '区分なし'}
                {!r.has_discord && '・Discord 未連携'}
                {r.blocked ? '・回答済みなので外せません' : r.byLevel ? '・区分で対象' : r.byPerson ? '・個人で追加' : ''}
              </span>
            </div>
            {!everyone && !r.byLevel && (
              r.byPerson ? (
                <button onClick={() => togglePerson(r.player_id)} disabled={r.answered && r.in_target} style={{
                  height: '36px', padding: '0 10px', borderRadius: '6px', fontSize: '12px', flexShrink: 0,
                  cursor: r.answered && r.in_target ? 'not-allowed' : 'pointer', opacity: r.answered && r.in_target ? 0.4 : 1,
                  backgroundColor: 'transparent', color: '#fca5a5', border: '1px solid #7f1d1d',
                }}>対象から外す</button>
              ) : (
                <button onClick={() => togglePerson(r.player_id)} style={{
                  height: '36px', padding: '0 10px', borderRadius: '6px', fontSize: '12px', flexShrink: 0, cursor: 'pointer',
                  backgroundColor: 'transparent', color: '#93c5fd', border: '1px solid #2563eb',
                }}>対象に追加</button>
              )
            )}
          </div>
        ))}
      </div>

      {blockedRows.length > 0 && (
        <p role="alert" style={{ margin: 0, fontSize: '12px', lineHeight: 1.6, color: '#fca5a5' }}>
          回答済みの人は対象から外せません（{blockedRows.map(r => r.player_name).join('、')}）。区分のチェックを戻すか、その人を個人で追加してください
        </p>
      )}

      {message && (
        <div role="status" style={{
          padding: '10px 12px', borderRadius: '8px', fontSize: '13px',
          backgroundColor: message.ok ? '#052e16' : '#450a0a',
          border: `1px solid ${message.ok ? '#16a34a' : '#b91c1c'}`,
          color: message.ok ? '#86efac' : '#fca5a5',
        }}>{message.text}</div>
      )}

      {dirty && (
        <button onClick={handleSave} disabled={saving || blockedRows.length > 0} style={{
          height: '46px', borderRadius: '6px', backgroundColor: '#3b82f6', color: '#fff', border: 'none',
          fontSize: '14px', fontWeight: 600,
          cursor: saving || blockedRows.length > 0 ? 'not-allowed' : 'pointer', opacity: blockedRows.length > 0 ? 0.5 : 1,
        }}>{saving ? '保存中...' : '対象者を保存'}</button>
      )}
    </div>
  )
}
