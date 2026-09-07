import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { buildPlayerOptions, matchPlayerOptions, type PlayerOption } from '../utils/playerSearch'

/**
 * 選手を1名選ぶ検索付きコンボボックス。選手を選ぶ <select> をすべてこれに置き換える。
 *
 * 設計の要点:
 * - 候補パネルは必ず createPortal(document.body) + position:fixed。
 *   モーダル（maxHeight:80vh + overflowY:auto）やテーブル（.reg-table の overflow:auto）の
 *   中でもクリップされないようにするため、absolute 版は作らない（分岐を作らない）。
 * - トリガは <input>。index.css の iOS ズーム防止 16px ルールが自動で効き、
 *   ネイティブ required / setCustomValidity がそのまま使える。
 * - 候補行は <div role="option">。index.css の button:hover{transform} で行が跳ねるのを避ける
 *   （CommentSection のメンションパネルと同じ回避）。
 * - 絞り込みルール（性別・年齢・既存参加者の除外など）は持ち込まない。
 *   呼び出し側がフィルタ済みの配列を渡す。
 */

/** アプリ内の最大 z-index（TournamentRegistrationForm の 9999）より上に出す */
export const PLAYER_SELECT_Z_INDEX = 10000

const MAX_RENDER = 60
const PANEL_MIN_WIDTH = 240
const PANEL_MIN_HEIGHT = 140
const PANEL_MAX_HEIGHT = 300
const GAP = 4
const EDGE = 8

interface PanelPos {
  top: number
  left: number
  width: number
  maxHeight: number
}

interface PlayerSelectProps {
  /** 候補の選手配列（呼び出し側でフィルタ済み） */
  players: any[]
  /** 選択中の player_id（文字列。未選択は ''） */
  value: string
  /** 選択値（文字列）を返す。'' はクリア。parseInt は呼び出し側で行う */
  onChange: (value: string) => void
  /** value が候補配列に無いときの表示名解決用（全選手を渡す） */
  allPlayers?: any[]
  placeholder?: string
  disabled?: boolean
  /** ネイティブ検証に接続する */
  required?: boolean
  requiredMessage?: string
  emptyMessage?: string
  /** 「＋ 選手追加」のような特殊項目。検索で消えず常に末尾に出る */
  actionLabel?: string
  onAction?: () => void
  /** 既定 true。false にすると選択解除（×・Backspace）を無効化する */
  allowClear?: boolean
  ariaLabel?: string
  /** トリガ <input> に当たる（既存 select の style をそのまま渡せる） */
  style?: React.CSSProperties
  /** ラッパ div に当たる（flex 行では { flex: 1, minWidth: 0 }） */
  containerStyle?: React.CSSProperties
}

const srOnly: React.CSSProperties = {
  position: 'absolute', width: '1px', height: '1px',
  overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap',
}

const baseInputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: '6px',
  backgroundColor: '#0c1220', color: '#e2e8f0', border: '1px solid #334155', fontSize: '13px',
}

