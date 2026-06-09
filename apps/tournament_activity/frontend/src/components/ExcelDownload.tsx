import { useState, useEffect } from 'react'
import type { UserPermissionInfo } from '../utils/permissions'

interface ExcelDownloadProps {
  permissionInfo: UserPermissionInfo
  discordId: string
}

export default function ExcelDownload({ permissionInfo, discordId }: ExcelDownloadProps) {
  const [tournaments, setTournaments] = useState<any[]>([])
  const [wards, setWards] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [generatedFiles, setGeneratedFiles] = useState<Record<string, string[]>>({})
  const [regCounts, setRegCounts] = useState<Record<string, number>>({})

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  useEffect(() => {
    const load = async () => {
      try {
        const [tRes, wRes] = await Promise.all([
          fetch(`${apiUrl}/api/tournaments`),
          fetch(`${apiUrl}/api/wards`),
        ])
        if (tRes.ok) {
          let data = await tRes.json()
          // 管理者は全区、それ以外はmanaged_ward_idでフィルタ
          if (permissionInfo.adminRole !== 0) {
            const pRes = await fetch(`${apiUrl}/api/players/discord/${discordId}`)
            if (pRes.ok) {
              const player = await pRes.json()
              const wardId = player?.managed_ward_id
              if (wardId != null) {
                data = data.filter((t: any) => t.registrated_ward === wardId)
              }
            }
          }
          // 当日以降の大会のみ、開催日昇順で表示
          const today = new Date(); today.setHours(0, 0, 0, 0)
          data = data
            .filter((t: any) => {
              if (!t.tournament_date) return false
              const d = new Date(t.tournament_date); d.setHours(0, 0, 0, 0)
              return d.getTime() >= today.getTime()
            })
            .sort((a: any, b: any) => (a.tournament_date || '').localeCompare(b.tournament_date || ''))
          setTournaments(data)
        }
        if (wRes.ok) setWards(await wRes.json())
      } catch {} finally { setLoading(false) }
    }
    load()
  }, [])

  const getWardName = (id: number) => wards.find(w => w.ward_id === id)?.ward_name || `ID:${id}`

  const formatDate = (d: string | null) => {
    if (!d) return '-'
    const dt = new Date(d)
    return `${dt.getFullYear()}/${dt.getMonth() + 1}/${dt.getDate()}`
  }

  const handleGenerate = async (tournamentId: string) => {
    setGenerating(tournamentId)
    setMessage('')
    try {
      const res = await fetch(`${apiUrl}/api/excel/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournament_id: tournamentId }),
      })
      const result = await res.json()
      if (res.ok && result.success) {
        const fileUrls = result.file_urls || {}
        const filenames: string[] = []
        if (result.file_paths) {
          Object.values(result.file_paths).forEach((p: any) => {
            const name = String(p).split('/').pop()
            if (name) filenames.push(name)
          })
        }
        // file_urlsからファイル名を抽出
        Object.values(fileUrls).forEach((url: any) => {
          const name = String(url).split('/').pop()?.split('?')[0]
          if (name && !filenames.includes(name)) filenames.push(name)
        })
        setGeneratedFiles(prev => ({ ...prev, [tournamentId]: filenames }))
        setMessage('申込書を生成しました')
        // ファイル一覧を再取得
        loadFiles(tournamentId)
      } else {
        setMessage(`生成失敗: ${result.detail || result.error || '申込データがありません'}`)
      }
    } catch { setMessage('通信エラー') }
    finally { setGenerating(null) }
  }

  const loadFiles = async (tournamentId: string) => {
    try {
      const res = await fetch(`${apiUrl}/api/excel/files/${tournamentId}`)
      if (res.ok) {
        const data = await res.json()
        const filenames = data.files?.map((f: any) => f.filename) || []
        setGeneratedFiles(prev => ({ ...prev, [tournamentId]: filenames }))
      }
    } catch {}
  }

  const handleDownload = (filename: string) => {
    window.open(`${apiUrl}/api/excel/download/${encodeURIComponent(filename)}`, '_blank')
  }

  const handleDelete = async (tournamentId: string, filename: string) => {
    if (!confirm(`「${filename}」を削除しますか？`)) return
    try {
      const res = await fetch(`${apiUrl}/api/excel/files/${encodeURIComponent(filename)}`, { method: 'DELETE' })
      if (res.ok) {
        setGeneratedFiles(prev => ({
          ...prev,
          [tournamentId]: (prev[tournamentId] || []).filter(f => f !== filename),
        }))
        setMessage('ファイルを削除しました')
      } else {
        const e = await res.json().catch(() => ({}))
        setMessage(`削除失敗: ${e.detail || ''}`)
      }
    } catch { setMessage('通信エラー') }
  }

  // 初回ロード時にファイル一覧と申込件数を取得
  useEffect(() => {
    if (tournaments.length > 0) {
      tournaments.forEach(async t => {
        loadFiles(t.tournament_id)
        try {
          const res = await fetch(`${apiUrl}/api/registrations/tournament/${t.tournament_id}`)
          if (res.ok) {
            const data = await res.json()
            setRegCounts(prev => ({ ...prev, [t.tournament_id]: data.length }))
          }
        } catch {}
      })
    }
  }, [tournaments])

  if (loading) return <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>読み込み中...</div>

  const cellStyle = { padding: '10px 12px', borderBottom: '1px solid #1e293b', fontSize: '13px', color: '#e2e8f0' }
  const headerCellStyle = { ...cellStyle, color: '#64748b', fontSize: '12px', fontWeight: '600' as const, backgroundColor: '#070e1b', borderBottom: '2px solid #1e293b' }

  return (
    <div>
      <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#e2e8f0', marginBottom: '16px' }}>
        申込書ダウンロード
      </h2>

      {message && (
        <div style={{
          padding: '10px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px',
          backgroundColor: message.includes('失敗') || message.includes('エラー') ? '#7f1d1d' : '#064e3b',
          color: '#e2e8f0',
          border: `1px solid ${message.includes('失敗') || message.includes('エラー') ? '#ef4444' : '#10b981'}`,
        }}>
          {message}
        </div>
      )}

      {/* PC: テーブル */}
      <div className="excel-table" style={{ borderRadius: '10px', border: '1px solid #1e293b', overflow: 'auto', backgroundColor: '#0c1220' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            <th style={headerCellStyle}>大会名</th>
            <th style={headerCellStyle}>主催</th>
            <th style={headerCellStyle}>開催日</th>
            <th style={{ ...headerCellStyle, textAlign: 'center' }}>生成</th>
            <th style={headerCellStyle}>ダウンロード</th>
          </tr></thead>
          <tbody>
            {tournaments.map(t => {
              const files = generatedFiles[t.tournament_id] || []
              const count = regCounts[t.tournament_id] ?? 0
              const noRegs = count === 0
              return (
                <tr key={t.tournament_id}>
                  <td style={{ ...cellStyle, fontWeight: '500', whiteSpace: 'normal' as const, minWidth: '140px' }}>{t.tournament_name}</td>
                  <td style={{ ...cellStyle, whiteSpace: 'nowrap' as const }}>{getWardName(t.registrated_ward)}</td>
                  <td style={{ ...cellStyle, whiteSpace: 'nowrap' as const }}>{formatDate(t.tournament_date)}</td>
                  <td style={{ ...cellStyle, textAlign: 'center', whiteSpace: 'nowrap' as const }}>
                    {(() => {
                      const hasFiles = files.length > 0
                      const btnLabel = generating === t.tournament_id
                        ? (hasFiles ? '再生成中...' : '生成中...')
                        : noRegs
                          ? '申込なし'
                          : hasFiles
                            ? `再生成（${count}件）`
                            : `生成（${count}件）`
                      return (
                        <button
                          onClick={() => handleGenerate(t.tournament_id)}
                          disabled={generating === t.tournament_id || noRegs}
                          title={noRegs ? '申込がありません' : (hasFiles ? '既存ファイルを置き換えて再生成します' : '')}
                          style={{
                            padding: '4px 14px', borderRadius: '5px',
                            backgroundColor: noRegs ? '#1e293b' : hasFiles ? '#78350f' : '#064e3b',
                            color: noRegs ? '#475569' : hasFiles ? '#fbbf24' : '#6ee7b7',
                            border: `1px solid ${noRegs ? '#334155' : hasFiles ? '#a16207' : '#10b981'}`,
                            fontSize: '12px',
                            cursor: (generating === t.tournament_id || noRegs) ? 'not-allowed' : 'pointer',
                            opacity: generating === t.tournament_id ? 0.5 : 1,
                          }}
                        >{btnLabel}</button>
                      )
                    })()}
                  </td>
                  <td style={cellStyle}>
                    {files.length === 0 ? (
                      <span style={{ color: '#64748b', fontSize: '12px' }}>未生成</span>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {files.map(f => (
                          <div key={f} style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                            <button onClick={() => handleDownload(f)} style={{
                              flex: 1, padding: '2px 10px', borderRadius: '4px', backgroundColor: '#1e3a8a', color: '#93c5fd',
                              border: '1px solid #2563eb', fontSize: '11px', cursor: 'pointer', textAlign: 'left',
                            }}>{f}</button>
                            <button onClick={() => handleDelete(t.tournament_id, f)} title="削除" style={{
                              padding: '2px 8px', borderRadius: '4px', backgroundColor: 'transparent', color: '#f87171',
                              border: '1px solid #7f1d1d', fontSize: '11px', cursor: 'pointer',
                            }}>✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* スマホ用カード */}
      <div className="excel-cards" style={{ display: 'none', flexDirection: 'column', gap: '10px' }}>
        {tournaments.map(t => {
          const files = generatedFiles[t.tournament_id] || []
          const count = regCounts[t.tournament_id] ?? 0
          const noRegs = count === 0
          return (
            <div key={t.tournament_id} style={{
              padding: '14px 16px', backgroundColor: '#0c1220', borderRadius: '10px', border: '1px solid #1e293b',
            }}>
              <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#f1f5f9', margin: '0 0 6px' }}>{t.tournament_name}</h3>
              <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '10px' }}>
                {getWardName(t.registrated_ward)} / {formatDate(t.tournament_date)}
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {(() => {
                  const hasFiles = files.length > 0
                  const btnLabel = generating === t.tournament_id
                    ? (hasFiles ? '再生成中...' : '生成中...')
                    : noRegs ? '申込なし' : hasFiles ? `再生成（${count}件）` : `生成（${count}件）`
                  return (
                    <button onClick={() => handleGenerate(t.tournament_id)} disabled={generating === t.tournament_id || noRegs} style={{
                      padding: '6px 14px', borderRadius: '5px',
                      backgroundColor: noRegs ? '#1e293b' : hasFiles ? '#78350f' : '#064e3b',
                      color: noRegs ? '#475569' : hasFiles ? '#fbbf24' : '#6ee7b7',
                      border: `1px solid ${noRegs ? '#334155' : hasFiles ? '#a16207' : '#10b981'}`,
                      fontSize: '12px', cursor: noRegs ? 'not-allowed' : 'pointer',
                    }}>{btnLabel}</button>
                  )
                })()}
                {files.map(f => (
                  <div key={f} style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <button onClick={() => handleDownload(f)} style={{
                      padding: '6px 10px', borderRadius: '5px', backgroundColor: '#1e3a8a', color: '#93c5fd',
                      border: '1px solid #2563eb', fontSize: '11px', cursor: 'pointer',
                    }}>{f}</button>
                    <button onClick={() => handleDelete(t.tournament_id, f)} title="削除" style={{
                      padding: '6px 8px', borderRadius: '5px', backgroundColor: 'transparent', color: '#f87171',
                      border: '1px solid #7f1d1d', fontSize: '11px', cursor: 'pointer',
                    }}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <style>{`
        @media (max-width: 640px) {
          .excel-table { display: none !important; }
          .excel-cards { display: flex !important; }
        }
      `}</style>
    </div>
  )
}
