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
  parent_id: number | null
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

type MentionTarget = number | 'new' | 'reply'

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

  // 返信: replyingTo はスレッド親（トップレベルコメント）のID
  const [replyingTo, setReplyingTo] = useState<number | null>(null)
  const [replyBody, setReplyBody] = useState('')
  const [replyPosting, setReplyPosting] = useState(false)

  const [mentionState, setMentionState] = useState<{
    open: boolean
    query: string
    start: number
    targetId: MentionTarget
  } | null>(null)

  const newRef = useRef<HTMLTextAreaElement>(null)
  const editRef = useRef<HTMLTextAreaElement>(null)
  const replyRef = useRef<HTMLTextAreaElement>(null)

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

  const setValueFor = (which: MentionTarget, v: string) => {
    if (which === 'new') setBody(v)
    else if (which === 'reply') setReplyBody(v)
    else setEditBody(v)
  }
  const getValueFor = (which: MentionTarget): string =>
    which === 'new' ? body : which === 'reply' ? replyBody : editBody
  const refFor = (which: MentionTarget) =>
    which === 'new' ? newRef.current : which === 'reply' ? replyRef.current : editRef.current

  const handleInput = (value: string, cursor: number, which: MentionTarget) => {
    setValueFor(which, value)
    const upto = value.slice(0, cursor)
    const m = upto.match(/@([^\s@<>]*)$/)
    if (m) {
      setMentionState({ open: true, query: m[1], start: cursor - m[0].length, targetId: which })
    } else {
      setMentionState(null)
    }
  }

  const insertMention = (member: MemberOption) => {
    if (!mentionState) return
    const which = mentionState.targetId
    const current = getValueFor(which)
    const before = current.slice(0, mentionState.start)
    const afterStart = mentionState.start + mentionState.query.length + 1
    const after = current.slice(afterStart)
    const token = `<@${member.player_id}>`
    const next = `${before}${token} ${after}`
    setValueFor(which, next)
    setMentionState(null)
    setTimeout(() => {
      const ref = refFor(which)
      if (ref) {
        const pos = before.length + token.length + 1
        ref.focus()
        ref.setSelectionRange(pos, pos)
      }
    }, 0)
  }

  const filteredMembers = mentionState
    ? members.filter(m => m.player_name && m.player_name.includes(mentionState.query)).slice(0, 8)
    : []

  const handlePost = async () => {
    if (!myPlayerId) { alert('選手登録が必要です'); return }
    const trimmed = body.trim()
    if (!trimmed) return
    setPosting(true)
    try {
      const res = await fetch(`${apiUrl}/api/comments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_type: targetType, target_id: targetId, player_id: myPlayerId, body: trimmed }),
      })
      if (res.ok) { setBody(''); await reload() }
      else alert('投稿に失敗しました')
    } catch { alert('通信エラー') }
    finally { setPosting(false) }
  }

  const startReply = (c: Comment) => {
    const rootId = c.parent_id ?? c.id
    setReplyingTo(rootId)
    // 返信先の相手をメンションで前置き（相手にDM通知が届く）
    setReplyBody(`<@${c.player_id}> `)
    setMentionState(null)
    setTimeout(() => { replyRef.current?.focus() }, 0)
  }

  const handleReply = async (rootId: number) => {
    if (!myPlayerId) { alert('選手登録が必要です'); return }
    const trimmed = replyBody.trim()
    if (!trimmed) return
    setReplyPosting(true)
    try {
      const res = await fetch(`${apiUrl}/api/comments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_type: targetType, target_id: targetId, player_id: myPlayerId, body: trimmed, parent_id: rootId }),
      })
      if (res.ok) { setReplyBody(''); setReplyingTo(null); await reload() }
      else alert('返信に失敗しました')
    } catch { alert('通信エラー') }
    finally { setReplyPosting(false) }
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
    if (!confirm('このコメントを削除しますか？返信も残ります。')) return
    try {
      const res = await fetch(`${apiUrl}/api/comments/${commentId}?discord_id=${encodeURIComponent(discordId)}`, { method: 'DELETE' })
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
        <span key={`m-${m.index}`} style={{ color: '#93c5fd', backgroundColor: '#1e3a8a40', padding: '1px 4px', borderRadius: '3px', fontSize: '13px' }}>@{member?.player_name || '?'}</span>
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

  // メンション候補パネル
  const mentionPanel = (which: MentionTarget) => (
    mentionState?.open && mentionState.targetId === which && filteredMembers.length > 0 ? (
      <div style={mentionPanelStyle}>
        {filteredMembers.map(m => (
          <div key={m.player_id} onClick={() => insertMention(m)} style={mentionItemStyle}>@{m.player_name}</div>
        ))}
      </div>
    ) : null
  )

  // 1コメントの本体（編集UI含む）。isReply=true で見た目を小さく
  const renderCommentBody = (c: Comment, isReply: boolean) => (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
        <span style={{ fontSize: isReply ? '12px' : '13px', fontWeight: '600', color: '#cbd5e1' }}>{c.player_name || '不明'}</span>
        <span style={{ fontSize: '11px', color: '#64748b' }}>{formatDt(c.created_at)}</span>
      </div>
      {editingId === c.id ? (
        <div style={{ position: 'relative' }}>
          <textarea
            ref={editRef} value={editBody}
            onChange={e => handleInput(e.target.value, e.target.selectionStart || 0, c.id)}
            onKeyUp={e => handleInput(e.currentTarget.value, e.currentTarget.selectionStart || 0, c.id)}
            rows={3} style={textareaStyle} />
          {mentionPanel(c.id)}
          <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
            <button onClick={() => handleSaveEdit(c.id)} style={btnPrimary}>保存</button>
            <button onClick={() => { setEditingId(null); setEditBody(''); setMentionState(null) }} style={btnGhost}>キャンセル</button>
          </div>
        </div>
      ) : (
        <>
          <div style={{ fontSize: '13px', color: '#e2e8f0', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{renderBody(c.body)}</div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
            {myPlayerId && <button onClick={() => startReply(c)} style={btnLink}>返信</button>}
            {canEdit(c) && <button onClick={() => handleStartEdit(c)} style={btnLink}>編集</button>}
            {canEdit(c) && <button onClick={() => handleDelete(c.id)} style={btnLinkDanger}>削除</button>}
          </div>
        </>
      )}
    </>
  )

  // ツリー構築
  const topLevel = comments.filter(c => !c.parent_id)
  const repliesOf = (rootId: number) =>
    comments.filter(c => c.parent_id === rootId).sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))

  return (
    <div style={{ marginTop: '20px' }}>
      <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#e2e8f0', marginBottom: '10px' }}>
        コメント({comments.length})
      </h4>

      {loading ? (
        <p style={{ color: '#94a3b8', fontSize: '13px' }}>読み込み中...</p>
      ) : topLevel.length === 0 ? (
        <p style={{ color: '#64748b', fontSize: '13px', marginBottom: '12px' }}>まだコメントはありません</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
          {topLevel.map(c => {
            const replies = repliesOf(c.id)
            return (
              <div key={c.id} style={{ padding: '10px 12px', backgroundColor: '#0c1220', borderRadius: '6px', border: '1px solid #1e293b' }}>
                {renderCommentBody(c, false)}

                {/* 返信一覧（インデント） */}
                {replies.length > 0 && (
                  <div style={{ marginTop: '8px', marginLeft: '12px', paddingLeft: '10px', borderLeft: '2px solid #1e293b', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {replies.map(r => (
                      <div key={r.id} style={{ padding: '8px 10px', backgroundColor: '#0f172a', borderRadius: '6px', border: '1px solid #1e293b' }}>
                        {renderCommentBody(r, true)}
                      </div>
                    ))}
                  </div>
                )}

                {/* 返信入力 */}
                {replyingTo === c.id && (
                  <div style={{ marginTop: '8px', marginLeft: '12px', paddingLeft: '10px', borderLeft: '2px solid #2563eb', position: 'relative' }}>
                    <textarea
                      ref={replyRef} value={replyBody}
                      onChange={e => handleInput(e.target.value, e.target.selectionStart || 0, 'reply')}
                      onKeyUp={e => handleInput(e.currentTarget.value, e.currentTarget.selectionStart || 0, 'reply')}
                      placeholder="返信を入力（@ でメンション）"
                      rows={2} style={textareaStyle} />
                    {mentionPanel('reply')}
                    <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                      <button onClick={() => handleReply(c.id)} disabled={replyPosting || !replyBody.trim()} style={{
                        ...btnPrimary,
                        backgroundColor: replyBody.trim() ? '#1e3a8a' : '#1e293b',
                        color: replyBody.trim() ? '#93c5fd' : '#64748b',
                        cursor: replyBody.trim() && !replyPosting ? 'pointer' : 'not-allowed',
                      }}>{replyPosting ? '送信中...' : '返信する'}</button>
                      <button onClick={() => { setReplyingTo(null); setReplyBody(''); setMentionState(null) }} style={btnGhost}>キャンセル</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* 新規コメント入力 */}
      {myPlayerId ? (
        <div style={{ position: 'relative' }}>
          <textarea
            ref={newRef} value={body}
            onChange={e => handleInput(e.target.value, e.target.selectionStart || 0, 'new')}
            onKeyUp={e => handleInput(e.currentTarget.value, e.currentTarget.selectionStart || 0, 'new')}
            placeholder="コメントを入力（@ でメンバーをメンション）"
            rows={3} style={{ ...textareaStyle, padding: '8px 10px' }} />
          {mentionPanel('new')}
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

const textareaStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '6px 8px',
  backgroundColor: '#0f172a', color: '#e2e8f0', border: '1px solid #334155',
  borderRadius: '4px', fontSize: '13px', resize: 'vertical',
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
