import PlayerMultiSelect from './PlayerMultiSelect'
import { MEMBER_LEVELS, describeAudience, encodeVisibility, parseLevels } from '../utils/audience'

/**
 * 見せる範囲の選択（イベント・日程アンケートの作成と編集で使う）
 *
 * 正会員・準会員・ゲストにチェックを付け、個人を足せる（例: 正会員 ＋ 田中さん）。
 * 3つすべてにチェックすると全員公開。
 */

interface AudiencePickerProps {
  visibility: string
  invitedIds: number[]
  players: any[]
  onChange: (visibility: string, invitedIds: number[]) => void
  maxHeight?: string
}

export default function AudiencePicker({ visibility, invitedIds, players, onChange, maxHeight = '200px' }: AudiencePickerProps) {
  const levels = parseLevels(visibility)
  const everyone = levels.length === MEMBER_LEVELS.length

  const toggleLevel = (level: number) => {
    const next = levels.includes(level) ? levels.filter(l => l !== level) : [...levels, level]
    onChange(encodeVisibility(next), invitedIds)
  }

  return (
    <div>
      <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '6px' }}>見せる範囲</div>
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

      {everyone ? (
        <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#94a3b8' }}>全員に見えます。絞るときはチェックを外し、必要なら個人を追加してください</p>
      ) : (
        <div style={{ marginTop: '10px' }}>
          <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>個人で追加（{invitedIds.length}名）</div>
          <PlayerMultiSelect players={players} selectedIds={invitedIds} onChange={ids => onChange(visibility, ids)} maxHeight={maxHeight} />
        </div>
      )}

      <p style={{ margin: '8px 0 0', fontSize: '12px', color: everyone || levels.length > 0 || invitedIds.length > 0 ? '#cbd5e1' : '#fca5a5' }}>
        見える人: {describeAudience(visibility, everyone ? 0 : invitedIds.length)}
      </p>
    </div>
  )
}
