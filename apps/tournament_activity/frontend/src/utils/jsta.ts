// 日本連盟登録番号（JSTA番号）の形式チェック。
// 「JSTA」＋数字8桁のみを有効とする。バックエンド api/jsta_utils.py と同じ規則。
// '-' のような値が「登録あり」と判定されると広域大会のチェックをすり抜けるため、
// 入力時の検証と申込時の判定で同じ関数を使う。

export const JSTA_DIGITS = 8

// 全角数字・空白・ハイフンを吸収して数字だけ取り出す
function extractDigits(value: string | null | undefined): string {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/^JSTA/i, '')
    .replace(/[\s\-‐‑‒–—―−]/g, '')
}

// 入力値の不備メッセージ。問題なければ null（未入力も可）
export function getJstaNumberIssue(value: string | null | undefined): string | null {
  const digits = extractDigits(value)
  if (digits === '') return null  // 未入力は許容（区の大会では不要なため）
  if (!/^\d+$/.test(digits)) return '日本連盟登録番号は数字で入力してください'
  if (digits.length !== JSTA_DIGITS) {
    return `日本連盟登録番号は数字${JSTA_DIGITS}桁で入力してください（入力: ${digits.length}桁）`
  }
  return null
}

// 保存用に 'JSTA########' へ正規化する。未入力は null
export function normalizeJstaNumber(value: string | null | undefined): string | null {
  const digits = extractDigits(value)
  return digits === '' ? null : `JSTA${digits}`
}

// 保存済みの値が有効な形式か（申込時の判定用）。
// 過去に保存された '-' や 'JSTA-' は無効として扱う
export function isJstaNumberValid(value: string | null | undefined): boolean {
  return /^JSTA\d{8}$/.test(String(value ?? '').trim())
}
