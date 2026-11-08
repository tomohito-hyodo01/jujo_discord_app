import { useState } from 'react'

/**
 * イベント・日程アンケートを Discord に通知するダイアログ（管理者のみ）
 *
 * - 全体公開: 大会の通知と同じチャンネルに @everyone で投稿
 * - メンバー限定: 招待メンバーへの DM（初期）か、チャンネルへの全体通知を選ぶ
 */

export type NotifyMethod = 'channel' | 'dm'

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

const formatNotifiedAt = (value: string) => {
  const d = new Date(String(value).replace(' ', 'T'))
  if (isNaN(d.getTime())) return String(value)
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]}) ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 前回の通知の説明（例: 11/8(日) 10:00・招待メンバーに DM 8人） */
export const describeNotification = (n: any) => {
  const how = n.method === 'dm' ? `招待メンバーに DM ${n.sent_count}人` : 'チャンネルに全体通知'
  return `${formatNotifiedAt(n.notified_at)}・${how}`
}

interface EventNotifyDialogProps {
  kind: 'event' | 'poll'
  title: string
  visibility: string
  last: any | null
  onSend: (method: NotifyMethod) => Promise<{ ok: boolean; message: string }>
  onClose: () => void
}

const optionStyle = (selected: boolean) => ({
  width: '100%', textAlign: 'left' as const, padding: '12px 14px', borderRadius: '8px', cursor: 'pointer',
  backgroundColor: selected ? '#172554' : '#0c1220',
  border: `1px solid ${selected ? '#3b82f6' : '#1e293b'}`,
  display: 'flex', flexDirection: 'column' as const, gap: '4px',
})

export default function EventNotifyDialog({ kind, title, visibility, last, onSend, onClose }: EventNotifyDialogProps) {
  const invited = visibility === 'invited'
  const [method, setMethod] = useState<NotifyMethod>(invited ? 'dm' : 'channel')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  const handleSend = async () => {
    setSending(true)
    try {
      setResult(await onSend(method))
    } finally {
      setSending(false)
    }
  }

  const done = !!result?.ok

  return (
    <div onClick={onClose} style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 300,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px', boxSizing: 'border-box',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        backgroundColor: '#0f172a', borderRadius: '12px', border: '1px solid #1e293b',
        maxWidth: '420px', width: '100%', maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#f1f5f9', margin: 0 }}>Discord に通知</h3>
          <button onClick={onClose} aria-label="閉じる" style={{ padding: '4px 10px', borderRadius: '5px', fontSize: '12px', backgroundColor: 'transparent', color: '#94a3b8', border: '1px solid #334155', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '2px' }}>{kind === 'poll' ? '日程アンケート' : 'イベント'}</div>
            <div style={{ fontSize: '15px', fontWeight: 600, color: '#f1f5f9' }}>{title}</div>
          </div>

          {last && (
            <div style={{ padding: '10px 12px', borderRadius: '8px', backgroundColor: '#1e293b', fontSize: '13px', color: '#cbd5e1' }}>
              通知済: {describeNotification(last)}
            </div>
          )}

          {invited ? (
            <div role="radiogroup" aria-label="送り方" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button type="button" role="radio" aria-checked={method === 'dm'} onClick={() => setMethod('dm')} disabled={sending || done} style={optionStyle(method === 'dm')}>
                <span style={{ fontSize: '14px', fontWeight: 600, color: '#f1f5f9' }}>招待メンバーに DM</span>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>招待メンバー一人ひとりに届きます</span>
              </button>
              <button type="button" role="radio" aria-checked={method === 'channel'} onClick={() => setMethod('channel')} disabled={sending || done} style={optionStyle(method === 'channel')}>
                <span style={{ fontSize: '14px', fontWeight: 600, color: '#f1f5f9' }}>チャンネルに全体通知</span>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>大会の通知と同じチャンネルに @everyone で投稿します</span>
              </button>
              {method === 'channel' && (
                <p style={{ margin: 0, fontSize: '12px', color: '#fdba74' }}>メンバー限定ですが、チャンネルの全員に見えます</p>
              )}
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.6, color: '#cbd5e1' }}>
              大会の通知と同じチャンネルに @everyone で投稿します
            </p>
          )}

          {result && (
            <div role="status" style={{
              padding: '10px 12px', borderRadius: '8px', fontSize: '13px',
              backgroundColor: result.ok ? '#052e16' : '#450a0a',
              border: `1px solid ${result.ok ? '#16a34a' : '#b91c1c'}`,
              color: result.ok ? '#86efac' : '#fca5a5',
            }}>{result.message}</div>
          )}

          {done ? (
            <button onClick={onClose} style={{ height: '44px', borderRadius: '6px', backgroundColor: 'transparent', color: '#93c5fd', border: '1px solid #334155', fontSize: '14px', cursor: 'pointer' }}>閉じる</button>
          ) : (
            <button onClick={handleSend} disabled={sending} style={{
              height: '46px', borderRadius: '6px', backgroundColor: '#3b82f6', color: '#fff', border: 'none',
              fontSize: '14px', fontWeight: 600, cursor: sending ? 'not-allowed' : 'pointer',
            }}>{sending ? '送信中...' : last ? 'もう一度送信する' : '送信する'}</button>
          )}
        </div>
      </div>
    </div>
  )
}
