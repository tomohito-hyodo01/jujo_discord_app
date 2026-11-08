/**
 * イベント・日程アンケートの公開範囲（見せる範囲）
 *
 * visibility の値（backend/api/audience.py と同じ規則）:
 * - 'public'            : 全員（正会員・準会員・ゲスト）
 * - 'invited'           : 個人で選んだ人だけ（invited_player_ids）
 * - 'members:0,1' など  : 選んだ会員区分 ＋ 個人で選んだ人
 *                         会員区分は member_level（0=正会員, 1=準会員, 2=ゲスト）
 * 練習日程の 'members_all'（正会員・準会員）/ 'members_regular'（正会員）も同じ意味で読む。
 */

export const MEMBER_LEVELS = [
  { value: 0, label: '正会員' },
  { value: 1, label: '準会員' },
  { value: 2, label: 'ゲスト' },
] as const

const ALL_LEVELS = [0, 1, 2]
const PREFIX = 'members:'

/** 見せる会員区分。不明な値は従来どおり全員として扱う */
export function parseLevels(visibility?: string | null): number[] {
  const v = (visibility || 'public').trim()
  if (v === 'public') return ALL_LEVELS
  if (v === 'invited') return []
  if (v === 'members_all') return [0, 1]
  if (v === 'members_regular') return [0]
  if (v.startsWith(PREFIX)) {
    const parts = v.slice(PREFIX.length).split(',').map(s => s.trim()).filter(s => s !== '')
    return ALL_LEVELS.filter(level => parts.some(s => Number(s) === level))
  }
  return ALL_LEVELS
}

/** 選んだ会員区分から保存する値を作る。全区分なら 'public'、区分なしなら 'invited'（個人だけ） */
export function encodeVisibility(levels: number[]): string {
  const picked = ALL_LEVELS.filter(level => levels.includes(level))
  if (picked.length === ALL_LEVELS.length) return 'public'
  if (picked.length === 0) return 'invited'
  return PREFIX + picked.join(',')
}

/** 全員公開ではない（会員区分か個人で絞っている） */
export function isRestricted(visibility?: string | null): boolean {
  return parseLevels(visibility).length !== ALL_LEVELS.length
}

/** 自分に見えるか（会員区分が合うか、個人で選ばれているか） */
export function canViewAudience(
  visibility: string | null | undefined,
  invitedIds: number[] | null | undefined,
  myMemberLevel: number | null,
  myPlayerId: number | null,
): boolean {
  const levels = parseLevels(visibility)
  if (levels.length === ALL_LEVELS.length) return true
  if (myMemberLevel != null && levels.includes(myMemberLevel)) return true
  return myPlayerId != null && (invitedIds || []).includes(myPlayerId)
}

/** 見える人の説明（例: 正会員 ＋ 個人2名） */
export function describeAudience(visibility: string | null | undefined, invitedCount: number): string {
  const levels = parseLevels(visibility)
  if (levels.length === ALL_LEVELS.length) return '全員（正会員・準会員・ゲスト）'
  const parts: string[] = MEMBER_LEVELS.filter(l => levels.includes(l.value)).map(l => l.label)
  if (invitedCount > 0) parts.push(`個人${invitedCount}名`)
  return parts.length > 0 ? parts.join(' ＋ ') : 'まだ誰も選ばれていません'
}
