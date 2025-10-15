import { useState } from 'react'

export default function DiscordLogin() {
  const [loading, setLoading] = useState(false)

  const handleLogin = () => {
    setLoading(true)
    
    // Discord OAuth2認証URL
    const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID || '1427563635773018182'
    const redirectUri = encodeURIComponent(window.location.origin + '/auth/callback')
    const scope = 'identify'
    
    const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}`
    
    // 認証画面を開く
    window.location.href = authUrl
  }

  return (
    <div style={{ 
      textAlign: 'center',
      padding: '80px 20px',
      minHeight: '400px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <div style={{
        width: '120px',
        height: '120px',
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #5865F2 0%, #7289DA 100%)',
        margin: '0 auto 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '60px',
        color: '#ffffff',
        boxShadow: '0 10px 30px rgba(88, 101, 242, 0.3)'
      }}>
        D
      </div>
      
      <h2 style={{
        fontSize: '28px',
        fontWeight: '600',
        color: '#f1f5f9',
        marginBottom: '16px'
      }}>
        Discordでログイン
      </h2>
      
      <p style={{
        fontSize: '15px',
        color: '#94a3b8',
        marginBottom: '40px',
        maxWidth: '400px'
      }}>
        大会申込にはDiscordアカウントでのログインが必要です
      </p>
      
      <button
        onClick={handleLogin}
        disabled={loading}
        style={{
          padding: '16px 48px',
          borderRadius: '12px',
          backgroundColor: loading ? '#475569' : '#5865F2',
          color: '#fff',
          border: 'none',
          fontSize: '16px',
          fontWeight: '600',
          cursor: loading ? 'not-allowed' : 'pointer',
          boxShadow: '0 4px 12px rgba(88, 101, 242, 0.4)',
          transition: 'all 0.3s'
        }}
      >
        {loading ? '認証中...' : 'Discordでログイン'}
      </button>
      
      <p style={{
        fontSize: '13px',
        color: '#64748b',
        marginTop: '24px',
        maxWidth: '400px'
      }}>
        ログインすると、あなたのDiscordユーザー名とIDを取得します
      </p>
    </div>
  )
}

