import { useState, useEffect } from 'react'
import DiscordLogin from './components/DiscordLogin'
import AuthCallback from './components/AuthCallback'
import Portal from './components/Portal'
import type { UserPermissionInfo } from './utils/permissions'

const DEV_DISCORD_ID = '1427112485047242945'
const AUTH_STORAGE_KEY = 'jujo_auth'

const fullScreenCenter = {
  height: '100%',
  display: 'flex',
  flexDirection: 'column' as const,
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '#0a1628',
}

function saveAuth(userId: string, username: string, memberLevel?: number) {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ userId, username, memberLevel }))
}

function loadAuth(): { userId: string; username: string; memberLevel?: number } | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (data.userId) return data
    return null
  } catch {
    return null
  }
}

function clearAuth() {
  localStorage.removeItem(AUTH_STORAGE_KEY)
}

function App() {
  const urlParams = new URLSearchParams(window.location.search)
  const authCode = urlParams.get('code')
  const sessionId = urlParams.get('session')
  const isLocalDev = import.meta.env.DEV || window.location.hostname === 'localhost'

  const [discordUserId, setDiscordUserId] = useState('')
  const [username, setUsername] = useState('')
  const [permissionInfo, setPermissionInfo] = useState<UserPermissionInfo>({ adminRole: 2, memberLevel: 2 })
  const [loading, setLoading] = useState(true)
  const [needsOAuth, setNeedsOAuth] = useState(false)
  const [needsPlayerRegistration, setNeedsPlayerRegistration] = useState(false)
  const [needsProfileCompletion, setNeedsProfileCompletion] = useState(false)
  const [accessDenied, setAccessDenied] = useState(false)

  const checkPlayerAndPermissions = async (userId: string, memberLevel?: number): Promise<{ needsRegistration: boolean; needsCompletion: boolean; perms: UserPermissionInfo }> => {
    const defaultPerms: UserPermissionInfo = { adminRole: 2, memberLevel: 2 }
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'
      const playerRes = await fetch(`${apiUrl}/api/players/discord/${userId}`)
      if (playerRes.ok) {
        const playerData = await playerRes.json()
        if (playerData && playerData.player_id) {
          const perms = {
            adminRole: playerData.admin_role ?? 2,
            memberLevel: playerData.member_level ?? 2,
          }
          // 正会員・準会員で必須項目が未入力ならプロフィール補完が必要
          const ml = memberLevel ?? perms.memberLevel
          let needsCompletion = false
          if (ml < 2) {
            const requiredFields = ['birth_date', 'post_number', 'address', 'phone_number']
            needsCompletion = requiredFields.some(f => !playerData[f])
          }
          return { needsRegistration: false, needsCompletion, perms }
        }
      }
      return { needsRegistration: true, needsCompletion: false, perms: defaultPerms }
    } catch {
      return { needsRegistration: true, needsCompletion: false, perms: defaultPerms }
    }
  }

  useEffect(() => {
    const init = async () => {
      // ローカル開発
      if (isLocalDev) {
        setDiscordUserId(DEV_DISCORD_ID)
        setUsername('開発ユーザー')
        const { needsRegistration, needsCompletion, perms } = await checkPlayerAndPermissions(DEV_DISCORD_ID)
        setNeedsPlayerRegistration(needsRegistration)
        setNeedsProfileCompletion(needsCompletion)
        setPermissionInfo(perms)
        setLoading(false)
        return
      }

      // OAuth2コールバック中
      if (authCode) {
        return
      }

      // セッションID（従来方式）
      if (sessionId) {
        try {
          const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'
          const res = await fetch(`${apiUrl}/api/session/${sessionId}`)
          const data = await res.json()
          setDiscordUserId(data.discord_id)
          setUsername(data.username || 'ユーザー')
          saveAuth(data.discord_id, data.username || 'ユーザー')
          const { needsRegistration, needsCompletion, perms } = await checkPlayerAndPermissions(data.discord_id)
          setNeedsPlayerRegistration(needsRegistration)
          setNeedsProfileCompletion(needsCompletion)
          setPermissionInfo(perms)
        } catch {
          // セッション取得失敗
        }
        setLoading(false)
        return
      }

      // localStorageから復元
      const saved = loadAuth()
      if (saved) {
        // memberLevelが未保存（旧データ）の場合は再認証を促す
        if (saved.memberLevel === undefined) {
          clearAuth()
          setNeedsOAuth(true)
          setLoading(false)
          return
        }
        if (saved.memberLevel > 2) {
          setAccessDenied(true)
          setLoading(false)
          return
        }
        setDiscordUserId(saved.userId)
        setUsername(saved.username)
        const { needsRegistration, needsCompletion, perms } = await checkPlayerAndPermissions(saved.userId, saved.memberLevel)
        setNeedsPlayerRegistration(needsRegistration)
        setNeedsProfileCompletion(needsCompletion)
        setPermissionInfo({ ...perms, memberLevel: saved.memberLevel })
        setLoading(false)
        return
      }

      // 認証なし
      setNeedsOAuth(true)
      setLoading(false)
    }

    init()
  }, [sessionId, authCode, isLocalDev])

  // アクセス拒否画面（OAuth2コールバックより先に評価）
  if (accessDenied) {
    return (
      <div style={fullScreenCenter}>
        <div style={{ textAlign: 'center', padding: '40px 20px', maxWidth: '400px' }}>
          <p style={{ fontSize: '20px', fontWeight: '600', color: '#f87171', lineHeight: '1.8' }}>
            利用権限がありません。<br />管理者にお問い合わせください。
          </p>
        </div>
      </div>
    )
  }

  // OAuth2コールバック処理
  if (authCode) {
    return (
      <div style={fullScreenCenter}>
        <AuthCallback onAuthComplete={async (userId, needsRegistration, returnedUsername, memberLevel) => {
          const uname = returnedUsername || 'ユーザー'
          const ml = memberLevel ?? 3
          if (ml > 2) {
            setAccessDenied(true)
            setLoading(false)
            window.history.replaceState({}, '', window.location.origin + window.location.pathname)
            return
          }
          setDiscordUserId(userId)
          setUsername(uname)
          setNeedsPlayerRegistration(needsRegistration)
          saveAuth(userId, uname, ml)
          if (!needsRegistration) {
            const { needsCompletion, perms } = await checkPlayerAndPermissions(userId, ml)
            setNeedsProfileCompletion(needsCompletion)
            setPermissionInfo({ ...perms, memberLevel: ml })
          } else {
            setPermissionInfo(prev => ({ ...prev, memberLevel: ml }))
          }
          setNeedsOAuth(false)
          setLoading(false)
          window.history.replaceState({}, '', window.location.origin + window.location.pathname)
        }} />
      </div>
    )
  }

  // ログイン画面
  if (needsOAuth && !discordUserId) {
    return (
      <div style={fullScreenCenter}>
        <DiscordLogin />
      </div>
    )
  }

  // ローディング
  if (loading) {
    return (
      <div style={fullScreenCenter}>
        <div style={{
          width: '40px', height: '40px',
          border: '3px solid #1e293b', borderTop: '3px solid #3b82f6',
          borderRadius: '50%', animation: 'spin 1s linear infinite',
          margin: '0 auto 16px'
        }} />
        <p style={{ color: '#94a3b8' }}>認証情報を取得しています...</p>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  // ポータル
  return (
    <Portal
      discordId={discordUserId}
      username={username}
      permissionInfo={permissionInfo}
      needsPlayerRegistration={needsPlayerRegistration}
      needsProfileCompletion={needsProfileCompletion}
      onPlayerRegistered={async () => {
        setNeedsPlayerRegistration(false)
        setNeedsProfileCompletion(false)
        const { perms } = await checkPlayerAndPermissions(discordUserId, permissionInfo.memberLevel)
        setPermissionInfo(perms)
      }}
      onProfileCompleted={async () => {
        setNeedsProfileCompletion(false)
        const { perms } = await checkPlayerAndPermissions(discordUserId, permissionInfo.memberLevel)
        setPermissionInfo(perms)
      }}
      onLogout={clearAuth}
    />
  )
}

export default App
