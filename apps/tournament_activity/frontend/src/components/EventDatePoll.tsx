import { useEffect, useState } from 'react'

/**
 * 日程アンケート
 *
 * - EventPollSection: イベント一覧の上に出す「日程アンケート」の枠
 * - EventPollModal: 回答（候補日ごとに ○ / ×）と、みんなの回答・日程の決定（作成者のみ）
 *
 * 決定するとバックエンドが普通のイベントを作り、その日に ○ を付けた人を参加者にする。
 */

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

/** '2026-12-12' → '12/12(土)'（端末のタイムゾーンに左右されないよう日付として読む） */
export const formatPollDate = (dateStr: string) => {
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return String(dateStr)
  return `${m}/${d}(${WEEKDAYS[new Date(y, m - 1, d).getDay()]})`
}

const parseDeadline = (deadline: string) => new Date(String(deadline).replace(' ', 'T'))

const formatPollDeadline = (deadline: string) => {
  const d = parseDeadline(deadline)
  if (isNaN(d.getTime())) return String(deadline)
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]}) ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

const isPollDeadlinePassed = (deadline?: string | null) => {
  if (!deadline) return false
  const d = parseDeadline(deadline)
  return !isNaN(d.getTime()) && d.getTime() < Date.now()
}

/** 自分の保存済みの回答（候補日ID → 1:○ / 0:×）。未回答なら null */
const myAnswersOf = (poll: any, myPlayerId: number | null): Record<string, number> | null => {
  if (!myPlayerId) return null
  const r = (poll.respondents || []).find((x: any) => x.player_id === myPlayerId)
  return r ? r.answers : null
}

const badgeStyle = (kind: 'pending' | 'done') => ({
  padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 500, flexShrink: 0,
  backgroundColor: kind === 'pending' ? '#451a03' : '#1e293b',
  color: kind === 'pending' ? '#fcd34d' : '#94a3b8',
  border: `1px solid ${kind === 'pending' ? '#b45309' : '#334155'}`,
})

// ===== 一覧の上の枠 =====

interface EventPollSectionProps {
  polls: any[]
  myPlayerId: number | null
  onOpen: (poll: any) => void
}

