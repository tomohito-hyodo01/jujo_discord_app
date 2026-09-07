import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * 検索付きの選手選択（<select> の置き換え）
 *
 * ・クリックで開くと検索欄と候補一覧が出る。名前（漢字）とふりがなの部分一致で絞り込める
 *   （ひらがな・カタカナ・全角半角・大文字小文字の違いは無視する）
 * ・候補一覧はページの流れの中に展開する（モーダル内でも切れない・スマホでも操作しやすい）
 * ・value は <select> と同じく player_id の文字列（未選択は ''）。extraOptions で「+ 選手追加」などの固定項目を末尾に出せる
 */

export interface PlayerOption {
  player_id: number
  player_name: string
  player_name_kana?: string | null
}

export interface ExtraOption {
  value: string
  label: string
}

interface PlayerSelectProps {
  players: PlayerOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  disabled?: boolean
  extraOptions?: ExtraOption[]
  /** 一覧や表の中など、小さめに表示する */
  compact?: boolean
  /** 外枠のスタイル上書き（flex: 1 など） */
  style?: React.CSSProperties
}

/** 検索用に正規化: 全角→半角(NFKC)、小文字化、カタカナ→ひらがな、空白除去 */
export function normalizeForSearch(text: string): string {
  return (text || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/\s+/g, '')
}

/** 名前・ふりがなの部分一致で絞り込む（検索語が空なら全件） */
export function filterPlayers<T extends PlayerOption>(players: T[], query: string): T[] {
  const q = normalizeForSearch(query)
  if (!q) return players
  return players.filter(p =>
    normalizeForSearch(p.player_name).includes(q) ||
    normalizeForSearch(p.player_name_kana || '').includes(q)
  )
}

export default function PlayerSelect({
  players, value, onChange,
  placeholder = '選択してください',
  searchPlaceholder = '名前で検索（ひらがなでも可）',
  disabled = false,
  extraOptions = [],
  compact = false,
  style,
}: PlayerSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = players.find(p => String(p.player_id) === value)
  const selectedExtra = extraOptions.find(o => o.value === value)
  const label = selected ? selected.player_name : (selectedExtra ? selectedExtra.label : '')

  const filtered = useMemo(() => filterPlayers(players, query), [players, query])
  const items = useMemo(() => [
    ...filtered.map(p => ({ value: String(p.player_id), label: p.player_name, sub: p.player_name_kana || '', extra: false })),
    ...extraOptions.map(o => ({ value: o.value, label: o.label, sub: '', extra: true })),
  ], [filtered, extraOptions])

  // 開くたびに検索欄を空にする（フォーカスは input の autoFocus で描画と同時に当てる）
  useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIndex(0)
  }, [open])

  useEffect(() => { setActiveIndex(0) }, [query])

  // 外側をクリック（タップ）したら閉じる
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
    }
  }, [open])

  const choose = (v: string) => {
    onChange(v)
    setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => Math.min(i + 1, Math.max(items.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (items[activeIndex]) choose(items[activeIndex].value)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    }
  }

  const fontSize = compact ? '13px' : '15px'
  const boxStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    padding: compact ? '8px 12px' : '12px 16px',
    borderRadius: compact ? '6px' : '8px',
    border: `1px solid ${open ? '#3b82f6' : '#1e293b'}`,
    backgroundColor: '#0c1220',
    color: label ? '#e2e8f0' : '#64748b',
    fontSize, textAlign: 'left',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  }

  return (
    <div ref={rootRef} style={{ width: '100%', ...style }}>
      <button
        type="button"
        onClick={() => { if (!disabled) setOpen(o => !o) }}
        disabled={disabled}
        style={boxStyle}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label || placeholder}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          {value && !disabled && (
            <span
              role="button"
              aria-label="選択を解除"
              onClick={(e) => { e.stopPropagation(); onChange(''); setOpen(false) }}
              style={{ color: '#64748b', fontSize: '16px', lineHeight: 1, padding: '0 2px' }}
            >×</span>
          )}
          <span style={{ color: '#64748b', fontSize: '11px' }}>{open ? '▲' : '▼'}</span>
        </span>
      </button>

      {open && (
        <div style={{
          marginTop: '6px', padding: '8px', borderRadius: '8px',
          border: '1px solid #334155', backgroundColor: '#0f172a',
        }}>
          <input
            ref={inputRef}
            type="text"
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={searchPlaceholder}
            autoComplete="off"
            style={{
              width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: '6px',
              border: '1px solid #334155', backgroundColor: '#0c1220', color: '#e2e8f0', fontSize,
            }}
          />
          <div style={{ maxHeight: '220px', overflowY: 'auto', marginTop: '6px' }}>
            {filtered.length === 0 && (
              <div style={{ padding: '8px 10px', fontSize: '13px', color: '#64748b' }}>
                {players.length === 0 ? '選択できる選手がいません' : '該当する選手がいません'}
              </div>
            )}
            {items.map((item, i) => (
              <button
                type="button"
                key={item.value}
                onClick={() => choose(item.value)}
                onMouseEnter={() => setActiveIndex(i)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '8px 10px', borderRadius: '6px', border: 'none',
                  borderTop: item.extra && i > 0 && !items[i - 1].extra ? '1px solid #334155' : 'none',
                  backgroundColor: i === activeIndex ? '#1e3a8a' : (item.value === value ? '#162032' : 'transparent'),
                  color: i === activeIndex ? '#93c5fd' : (item.extra ? '#94a3b8' : '#e2e8f0'),
                  fontSize, cursor: 'pointer',
                }}
              >
                {item.label}
                {item.sub && <span style={{ marginLeft: '8px', fontSize: '11px', color: '#64748b' }}>{item.sub}</span>}
              </button>
            ))}
          </div>
          <div style={{ marginTop: '6px', fontSize: '11px', color: '#64748b', textAlign: 'right' }}>
            {query ? `${filtered.length} / ${players.length}名` : `${players.length}名`}
          </div>
        </div>
      )}
    </div>
  )
}
