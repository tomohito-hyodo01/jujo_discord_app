// 大会の申込締切（deadline_date + 任意の deadline_time）の共通ユーティリティ。
// 画面ごとの判定・表示の食い違いを防ぐため、大会の締切は必ずここを使う。
// （練習会・イベント等、deadline_date に日時文字列を持つ他エンティティは対象外）

// 締切日時。deadline_time（'HH:MM'）未設定は当日23:59:59まで受付
export const tournamentDeadlineDate = (t: any): Date | null => {
  if (!t?.deadline_date) return null
  const d = String(t.deadline_date).split('T')[0]
  const time = t.deadline_time ? `${String(t.deadline_time).slice(0, 5)}:00` : '23:59:59'
  const dt = new Date(`${d}T${time}`)
  return isNaN(dt.getTime()) ? null : dt
}

// 申込締切を過ぎているか（deadline_date が無い場合は false）
export const isTournamentDeadlinePassed = (t: any): boolean => {
  const dt = tournamentDeadlineDate(t)
  return dt !== null && dt < new Date()
}

// 表示用: "YYYY/M/D" または "YYYY/M/D HH:MM"
export const formatTournamentDeadline = (t: any): string => {
  if (!t?.deadline_date) return '-'
  const d = new Date(String(t.deadline_date).split('T')[0])
  if (isNaN(d.getTime())) return '-'
  const dateStr = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
  return t.deadline_time ? `${dateStr} ${String(t.deadline_time).slice(0, 5)}` : dateStr
}
