import { useState, useEffect } from 'react'
import PlayerRegistrationForm from './components/PlayerRegistrationForm'
import TournamentApplicationForm from './components/TournamentApplicationForm'
import DiscordLogin from './components/DiscordLogin'
import AuthCallback from './components/AuthCallback'

function App() {
  // URLパラメータからビューとセッションID、認証コードを取得
  const urlParams = new URLSearchParams(window.location.search)
  const initialView = urlParams.get('view') === 'tournament' ? 'tournament' : 'player'
  const sessionId = urlParams.get('session')
  const authCode = urlParams.get('code')
  
  const [view, setView] = useState<'player' | 'tournament'>(initialView)
  const [discordUserId, setDiscordUserId] = useState('')
  const [loading, setLoading] = useState(true)
  const [isCompleted, setIsCompleted] = useState(false)
  const [isPlayerRegistrationRequired, setIsPlayerRegistrationRequired] = useState(false)
  const [needsOAuth, setNeedsOAuth] = useState(false)
  
  // 全てのuseEffectを条件分岐の前に配置
  useEffect(() => {
    // 認証コールバック処理（OAuth2）
    if (authCode) {
      // AuthCallbackコンポーネントで処理
      return
    }
    
    // セッションIDからDiscord情報を取得（従来方式）
    if (sessionId) {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'
      
      fetch(`${apiUrl}/api/session/${sessionId}`)
        .then(res => res.json())
        .then(async data => {
          setDiscordUserId(data.discord_id)
          
          // player_mstに存在するかチェック
          const playerRes = await fetch(`${apiUrl}/api/players/discord/${data.discord_id}`)
          
          if (playerRes.ok) {
            const playerData = await playerRes.json()
            
            if (playerData && playerData.player_id) {
              // 選手登録済み
            } else {
              setIsPlayerRegistrationRequired(true)
              setView('player')
            }
          } else {
            setIsPlayerRegistrationRequired(true)
            setView('player')
          }
          
          setLoading(false)
        })
        .catch(() => {
          setLoading(false)
        })
    } else {
      // セッションIDもなし → OAuth2ログインが必要
      setNeedsOAuth(true)
      setLoading(false)
    }
  }, [sessionId, authCode])
  
  useEffect(() => {
    // URLパラメータの変更を検知
    const view = urlParams.get('view')
    if (view === 'tournament') {
      setView('tournament')
    } else {
      setView('player')
    }
  }, [])
  
  const auth = {
    user: {
      id: discordUserId || 'unknown',
      username: 'user'
    }
  }
  
  // OAuth2認証コールバック処理
  if (authCode) {
    return (
      <div style={{ 
        width: '100%',
        maxWidth: '800px',
        backgroundColor: '#0a1628',
        borderRadius: '16px',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.7)',
        overflow: 'hidden',
        border: '1px solid #1e293b'
      }}>
        <div style={{ 
          padding: '40px',
          background: 'linear-gradient(135deg, #0c1e3d 0%, #0f172a 100%)',
          color: '#ffffff',
          borderBottom: '1px solid #1e293b'
        }}>
          <h1 style={{ 
            fontSize: '32px',
            fontWeight: '600',
            margin: 0,
            letterSpacing: '-0.5px'
          }}>
            十条クラブ　大会申込フォーム
          </h1>
        </div>
        <div style={{ padding: '40px', backgroundColor: '#0a1628' }}>
          <AuthCallback onAuthComplete={(userId, needsRegistration) => {
            setDiscordUserId(userId)
            setNeedsOAuth(false)
            if (needsRegistration) {
              setIsPlayerRegistrationRequired(true)
              setView('player')
            } else {
              setView('tournament')
            }
            setLoading(false)
          }} />
        </div>
      </div>
    )
  }

  // OAuth2ログインが必要
  if (needsOAuth && !discordUserId) {
    return (
      <div style={{ 
        width: '100%',
        maxWidth: '800px',
        backgroundColor: '#0a1628',
        borderRadius: '16px',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.7)',
        overflow: 'hidden',
        border: '1px solid #1e293b'
      }}>
        <div style={{ 
          padding: '40px',
          background: 'linear-gradient(135deg, #0c1e3d 0%, #0f172a 100%)',
          color: '#ffffff',
          borderBottom: '1px solid #1e293b'
        }}>
          <h1 style={{ 
            fontSize: '32px',
            fontWeight: '600',
            margin: 0,
            letterSpacing: '-0.5px'
          }}>
            十条クラブ　大会申込フォーム
          </h1>
        </div>
        <div style={{ padding: '40px', backgroundColor: '#0a1628' }}>
          <DiscordLogin />
        </div>
      </div>
    )
  }
  
  if (loading) {
    return (
      <div style={{ 
        padding: '40px',
        textAlign: 'center',
        color: '#94a3b8'
      }}>
        <h2>読み込み中...</h2>
        <p>認証情報を取得しています</p>
      </div>
    )
  }

  return (
    <div style={{ 
      width: '100%',
      maxWidth: '800px',
      backgroundColor: '#0a1628',
      borderRadius: '16px',
      boxShadow: '0 20px 60px rgba(0, 0, 0, 0.7)',
      overflow: 'hidden',
      border: '1px solid #1e293b'
    }}>
      <div style={{ 
        padding: '40px',
        background: 'linear-gradient(135deg, #0c1e3d 0%, #0f172a 100%)',
        color: '#ffffff',
        borderBottom: '1px solid #1e293b'
      }}>
        <h1 style={{ 
          fontSize: '32px',
          fontWeight: '600',
          margin: 0,
          letterSpacing: '-0.5px'
        }}>
          十条クラブ　大会申込フォーム
        </h1>
      </div>
      
      {!isCompleted && !isPlayerRegistrationRequired && (
        <div style={{ 
          display: 'flex',
          borderBottom: '1px solid #1e293b',
          backgroundColor: '#0a1628'
        }}>
          <button 
            onClick={() => setView('player')}
            style={{ 
              flex: 1,
              padding: '16px',
              border: 'none',
              backgroundColor: view === 'player' ? '#0f172a' : 'transparent',
              color: view === 'player' ? '#60a5fa' : '#64748b',
              fontSize: '15px',
              fontWeight: view === 'player' ? '600' : '400',
              borderBottom: view === 'player' ? '3px solid #3b82f6' : '3px solid transparent',
              transition: 'all 0.2s'
            }}
          >
            選手登録
          </button>
          <button 
            onClick={() => setView('tournament')}
            style={{ 
              flex: 1,
              padding: '16px',
              border: 'none',
              backgroundColor: view === 'tournament' ? '#0f172a' : 'transparent',
              color: view === 'tournament' ? '#60a5fa' : '#64748b',
              fontSize: '15px',
              fontWeight: view === 'tournament' ? '600' : '400',
              borderBottom: view === 'tournament' ? '3px solid #3b82f6' : '3px solid transparent',
              transition: 'all 0.2s'
            }}
          >
            大会申込
          </button>
        </div>
      )}

      <div style={{ padding: '40px', backgroundColor: '#0a1628' }}>
        {view === 'player' ? (
          <PlayerRegistrationForm 
            auth={auth}
            isRequired={isPlayerRegistrationRequired}
            onCompleted={() => {
              setIsPlayerRegistrationRequired(false)
              setView('tournament')
            }}
          />
        ) : (
          <TournamentApplicationForm 
            auth={auth} 
            onCompletedChange={(completed) => setIsCompleted(completed)}
          />
        )}
      </div>
    </div>
  )
}

export default App

