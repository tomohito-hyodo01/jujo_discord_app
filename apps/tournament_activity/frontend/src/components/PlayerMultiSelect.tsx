import { useMemo, useState, type ReactNode } from 'react'
import { buildPlayerOptions, matchPlayerOptions } from '../utils/playerSearch'

/**
 * 招待メンバーなど「複数の選手を選ぶ」チェックボックス一覧に検索を足したもの。
 *
 * ポップオーバーではなく既存どおりインラインのスクロールボックスなので、
 * portal も座標計算も不要。PlayerSelect と共通化すると不要な positioning コードを
 * 持ち込むことになるため、あえて別コンポーネントにしている。
 * 検索の当たり方（正規化・AND検索・並び）は PlayerSelect と完全に同じ。
 */

interface PlayerMultiSelectProps {
  players: any[]
  /** 既存 state が number[] なのでそのまま受ける */
  selectedIds: number[]
  onChange: (ids: number[]) => void
  /** 既存の '200px' / '150px' を維持する */
  maxHeight?: string
  /** PracticeManagement の性別バッジのような追加表示 */
  renderMeta?: (player: any) => ReactNode
  emptyMessage?: string
}

export default function PlayerMultiSelect({
  players,
  selectedIds,
  onChange,
  maxHeight = '200px',
  renderMeta,
  emptyMessage = '該当する選手がいません',
}: PlayerMultiSelectProps) {
  const [query, setQuery] = useState('')

  const idKey = players.map(p => p.player_id).join('|')
  const options = useMemo(() => buildPlayerOptions(players), [idKey])
  // 上限を掛けない（既存の「全件表示」を維持するため）
  const matched = useMemo(() => matchPlayerOptions(options, query), [options, query])
  const rows = matched.items

  const visibleIds = rows.map(o => Number(o.id))
  const allVisibleChecked = visibleIds.length > 0 && visibleIds.every(id => selectedIds.includes(id))
  // 絞り込みで見えなくなっている選択は「消えた」ように見えるので必ず件数で示す
  const hiddenSelected = selectedIds.filter(id => !visibleIds.includes(id)).length
  const searching = query.trim() !== ''

  const toggle = (id: number) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id])
  }

  const toggleVisible = () => {
    if (allVisibleChecked) onChange(selectedIds.filter(id => !visibleIds.includes(id)))
    else onChange([...selectedIds, ...visibleIds.filter(id => !selectedIds.includes(id))])
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap' }}>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          // 編集フォームの内側に置かれるため、絞り込み中の Enter で
          // フォームが暗黙送信されないように止める（IME変換確定の Enter は無視）
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.preventDefault()
          }}
          placeholder="名前・カナ・所属で検索"
          aria-label="選手を絞り込み"
          autoComplete="off"
          spellCheck={false}
          style={{
            flex: 1, minWidth: '140px', boxSizing: 'border-box',
            padding: '8px 12px', borderRadius: '6px', backgroundColor: '#0c1220',
            border: '1px solid #1e293b', color: '#e2e8f0', fontSize: '13px',
          }}
        />
        <button
          type="button"
          onClick={toggleVisible}
          disabled={visibleIds.length === 0}
          style={{
            padding: '6px 12px', borderRadius: '6px', backgroundColor: 'transparent',
            color: '#94a3b8', border: '1px solid #334155', fontSize: '12px',
            cursor: visibleIds.length === 0 ? 'not-allowed' : 'pointer', flexShrink: 0,
          }}
        >
          {allVisibleChecked ? '表示中を解除' : '表示中を全選択'}
        </button>
      </div>

      {(searching || hiddenSelected > 0) && (
        <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>
          表示 {rows.length}名
          {hiddenSelected > 0 && `（絞り込み外で選択中 ${hiddenSelected}名）`}
        </div>
      )}

      <div style={{
        maxHeight, overflowY: 'auto', padding: '8px',
        backgroundColor: '#0c1220', borderRadius: '6px', border: '1px solid #1e293b',
        display: 'flex', flexDirection: 'column', gap: '4px',
      }}>
        {rows.length === 0 && (
          <div style={{ padding: '8px', fontSize: '13px', color: '#64748b' }}>{emptyMessage}</div>
        )}
        {rows.map(o => {
          const id = Number(o.id)
          const checked = selectedIds.includes(id)
          return (
            <label
              key={o.id}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 6px',
                borderRadius: '4px', cursor: 'pointer', fontSize: '13px', color: '#e2e8f0',
                backgroundColor: checked ? '#1e3a8a' : 'transparent',
              }}
            >
              <input type="checkbox" checked={checked} onChange={() => toggle(id)} style={{ cursor: 'pointer' }} />
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {o.label}
              </span>
              {renderMeta ? renderMeta(o.player) : (
                (o.kana || o.club) ? (
                  <span style={{ fontSize: '11px', color: '#64748b', flexShrink: 0 }}>
                    {[o.kana, o.club].filter(Boolean).join(' ・ ')}
                  </span>
                ) : null
              )}
            </label>
          )
        })}
      </div>
    </div>
  )
}