export default function PlayerSelect({
  players,
  value,
  onChange,
  allPlayers,
  placeholder = '名前・カナ・所属で検索',
  disabled = false,
  required = false,
  requiredMessage = '選手を選択してください',
  emptyMessage = '該当する選手がいません',
  actionLabel,
  onAction,
  allowClear = true,
  ariaLabel,
  style,
  containerStyle,
}: PlayerSelectProps) {
  const reactId = useId()
  const listboxId = `psel-list-${reactId}`
  const optionId = (i: number) => `psel-opt-${reactId}-${i}`

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [pos, setPos] = useState<PanelPos | null>(null)

  const wrapRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const frameRef = useRef(0)
  const clipsRef = useRef<HTMLElement[]>([])
  const composingRef = useRef(false)

  // 候補配列は呼び出し側で毎レンダー新しく作られる（getTeamCandidates(index) 等）ため、
  // 参照ではなく player_id の並びをキーにして検索インデックスを作り直す。
  // 氏名だけが変わって ID 列が同じケースでは古いままになるが、実際には
  // /api/players の再取得で配列ごと作り直されるので実害は無い。
  const idKey = players.map(p => p.player_id).join('|')
  const candidateOptions = useMemo(() => buildPlayerOptions(players), [idKey])

  // 現在の選択が候補に含まれない場合（性別・年齢フィルタで落ちた等）でも
  // 「空欄に見える／先頭候補にすり替わる」ことがないよう、先頭に固定で足す。
  const pinnedRaw = value && !candidateOptions.some(o => o.id === value)
    ? (allPlayers && allPlayers.length > 0 ? allPlayers : players).find(p => String(p.player_id) === value)
    : undefined
  const pinnedId = pinnedRaw ? String(pinnedRaw.player_id) : ''
  const options = useMemo(
    () => (pinnedRaw ? [...buildPlayerOptions([pinnedRaw], '現在の選択'), ...candidateOptions] : candidateOptions),
    [candidateOptions, pinnedId],
  )

  const selected = options.find(o => o.id === value) || null
  // value があるのに解決できないときも空欄にはしない（非制御 select 時代のバグの再発防止）
  const selectedLabel = selected ? selected.label : value ? `選手ID ${value}` : ''

  const matched = useMemo(() => matchPlayerOptions(options, query, MAX_RENDER), [options, query])
  const rows = matched.items
  const hasAction = !!(actionLabel && onAction)
  const rowCount = rows.length + (hasAction ? 1 : 0)
  const showClear = allowClear && !!value && !disabled

  const close = useCallback((focusBack: boolean) => {
    setOpen(false)
    setQuery('')
    setActiveIndex(0)
    if (focusBack) inputRef.current?.focus()
  }, [])

  const measure = useCallback(() => {
    const anchor = wrapRef.current
    if (!anchor) return
    const r = anchor.getBoundingClientRect()

    // クリップ祖先の外へスクロールアウトしたら閉じる
    // （行が消えたのに fixed のパネルだけ宙に取り残されるのを防ぐ）
    for (const el of clipsRef.current) {
      const c = el.getBoundingClientRect()
      if (r.bottom <= c.top || r.top >= c.bottom || r.right <= c.left || r.left >= c.right) {
        setOpen(false)
        return
      }
    }

    // visualViewport はレイアウトビューポート座標での「実際に見えている範囲」。
    // position:fixed と getBoundingClientRect も同じ座標系なので、そのままクランプに使える。
    const vv = window.visualViewport
    const vTop = vv ? vv.offsetTop : 0
    const vLeft = vv ? vv.offsetLeft : 0
    const vW = vv ? vv.width : window.innerWidth
    const vH = vv ? vv.height : window.innerHeight

    if (r.bottom <= vTop || r.top >= vTop + vH) { setOpen(false); return }

    const below = vTop + vH - r.bottom - GAP - EDGE
    const above = r.top - vTop - GAP - EDGE
    const toBottom = below >= PANEL_MIN_HEIGHT || below >= above
    const maxHeight = Math.max(96, Math.min(PANEL_MAX_HEIGHT, toBottom ? below : above))
    const width = Math.min(
      Math.max(r.width, PANEL_MIN_WIDTH),
      Math.max(160, vW - EDGE * 2),
    )
    const left = Math.min(
      Math.max(r.left, vLeft + EDGE),
      Math.max(vLeft + EDGE, vLeft + vW - width - EDGE),
    )
    const top = toBottom ? r.bottom + GAP : r.top - GAP - maxHeight

    setPos(prev => (
      prev && prev.top === top && prev.left === left && prev.width === width && prev.maxHeight === maxHeight
        ? prev
        : { top, left, width, maxHeight }
    ))
  }, [])

  const schedule = useCallback(() => {
    if (frameRef.current) return
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = 0
      measure()
    })
  }, [measure])

  // 位置決めと追従。StrictMode の二重実行でも add/remove が対称なので安全。
  useLayoutEffect(() => {
    if (!open) { setPos(null); return }

    // クリップ祖先は開いた時点で一度だけ収集する（毎フレームの getComputedStyle を避ける）
    const clips: HTMLElement[] = []
    let node: HTMLElement | null = wrapRef.current?.parentElement || null
    while (node && node !== document.body) {
      const cs = getComputedStyle(node)
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') clips.push(node)
      node = node.parentElement
    }
    clipsRef.current = clips
    measure()

    const onAny = () => schedule()
    // capture:true にすると、祖先スクローラ（.portal-content / .reg-table / モーダル panel）の
    // scroll も拾える。どれがスクローラかを列挙する必要が無いのがポイント。
    window.addEventListener('scroll', onAny, true)
    window.addEventListener('resize', onAny)
    const vv = window.visualViewport
    vv?.addEventListener('resize', onAny)
    vv?.addEventListener('scroll', onAny)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onAny) : null
    if (ro && wrapRef.current) ro.observe(wrapRef.current)

    return () => {
      window.removeEventListener('scroll', onAny, true)
      window.removeEventListener('resize', onAny)
      vv?.removeEventListener('resize', onAny)
      vv?.removeEventListener('scroll', onAny)
      ro?.disconnect()
      if (frameRef.current) { window.cancelAnimationFrame(frameRef.current); frameRef.current = 0 }
      clipsRef.current = []
    }
  }, [open, measure, schedule])

  // 外側クリックと Escape
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node | null
      if (!t) return
      if (wrapRef.current?.contains(t)) return
      // portal ノードは DOM ツリー上「外側」に見えるので必ず除外する。
      // これを忘れると option の click より先にパネルが閉じる。
      if (panelRef.current?.contains(t)) return
      close(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      // 背後のモーダルの Escape ハンドラまで反応しないよう、ここで止める
      e.stopPropagation()
      close(true)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [open, close])

  // ハイライト行を可視領域へ
  useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector('[data-active="1"]') as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex, query])

  // required の実体。表示テキストではなく「確定済みの value」を判定軸にするので、
  // 入力途中の文字列とズレても未選択のまま送信されることはない。
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.setCustomValidity(required && !value ? requiredMessage : '')
  }, [required, value, requiredMessage])

  const openPanel = (seed?: string) => {
    if (disabled || open) return
    if (seed) {
      setQuery(seed)
      setActiveIndex(0)
    } else {
      setQuery('')
      const i = options.findIndex(o => o.id === value)
      setActiveIndex(i >= 0 && i < MAX_RENDER ? i : 0)
    }
    setOpen(true)
  }

  const commit = (index: number) => {
    if (hasAction && index === rows.length) {
      close(true)
      if (onAction) onAction()
      return
    }
    const opt = rows[index]
    if (!opt) return
    onChange(opt.id)
    close(true)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value
    if (open) {
      setQuery(next)
      setActiveIndex(0)
      return
    }
    // 閉じている状態で入力された場合（IME確定・貼り付けなど）は、
    // 表示中のラベル部分を取り除いた残りを検索語にする
    const seed = selectedLabel && next.startsWith(selectedLabel) ? next.slice(selectedLabel.length) : next
    setQuery(seed)
    setActiveIndex(0)
    setOpen(true)
  }

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return
    // IME 変換中の Enter / ↑↓ は絶対に拾わない（日本語入力の確定 Enter が
    // そのまま候補確定になる事故を防ぐ）
    if (composingRef.current || e.nativeEvent.isComposing) return

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) { openPanel(); return }
      if (rowCount === 0) return
      const delta = e.key === 'ArrowDown' ? 1 : -1
      setActiveIndex(prev => (prev + delta + rowCount) % rowCount)
      return
    }

    if (!open) {
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault()
        if (allowClear && value) onChange('')
        return
      }
      // タイプアヘッド: 1文字打つだけで開いて検索が始まる
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        openPanel(e.key)
      }
      return
    }

    if (e.key === 'Home') { e.preventDefault(); setActiveIndex(0); return }
    if (e.key === 'End') { e.preventDefault(); setActiveIndex(Math.max(0, rowCount - 1)); return }
    if (e.key === 'Enter') {
      // 開いているときは絶対に submit させない
      e.preventDefault()
      commit(activeIndex)
      return
    }
    if (e.key === 'Tab') {
      // フォーカストラップは掛けない（コンボボックスでは誤り）。閉じて自然に抜けさせる。
      close(false)
      return
    }
    if (e.key === 'Backspace' && query === '' && value && allowClear) {
      e.preventDefault()
      onChange('')
    }
  }

  const mergedInputStyle: React.CSSProperties = { ...baseInputStyle, ...style }
  if (showClear) mergedInputStyle.paddingRight = '28px'
  mergedInputStyle.cursor = disabled ? 'not-allowed' : 'text'
  if (disabled && mergedInputStyle.opacity === undefined) mergedInputStyle.opacity = 0.5

  const sexBadge = (sex: number | null) => {
    if (sex !== 0 && sex !== 1) return null
    return (
      <span style={{
        flexShrink: 0, fontSize: '10px', padding: '1px 6px', borderRadius: '4px',
        backgroundColor: sex === 0 ? '#1e3a5f' : '#5f1e3a',
        color: sex === 0 ? '#93c5fd' : '#fda4af',
      }}>{sex === 0 ? '男' : '女'}</span>
    )
  }

  const rowStyle = (isActive: boolean): React.CSSProperties => ({
    display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '2px',
    padding: '7px 12px', minHeight: '34px', cursor: 'pointer',
    backgroundColor: isActive ? '#1e293b' : 'transparent',
    borderBottom: '1px solid #1e293b',
  })

  const renderRow = (o: PlayerOption, i: number) => {
    const isSelected = o.id === value
    const sub = [o.kana, o.club].filter(Boolean).join(' ・ ')
    return (
      <div
        key={o.id}
        id={optionId(i)}
        data-active={i === activeIndex ? '1' : '0'}
        role="option"
        aria-selected={isSelected}
        onMouseMove={() => setActiveIndex(i)}
        onClick={() => commit(i)}
        style={rowStyle(i === activeIndex)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            fontSize: '13px', color: isSelected ? '#93c5fd' : '#e2e8f0',
          }}>{o.label}</span>
          {o.note && <span style={{ flexShrink: 0, fontSize: '10px', color: '#64748b' }}>{o.note}</span>}
          {isSelected && <span style={{ flexShrink: 0, fontSize: '10px', color: '#93c5fd' }}>選択中</span>}
          {sexBadge(o.sex)}
        </div>
        {sub && (
          <div style={{
            fontSize: '11px', color: '#64748b',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{sub}</div>
        )}
      </div>
    )
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', minWidth: 0, ...containerStyle }}>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-activedescendant={open && rowCount > 0 ? optionId(activeIndex) : undefined}
        aria-label={ariaLabel}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="done"
        disabled={disabled}
        required={required}
        placeholder={open && selectedLabel ? selectedLabel : placeholder}
        value={open ? query : selectedLabel}
        onChange={handleInputChange}
        onKeyDown={onInputKeyDown}
        onCompositionStart={() => { composingRef.current = true }}
        onCompositionEnd={() => { composingRef.current = false }}
        onFocus={() => { inputRef.current?.select() }}
        onClick={() => openPanel()}
        style={mergedInputStyle}
      />

      {showClear && (
        <span
          role="button"
          aria-label="選択を解除"
          onMouseDown={e => e.preventDefault()}
          onClick={() => { onChange(''); setQuery(''); inputRef.current?.focus() }}
          style={{
            position: 'absolute', top: 0, right: 0, height: '100%', width: '28px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#64748b', cursor: 'pointer', fontSize: '14px', lineHeight: 1,
          }}
        >
          ×
        </span>
      )}

      <span aria-live="polite" style={srOnly}>{open ? `${matched.total}件の候補` : ''}</span>

      {open && pos && createPortal(
        <div
          ref={panelRef}
          // input からフォーカスを奪わない。ただしパネル本体（＝スクロールバー）への
          // mousedown は殺さないので、スクロールバードラッグは通常どおり効く。
          onMouseDown={e => { if (e.target === panelRef.current) return; e.preventDefault() }}
          style={{
            position: 'fixed',
            top: `${pos.top}px`, left: `${pos.left}px`,
            width: `${pos.width}px`, maxHeight: `${pos.maxHeight}px`,
            overflowY: 'auto', overflowX: 'hidden', overscrollBehavior: 'contain',
            backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '6px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            zIndex: PLAYER_SELECT_Z_INDEX,
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {matched.total > rows.length && (
            <div style={{
              position: 'sticky', top: 0, zIndex: 1,
              padding: '6px 12px', fontSize: '11px', color: '#475569',
              backgroundColor: '#0f172a', borderBottom: '1px solid #1e293b',
            }}>
              他 {matched.total - rows.length} 件（さらに入力して絞り込んでください）
            </div>
          )}

          {rows.length === 0 && (
            <div style={{ padding: '10px 12px', fontSize: '13px', color: '#64748b' }}>{emptyMessage}</div>
          )}

          <div ref={listRef} id={listboxId} role="listbox" aria-label={ariaLabel || '選手候補'}>
            {rows.map(renderRow)}
            {hasAction && (
              <div
                id={optionId(rows.length)}
                data-active={activeIndex === rows.length ? '1' : '0'}
                role="option"
                aria-selected={false}
                onMouseMove={() => setActiveIndex(rows.length)}
                onClick={() => commit(rows.length)}
                style={{
                  padding: '9px 12px', fontSize: '13px', cursor: 'pointer', color: '#93c5fd',
                  backgroundColor: activeIndex === rows.length ? '#1e293b' : 'transparent',
                  borderTop: '1px solid #334155',
                }}
              >
                {actionLabel}
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
