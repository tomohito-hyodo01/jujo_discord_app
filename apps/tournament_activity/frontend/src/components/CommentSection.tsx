import { useState, useEffect, useRef } from 'react'

interface CommentSectionProps {
  targetType: 'practice' | 'event' | 'referee_training'
  targetId: number
  discordId: string
}

interface Comment {
  id: number
  target_type: string
  target_id: number
  player_id: number
  player_name: string | null
  body: string
  created_at: string
  updated_at: string
}

interface MemberOption {
  player_id: number
  player_name: string
}

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export default function CommentSection({ targetType, targetId, discordId }: CommentSectionProps) {
  const [comments, setComments] = useState<Comment[]>([])
  const [members, setMembers] = useState<MemberOption[]>([])
  const [body, setBody] = useState('')
  const [posting, setPosting] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editBody, setEditBody] = useState('')
  const [loading, setLoading] = useState(false)
  const [myPlayerId, setMyPlayerId] = useState<number | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  const [mentionState, setMentionState] = useState<{
    open: boolean
    query: string
    start: number
    targetId: number | 'new'
  } | null>(null)

  const newRef = useRef<HTMLTextAreaElement>(null)
  const editRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [cRes, mRes, meRes] = await Promise.all([
          fetch(`${apiUrl}/api/comments?target_type=${targetType}&target_id=${targetId}`),
          fetch(`${apiUrl}/api/players`),
          fetch(`${apiUrl}/api/players/discord/${discordId}`),
        ])
        if (cRes.ok) setComments(await cRes.json())
        if (mRes.ok) {
          const all = await mRes.json()
          setMembers(all.map((p: any) => ({ player_id: p.player_id, player_name: p.player_name })))
        }
        if (meRes.ok) {
          const me = await meRes.json()
          if (me?.player_id) setMyPlayerId(me.player_id)
          setIsAdmin((me?.admin_role ?? 2) === 0)
        }
      } catch {} finally { setLoading(false) }
    }
    load()
  }, [targetType, targetId, discordId])

  const reload = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/comments?target_type=${targetType}&target_id=${targetId}`)
      if (res.ok) setComments(await res.json())
    } catch {}
  }

  const handleInput = (
    value: string,
    cursor: number,
    which: number | 'new'
  ) => {
    if (which === 'new') setBody(value); else setEditBody(value)

    // カーソル位置から左に向かって @ を探す
    const upto = value.slice(0, cursor)
    const m = upto.match(/@([^\s@<>]*)$/)
    if (m) {
      setMentionState({
        open: true,
        query: m[1],
        start: cursor - m[0].length,
        targetId: which,
      })
    } else {
      setMentionState(null)
    }
  }

  const insertMention = (member: MemberOption) => {
    if (!mentionState) return
    const which = mentionState.targetId
    const current = which === 'new' ? body : editBody
    const before = current.slice(0, mentionState.start)
    const afterStart = mentionState.start + mentionState.query.length + 1 // +1 for @
    const after = current.slice(afterStart)
    const token = `<@${member.player_id}>`
    const next = `${before}${token} ${after}`
    if (which === 'new') setBody(next); else setEditBody(next)
    setMentionState(null)
    setTimeout(() => {
      const ref = which === 'new' ? newRef.current : editRef.current
      if (ref) {
        const pos = before.length + token.length + 1
        ref.focus()
        ref.setSelectionRange(pos, pos)
      }
    }, 0)
  }

  const filteredMembers = mentionState
    ? members
        .filter(m => m.player_name && m.player_name.includes(mentionState.query))
        .slice(0, 8)
    : []

  const handlePost = async () => {
    if (!myPlayerId) { alert('選手登録が必要です'); return }
    const trimmed = body.trim()
    if (!trimmed) return
    setPosting(true)
    try {
      const res = await fetch(`${apiUrl}/api/comments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_type: targetType, target_id: targetId,
          player_id: myPlayerId, body: trimmed,
        }),
      })
      if (res.ok) { setBody(''); await reload() }
      else alert('投稿に失敗しました')
    } catch { alert('通信エラー') }
    finally { setPosting(false) }
  }

  const handleStartEdit = (c: Comment) => {
    setEditingId(c.id)
    setEditBody(c.body)
    setMentionState(null)
  }

  const handleSaveEdit = async (commentId: number) => {
    const trimmed = editBody.trim()
    if (!trimmed) return
    try {
      const res = await fetch(`${apiUrl}/api/comments/${commentId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: trimmed, discord_id: discordId }),
      })
      if (res.ok) { setEditingId(null); setEditBody(''); await reload() }
      else { const e = await res.json().catch(() => ({})); alert(e.detail || '更新に失敗しました') }
    } catch { alert('通信エラー') }
  }

  const handleDelete = async (commentId: number) => {
    if (!confirm('このコメントを削除しますか？')) return
    try {
      const res = await fetch(
        `${apiUrl}/api/comments/${commentId}?discord_id=${encodeURIComponent(discordId)}`,
        { method: 'DELETE' }
      )
      if (res.ok) await reload()
      else { const e = await res.json().catch(() => ({})); alert(e.detail || '削除に失敗しました') }
    } catch { alert('通信エラー') }
  }

  const renderBody = (text: string) => {
    const parts: any[] = []
    const re = /<@(\d+)>/g
    let last = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) parts.push(text.slice(last, m.index))
      const pid = Number(m[1])
      const member = members.find(mb => mb.player_id === pid)
      parts.push(
        <span key={`m-${m.index}`} style={{
          color: '#93c5fd', backgroundColor: '#1e3a8a40', padding: '1px 4px',
          borderRadius: '3px', fontSize: '13px',
        }}>@{member?.player_name || `?`}</span>
      )
      last = m.index + m[0].length
    }
    if (last < text.length) parts.push(text.slice(last))
    return <>{parts.map((p, i) => typeof p === 'string' ? <span key={i}>{p}</span> : p)}</>
  }

  const formatDt = (s: string) => {
    if (!s) return ''
    const d = new Date(s)
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  const canEdit = (c: Comment) => isAdmin || (myPlayerId !== null && c.player_id === myPlayerId)

  return (
    <div style={{ marginTop: '20px' }}>
      <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#e2e8f0', marginBottom: '10px' }}>
        コメント({comments.length})
      </h4>

      {loading ? (
        <p style={{ color: '#94a3b8', fontSize: '13px' }}>読み込み中...</p>
      ) : comments.length === 0 ? (
        <p style={{ color: '#64748b', fontSize: '13px', marginBottom: '12px' }}>まだコメントはありません</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
          {comments.map(c => (
            <div key={c.id} style={{
              padding: '10px 12px', backgroundColor: '#0c1220',
              borderRadius: '6px', border: '1px solid #1e293b',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#cbd5e1' }}>
                  {c.player_name || '不明'}
                </span>
                <span style={{ fontSize: '11px', color: '#64748b' }}>{formatDt(c.created_at)}</span>
              </div>
              {editingId === c.id ? (
                <div style={{ position: 'relative' }}>
                  <textarea
                    ref={editRef} value={editBody}
                    onChange={e => handleInput(e.target.value, e.target.selectionStart || 0, c.id)}
                    onKeyUp={e => handleInput(e.currentTarget.value, e.currentTarget.selectionStart || 0, c.id)}
                    rows={3} style={{
                      width: '100%', boxSizing: 'border-box', padding: '6px 8px',
                      backgroundColor: '#0f172a', color: '#e2e8f0', border: '1px solid #334155',
                      borderRadius: '4px', fontSize: '13px', resize: 'vertical',
                    }} />
                  {mentionState?.open && mentionState.targetId === c.id && filteredMembers.length > 0 && (
                    <div style={mentionPanelStyle}>
                      {filteredMembers.map(m => (
                        <div key={m.player_id} onClick={() => insertMention(m)} style={mentionItemStyle}>
                          @{m.player_name}
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                    <button onClick={() => handleSaveEdit(c.id)} style={btnPrimary}>保存</button>
                    <button onClick={() => { setEditingId(null); setEditBody(''); setMentionState(null) }} style={btnGhost}>キャンセル</button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: '13px', color: '#e2e8f0', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {renderBody(c.body)}
                  </div>
                  {canEdit(c) && (
                    <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                      <button onClick={() => handleStartEdit(c)} style={btnLink}>編集</button>
                      <button onClick={() => handleDelete(c.id)} style={btnLinkDanger}>削除</button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {myPlayerId ? (
        <div style={{ position: 'relative' }}>
          <textarea
            ref={newRef} value={body}
            onChange={e => handleInput(e.target.value, e.target.selectionStart || 0, 'new')}
            onKeyUp={e => handleInput(e.currentTarget.value, e.currentTarget.selectionStart || 0, 'new')}
            placeholder="コメントを入力（@ でメンバーをメンション）"
            rows={3} style={{
              width: '100%', boxSizing: 'border-box', padding: '8px 10px',
              backgroundColor: '#0f172a', color: '#e2e8f0', border: '1px solid #334155',
              borderRadius: '6px', fontSize: '13px', resize: 'vertical',
            }} />
          {mentionState?.open && mentionState.targetId === 'new' && filteredMembers.length > 0 && (
            <div style={mentionPanelStyle}>
              {filteredMembers.map(m => (
                <div key={m.player_id} onClick={() => insertMention(m)} style={mentionItemStyle}>
                  @{m.player_name}
                </div>
              ))}
            </div>
          )}
          <button onClick={handlePost} disabled={posting || !body.trim()} style={{
            marginTop: '6px', padding: '8px 16px', borderRadius: '6px',
            backgroundColor: body.trim() ? '#1e3a8a' : '#1e293b',
            color: body.trim() ? '#93c5fd' : '#64748b',
            border: '1px solid ' + (body.trim() ? '#2563eb' : '#334155'),
            fontSize: '13px', cursor: body.trim() && !posting ? 'pointer' : 'not-allowed',
          }}>{posting ? '投稿中...' : '投稿'}</button>
        </div>
      ) : (
        <p style={{ color: '#64748b', fontSize: '12px' }}>選手登録するとコメントできます</p>
      )}
    </div>
  )
}

const mentionPanelStyle: React.CSSProperties = {
  position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: '4px',
  backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '6px',
  maxHeight: '200px', overflowY: 'auto', zIndex: 300,
}
const mentionItemStyle: React.CSSProperties = {
  padding: '6px 10px', fontSize: '13px', color: '#e2e8f0', cursor: 'pointer',
  borderBottom: '1px solid #1e293b',
}
const btnPrimary: React.CSSProperties = {
  padding: '4px 10px', borderRadius: '4px', backgroundColor: '#1e3a8a',
  color: '#93c5fd', border: '1px solid #2563eb', fontSize: '12px', cursor: 'pointer',
}
const btnGhost: React.CSSProperties = {
  padding: '4px 10px', borderRadius: '4px', backgroundColor: 'transparent',
  color: '#94a3b8', border: '1px solid #334155', fontSize: '12px', cursor: 'pointer',
}
const btnLink: React.CSSProperties = {
  padding: '0', backgroundColor: 'transparent', color: '#93c5fd',
  border: 'none', fontSize: '11px', cursor: 'pointer', textDecoration: 'underline',
}
const btnLinkDanger: React.CSSProperties = {
  padding: '0', backgroundColor: 'transparent', color: '#f87171',
  border: 'none', fontSize: '11px', cursor: 'pointer', textDecoration: 'underline',
}
