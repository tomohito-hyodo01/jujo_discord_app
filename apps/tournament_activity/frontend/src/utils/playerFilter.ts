/**
 * ペア候補の選手をフィルタリングする共通関数
 * - 自分自身は除外（player_idベース）
 * - ミックス: 異性のみ
 * - それ以外: 同性のみ
 * - 数字種別(35,45等): 年齢制限適用
 */

export function calculateAge(birthDate: string, baseDate: string): number {
  const birth = new Date(birthDate)
  const base = new Date(baseDate)
  let age = base.getFullYear() - birth.getFullYear()
  const m = base.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && base.getDate() < birth.getDate())) age--
  return age
}

interface FilterOptions {
  players: any[]
  myPlayerId?: number | null
  myDiscordId?: string | null
  mySex: number | null
  type: string
  tournamentDate?: string
}

export function filterPairCandidates(opts: FilterOptions): any[]
export function filterPairCandidates(
  players: any[],
  myDiscordId: string,
  mySex: number | null,
  type: string,
  tournamentDate?: string,
): any[]
export function filterPairCandidates(...args: any[]): any[] {
  let players: any[]
  let myPlayerId: number | null | undefined
  let myDiscordId: string | null | undefined
  let mySex: number | null
  let type: string
  let tournamentDate: string | undefined

  if (args.length === 1 && typeof args[0] === 'object' && !Array.isArray(args[0])) {
    const opts = args[0] as FilterOptions
    players = opts.players
    myPlayerId = opts.myPlayerId
    myDiscordId = opts.myDiscordId
    mySex = opts.mySex
    type = opts.type
    tournamentDate = opts.tournamentDate
  } else {
    players = args[0]
    myDiscordId = args[1]
    mySex = args[2]
    type = args[3]
    tournamentDate = args[4]
  }

  // 自分自身を除外（player_idとdiscord_id両方でチェック）
  let filtered = players.filter(p => {
    if (myPlayerId != null && p.player_id === myPlayerId) return false
    if (myDiscordId && p.discord_id === myDiscordId) return false
    return true
  })

  // 性別フィルター
  if (mySex != null) {
    if (type === 'ミックス') {
      filtered = filtered.filter(p => p.sex != null && p.sex !== mySex)
    } else {
      filtered = filtered.filter(p => p.sex != null && p.sex === mySex)
    }
  }

  // 年齢制限（数字の種別の場合）
  if (/^\d+$/.test(type) && tournamentDate) {
    const minAge = parseInt(type)
    filtered = filtered.filter(p => {
      if (!p.birth_date) return false
      return calculateAge(p.birth_date, tournamentDate!) >= minAge
    })
  }

  return filtered
}
