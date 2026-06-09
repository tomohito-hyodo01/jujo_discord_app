import { useState, useEffect, Fragment } from 'react'
import { filterPairCandidates } from '../utils/playerFilter'

interface MyRegistrationsProps {
  discordId: string
  onNavigate: (page: string, tournamentId?: string) => void
}

export default function MyRegistrations({ discordId, onNavigate }: MyRegistrationsProps) {
  const [registrations, setRegistrations] = useState<any[]>([])
  const [tournaments, setTournaments] = useState<any[]>([])
  const [players, setPlayers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [cancellingId, setCancellingId] = useState<number | null>(null)
  const [editingPairId, setEditingPairId] = useState<number | null>(null)
  const [updatingPairId, setUpdatingPairId] = useState<number | null>(null)
  const [editingTeamMembers, setEditingTeamMembers] = useState<string[]>([])
  const [savingTeamId, setSavingTeamId] = useState<number | null>(null)

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  const loadData = async () => {
    try {
      const [regRes, tourRes, playerRes] = await Promise.all([
        fetch(`${apiUrl}/api/registrations/user/${discordId}`),
        fetch(`${apiUrl}/api/tournaments`),
        fetch(`${apiUrl}/api/players`),
      ])

      if (regRes.ok) setRegistrations(await regRes.json())
      if (tourRes.ok) setTournaments(await tourRes.json())
      if (playerRes.ok) setPlayers(await playerRes.json())
    } catch {
      // エラー時は空
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [discordId])

  const getTournament = (id: string) => tournaments.find(t => t.tournament_id === id)
  const getPlayer = (id: number) => players.find(p => p.player_id === id)

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    const d = new Date(dateStr)
    return `${d.getMonth() + 1}/${d.getDate()}`
  }

  const isBeforeDeadline = (tournament: any) => {
    if (!tournament?.deadline_date) return false
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const deadline = new Date(tournament.deadline_date)
    deadline.setHours(0, 0, 0, 0)
    return today <= deadline
  }

  const handlePairChange = async (registrationId: number, newPairId: number) => {
    setUpdatingPairId(registrationId)
    try {
      const res = await fetch(`${apiUrl}/api/registrations/${registrationId}/pair`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pair1: newPairId })
      })
      if (res.ok) {
        setRegistrations(prev => prev.map(r => r.registration_id === registrationId ? { ...r, pair1: newPairId } : r))
        setEditingPairId(null)
      } else {
        const err = await res.json()
        alert(`ペア変更に失敗しました: ${err.detail || ''}`)
      }
    } catch {
      alert('通信エラーが発生しました')
    } finally {
      setUpdatingPairId(null)
    }
  }

  const handleCancel = async (registrationId: number, tournamentName: string) => {
    if (!confirm(`「${tournamentName}」の申込をキャンセルしますか？`)) return

    setCancellingId(registrationId)
    try {
      const res = await fetch(`${apiUrl}/api/registrations/${registrationId}`, { method: 'DELETE' })
      if (res.ok) {
        setRegistrations(prev => prev.filter(r => r.registration_id !== registrationId))
      } else {
        const err = await res.json()
        alert(`キャンセルに失敗しました: ${err.detail || ''}`)
      }
    } catch {
      alert('通信エラーが発生しました')
    } finally {
      setCancellingId(null)
    }
  }

  // --- 団体戦チーム変更 ---

  const startTeamEdit = (reg: any) => {
    const currentMembers: string[] = []
    if (reg.pair1) currentMembers.push(String(reg.pair1))
    if (Array.isArray(reg.pair2)) {
      reg.pair2.forEach((id: number) => currentMembers.push(String(id)))
    }
    while (currentMembers.length < 3) currentMembers.push('')
    setEditingTeamMembers(currentMembers)
    setEditingPairId(reg.registration_id)
  }

  const cancelTeamEdit = () => {
    setEditingPairId(null)
    setEditingTeamMembers([])
  }

  const getTeamEditCandidates = (reg: any, slotIndex: number) => {
    const tournament = getTournament(reg.tournament_id)
    const selectedIds = editingTeamMembers.filter((id, i) => i !== slotIndex && id !== '')
    const me = players.find(p => p.discord_id === discordId)
    const base = filterPairCandidates(
      players, discordId, me?.sex ?? null,
      reg.type || '', tournament?.tournament_date, tournament?.registrated_ward
    )
    return base.filter(p => !selectedIds.includes(String(p.player_id)))
  }

  const handleTeamSave = async (registrationId: number) => {
    const filledMembers = editingTeamMembers.filter(id => id !== '')
    if (filledMembers.length < 3) {
      alert('チームメンバーを最低3名選択してください（自分を含めて4名以上）')
      return
    }

    setSavingTeamId(registrationId)
    try {
      const memberIds = filledMembers.map(id => parseInt(id))
      const res = await fetch(`${apiUrl}/api/registrations/${registrationId}/team`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pair1: memberIds[0], pair2: memberIds.slice(1) }),
      })
      if (res.ok) {
        setRegistrations(prev => prev.map(r =>
          r.registration_id === registrationId
            ? { ...r, pair1: memberIds[0], pair2: memberIds.slice(1) }
            : r
        ))
        cancelTeamEdit()
      } else {
        const err = await res.json()
        alert(`チーム変更に失敗しました: ${err.detail || ''}`)
      }
    } catch {
      alert('通信エラーが発生しました')
    } finally {
      setSavingTeamId(null)
    }
  }

  const renderTeamEditPanel = (reg: any) => {
    const tournament = getTournament(reg.tournament_id)
    const isWideArea = tournament?.registrated_ward === 99
    const minMembers = 3
    const maxMembers = isWideArea ? 99 : 7

    return (
      <div style={{
        padding: '16px', backgroundColor: '#0f172a',
        borderRadius: '8px', border: '1px solid #1e293b',
      }}>
        <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '12px' }}>
          自分以外のチームメンバーを選択（{isWideArea ? '3名以上' : `${minMembers}〜${maxMembers}名`}）
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {editingTeamMembers.map((memberId, index) => (
            <div key={index} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: '#64748b', minWidth: '24px' }}>
                {index + 1}.
              </span>
              <select
                value={memberId}
                onChange={(e) => {
                  const newIds = [...editingTeamMembers]
                  newIds[index] = e.target.value
                  setEditingTeamMembers(newIds)
                }}
                style={{
                  flex: 1, padding: '8px 12px', borderRadius: '6px',
                  backgroundColor: '#0c1220', color: '#e2e8f0',
                  border: '1px solid #334155', fontSize: '13px',
                }}
              >
                <option value="">選択してください</option>
                {getTeamEditCandidates(reg, index).map(p => (
                  <option key={p.player_id} value={p.player_id}>{p.player_name}</option>
                ))}
              </select>
              {editingTeamMembers.length > minMembers && (
                <button
                  onClick={() => setEditingTeamMembers(prev => prev.filter((_, i) => i !== index))}
                  style={{
                    padding: '4px 10px', borderRadius: '5px',
                    backgroundColor: 'transparent', color: '#f87171',
                    border: '1px solid #7f1d1d', fontSize: '12px',
                    cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  削除
                </button>
              )}
            </div>
          ))}
        </div>
        {editingTeamMembers.length < maxMembers && (
          <button
            onClick={() => setEditingTeamMembers(prev => [...prev, ''])}
            style={{
              marginTop: '8px', padding: '6px 14px', borderRadius: '6px',
              backgroundColor: '#1e293b', color: '#94a3b8',
              border: '1px solid #334155', fontSize: '12px',
              cursor: 'pointer', width: '100%',
            }}
          >
            + メンバーを追加
          </button>
        )}
        <div style={{ display: 'flex', gap: '8px', marginTop: '12px', justifyContent: 'flex-end' }}>
          <button
            onClick={cancelTeamEdit}
            style={{
              padding: '6px 16px', borderRadius: '6px',
              backgroundColor: 'transparent', color: '#94a3b8',
              border: '1px solid #334155', fontSize: '13px', cursor: 'pointer',
            }}
          >
            キャンセル
          </button>
          <button
            onClick={() => handleTeamSave(reg.registration_id)}
            disabled={savingTeamId === reg.registration_id}
            style={{
              padding: '6px 20px', borderRadius: '6px',
              backgroundColor: '#1e3a8a', color: '#93c5fd',
              border: '1px solid #2563eb', fontSize: '13px',
              cursor: savingTeamId === reg.registration_id ? 'not-allowed' : 'pointer',
              opacity: savingTeamId === reg.registration_id ? 0.5 : 1,
            }}
          >
            {savingTeamId === reg.registration_id ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    )
  }

  // --- ここまで団体戦チーム変更 ---

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>読み込み中...</div>
  }

  const cellStyle = {
    padding: '10px 12px',
    borderBottom: '1px solid #1e293b',
    fontSize: '13px',
    color: '#e2e8f0',
    whiteSpace: 'nowrap' as const,
  }

  const headerCellStyle = {
    ...cellStyle,
    color: '#64748b',
    fontSize: '12px',
    fontWeight: '600' as const,
    backgroundColor: '#070e1b',
    borderBottom: '2px solid #1e293b',
  }

  // 個人戦・団体戦に分類
  const individualRegs = registrations.filter(r => {
    const t = getTournament(r.tournament_id)
    return !t || t.classification === 0
  })
  const teamRegs = registrations.filter(r => {
    const t = getTournament(r.tournament_id)
    return t && t.classification === 1
  })

  // 共通のレコード情報を計算
  const getRegInfo = (reg: any) => {
    const tournament = getTournament(reg.tournament_id)
    const isApplicant = reg.is_applicant !== false
    const isTeam = tournament?.classification === 1
    const isJoinOnly = reg.team_status === 1
    const pairPlayer = isApplicant
      ? getPlayer(reg.pair1)
      : players.find(p => p.discord_id === reg.discord_id)
    const teamMembers = isTeam && reg.pair1
      ? [reg.pair1, ...(Array.isArray(reg.pair2) ? reg.pair2 : [])]
          .map((id: number) => getPlayer(id)?.player_name)
          .filter(Boolean)
      : []
    const tournamentName = tournament?.tournament_name || reg.tournament_id
    const isPast = tournament && new Date(tournament.tournament_date) < new Date()
    const canEdit = !isPast && isBeforeDeadline(tournament) && isApplicant
    const isEditingThis = editingPairId === reg.registration_id
    return {
      tournament, isApplicant, isTeam, isJoinOnly,
      pairPlayer, teamMembers, tournamentName, isPast, canEdit, isEditingThis,
    }
  }

  // PC行のレンダリング
  const renderTableRow = (reg: any) => {
    const {
      tournament, isApplicant, isTeam, isJoinOnly,
      pairPlayer, teamMembers, tournamentName, isPast, canEdit, isEditingThis,
    } = getRegInfo(reg)

    const memberLabel = isTeam
      ? (isJoinOnly ? '参加希望（チーム未定）' : teamMembers.join('、') || '-')
      : (pairPlayer?.player_name || '-')

    return (
      <Fragment key={reg.registration_id}>
        <tr>
          <td style={{ ...cellStyle, fontWeight: '500', whiteSpace: 'normal', minWidth: '140px' }}>
            {tournamentName}
            {!isApplicant && (
              <span style={{
                marginLeft: '6px', fontSize: '11px', color: '#60a5fa',
                backgroundColor: '#1e3a8a', padding: '1px 6px', borderRadius: '4px',
              }}>
                {isTeam ? 'メンバー' : 'ペア'}
              </span>
            )}
          </td>
          <td style={cellStyle}>{reg.type}</td>
          <td style={cellStyle}>
            {tournament ? formatDate(tournament.tournament_date) : '-'}
          </td>
          <td style={{ ...cellStyle, whiteSpace: 'normal' as const, maxWidth: '200px' }}>
            {isEditingThis && !isTeam ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <select
                  defaultValue={reg.pair1}
                  onChange={(e) => handlePairChange(reg.registration_id, parseInt(e.target.value))}
                  disabled={updatingPairId === reg.registration_id}
                  style={{
                    padding: '4px 8px', borderRadius: '5px',
                    backgroundColor: '#0f172a', color: '#e2e8f0',
                    border: '1px solid #334155', fontSize: '12px',
                    maxWidth: '120px',
                  }}
                >
                  {(() => {
                    const me = players.find(pl => pl.discord_id === discordId)
                    return filterPairCandidates(
                      players, discordId, me?.sex ?? null,
                      reg.type, tournament?.tournament_date, tournament?.registrated_ward
                    ).map(p => (
                      <option key={p.player_id} value={p.player_id}>{p.player_name}</option>
                    ))
                  })()}
                </select>
                <button
                  onClick={() => setEditingPairId(null)}
                  style={{
                    padding: '3px 8px', borderRadius: '5px',
                    backgroundColor: 'transparent', color: '#94a3b8',
                    border: '1px solid #334155', fontSize: '11px', cursor: 'pointer',
                  }}
                >
                  戻る
                </button>
              </div>
            ) : (
              <span style={{ fontSize: '12px' }}>{memberLabel}</span>
            )}
          </td>
          <td style={{ ...cellStyle, textAlign: 'center' }}>
            {isPast ? (
              <span style={{ fontSize: '12px', color: '#64748b' }}>終了</span>
            ) : isApplicant ? (
              <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                {canEdit && !isEditingThis && !(isTeam && isJoinOnly) && (
                  <button
                    onClick={() => isTeam ? startTeamEdit(reg) : setEditingPairId(reg.registration_id)}
                    style={{
                      padding: '4px 10px', borderRadius: '5px',
                      backgroundColor: 'transparent', color: '#60a5fa',
                      border: '1px solid #1e3a8a', fontSize: '12px', cursor: 'pointer',
                    }}
                  >
                    {isTeam ? 'チーム変更' : 'ペア変更'}
                  </button>
                )}
                <button
                  onClick={() => handleCancel(reg.registration_id, tournamentName)}
                  disabled={cancellingId === reg.registration_id}
                  style={{
                    padding: '4px 12px', borderRadius: '5px',
                    backgroundColor: 'transparent', color: '#f87171',
                    border: '1px solid #7f1d1d', fontSize: '12px',
                    cursor: cancellingId === reg.registration_id ? 'not-allowed' : 'pointer',
                    opacity: cancellingId === reg.registration_id ? 0.5 : 1,
                  }}
                >
                  {cancellingId === reg.registration_id ? '...' : 'キャンセル'}
                </button>
              </div>
            ) : (
              <span style={{ fontSize: '12px', color: '#64748b' }}>-</span>
            )}
          </td>
        </tr>
        {isEditingThis && isTeam && (
          <tr>
            <td colSpan={5} style={{
              padding: '0 12px 12px',
              borderBottom: '1px solid #1e293b',
              backgroundColor: '#0c1220',
            }}>
              {renderTeamEditPanel(reg)}
            </td>
          </tr>
        )}
      </Fragment>
    )
  }

  // スマホカードのレンダリング
  const renderCard = (reg: any) => {
    const {
      tournament, isApplicant, isTeam, isJoinOnly,
      pairPlayer, teamMembers, tournamentName, isPast, canEdit, isEditingThis,
    } = getRegInfo(reg)

    const memberLabel = isTeam
      ? (isJoinOnly ? '参加希望' : teamMembers.join('、') || '-')
      : (pairPlayer?.player_name || '-')

    return (
      <div key={reg.registration_id} style={{
        padding: '14px 16px', backgroundColor: '#0c1220',
        borderRadius: '10px', border: '1px solid #1e293b',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#f1f5f9', margin: 0, flex: 1 }}>
            {tournamentName}
            {!isApplicant && (
              <span style={{
                marginLeft: '6px', fontSize: '11px', color: '#60a5fa',
                backgroundColor: '#1e3a8a', padding: '1px 6px', borderRadius: '4px',
                fontWeight: '400',
              }}>
                {isTeam ? 'メンバー' : 'ペア'}
              </span>
            )}
          </h3>
          {isPast ? (
            <span style={{ fontSize: '12px', color: '#64748b', marginLeft: '8px' }}>終了</span>
          ) : isApplicant ? (
            <div style={{ display: 'flex', gap: '6px', marginLeft: '8px', flexShrink: 0 }}>
              {canEdit && !isEditingThis && !(isTeam && isJoinOnly) && (
                <button
                  onClick={() => isTeam ? startTeamEdit(reg) : setEditingPairId(reg.registration_id)}
                  style={{
                    padding: '4px 10px', borderRadius: '5px',
                    backgroundColor: 'transparent', color: '#60a5fa',
                    border: '1px solid #1e3a8a', fontSize: '12px', cursor: 'pointer',
                  }}
                >
                  {isTeam ? 'チーム変更' : 'ペア変更'}
                </button>
              )}
              <button
                onClick={() => handleCancel(reg.registration_id, tournamentName)}
                disabled={cancellingId === reg.registration_id}
                style={{
                  padding: '4px 10px', borderRadius: '5px',
                  backgroundColor: 'transparent', color: '#f87171',
                  border: '1px solid #7f1d1d', fontSize: '12px', cursor: 'pointer',
                }}
              >
                キャンセル
              </button>
            </div>
          ) : null}
        </div>
        {isEditingThis && !isTeam && (
          <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <select
              defaultValue={reg.pair1}
              onChange={(e) => handlePairChange(reg.registration_id, parseInt(e.target.value))}
              disabled={updatingPairId === reg.registration_id}
              style={{
                padding: '6px 10px', borderRadius: '6px', flex: 1,
                backgroundColor: '#0f172a', color: '#e2e8f0',
                border: '1px solid #334155', fontSize: '13px',
              }}
            >
              {(() => {
                const me = players.find(pl => pl.discord_id === discordId)
                return filterPairCandidates(
                  players, discordId, me?.sex ?? null,
                  reg.type, tournament?.tournament_date, tournament?.registrated_ward
                ).map(p => (
                  <option key={p.player_id} value={p.player_id}>{p.player_name}</option>
                ))
              })()}
            </select>
            <button
              onClick={() => setEditingPairId(null)}
              style={{
                padding: '5px 10px', borderRadius: '5px',
                backgroundColor: 'transparent', color: '#94a3b8',
                border: '1px solid #334155', fontSize: '12px', cursor: 'pointer',
              }}
            >
              戻る
            </button>
          </div>
        )}
        {isEditingThis && isTeam && (
          <div style={{ marginBottom: '8px' }}>
            {renderTeamEditPanel(reg)}
          </div>
        )}
        <div style={{ display: 'flex', gap: '14px', fontSize: '13px', color: '#94a3b8', flexWrap: 'wrap' }}>
          <span><span style={{ color: '#64748b' }}>種別 </span>{reg.type}</span>
          <span><span style={{ color: '#64748b' }}>開催 </span>{tournament ? formatDate(tournament.tournament_date) : '-'}</span>
          <span>
            <span style={{ color: '#64748b' }}>{isTeam ? 'メンバー ' : 'ペア '}</span>
            {memberLabel}
          </span>
        </div>
      </div>
    )
  }

  // ブロックレンダリング
  const renderBlock = (title: string, regs: any[], pairHeader: string) => {
    if (regs.length === 0) return null
    return (
      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#e2e8f0', marginBottom: '10px' }}>
          {title}
        </h3>

        {/* PC: テーブル */}
        <div className="reg-table" style={{
          borderRadius: '10px', border: '1px solid #1e293b',
          overflow: 'auto', backgroundColor: '#0c1220',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={headerCellStyle}>大会名</th>
                <th style={headerCellStyle}>種別</th>
                <th style={headerCellStyle}>開催日</th>
                <th style={headerCellStyle}>{pairHeader}</th>
                <th style={{ ...headerCellStyle, textAlign: 'center' }}></th>
              </tr>
            </thead>
            <tbody>{regs.map(renderTableRow)}</tbody>
          </table>
        </div>

        {/* スマホ: カード */}
        <div className="reg-cards" style={{ display: 'none', flexDirection: 'column', gap: '10px' }}>
          {regs.map(renderCard)}
        </div>
      </div>
    )
  }

  return (
    <div>
      <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#e2e8f0', marginBottom: '20px' }}>
        申込履歴
      </h2>

      {registrations.length === 0 ? (
        <div style={{
          padding: '40px', textAlign: 'center', color: '#94a3b8',
          backgroundColor: '#0c1220', borderRadius: '12px', border: '1px solid #1e293b'
        }}>
          <p>申込履歴はありません</p>
          <button
            onClick={() => onNavigate('apply')}
            style={{
              marginTop: '16px', padding: '8px 20px', borderRadius: '6px',
              backgroundColor: '#1e3a8a', color: '#93c5fd', border: '1px solid #2563eb',
              fontSize: '13px', cursor: 'pointer',
            }}
          >
            大会に申し込む
          </button>
        </div>
      ) : (
        <>
          {renderBlock('個人戦', individualRegs, 'ペア')}
          {renderBlock('団体戦', teamRegs, 'メンバー')}
        </>
      )}

      <style>{`
        @media (max-width: 640px) {
          .reg-table { display: none !important; }
          .reg-cards { display: flex !important; }
        }
      `}</style>
    </div>
  )
}
