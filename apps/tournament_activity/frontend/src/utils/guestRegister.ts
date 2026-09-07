// ログイン不要の本人登録ページ（ペアの方に自分で選手情報を登録してもらうページ）のパス。
// App.tsx（ページの判定）と TournamentApplicationForm（共有用URLの表示）で同じ値を使う。
export const GUEST_REGISTER_PATH = '/guest-register'

// 本番はルート直下、プレビュー環境は /preview/ 配下で動くため、末尾一致で判定する
export function isGuestRegisterPath(pathname: string): boolean {
  return pathname.replace(/\/+$/, '').endsWith(GUEST_REGISTER_PATH)
}

// 申込者がペアに共有するためのURL。プレビュー環境では /preview 配下のURLになる
export function getGuestRegisterUrl(location: { origin: string; pathname: string } = window.location): string {
  const base = location.pathname.includes('/preview/') ? '/preview' : ''
  return `${location.origin}${base}${GUEST_REGISTER_PATH}`
}
