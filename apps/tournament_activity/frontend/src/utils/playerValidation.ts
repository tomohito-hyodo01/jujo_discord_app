// 大会申込に必要なプロフィール項目の共通バリデーション。
// 申込時(TournamentApplicationForm)とログイン時(App/ProfileCompletionForm)で同じ基準を使う。

export function normalizePhoneDigits(raw: string | null | undefined): string {
  return (raw || '')
    .replace(/[-\s‐‑‒–—―−ー－ｰ]/g, '')
    .replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
}

export function isPhoneValid(phone: string | null | undefined): boolean {
  if (!phone) return false
  const d = normalizePhoneDigits(phone)
  if (d.length < 10 || d.length > 11) return false
  if (!d.startsWith('0')) return false
  if (/^(\d)\1+$/.test(d)) return false // 全部同じ数字
  const seq = '01234567890'
  if (d.length >= 10 && seq.includes(d.slice(0, 10))) return false // 連番
  return true
}

// 住所は番地（数字）を含む必要がある
export function isAddressValid(address: string | null | undefined): boolean {
  return !!address && /[\d０-９]/.test(address)
}

export interface ProfileIssue {
  field: 'birth_date' | 'post_number' | 'address' | 'phone_number'
  reason: 'missing' | 'invalid'
  message: string
}

// 大会申込に必要なプロフィール項目の不備（空欄 or 不正な値）を返す
export function getProfileIssues(player: any): ProfileIssue[] {
  const issues: ProfileIssue[] = []
  if (!player?.birth_date) {
    issues.push({ field: 'birth_date', reason: 'missing', message: '生年月日が未登録です' })
  }
  if (!player?.post_number) {
    issues.push({ field: 'post_number', reason: 'missing', message: '郵便番号が未登録です' })
  }
  if (!player?.address) {
    issues.push({ field: 'address', reason: 'missing', message: '住所が未登録です' })
  } else if (!isAddressValid(player.address)) {
    issues.push({ field: 'address', reason: 'invalid', message: '住所に番地（丁目・番地）を追加してください' })
  }
  if (!player?.phone_number) {
    issues.push({ field: 'phone_number', reason: 'missing', message: '電話番号が未登録です' })
  } else if (!isPhoneValid(player.phone_number)) {
    issues.push({ field: 'phone_number', reason: 'invalid', message: '電話番号を正しい形式で入力してください（例: 090-1234-5678）' })
  }
  return issues
}

// プロフィールが大会申込に必要な条件を満たしているか
export function isProfileComplete(player: any): boolean {
  return getProfileIssues(player).length === 0
}
