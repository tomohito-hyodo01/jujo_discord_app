import { useEffect, useState } from 'react'

interface AuthCallbackProps {
  onAuthComplete: (userId: string, needsRegistration: boolean) => void
}

export default function AuthCallback({ onAuthComplete }: AuthCallbackProps) {
  const [error, setError] = useState('')

  useEffect(() => {
    const handleCallback = async () => {
      // URLパラメータからcodeを取得
      const urlParams = new URLSearchParams(window.location.search)
      const code = urlParams.get('code')
      
      if (!code) {
        setError('認証コードが見つかりません')
        return
      }

      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'
        
        // バックエンドでトークン交換
        const response = await fetch(`${apiUrl}/api/oauth2/callback`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ code }),
        })

        if (!response.ok) {
          throw new Error('認証に失敗しました')
        }

        const data = await response.json()
        const userId = data.user_id
        
        // player_mstに存在するかチェック
        const playerRes = await fetch(`${apiUrl}/api/players/discord/${userId}`)
        let needsRegistration = true
        
        if (playerRes.ok) {
          const playerData = await playerRes.json()
          if (playerData && playerData.player_id) {
            needsRegistration = false
          }
        }
        
        // Discord IDと選手登録が必要かを親コンポーネントに渡す
        onAuthComplete(userId, needsRegistration)
        
        // URLを元に戻す（codeパラメータを削除）
        window.history.replaceState({}, '', '/?view=tournament')
        
      } catch (err: any) {
        console.error('認証エラー:', err)
        setError(err.message || '認証に失敗しました')
      }
    }

    handleCallback()
  }, [onAuthComplete])

  if (error) {
    return (
      <div style={{ 
        textAlign: 'center',
        padding: '40px',
        color: '#f87171'
      }}>
        <h2>エラー</h2>
        <p>{error}</p>
        <button
          onClick={() => window.location.href = '/'}
          style={{
            marginTop: '20px',
            padding: '12px 24px',
            borderRadius: '8px',
            backgroundColor: '#334155',
            color: '#fff',
            border: 'none',
            cursor: 'pointer'
          }}
        >
          トップに戻る
        </button>
      </div>
    )
  }

  return (
    <div style={{ 
      textAlign: 'center',
      padding: '80px 20px',
      color: '#94a3b8'
    }}>
      <h2>認証中...</h2>
      <p>Discordアカウントを確認しています</p>
    </div>
  )
}

