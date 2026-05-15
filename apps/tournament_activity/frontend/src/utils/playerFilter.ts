/**
 * ペア候補の選手をフィルタリングする共通関数
 * - 自分自身は除外（player_idベース）
 * - ミックス系: 異性のみ
 * - それ以外: 同性のみ
 * - 年齢制限: 種別名から数字を抽出して適用（35, 45, ミックス（35）等）
 *   - 区大会: 大会当日時点の年齢
 *   - 東京都・広域(wardId=99): 開催年の4/1時点の年齢
 */

export function calculateAge(birthDate: string, baseDate: string): number {
  const birth = new Date(birthDate)
  const base = new Date(baseDate)
  let age = base.getFullYear() - birth.getFullYear()
  const m = base.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && base.getDate() < birth.getDate())) age--
  return age
}

/** 年齢判定の基準日を取得 */
function getAgeBaseDate(tournamentDate: string, wardId?: number | null): string {
  if (wardId === 99) {
    // 広域大会: 開催年の4/1
    const year = new Date(tournamentDate).getFullYear()
    return `${year}-04-01`
  }
  // 区大会: 大会当日
  return tournamentDate
}

/** 種別名がミックス系かどうか */
function isMixType(type: string): boolean {
  return type.startsWith('ミックス')
}

/** 種別名から年齢制限の数字を抽出（なければnull） */
function extractMinAge(type: string): number | null {
  if (/^\d+$/.test(type)) return parseInt(type)
  const match = type.match(/(\d+)/)
  if (match) {
    const n = parseInt(match[1])
    if (n >= 30) return n
  }
  return null
}

interface FilterOptions {
  players: any[]
  myPlayerId?: number | null
  myDiscordId?: string | null
  mySex: number | null
  type: string
  tournamentDate?: string
  wardId?: number | null
}

export function filterPairCandidates(opts: FilterOptions): any[]
export function filterPairCandidates(
  players: any[],
  myDiscordId: string,
  mySex: number | null,
  type: string,
  tournamentDate?: string,
  wardId?: number | null,
): any[]
export function filterPairCandidates(...args: any[]): any[] {
  let players: any[]
  let myPlayerId: number | null | undefined
  let myDiscordId: string | null | undefined
  let mySex: number | null
  let type: string
  let tournamentDate: string | undefined
  let wardId: number | null | undefined

  if (args.length === 1 && typeof args[0] === 'object' && !Array.isArray(args[0])) {
    const opts = args[0] as FilterOptions
    players = opts.players
    myPlayerId = opts.myPlayerId
    myDiscordId = opts.myDiscordId
    mySex = opts.mySex
    type = opts.type
    tournamentDate = opts.tournamentDate
    wardId = opts.wardId
  } else {
    players = args[0]
    myDiscordId = args[1]
    mySex = args[2]
    type = args[3]
    tournamentDate = args[4]
    wardId = args[5]
  }

  // 自分自身を除外
  let filtered = players.filter(p => {
    if (myPlayerId != null && p.player_id === myPlayerId) return false
    if (myDiscordId && p.discord_id === myDiscordId) return false
    return true
  })

  // 性別フィルター
  if (mySex != null) {
    if (isMixType(type)) {
      filtered = filtered.filter(p => p.sex != null && p.sex !== mySex)
    } else if (type !== 'シングルス') {
      filtered = filtered.filter(p => p.sex != null && p.sex === mySex)
    }
  }

  // 年齢制限
  const minAge = extractMinAge(type)
  if (minAge != null && tournamentDate) {
    const baseDate = getAgeBaseDate(tournamentDate, wardId)
    filtered = filtered.filter(p => {
      if (!p.birth_date) return false
      return calculateAge(p.birth_date, baseDate) >= minAge
    })
  }

  return filtered
}
