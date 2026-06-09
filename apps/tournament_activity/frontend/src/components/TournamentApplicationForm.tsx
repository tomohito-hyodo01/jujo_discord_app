import { useState, useEffect } from 'react'
import PlayerRegistrationFormInline from './PlayerRegistrationFormInline'
import CompletePage from './CompletePage'
import { filterPairCandidates } from '../utils/playerFilter'

interface TournamentApplicationFormProps {
  auth: any
  wardId?: string
  initialTournamentId?: string
  onCompletedChange?: (isCompleted: boolean) => void
  onNavigate?: (page: string) => void
}

export default function TournamentApplicationForm({ auth, wardId, initialTournamentId, onCompletedChange, onNavigate }: TournamentApplicationFormProps) {
  const [allTournaments, setAllTournaments] = useState<any[]>([])
  const [tournaments, setTournaments] = useState<any[]>([])
  const [allWards, setAllWards] = useState<any[]>([])
  const [availableWards, setAvailableWards] = useState<{ id: number; name: string }[]>([])
  const [players, setPlayers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showPlayerForm, setShowPlayerForm] = useState(false)
  const [newPlayerData, setNewPlayerData] = useState<any>(null)
  const [isCompleted, setIsCompleted] = useState(false)
  const [completedData, setCompletedData] = useState<any>(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [teamMemberIds, setTeamMemberIds] = useState<string[]>(['', '', ''])  // 最低3名（自分+3=4名）から開始
  const [teamMode, setTeamMode] = useState<'build' | 'join' | ''>('')
  const [isProxyRegistration, setIsProxyRegistration] = useState(false)
  const [formData, setFormData] = useState({
    discordId: '',
    wardId: wardId || '',
    tournamentId: '',
    type: '',
    pairId: '',
  })

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'
        const playersRes = await fetch(`${apiUrl}/api/players`)
        if (!playersRes.ok) throw new Error(`選手取得失敗: ${playersRes.status}`)
        setPlayers(await playersRes.json())

        const wardsRes = await fetch(`${apiUrl}/api/wards`)
        if (!wardsRes.ok) throw new Error(`地域取得失敗: ${wardsRes.status}`)
        setAllWards(await wardsRes.json())
        setError('')
      } catch (err: any) {
        setError(err.message || 'データの取得に失敗しました')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  useEffect(() => {
    const loadAvailableTournaments = async () => {
      if (!formData.discordId || allWards.length === 0) return
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'
        const tournamentsRes = await fetch(`${apiUrl}/api/tournaments/available/${formData.discordId}`)
        if (!tournamentsRes.ok) throw new Error(`大会取得失敗: ${tournamentsRes.status}`)
        const tournamentsData = await tournamentsRes.json()
        setAllTournaments(tournamentsData)

        const uniqueWardIds = [...new Set(tournamentsData.map((t: any) => t.registrated_ward))]
        const wardsArray = uniqueWardIds
          .map(wId => {
            const ward = allWards.find((w: any) => w.ward_id === wId)
            return ward ? { id: ward.ward_id, name: ward.ward_name } : null
          })
          .filter((ward): ward is { id: number; name: string } => ward !== null)
          .sort((a, b) => a.id - b.id)
        setAvailableWards(wardsArray)

        if (formData.wardId) {
          const wardIdNumber = parseInt(formData.wardId, 10)
          if (!isNaN(wardIdNumber)) {
            setTournaments(tournamentsData.filter((t: any) => t.registrated_ward === wardIdNumber))
          }
        } else {
          setTournaments([])
        }

        const playersRes = await fetch(`${apiUrl}/api/players`)
        if (playersRes.ok) setPlayers(await playersRes.json())
      } catch (err: any) {
        setError(err.message || '大会の取得に失敗しました')
      }
    }
    loadAvailableTournaments()
  }, [formData.discordId, refreshTrigger, allWards])

  useEffect(() => {
    if (initialTournamentId && allTournaments.length > 0) {
      const target = allTournaments.find((t: any) => t.tournament_id === initialTournamentId)
      if (target) {
        setFormData(prev => ({ ...prev, wardId: String(target.registrated_ward), tournamentId: initialTournamentId }))
      }
    }
  }, [initialTournamentId, allTournaments])

  useEffect(() => {
    if (formData.wardId && allTournaments.length > 0) {
      const wardIdNumber = parseInt(formData.wardId, 10)
      if (!isNaN(wardIdNumber)) {
        setTournaments(allTournaments.filter((t: any) => t.registrated_ward === wardIdNumber))
      }
    } else {
      setTournaments([])
    }
    setFormData(prev => {
      if (initialTournamentId && prev.tournamentId === initialTournamentId) return prev
      return { ...prev, tournamentId: '', type: '' }
    })
  }, [formData.wardId, allTournaments])

  const selectedTournament = tournaments.find(t => t.tournament_id === formData.tournamentId)
  const isTeamTournament = selectedTournament?.classification === 1
  const isSingles = formData.type === 'シングルス'
  const isWideArea = selectedTournament?.registrated_ward === 99  // 東京・広域
  const minTeamMembers = 3  // 自分+3=最低4名
  const maxTeamMembers = isWideArea ? 99 : 7  // 自分+7=最大8名、広域は無制限

  const getFilteredPlayers = () => {
    if (!formData.type || !selectedTournament) {
      return players.filter(p => p.discord_id !== formData.discordId)
    }
    const me = players.find(p => p.discord_id === formData.discordId)
    return filterPairCandidates(players, formData.discordId, me?.sex ?? null, formData.type, selectedTournament.tournament_date, selectedTournament.registrated_ward)
  }

  const getTeamCandidates = (slotIndex: number) => {
    const selectedIds = teamMemberIds.filter((id, i) => i !== slotIndex && id !== '')
    let base: any[]
    if (isProxyRegistration) {
      // 代理申込: 性別フィルターなし、自分も除外しない、全選手を候補に
      base = players
    } else {
      const me = players.find(p => p.discord_id === formData.discordId)
      base = filterPairCandidates(
        players, formData.discordId, me?.sex ?? null,
        formData.type || '', selectedTournament?.tournament_date, selectedTournament?.registrated_ward
      )
    }
    return base.filter(p => !selectedIds.includes(String(p.player_id)))
  }

  useEffect(() => {
    if (auth.user.id !== 'unknown' && !formData.discordId) {
      setFormData({ ...formData, discordId: auth.user.id })
    }
  }, [auth.user.id])

  const validatePlayerInfo = (player: any): string[] => {
    const issues: string[] = []
    if (!player.birth_date) issues.push('生年月日が未登録')
    if (!player.address) issues.push('住所が未登録')
    else if (!/[\d０-９]/.test(player.address)) issues.push('住所に番地がない')
    if (!player.phone_number) issues.push('電話番号が未登録')
    else {
      const digits = (player.phone_number || '').replace(/[-\s\u2010\u2011\u2012\u2013\u2014\u2015\u2212\u30FC\uFF0D\uFF70]/g, '')
        .replace(/[０-９]/g, (s: string) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
      if (digits.length < 10 || digits.length > 11) issues.push('電話番号が不正（桁数）')
      else if (!digits.startsWith('0')) issues.push('電話番号が不正')
      else if (/^(\d)\1+$/.test(digits)) issues.push('電話番号が不正')
      else {
        const seq = '01234567890'
        if (digits.length >= 10 && seq.includes(digits.slice(0, 10))) issues.push('電話番号が不正')
      }
    }
    return issues
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'

      // 申込者・ペア・チームメンバーの情報チェック
      const me = players.find(p => p.discord_id === formData.discordId)
      const meIssues = (me && !isProxyRegistration) ? validatePlayerInfo(me) : []

      let pairIssues: string[] = []
      let pairName = ''
      if (!isTeamTournament && !isSingles && formData.pairId && !showPlayerForm) {
        const pair = players.find(p => p.player_id === parseInt(formData.pairId))
        if (pair) { pairIssues = validatePlayerInfo(pair); pairName = pair.player_name || '' }
      }

      const memberErrors: { name: string; issues: string[] }[] = []
      if (isTeamTournament && teamMode === 'build') {
        for (const memberId of teamMemberIds) {
          if (!memberId) continue
          const member = players.find(p => p.player_id === parseInt(memberId))
          if (member) {
            const issues = validatePlayerInfo(member)
            if (issues.length > 0) memberErrors.push({ name: member.player_name || '', issues })
          }
        }
      }

      // エラーメッセージ組み立て
      if (meIssues.length > 0 || pairIssues.length > 0 || memberErrors.length > 0) {
        let msg = ''
        if (meIssues.length > 0 && pairIssues.length > 0) {
          msg = `申込者、ペアの${pairName}さんの情報に不備があります。\n\n【あなた】${meIssues.join('、')}\nマイページから修正してください。\n\n【${pairName}さん】${pairIssues.join('、')}\nご本人に修正していただくか、管理者に問い合わせてください。`
        } else if (meIssues.length > 0) {
          msg = `登録情報に不備があります。\n${meIssues.join('、')}\nマイページから修正してください。`
        } else if (pairIssues.length > 0) {
          msg = `ペアの${pairName}さんの情報に不備があります。\n${pairIssues.join('、')}\nご本人に修正していただくか、管理者に問い合わせてください。`
        }
        if (memberErrors.length > 0) {
          const memberMsg = memberErrors.map(m => `【${m.name}さん】${m.issues.join('、')}`).join('\n')
          msg += (msg ? '\n\n' : '') + `チームメンバーの情報に不備があります。\n${memberMsg}\nご本人に修正していただくか、管理者に問い合わせてください。`
        }
        alert(msg)
        return
      }

      if (isTeamTournament && teamMode === 'build') {
        const filledMembers = teamMemberIds.filter(id => id !== '')
        const requiredMin = isProxyRegistration ? minTeamMembers + 1 : minTeamMembers
        if (filledMembers.length < requiredMin) {
          alert(isProxyRegistration
            ? `出場メンバーを最低${requiredMin}名選択してください`
            : `チームメンバーを最低${minTeamMembers}名選択してください（自分を含めて${minTeamMembers + 1}名以上）`)
          return
        }
      }

      let pairId = formData.pairId
      let newlyRegisteredPlayerName = ''

      if (isSingles) {
        // シングルスはペア不要
        pairId = '0'
      } else if (!isTeamTournament && showPlayerForm && newPlayerData) {
        const playerResponse = await fetch(`${apiUrl}/api/players`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
        const playersRes = await fetch(`${apiUrl}/api/players`)
        setPlayers(await playersRes.json())
      } else if (!isTeamTournament && !isSingles && (!formData.pairId || formData.pairId === 'add_player')) {
        alert('選手情報を入力してください')
        return
      }

      const playerRes = await fetch(`${apiUrl}/api/players/discord/${formData.discordId}`)
      let sex = 0
      if (playerRes.ok) {
        const playerInfo = await playerRes.json()
        if (playerInfo) sex = playerInfo.sex
      }

      let registrationData: any
      if (isTeamTournament && teamMode === 'join') {
        registrationData = {
          discord_id: formData.discordId,
          tournament_id: formData.tournamentId,
          type: formData.type,
          sex: sex,
          pair1: null,
          pair2: null,
          team_status: 1,
        }
      } else if (isTeamTournament && teamMode === 'build') {
        const memberIds = teamMemberIds.filter(id => id !== '').map(id => parseInt(id))
        registrationData = {
          discord_id: formData.discordId,
          tournament_id: formData.tournamentId,
          type: formData.type,
          sex: sex,
          pair1: memberIds[0],
          pair2: memberIds.slice(1),
          team_status: 0,
        }
      } else {
        registrationData = {
          discord_id: formData.discordId,
          tournament_id: formData.tournamentId,
          type: formData.type,
          sex: sex,
          pair1: isSingles ? null : parseInt(pairId),
          pair2: null,
        }
      }

      const response = await fetch(`${apiUrl}/api/registrations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registrationData),
      })

      if (response.ok) {
        const tournament = tournaments.find(t => t.tournament_id === formData.tournamentId)
        const applicant = players.find(p => p.discord_id === formData.discordId)

        if (isTeamTournament) {
          const memberNames = teamMemberIds
            .filter(id => id !== '')
            .map(id => players.find(p => p.player_id.toString() === id)?.player_name || '不明')
          setCompletedData({
            tournamentName: tournament?.tournament_name || '',
            type: formData.type,
            isTeam: true,
            teamMembers: [applicant?.player_name || '', ...memberNames],
          })
        } else {
          const player = players.find(p => p.player_id.toString() === pairId)
          const pairPlayerName = newlyRegisteredPlayerName || player?.player_name || '新規登録選手'
          setCompletedData({
            tournamentName: tournament?.tournament_name || '',
            type: formData.type,
            pairName: pairPlayerName,
            isTeam: false,
          })
        }

        // Discord通知はバックエンドのPOST /registrationsで自動送信されるため、フロントからは不要

        setIsCompleted(true)
        if (onCompletedChange) onCompletedChange(true)
      } else {
        const errorData = await response.json()
        alert(`申込に失敗しました: ${errorData.detail || ''}`)
      }
    } catch {
      alert('通信エラーが発生しました')
    }
  }

  const inputStyle = {
    width: '100%', padding: '12px 16px', borderRadius: '8px',
    border: '1px solid #1e293b', backgroundColor: '#0c1220',
    color: '#e2e8f0', fontSize: '15px', transition: 'border-color 0.2s, box-shadow 0.2s',
  }
  const labelStyle = {
    display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: '#94a3b8'
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>読み込み中...</div>

  if (error) {
    return (
      <div style={{ padding: '20px', backgroundColor: '#7f1d1d', borderRadius: '8px', color: '#fecaca', border: '1px solid #ef4444' }}>
        エラー: {error}<br /><small>バックエンドAPIが起動しているか確認してください</small>
      </div>
    )
  }

  if (isCompleted && completedData) {
    return (
      <CompletePage
        tournamentName={completedData.tournamentName}
        type={completedData.type}
        pairName={completedData.isTeam ? undefined : completedData.pairName}
        teamMembers={completedData.isTeam ? completedData.teamMembers : undefined}
        onNavigateToEventList={onNavigate ? () => {
          if (onCompletedChange) onCompletedChange(false)
          onNavigate('event-list')
        } : undefined}
        onBackToForm={() => {
          setIsCompleted(false)
          setFormData({ ...formData, wardId: '', tournamentId: '', type: '', pairId: '' })
          setTeamMemberIds(['', '', '', '', ''])
          setShowPlayerForm(false)
          setNewPlayerData(null)
          setRefreshTrigger(prev => prev + 1)
          if (onCompletedChange) onCompletedChange(false)
        }}
      />
    )
  }

  return (
    <div>
      <div style={{ padding: '12px', backgroundColor: '#0c1220', borderRadius: '8px', marginBottom: '20px', border: '1px solid #1e293b' }}>
        <div style={{ fontSize: '13px', color: '#94a3b8' }}>
          Discord ID（テスト表示）: <span style={{ color: '#60a5fa', fontWeight: '600' }}>{formData.discordId || '取得中...'}</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* 地域選択 */}
        <div>
          <label style={labelStyle}>地域 *</label>
          <select value={formData.wardId} onChange={(e) => setFormData({ ...formData, wardId: e.target.value })} required style={inputStyle}>
            <option value="">選択してください</option>
            {availableWards.map(ward => (
              <option key={ward.id} value={ward.id}>{ward.name}</option>
            ))}
          </select>
        </div>

        {formData.wardId && tournaments.length === 0 && (
          <div style={{ padding: '12px 16px', backgroundColor: '#0c1220', borderRadius: '8px', border: '1px solid #475569', color: '#94a3b8', fontSize: '14px' }}>
            現在、選択された地域で申込可能な大会はありません
          </div>
        )}

        {/* 大会選択 */}
        <div>
          <label style={labelStyle}>大会名 *</label>
          <select
            value={formData.tournamentId}
            onChange={(e) => {
              setFormData({ ...formData, tournamentId: e.target.value, type: '', pairId: '' })
              setTeamMemberIds(['', '', ''])
            }}
            required disabled={!formData.wardId}
            style={{ ...inputStyle, opacity: !formData.wardId ? 0.5 : 1, cursor: !formData.wardId ? 'not-allowed' : 'pointer' }}
          >
            <option value="">{!formData.wardId ? '先に地域を選択してください' : '選択してください'}</option>
            {tournaments.map(t => {
              const date = t.tournament_date ? new Date(t.tournament_date) : null
              const dateStr = date ? `${date.getMonth() + 1}/${date.getDate()}` : ''
              const types = Array.isArray(t.type) ? t.type.join('・') : ''
              const classLabel = t.classification === 1 ? '【団体】' : ''
              return (
                <option key={t.tournament_id} value={t.tournament_id}>
                  {classLabel}{t.tournament_name}（{dateStr} {types}）
                </option>
              )
            })}
          </select>
        </div>

        {/* 種別選択 */}
        <div>
          <label style={labelStyle}>種別 *</label>
          <select
            value={formData.type}
            onChange={(e) => {
              setFormData({ ...formData, type: e.target.value, pairId: '' })
              setTeamMemberIds(['', '', ''])
              setShowPlayerForm(false)
              setNewPlayerData(null)
            }}
            required disabled={!selectedTournament}
            style={{ ...inputStyle, opacity: !selectedTournament ? 0.5 : 1, cursor: !selectedTournament ? 'not-allowed' : 'pointer' }}
          >
            <option value="">{!selectedTournament ? '先に大会を選択してください' : '選択してください'}</option>
            {selectedTournament && selectedTournament.type.map((t: string) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {/* 団体戦: 参加方法選択 */}
        {isTeamTournament && formData.type && (
          <div>
            <label style={labelStyle}>参加方法 *</label>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '4px' }}>
              <button type="button" onClick={() => { setTeamMode('build'); setTeamMemberIds(['', '', '']) }} style={{
                flex: 1, padding: '14px 12px', borderRadius: '8px', fontSize: '14px', fontWeight: '500',
                backgroundColor: teamMode === 'build' ? '#1e3a8a' : '#0c1220',
                color: teamMode === 'build' ? '#93c5fd' : '#94a3b8',
                border: `1px solid ${teamMode === 'build' ? '#3b82f6' : '#1e293b'}`, cursor: 'pointer', textAlign: 'center',
              }}>
                <div>自分でチームを作る</div>
                <div style={{ fontSize: '11px', marginTop: '4px', opacity: 0.7 }}>自分＋メンバーを選択</div>
              </button>
              <button type="button" onClick={() => setTeamMode('join')} style={{
                flex: 1, padding: '14px 12px', borderRadius: '8px', fontSize: '14px', fontWeight: '500',
                backgroundColor: teamMode === 'join' ? '#1e3a8a' : '#0c1220',
                color: teamMode === 'join' ? '#93c5fd' : '#94a3b8',
                border: `1px solid ${teamMode === 'join' ? '#3b82f6' : '#1e293b'}`, cursor: 'pointer', textAlign: 'center',
              }}>
                <div>参加する</div>
                <div style={{ fontSize: '11px', marginTop: '4px', opacity: 0.7 }}>チームは任せる</div>
              </button>
            </div>
          </div>
        )}

        {/* 団体戦: チームメンバー選択 / 個人戦: ペア選択 */}
        {isTeamTournament && teamMode === 'build' ? (
          <div>
            <label style={labelStyle}>チームメンバー *</label>
            <div style={{ padding: '12px', backgroundColor: '#0c1220', borderRadius: '8px', border: '1px solid #1e293b', marginBottom: '12px', fontSize: '13px', color: '#64748b' }}>
              {isProxyRegistration
                ? '出場メンバーを全員選択してください'
                : `申込者（自分）を含む${isWideArea ? '4名以上' : `${minTeamMembers + 1}〜${maxTeamMembers + 1}名`}でチームを構成します（自分以外を選択）`
              }
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', fontSize: '13px', color: '#94a3b8', cursor: 'pointer' }}>
              <input type="checkbox" checked={isProxyRegistration}
                onChange={e => { setIsProxyRegistration(e.target.checked); setTeamMemberIds(['', '', '']) }}
                style={{ cursor: 'pointer' }} />
              代理申込（自分はメンバーに含まない）
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {teamMemberIds.map((memberId, index) => (
                <div key={index} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ ...labelStyle, fontSize: '13px', marginBottom: '4px' }}>メンバー {index + 1}</label>
                    <select
                      value={memberId}
                      onChange={(e) => {
                        const newIds = [...teamMemberIds]
                        newIds[index] = e.target.value
                        setTeamMemberIds(newIds)
                      }}
                      disabled={!formData.type}
                      style={{ ...inputStyle, opacity: !formData.type ? 0.5 : 1, cursor: !formData.type ? 'not-allowed' : 'pointer' }}
                    >
                      <option value="">選択してください</option>
                      {getTeamCandidates(index).map(p => (
                        <option key={p.player_id} value={p.player_id}>{p.player_name}</option>
                      ))}
                    </select>
                  </div>
                  {teamMemberIds.length > minTeamMembers && (
                    <button type="button" onClick={() => {
                      setTeamMemberIds(prev => prev.filter((_, i) => i !== index))
                    }} style={{
                      padding: '6px 10px', borderRadius: '6px', backgroundColor: 'transparent',
                      color: '#f87171', border: '1px solid #7f1d1d', fontSize: '12px', cursor: 'pointer',
                      marginTop: '20px',
                    }}>削除</button>
                  )}
                </div>
              ))}
            </div>
            {teamMemberIds.length < maxTeamMembers && (
              <button type="button" onClick={() => setTeamMemberIds(prev => [...prev, ''])} style={{
                marginTop: '12px', padding: '8px 16px', borderRadius: '6px',
                backgroundColor: '#1e293b', color: '#94a3b8', border: '1px solid #334155',
                fontSize: '13px', cursor: 'pointer', width: '100%',
              }}>+ メンバーを追加</button>
            )}
          </div>
        ) : isTeamTournament && teamMode === 'join' ? (
          <div style={{
            padding: '16px', backgroundColor: '#0c1220', borderRadius: '8px',
            border: '1px solid #1e293b', fontSize: '14px', color: '#94a3b8',
          }}>
            チーム編成は管理者が行います。申し込むボタンを押して参加希望を登録してください。
          </div>
        ) : isTeamTournament ? (
          null
        ) : isSingles ? (
          <div style={{
            padding: '12px 16px', backgroundColor: '#0c1220', borderRadius: '8px',
            border: '1px solid #1e293b', color: '#94a3b8', fontSize: '14px',
          }}>
            シングルスのためペア選択は不要です
          </div>
        ) : (
          <>
            <div>
              <label style={labelStyle}>ペア選手 *</label>
              <select
                value={formData.pairId || (showPlayerForm ? 'add_player' : '')}
                onChange={(e) => {
                  const value = e.target.value
                  if (value === 'add_player') { setShowPlayerForm(true); setFormData({ ...formData, pairId: 'add_player' }) }
                  else { setFormData({ ...formData, pairId: value }); setShowPlayerForm(false); setNewPlayerData(null) }
                }}
                required={!showPlayerForm} disabled={!formData.type}
                style={{ ...inputStyle, opacity: !formData.type ? 0.5 : 1, cursor: !formData.type ? 'not-allowed' : 'pointer' }}
              >
                <option value="">{!formData.type ? '先に種別を選択してください' : '選択してください'}</option>
                {getFilteredPlayers().map(p => (
                  <option key={p.player_id} value={p.player_id}>{p.player_name}</option>
                ))}
                <option value="add_player">+ 選手追加</option>
              </select>
            </div>
            {showPlayerForm && (
              <div style={{ padding: '24px', backgroundColor: '#0c1220', borderRadius: '12px', border: '1px solid #1e293b' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#f1f5f9', margin: 0 }}>新規選手登録</h3>
                  <button type="button" onClick={() => setShowPlayerForm(false)}
                    style={{ padding: '6px 12px', borderRadius: '6px', backgroundColor: '#475569', color: '#fff', border: 'none', fontSize: '13px', cursor: 'pointer' }}>閉じる</button>
                </div>
                <PlayerRegistrationFormInline discordId="" onDataChange={(data) => setNewPlayerData(data)} />
              </div>
            )}
          </>
        )}

        <button type="submit" style={{
          padding: '16px', borderRadius: '8px', backgroundColor: '#3b82f6',
          color: '#fff', border: 'none', fontSize: '16px', fontWeight: '600', marginTop: '8px'
        }}>
          申し込む
        </button>
      </form>
    </div>
  )
}
