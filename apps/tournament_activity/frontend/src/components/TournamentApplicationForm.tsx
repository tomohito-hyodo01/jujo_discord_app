import { useState, useEffect } from 'react'
import PlayerRegistrationFormInline from './PlayerRegistrationFormInline'
import CompletePage from './CompletePage'

interface TournamentApplicationFormProps {
  auth: any
  onCompletedChange?: (isCompleted: boolean) => void
}

export default function TournamentApplicationForm({ auth, onCompletedChange }: TournamentApplicationFormProps) {
  const [tournaments, setTournaments] = useState<any[]>([])
  const [players, setPlayers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showPlayerForm, setShowPlayerForm] = useState(false)
  const [newPlayerData, setNewPlayerData] = useState<any>(null)
  const [isCompleted, setIsCompleted] = useState(false)
  const [completedData, setCompletedData] = useState<any>(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [formData, setFormData] = useState({
    discordId: '',
    tournamentId: '',
    type: '',
    pairId: '',
  })

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'
        
        // 選手一覧を取得
        const playersRes = await fetch(`${apiUrl}/api/players`)
        if (!playersRes.ok) {
          throw new Error(`選手取得失敗: ${playersRes.status}`)
        }
        const playersData = await playersRes.json()
        setPlayers(playersData)
        
        setError('')
      } catch (err: any) {
        setError(err.message || 'データの取得に失敗しました')
      } finally {
        setLoading(false)
      }
    }
    
    loadData()
  }, [])
  
  // Discord IDが設定されたら、または再読み込みトリガーで申込可能な大会を取得
  useEffect(() => {
    const loadAvailableTournaments = async () => {
      if (!formData.discordId) return
      
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'
        
        // 申込可能な大会を取得（締切前 & 未申込）
        const tournamentsRes = await fetch(`${apiUrl}/api/tournaments/available/${formData.discordId}`)
        if (!tournamentsRes.ok) {
          throw new Error(`大会取得失敗: ${tournamentsRes.status}`)
        }
        const tournamentsData = await tournamentsRes.json()
        setTournaments(tournamentsData)
        
        // 選手一覧も再取得
        const playersRes = await fetch(`${apiUrl}/api/players`)
        if (playersRes.ok) {
          const playersData = await playersRes.json()
          setPlayers(playersData)
        }
      } catch (err: any) {
        setError(err.message || '大会の取得に失敗しました')
      }
    }
    
    loadAvailableTournaments()
  }, [formData.discordId, refreshTrigger])

  const selectedTournament = tournaments.find(t => t.tournament_id === formData.tournamentId)
  
  // Discord IDが取得できていれば自動設定
  useEffect(() => {
    if (auth.user.id !== 'unknown' && !formData.discordId) {
      setFormData({ ...formData, discordId: auth.user.id })
    }
  }, [auth.user.id])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'
      let pairId = formData.pairId
      
      let newlyRegisteredPlayerName = ''
      
      // 選手追加フォームが表示されている場合、先に選手を登録
      if (showPlayerForm && newPlayerData) {
        const playerResponse = await fetch(`${apiUrl}/api/players`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(newPlayerData),
        })

        if (!playerResponse.ok) {
          const errorData = await playerResponse.json()
          alert(`選手登録に失敗しました: ${errorData.detail || ''}`)
          return
        }

        const newPlayer = await playerResponse.json()
        pairId = newPlayer.player_id.toString()
        newlyRegisteredPlayerName = newPlayerData.player_name
        
        // 選手一覧を更新
        const playersRes = await fetch(`${apiUrl}/api/players`)
        const playersData = await playersRes.json()
        setPlayers(playersData)
      } else if (!formData.pairId || formData.pairId === 'add_player') {
        alert('選手情報を入力してください')
        return
      }
      
      // アクセス者のplayer_mst情報を取得してsexを取得
      const playerRes = await fetch(`${apiUrl}/api/players/discord/${formData.discordId}`)
      let sex = 0
      
      if (playerRes.ok) {
        const playerInfo = await playerRes.json()
        if (playerInfo) {
          sex = playerInfo.sex
        }
      }
      
      // 大会申込データ
      const registrationData = {
        discord_id: formData.discordId,
        tournament_id: formData.tournamentId,
        type: formData.type,
        sex: sex,
        pair1: parseInt(pairId),
        pair2: null
      }

      const response = await fetch(`${apiUrl}/api/registrations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(registrationData),
      })

      if (response.ok) {
        // 完了データを設定
        const tournament = tournaments.find(t => t.tournament_id === formData.tournamentId)
        const player = players.find(p => p.player_id.toString() === pairId)
        const applicant = players.find(p => p.discord_id === formData.discordId)
        
        // ペア名を取得
        const pairPlayerName = newlyRegisteredPlayerName || player?.player_name || '新規登録選手'
        
        setCompletedData({
          tournamentName: tournament?.tournament_name || '',
          type: formData.type,
          pairName: pairPlayerName
        })
        
        // Discord Webhook通知を送信
        try {
          await fetch(`${apiUrl}/api/notify/registration`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              tournament_name: tournament?.tournament_name || '',
              type: formData.type,
              sex: sex,
              player1_name: applicant?.player_name || '',
              player2_name: pairPlayerName
            }),
          })
        } catch (notifyError) {
          // 通知エラーでも申込は成功扱い
        }
        
        // 完了画面を表示
        setIsCompleted(true)
        
        // 親コンポーネントに完了状態を通知
        if (onCompletedChange) {
          onCompletedChange(true)
        }
      } else {
        const errorData = await response.json()
        alert(`申込に失敗しました: ${errorData.detail || ''}`)
      }
    } catch (error) {
      alert('通信エラーが発生しました')
    }
  }

  const inputStyle = {
    width: '100%',
    padding: '12px 16px',
    borderRadius: '8px',
    border: '1px solid #1e293b',
    backgroundColor: '#0c1220',
    color: '#e2e8f0',
    fontSize: '15px',
    transition: 'border-color 0.2s, box-shadow 0.2s',
  }

  const labelStyle = {
    display: 'block',
    marginBottom: '8px',
    fontSize: '14px',
    fontWeight: '500',
    color: '#94a3b8'
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
        読み込み中...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ 
        padding: '20px',
        backgroundColor: '#7f1d1d',
        borderRadius: '8px',
        color: '#fecaca',
        border: '1px solid #ef4444'
      }}>
        エラー: {error}
        <br />
        <small>バックエンドAPIが起動しているか確認してください</small>
      </div>
    )
  }

  // 完了画面を表示
  if (isCompleted && completedData) {
    return (
      <CompletePage 
        tournamentName={completedData.tournamentName}
        type={completedData.type}
        pairName={completedData.pairName}
        onBackToForm={() => {
          setIsCompleted(false)
          setFormData({ ...formData, tournamentId: '', type: '', pairId: '' })
          setShowPlayerForm(false)
          setNewPlayerData(null)
          
          // DBデータを再取得
          setRefreshTrigger(prev => prev + 1)
          
          // 親コンポーネントに完了状態解除を通知
          if (onCompletedChange) {
            onCompletedChange(false)
          }
        }}
      />
    )
  }

  return (
    <div>
      {/* Discord ID 表示（テスト用） */}
      <div style={{
        padding: '12px',
        backgroundColor: '#0c1220',
        borderRadius: '8px',
        marginBottom: '20px',
        border: '1px solid #1e293b'
      }}>
        <div style={{ fontSize: '13px', color: '#94a3b8' }}>
          Discord ID（テスト表示）: <span style={{ color: '#60a5fa', fontWeight: '600' }}>{formData.discordId || '取得中...'}</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* 大会選択 */}
        <div>
          <label style={labelStyle}>大会名 *</label>
          <select
            value={formData.tournamentId}
            onChange={(e) => setFormData({ ...formData, tournamentId: e.target.value, type: '' })}
            required
            style={inputStyle}
          >
            <option value="">選択してください</option>
            {tournaments.map(t => (
              <option key={t.tournament_id} value={t.tournament_id}>
                {t.tournament_name}
              </option>
            ))}
          </select>
        </div>

        {/* 種別選択 */}
        <div>
          <label style={labelStyle}>種別 *</label>
          <select
            value={formData.type}
            onChange={(e) => setFormData({ ...formData, type: e.target.value })}
            required
            disabled={!selectedTournament}
            style={{
              ...inputStyle,
              opacity: !selectedTournament ? 0.5 : 1,
              cursor: !selectedTournament ? 'not-allowed' : 'pointer'
            }}
          >
            <option value="">
              {!selectedTournament ? '先に大会を選択してください' : '選択してください'}
            </option>
            {selectedTournament && selectedTournament.type.map((t: string) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {/* ペア選択 */}
        <div>
          <label style={labelStyle}>ペア選手 *</label>
          <select
            value={formData.pairId || (showPlayerForm ? 'add_player' : '')}
            onChange={(e) => {
              const value = e.target.value
              if (value === 'add_player') {
                setShowPlayerForm(true)
                setFormData({ ...formData, pairId: 'add_player' })
              } else {
                setFormData({ ...formData, pairId: value })
                setShowPlayerForm(false)
                setNewPlayerData(null)
              }
            }}
            required={!showPlayerForm}
            style={inputStyle}
          >
            <option value="">選択してください</option>
            {players
              .filter(p => p.discord_id !== formData.discordId)
              .map(p => (
                <option key={p.player_id} value={p.player_id}>
                  {p.player_name}
                </option>
              ))}
            <option value="add_player">+ 選手追加</option>
          </select>
        </div>

        {/* 選手登録フォーム（条件付き表示） */}
        {showPlayerForm && (
          <div style={{
            padding: '24px',
            backgroundColor: '#0c1220',
            borderRadius: '12px',
            border: '1px solid #1e293b'
          }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: '20px'
            }}>
              <h3 style={{ 
                fontSize: '18px',
                fontWeight: '600',
                color: '#f1f5f9',
                margin: 0
              }}>
                新規選手登録
              </h3>
              <button
                type="button"
                onClick={() => setShowPlayerForm(false)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  backgroundColor: '#475569',
                  color: '#fff',
                  border: 'none',
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                閉じる
              </button>
            </div>
            <PlayerRegistrationFormInline 
              discordId=""  // 大会申込からの追加時はdiscord_idを空に
              onDataChange={(data) => setNewPlayerData(data)}
            />
          </div>
        )}

        {/* 送信ボタン */}
        <button
          type="submit"
          style={{
            padding: '16px',
            borderRadius: '8px',
            backgroundColor: '#3b82f6',
            color: '#fff',
            border: 'none',
            fontSize: '16px',
            fontWeight: '600',
            marginTop: '8px'
          }}
        >
          申し込む
        </button>
      </form>
    </div>
  )
}

