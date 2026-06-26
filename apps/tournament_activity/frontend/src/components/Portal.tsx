import { useState, useRef, useEffect } from 'react'
import Home from './Home'
import EventList from './EventList'
import PlayerRegistrationForm from './PlayerRegistrationForm'
import TournamentApplicationForm from './TournamentApplicationForm'
import TournamentRegistrationForm from './TournamentRegistrationForm'
import MemberList from './MemberList'
import TournamentManagement from './TournamentManagement'
import ExcelDownload from './ExcelDownload'
import MyRegistrations from './MyRegistrations'
import PracticeManagement from './PracticeManagement'
import MyProfile from './MyProfile'
import ProfileCompletionForm from './ProfileCompletionForm'
import AppLogViewer from './AppLogViewer'
import RefereeTraining from './RefereeTraining'
import AccountMerge from './AccountMerge'
import ProfileIncompleteNotifier from './ProfileIncompleteNotifier'
import GameHub from './GameHub'
import { hasPermission, getMemberLevelName, type Permission, type UserPermissionInfo } from '../utils/permissions'

interface PortalProps {
  discordId: string
  username: string
  permissionInfo: UserPermissionInfo
  needsPlayerRegistration: boolean
  needsProfileCompletion: boolean
  onPlayerRegistered: () => void
  onProfileCompleted: () => void
  onLogout: () => void
}

interface MenuItem {
  id: string
  label: string
  permission: Permission
}

const MENU_ITEMS: MenuItem[] = [
  { id: 'dashboard', label: 'ホーム', permission: 'view_dashboard' },
  { id: 'event-list', label: 'イベント一覧', permission: 'view_event_list' },
  { id: 'player', label: '選手登録', permission: 'view_player' },
  { id: 'apply', label: '大会申込', permission: 'view_apply' },
  { id: 'referee-training', label: '審判講習', permission: 'view_referee_training' },
  { id: 'my-registrations', label: '申込履歴', permission: 'view_my_registrations' },
  { id: 'admin-tournament', label: '大会登録', permission: 'view_tournament_register' },
  { id: 'admin-tournament-mgmt', label: '大会管理', permission: 'view_tournament_register' },
  { id: 'admin-excel', label: '申込書出力', permission: 'view_excel_download' },
  { id: 'admin-practice', label: '練習日程管理', permission: 'view_practice_manage' },
  { id: 'admin-members', label: 'メンバー一覧', permission: 'view_member_list' },
  { id: 'profile-notify', label: 'プロフィール不備通知', permission: 'view_app_logs' },
  { id: 'account-merge', label: 'アカウント統合', permission: 'view_app_logs' },
  { id: 'admin-logs', label: 'ログ', permission: 'view_app_logs' },
  { id: 'game', label: '⚔️ ゲーム(試作)', permission: 'view_game' },
]

// ゲーム(試作)は一旦 管理者 兵頭 のみに表示（view_game権限に加えてこのIDのみ）
const GAME_ALLOWED_DISCORD_IDS = new Set(['1427112485047242945'])

const VALID_PAGES = new Set([
  'dashboard', 'event-list', 'player', 'my-profile', 'apply', 'referee-training', 'my-registrations',
  'admin-tournament', 'admin-tournament-mgmt', 'admin-excel', 'admin-practice', 'admin-members',
  'admin-logs', 'account-merge', 'profile-notify', 'game',
])