export function EventPollSection({ polls, myPlayerId, onOpen }: EventPollSectionProps) {
  if (polls.length === 0) return null
  return (
    <section aria-label="日程アンケート" style={{ marginBottom: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <h3 style={{ fontSize: '13px', fontWeight: 600, color: '#c4b5fd', margin: 0 }}>日程アンケート</h3>
        <span style={{ fontSize: '12px', color: '#94a3b8' }}>{polls.length}件</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {polls.map(poll => {
          const answered = !!myAnswersOf(poll, myPlayerId)
          const closed = isPollDeadlinePassed(poll.deadline_date)
          const badge = closed ? '締切済' : answered ? '回答済' : '未回答'
          const action = closed || !myPlayerId ? '回答を見る' : answered ? '回答を変更' : '回答する'
          return (
            <div key={poll.id} style={{
              padding: '14px 16px', borderRadius: '10px', border: '1px solid #5b21b6',
              backgroundColor: '#0c1220', display: 'flex', flexDirection: 'column', gap: '10px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '15px', fontWeight: 600, color: '#f1f5f9' }}>{poll.title}</span>
                <span style={badgeStyle(badge === '未回答' ? 'pending' : 'done')}>{badge}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#94a3b8' }}>
                <span>候補 {(poll.options || []).map((o: any) => formatPollDate(o.option_date)).join('・')}</span>
                <span>
                  {poll.deadline_date ? `回答締切 ${formatPollDeadline(poll.deadline_date)} ・ ` : ''}
                  回答済 {poll.respondent_count || 0}人
                </span>
              </div>
              <button onClick={() => onOpen(poll)} style={{
                height: '44px', borderRadius: '6px', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                backgroundColor: action === '回答する' ? '#3b82f6' : 'transparent',
                color: action === '回答する' ? '#fff' : '#93c5fd',
                border: action === '回答する' ? 'none' : '1px solid #2563eb',
              }}>{action}</button>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ===== 回答・集計・決定 =====

interface EventPollModalProps {
  poll: any
  myPlayerId: number | null
  discordId: string
  onClose: () => void
  /** 回答・削除のあとに一覧を取り直す */
  onChanged: () => Promise<void> | void
  /** 日程を決めたあと（作られたイベントのIDと、自分が参加者に入ったか） */
  onDecided: (eventId: number, iJoined: boolean) => void
}

const infoRow = (label: string, value: string) => (
  <div key={label} style={{ display: 'flex', padding: '8px 0', borderBottom: '1px solid #1e293b', fontSize: '14px' }}>
    <span style={{ width: '60px', flexShrink: 0, color: '#94a3b8', fontSize: '13px' }}>{label}</span>
    <span style={{ color: '#e2e8f0' }}>{value}</span>
  </div>
)

const choiceStyle = (selected: boolean, kind: 'yes' | 'no') => ({
  width: '56px', height: '44px', borderRadius: '6px', fontSize: '18px', cursor: 'pointer',
  fontWeight: selected ? 700 : 400,
  backgroundColor: selected ? (kind === 'yes' ? '#1e3a8a' : '#431407') : 'transparent',
  color: selected ? (kind === 'yes' ? '#bfdbfe' : '#fdba74') : '#94a3b8',
  border: `1px solid ${selected ? (kind === 'yes' ? '#3b82f6' : '#ea580c') : '#334155'}`,
})

const cellBorder = { borderBottom: '1px solid #1e293b' }

export function EventPollModal({ poll, myPlayerId, discordId, onClose, onChanged, onDecided }: EventPollModalProps) {
  const [view, setView] = useState<'answer' | 'results'>('answer')
  const [draft, setDraft] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [decidingId, setDecidingId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)

  const options: any[] = poll.options || []
  const respondents: any[] = poll.respondents || []
  const savedAnswers = myAnswersOf(poll, myPlayerId)
  const isOpen = poll.status === 'open'
  const closed = isPollDeadlinePassed(poll.deadline_date)
  const canAnswer = isOpen && !closed && !!myPlayerId
  const isCreator = !!discordId && poll.created_by === discordId
  const allChosen = options.length > 0 && options.every(o => draft[String(o.id)] === 0 || draft[String(o.id)] === 1)
  const maxYes = Math.max(0, ...options.map(o => o.yes_count || 0))

  // 開いたアンケートが変わったら、保存済みの回答から始める
  useEffect(() => {
    setView('answer')
    setDraft(myAnswersOf(poll, myPlayerId) || {})
    setSaved(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poll.id, myPlayerId])

  const choose = (optionId: number, answer: number) => {
    setDraft(prev => ({ ...prev, [String(optionId)]: answer }))
    setSaved(false)
  }

  const handleSave = async () => {
    if (!myPlayerId || !allChosen) return
    setSaving(true)
    try {
      const res = await fetch(`${apiUrl}/api/event-polls/${poll.id}/answers`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_id: myPlayerId,
          answers: options.map(o => ({ option_id: o.id, answer: draft[String(o.id)] })),
        }),
      })
      if (res.ok) {
        setSaved(true)
        await onChanged()
      } else {
        const err = await res.json().catch(() => null)
        alert(err?.detail || '回答の保存に失敗しました')
      }
    } catch { alert('通信エラー') }
    finally { setSaving(false) }
  }

  const handleDecide = async (opt: any) => {
    if (!confirm(`${formatPollDate(opt.option_date)} に決定します。\nこの日に ○ を付けた${opt.yes_count || 0}人が参加者になります。よろしいですか？`)) return
    setDecidingId(opt.id)
    try {
      const res = await fetch(`${apiUrl}/api/event-polls/${poll.id}/decide`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ option_id: opt.id, actor_discord_id: discordId }),
      })
      if (res.ok) {
        const data = await res.json()
        onDecided(data.event_id, savedAnswers?.[String(opt.id)] === 1)
      } else {
        const err = await res.json().catch(() => null)
        alert(err?.detail || '日程の決定に失敗しました')
        await onChanged()
      }
    } catch { alert('通信エラー') }
    finally { setDecidingId(null) }
  }

  const handleDelete = async () => {
    if (!confirm('このアンケートを削除しますか？\nみんなの回答もすべて消えます。')) return
    setDeleting(true)
    try {
      const res = await fetch(
        `${apiUrl}/api/event-polls/${poll.id}?actor_discord_id=${encodeURIComponent(discordId)}`,
        { method: 'DELETE' },
      )
      if (res.ok) {
        await onChanged()
        onClose()
      } else {
        const err = await res.json().catch(() => null)
        alert(err?.detail || 'アンケートの削除に失敗しました')
      }
    } catch { alert('通信エラー') }
    finally { setDeleting(false) }
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px', boxSizing: 'border-box',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        backgroundColor: '#0f172a', borderRadius: '12px', border: '1px solid #1e293b',
        maxWidth: '480px', width: '100%', maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#f1f5f9', margin: 0 }}>{poll.title}</h3>
            <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 500, backgroundColor: '#2e1065', color: '#c4b5fd', border: '1px solid #6d28d9', flexShrink: 0 }}>日程アンケート</span>
          </div>
          <button onClick={onClose} aria-label="閉じる" style={{ padding: '4px 10px', borderRadius: '5px', fontSize: '12px', backgroundColor: 'transparent', color: '#94a3b8', border: '1px solid #334155', cursor: 'pointer', flexShrink: 0 }}>✕</button>
        </div>

        <div style={{ padding: '20px' }}>
          {view === 'answer' ? (
            <>
              {poll.start_time && infoRow('時間', `${poll.start_time}${poll.end_time ? ` - ${poll.end_time}` : ''}`)}
              {poll.location && infoRow('場所', poll.location)}
              {poll.deadline_date && infoRow('締切', formatPollDeadline(poll.deadline_date))}

              {!isOpen ? (
                <div style={{ marginTop: '16px', padding: '10px', borderRadius: '8px', backgroundColor: '#1e293b', textAlign: 'center', fontSize: '14px', color: '#94a3b8' }}>日程が決まりました</div>
              ) : closed ? (
                <div style={{ marginTop: '16px', padding: '10px', borderRadius: '8px', backgroundColor: '#1e293b', textAlign: 'center', fontSize: '14px', color: '#94a3b8' }}>回答締切を過ぎました</div>
              ) : !myPlayerId ? (
                <div style={{ marginTop: '16px', padding: '10px', borderRadius: '8px', backgroundColor: '#1e293b', textAlign: 'center', fontSize: '14px', color: '#94a3b8' }}>選手登録をすると回答できます</div>
              ) : null}

              {canAnswer && (
                <>
                  <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0', margin: '20px 0 10px' }}>参加できる日に ○ を付けてください</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {options.map(o => {
                      const v = draft[String(o.id)]
                      const label = formatPollDate(o.option_date)
                      return (
                        <div key={o.id} style={{ padding: '10px 12px 10px 14px', borderRadius: '8px', backgroundColor: '#0c1220', border: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span style={{ fontSize: '15px', fontWeight: 600, color: '#f1f5f9' }}>{label}</span>
                            <span style={{ fontSize: '12px', color: '#94a3b8' }}>○ {o.yes_count || 0}人</span>
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button aria-pressed={v === 1} aria-label={`${label} ○`} onClick={() => choose(o.id, 1)} style={choiceStyle(v === 1, 'yes')}>○</button>
                            <button aria-pressed={v === 0} aria-label={`${label} ×`} onClick={() => choose(o.id, 0)} style={choiceStyle(v === 0, 'no')}>×</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <button onClick={handleSave} disabled={saving || !allChosen} style={{
                    marginTop: '16px', width: '100%', height: '46px', borderRadius: '6px',
                    backgroundColor: '#3b82f6', color: '#fff', border: 'none', fontSize: '14px', fontWeight: 600,
                    cursor: saving || !allChosen ? 'not-allowed' : 'pointer', opacity: allChosen ? 1 : 0.5,
                  }}>{saving ? '保存中...' : '回答を保存'}</button>
                  <p style={{ margin: '8px 0 0', fontSize: '12px', textAlign: 'center', color: saved ? '#86efac' : '#94a3b8' }}>
                    {saved ? '回答を保存しました' : !allChosen ? 'すべての候補日に ○ か × を付けてください' : '締切までは何度でも変更できます'}
                  </p>
                </>
              )}

              <button onClick={() => setView('results')} style={{
                marginTop: '20px', width: '100%', height: '44px', borderRadius: '6px', backgroundColor: 'transparent',
                color: '#93c5fd', border: '1px solid #334155', fontSize: '13px', cursor: 'pointer',
              }}>みんなの回答を見る（{respondents.length}人）</button>
            </>
          ) : (
            <>
              <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0', margin: '0 0 10px' }}>みんなの回答（{respondents.length}人）</h4>
              {respondents.length === 0 ? (
                <p style={{ color: '#94a3b8', fontSize: '13px' }}>まだ回答がありません</p>
              ) : (
                <div style={{ borderRadius: '8px', border: '1px solid #1e293b', overflowX: 'auto' }}>
                  <table style={{ width: '100%', minWidth: `${90 + options.length * 72}px`, borderCollapse: 'collapse', fontSize: '14px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#0c1220' }}>
                        <th scope="col" style={{ ...cellBorder, padding: '10px 8px', textAlign: 'left', fontSize: '12px', fontWeight: 500, color: '#94a3b8' }}>名前</th>
                        {options.map(o => (
                          <th key={o.id} scope="col" style={{ ...cellBorder, padding: '10px 2px', textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#e2e8f0', whiteSpace: 'nowrap' }}>{formatPollDate(o.option_date)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {respondents.map(r => (
                        <tr key={r.player_id}>
                          <th scope="row" style={{ ...cellBorder, padding: '8px', textAlign: 'left', fontWeight: 400, color: '#e2e8f0', whiteSpace: 'nowrap' }}>{r.player_name || '（不明）'}</th>
                          {options.map(o => {
                            const a = r.answers?.[String(o.id)]
                            return (
                              <td key={o.id} style={{ ...cellBorder, textAlign: 'center', color: a === 1 ? '#93c5fd' : '#94a3b8', fontWeight: a === 1 ? 700 : 400 }}>
                                {a === 1 ? '○' : a === 0 ? '×' : '-'}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ backgroundColor: '#0c1220' }}>
                        <th scope="row" style={{ padding: '10px 8px', textAlign: 'left', fontSize: '12px', fontWeight: 500, color: '#94a3b8' }}>○の数</th>
                        {options.map(o => {
                          const top = maxYes > 0 && (o.yes_count || 0) === maxYes
                          return (
                            <td key={o.id} style={{ textAlign: 'center', fontWeight: top ? 700 : 600, color: top ? '#bfdbfe' : '#e2e8f0', backgroundColor: top ? '#1e3a8a' : 'transparent' }}>{o.yes_count || 0}</td>
                          )
                        })}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {isCreator && isOpen && (
                <>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '22px 0 10px' }}>
                    <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0', margin: 0 }}>日程を決める</h4>
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>作成者だけに表示</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {options.map(o => {
                      const top = maxYes > 0 && (o.yes_count || 0) === maxYes
                      return (
                        <div key={o.id} style={{ padding: '8px 8px 8px 14px', borderRadius: '8px', backgroundColor: '#0c1220', border: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                          <span style={{ fontSize: '14px', color: '#f1f5f9' }}>
                            <strong style={{ fontWeight: 600 }}>{formatPollDate(o.option_date)}</strong>
                            <span style={{ marginLeft: '8px', fontSize: '12px', color: '#94a3b8' }}>○ {o.yes_count || 0}人</span>
                          </span>
                          <button onClick={() => handleDecide(o)} disabled={decidingId !== null} style={{
                            height: '40px', padding: '0 14px', borderRadius: '6px', fontSize: '13px', flexShrink: 0,
                            cursor: decidingId !== null ? 'not-allowed' : 'pointer',
                            fontWeight: top ? 600 : 400,
                            backgroundColor: top ? '#3b82f6' : 'transparent',
                            color: top ? '#fff' : '#93c5fd',
                            border: top ? 'none' : '1px solid #2563eb',
                          }}>{decidingId === o.id ? '決定中...' : 'この日に決定'}</button>
                        </div>
                      )
                    })}
                  </div>
                  <p style={{ margin: '10px 0 0', fontSize: '12px', lineHeight: 1.6, color: '#94a3b8' }}>決定すると、その日に ○ を付けた人がそのまま参加者になります</p>
                </>
              )}

              <button onClick={() => setView('answer')} style={{
                marginTop: '20px', width: '100%', height: '44px', borderRadius: '6px', backgroundColor: 'transparent',
                color: '#93c5fd', border: '1px solid #334155', fontSize: '13px', cursor: 'pointer',
              }}>{canAnswer ? '回答に戻る' : '戻る'}</button>

              {isCreator && (
                <button onClick={handleDelete} disabled={deleting} style={{
                  marginTop: '10px', width: '100%', height: '44px', borderRadius: '6px', backgroundColor: 'transparent',
                  color: '#f87171', border: '1px solid #7f1d1d', fontSize: '14px', cursor: deleting ? 'not-allowed' : 'pointer',
                }}>{deleting ? '削除中...' : 'アンケートを削除'}</button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
