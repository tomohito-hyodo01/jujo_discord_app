// 大会の申込締切（deadline_date + 任意の deadline_time）の共通ユーティリティ。
// 画面ごとの判定・表示の食い違いを防ぐため、大会の締切は必ずここを使う。
// （練習会・イベント等、deadline_date に日時文字列を持つ他エンティティは対象外）

// 時刻未設定（または不正値）は当日終日まで受付。バックエンド deadline_utils.py と同一規則
const DEFAULT_CUTOFF = '23:59:59.999'

const validTime = (v: any): string | null => {
  const s = String(v ?? '').slice(0, 5)
  return /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(s) ? s : null
}

// 締切日時。deadline_time（'HH:MM'）はその時刻ちょうどまで受付
export const tournamentDeadlineDate = (t: any): Date | null => {
  if (!t?.deadline_date) return null
  const d = String(t.deadline_date).split('T')[0]
  const time = validTime(t.deadline_time)
  const dt = new Date(`${d}T${time ? `${time}:00` : DEFAULT_CUTOFF}`)
  return isNaN(dt.getTime()) ? null : dt
}

// 申込締切を過ぎているか（deadline_date が無い場合は false）
export const isTournamentDeadlinePassed = (t: any): boolean => {
  const dt = tournamentDeadlineDate(t)
  return dt !== null && dt < new Date()
}

// 表示用の時刻サフィックス: " HH:MM"（時刻未設定は空文字）。
// 各画面の日付表示形式（M/D(曜) や YYYY/M/D）を変えずに時刻だけ追記するために使う
export const deadlineTimeSuffix = (t: any): string => {
  const time = validTime(t?.deadline_time)
  return time ? ` ${time}` : ''
}

// 表示用: "YYYY/M/D" または "YYYY/M/D HH:MM"
export const formatTournamentDeadline = (t: any): string => {
  if (!t?.deadline_date) return '-'
  const d = new Date(String(t.deadline_date).split('T')[0])
  if (isNaN(d.getTime())) return '-'
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}${deadlineTimeSuffix(t)}`
}