export default function Portal({ discordId, username, permissionInfo, needsPlayerRegistration, needsProfileCompletion, onPlayerRegistered, onProfileCompleted, onLogout }: PortalProps) {
  const getInitialPage = () => {
    if (needsPlayerRegistration) return 'player'
    const hash = window.location.hash.replace(/^#/, '')
    if (hash && VALID_PAGES.has(hash)) {
      // プロフィール補完中は dashboard/player のみ許可
      if (needsProfileCompletion && hash !== 'player' && hash !== 'dashboard') {
        return 'dashboard'
      }
      return hash
    }
    return 'dashboard'
  }
  const [currentPage, setCurrentPage] = useState(getInitialPage)
  const [isCompleted, setIsCompleted] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [selectedTournamentId, setSelectedTournamentId] = useState<string | undefined>(undefined)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const accountMenuRef = useRef<HTMLDivElement>(null)

  const visibleMenuItems = MENU_ITEMS.filter(item => {
    if (!hasPermission(permissionInfo, item.permission)) return false
    if (item.id === 'game' && !GAME_ALLOWED_DISCORD_IDS.has(discordId || '')) return false // ゲームは一旦 兵頭のみ
    // 初回選手登録未完了 or プロフィール補完中はホームのみ表示
    if ((needsPlayerRegistration || needsProfileCompletion) && item.id !== 'player' && item.id !== 'dashboard') return false
    return true
  })

  const auth = {
    user: { id: discordId, username }
  }

  // アカウントメニュー外クリックで閉じる
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setAccountMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const navigate = (page: string, tournamentId?: string) => {
    setIsCompleted(false)
    setSelectedTournamentId(tournamentId)
    setCurrentPage(page)
    setSidebarOpen(false)
    setAccountMenuOpen(false)
    window.history.pushState({ page, tournamentId }, '', `#${page}`)
  }

  // ブラウザの戻る/進むに対応
  useEffect(() => {
    // 初回ロード時、現在のページとURLハッシュを同期（既存ハッシュは尊重）
    window.history.replaceState({ page: currentPage }, '', `#${currentPage}`)

    const handlePopState = (e: PopStateEvent) => {
      if (e.state?.page) {
        setCurrentPage(e.state.page)
        setSelectedTournamentId(e.state.tournamentId)
        setIsCompleted(false)
        setSidebarOpen(false)
        setAccountMenuOpen(false)
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const handleLogout = () => {
    onLogout()
    window.location.href = window.location.origin + window.location.pathname
  }

  const renderContent = () => {
    if (needsPlayerRegistration) {
      return (
        <PlayerRegistrationForm
          auth={auth}
          permissionInfo={permissionInfo}
          isRequired={true}
          onCompleted={() => { onPlayerRegistered(); setCurrentPage('dashboard') }}
        />
      )
    }

    if (needsProfileCompletion) {
      return (
        <ProfileCompletionForm
          discordId={discordId}
          permissionInfo={permissionInfo}
          onCompleted={onProfileCompleted}
        />
      )
    }

    switch (currentPage) {
      case 'dashboard':
        return <Home discordId={discordId} permissionInfo={permissionInfo} onNavigate={navigate} />
      case 'event-list':
        return <EventList discordId={discordId} onNavigate={navigate} guestMode={permissionInfo.memberLevel === 2} />
      case 'player':
        return <PlayerRegistrationForm auth={auth} permissionInfo={permissionInfo} onNavigate={navigate} />
      case 'my-profile':
        return <MyProfile discordId={discordId} />
      case 'apply':
        return (
          <TournamentApplicationForm
            auth={auth}
            initialTournamentId={selectedTournamentId}
            onCompletedChange={(completed) => setIsCompleted(completed)}
            onNavigate={navigate}
          />
        )
      case 'referee-training':
        return <RefereeTraining discordId={discordId} />
      case 'my-registrations':
        return <MyRegistrations discordId={discordId} onNavigate={navigate} />
      case 'admin-tournament':
        if (!hasPermission(permissionInfo, 'view_tournament_register')) {
          return <div style={{ padding: '40px', textAlign: 'center', color: '#f87171' }}>権限がありません</div>
        }
        return <TournamentRegistrationForm />
      case 'admin-tournament-mgmt':
        if (!hasPermission(permissionInfo, 'view_tournament_register')) {
          return <div style={{ padding: '40px', textAlign: 'center', color: '#f87171' }}>権限がありません</div>
        }
        return <TournamentManagement />
      case 'admin-excel':
        if (!hasPermission(permissionInfo, 'view_excel_download')) {
          return <div style={{ padding: '40px', textAlign: 'center', color: '#f87171' }}>権限がありません</div>
        }
        return <ExcelDownload permissionInfo={permissionInfo} discordId={discordId} />
      case 'admin-practice':
        if (!hasPermission(permissionInfo, 'view_practice_manage')) {
          return <div style={{ padding: '40px', textAlign: 'center', color: '#f87171' }}>権限がありません</div>
        }
        return <PracticeManagement discordId={discordId} />
      case 'admin-members':
        if (!hasPermission(permissionInfo, 'view_member_list')) {
          return <div style={{ padding: '40px', textAlign: 'center', color: '#f87171' }}>権限がありません</div>
        }
        return <MemberList />
      case 'admin-logs':
        if (!hasPermission(permissionInfo, 'view_app_logs')) {
          return <div style={{ padding: '40px', textAlign: 'center', color: '#f87171' }}>権限がありません</div>
        }
        return <AppLogViewer />
      case 'account-merge':
        if (!hasPermission(permissionInfo, 'view_app_logs')) {
          return <div style={{ padding: '40px', textAlign: 'center', color: '#f87171' }}>権限がありません</div>
        }
        return <AccountMerge discordId={discordId} />
      case 'profile-notify':
        if (!hasPermission(permissionInfo, 'view_app_logs')) {
          return <div style={{ padding: '40px', textAlign: 'center', color: '#f87171' }}>権限がありません</div>
        }
        return <ProfileIncompleteNotifier discordId={discordId} />
      case 'game':
        if (!hasPermission(permissionInfo, 'view_game') || !GAME_ALLOWED_DISCORD_IDS.has(discordId || '')) {
          return <div style={{ padding: '40px', textAlign: 'center', color: '#f87171' }}>権限がありません</div>
        }
        return <GameHub username={username} discordId={discordId} onExitToPortal={() => navigate('dashboard')} />
      default:
        return <Home discordId={discordId} permissionInfo={permissionInfo} onNavigate={navigate} />
    }
  }

  const showSidebar = !isCompleted

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#0a1628',
    }}>
      {/* ヘッダー */}
      <div style={{
        padding: '12px 20px',
        background: 'linear-gradient(135deg, #0c1e3d 0%, #0f172a 100%)',
        borderBottom: '1px solid #1e293b',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {showSidebar && (
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="sidebar-toggle"
              style={{
                display: 'none', padding: '6px 8px', borderRadius: '6px',
                backgroundColor: '#1e293b', color: '#94a3b8', border: '1px solid #334155',
                fontSize: '18px', cursor: 'pointer', lineHeight: 1,
              }}
            >
              ☰
            </button>
          )}
          <h1 style={{ fontSize: '18px', fontWeight: '600', color: '#ffffff', margin: 0 }}>
            十条クラブ
          </h1>
        </div>
      </div>

      {/* メインエリア */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {showSidebar && (
          <>
            {sidebarOpen && (
              <div
                onClick={() => setSidebarOpen(false)}
                className="sidebar-overlay"
                style={{
                  display: 'none', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                  backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 99,
                }}
              />
            )}
            <nav
              className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}
              style={{
                width: '200px', minWidth: '200px',
                backgroundColor: '#070e1b', borderRight: '1px solid #1e293b',
                padding: '0', display: 'flex', flexDirection: 'column',
                flexShrink: 0, overflowY: 'auto',
              }}
            >
              {/* アカウント */}
              <div ref={accountMenuRef} style={{ position: 'relative', borderBottom: '1px solid #1e293b' }}>
                <button
                  onClick={() => setAccountMenuOpen(!accountMenuOpen)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    width: '100%', padding: '14px 16px', border: 'none',
                    backgroundColor: accountMenuOpen || currentPage === 'my-profile' ? '#1e293b' : '#0a1220',
                    color: '#e2e8f0', fontSize: '14px', fontWeight: '500',
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '50%',
                    backgroundColor: '#1e3a8a', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: '14px', color: '#93c5fd', flexShrink: 0,
                  }}>
                    {username.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {username}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>
                      {getMemberLevelName(permissionInfo.memberLevel)}
                    </div>
                  </div>
                </button>

                {/* ドロップダウンメニュー */}
                {accountMenuOpen && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, width: '100%',
                    backgroundColor: '#0f172a', border: '1px solid #1e293b',
                    borderTop: 'none', zIndex: 50,
                  }}>
                    <button
                      onClick={() => navigate('my-profile')}
                      style={{
                        display: 'block', width: '100%', padding: '10px 16px',
                        border: 'none', backgroundColor: 'transparent', color: '#94a3b8',
                        fontSize: '13px', cursor: 'pointer', textAlign: 'left',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#1e293b')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      マイページ
                    </button>
                    <button
                      onClick={handleLogout}
                      style={{
                        display: 'block', width: '100%', padding: '10px 16px',
                        border: 'none', backgroundColor: 'transparent', color: '#f87171',
                        fontSize: '13px', cursor: 'pointer', textAlign: 'left',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#1e293b')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      ログアウト
                    </button>
                  </div>
                )}
              </div>

              {/* メニュー */}
              <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {visibleMenuItems.map(item => (
                  <button
                    key={item.id}
                    onClick={() => navigate(item.id)}
                    style={{
                      display: 'block', width: '100%', padding: '12px 20px',
                      border: 'none',
                      backgroundColor: currentPage === item.id ? '#1e293b' : 'transparent',
                      color: currentPage === item.id ? '#60a5fa' : '#94a3b8',
                      fontSize: '14px',
                      fontWeight: currentPage === item.id ? '600' : '400',
                      cursor: 'pointer', transition: 'all 0.15s', textAlign: 'left',
                      borderLeft: currentPage === item.id ? '3px solid #3b82f6' : '3px solid transparent',
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </nav>
          </>
        )}

        <div className="portal-content" style={{
          flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '28px 32px', backgroundColor: '#0a1628',
        }}>
          <div style={{ maxWidth: currentPage === 'admin-members' ? '100%' : '800px', width: '100%' }}>
            {renderContent()}
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 640px) {
          .sidebar-toggle { display: block !important; }
          .sidebar {
            position: fixed; top: 0; left: -240px; width: 240px;
            height: 100%; z-index: 100; transition: left 0.25s ease;
            padding-top: 56px !important;
          }
          .sidebar-open { left: 0 !important; }
          .sidebar-overlay { display: block !important; }
          .portal-content { padding: 16px 12px !important; }
        }
      `}</style>
    </div>
  )
}
