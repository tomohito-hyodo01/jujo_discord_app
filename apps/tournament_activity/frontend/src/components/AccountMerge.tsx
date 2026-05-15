import { useState, useEffect } from 'react'

interface AccountMergeProps {
  discordId: string
}

interface DuplicatePair {
  id1: number
  name1: string
  discord1: string | null
  birth1: string | null
  id2: number
  name2: string
  discord2: string | null
  birth2: string | null
}

export default function AccountMerge({ discordId: _discordId }: AccountMergeProps) {
  const [duplicates, setDuplicates] = useState<DuplicatePair[]>([])
  const [loading, setLoading] = useState(true)
  const [merging, setMerging] = useState(false)
  const [confirmTarget, setConfirmTarget] = useState<DuplicatePair | null>(null)
  const [keepId, setKeepId] = useState<number | null>(null)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  const loadDuplicates = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${apiUrl}/api/players/duplicates`)
      if (res.ok) {
        setDuplicates(await res.json())
      }
    } catch {
      setMessage({ text: '重複データの取得に失敗しました', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDuplicates()
  }, [])

  const openConfirm = (pair: DuplicatePair) => {
    // デフォルト: Discord IDを持つ方を残す
    if (pair.discord1 && !pair.discord2) {
      setKeepId(pair.id1)
    } else if (pair.discord2 && !pair.discord1) {
      setKeepId(pair.id2)
    } else {
      setKeepId(pair.id1)
    }
    setConfirmTarget(pair)
  }

  const handleMerge = async () => {
    if (!confirmTarget || !keepId) return
    const removeId = keepId === confirmTarget.id1 ? confirmTarget.id2 : confirmTarget.id1
    setMerging(true)
    setMessage(null)
    try {
      const res = await fetch(`${apiUrl}/api/players/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keep_id: keepId, remove_id: removeId }),
      })
      if (res.ok) {
        const data = await res.json()
        setMessage({ text: data.message || '統合が完了しました', type: 'success' })
        setConfirmTarget(null)
        await loadDuplicates()
      } else {
        const err = await res.json().catch(() => ({}))
        setMessage({ text: err.detail || '統合に失敗しました', type: 'error' })
      }
    } catch {
      setMessage({ text: '通信エラーが発生しました', type: 'error' })
    } finally {
      setMerging(false)
    }
  }

  const formatBirth = (d: string | null) => {
    if (!d) return '-'
    return d
  }

  return (
    <div>
      <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#f1f5f9', marginBottom: '8px' }}>
        アカウント統合
      </h2>
      <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '24px' }}>
        同名の選手レコードを検出し、重複アカウントを統合します。
      </p>

      {message && (
        <div style={{
          padding: '12px 16px', borderRadius: '8px', marginBottom: '16px',
          backgroundColor: message.type === 'success' ? '#064e3b' : '#7f1d1d',
          border: `1px solid ${message.type === 'success' ? '#059669' : '#dc2626'}`,
          color: message.type === 'success' ? '#6ee7b7' : '#fca5a5',
          fontSize: '13px',
        }}>
          {message.text}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>
          読み込み中...
        </div>
      ) : duplicates.length === 0 ? (
        <div style={{
          padding: '40px', textAlign: 'center', borderRadius: '10px',
          backgroundColor: '#0c1220', border: '1px solid #1e293b',
        }}>
          <div style={{ fontSize: '15px', color: '#94a3b8' }}>
            重複の可能性がある選手は見つかりませんでした
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>
            {duplicates.length}件の重複候補が見つかりました
          </div>
          {duplicates.map((pair) => (
            <div key={`${pair.id1}-${pair.id2}`} style={{
              borderRadius: '10px', backgroundColor: '#0c1220',
              border: '1px solid #1e293b', overflow: 'hidden',
            }}>
              <div style={{
                display: 'flex', flexDirection: 'column', gap: '0',
              }}>
                {/* Player 1 */}
                <div style={{
                  padding: '14px 16px', display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', borderBottom: '1px solid #1e293b',
                }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#e2e8f0', marginBottom: '4px' }}>
                      {pair.name1}
                      <span style={{ fontSize: '11px', color: '#475569', marginLeft: '8px' }}>
                        ID: {pair.id1}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: '#94a3b8' }}>
                      <span>Discord: {pair.discord1 || '未登録'}</span>
                      <span>生年月日: {formatBirth(pair.birth1)}</span>
                    </div>
                  </div>
                  {pair.discord1 && (
                    <span style={{
                      padding: '2px 8px', borderRadius: '6px', fontSize: '11px',
                      backgroundColor: '#1e3a8a', color: '#93c5fd',
                    }}>Discord連携済</span>
                  )}
                </div>

                {/* Player 2 */}
                <div style={{
                  padding: '14px 16px', display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#e2e8f0', marginBottom: '4px' }}>
                      {pair.name2}
                      <span style={{ fontSize: '11px', color: '#475569', marginLeft: '8px' }}>
                        ID: {pair.id2}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: '#94a3b8' }}>
                      <span>Discord: {pair.discord2 || '未登録'}</span>
                      <span>生年月日: {formatBirth(pair.birth2)}</span>
                    </div>
                  </div>
                  {pair.discord2 && (
                    <span style={{
                      padding: '2px 8px', borderRadius: '6px', fontSize: '11px',
                      backgroundColor: '#1e3a8a', color: '#93c5fd',
                    }}>Discord連携済</span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div style={{
                padding: '10px 16px', borderTop: '1px solid #1e293b',
                backgroundColor: '#0f172a', display: 'flex', justifyContent: 'flex-end',
              }}>
                <button
                  onClick={() => openConfirm(pair)}
                  style={{
                    padding: '8px 20px', borderRadius: '6px',
                    backgroundColor: '#1e3a8a', color: '#93c5fd',
                    border: '1px solid #2563eb', fontSize: '13px',
                    fontWeight: '500', cursor: 'pointer',
                  }}
                >
                  統合
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 確認モーダル */}
      {confirmTarget && (
        <div
          onClick={() => !merging && setConfirmTarget(null)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 200,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '12px', boxSizing: 'border-box',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              backgroundColor: '#0f172a', borderRadius: '12px',
              border: '1px solid #1e293b', maxWidth: '480px', width: '100%',
              maxHeight: '80vh', overflowY: 'auto', boxSizing: 'border-box',
            }}
          >
            <div style={{
              padding: '16px 20px', borderBottom: '1px solid #1e293b',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#f1f5f9', margin: 0 }}>
                統合の確認
              </h3>
              <button
                onClick={() => setConfirmTarget(null)}
                disabled={merging}
                style={{
                  padding: '4px 10px', borderRadius: '5px', fontSize: '12px',
                  backgroundColor: 'transparent', color: '#94a3b8',
                  border: '1px solid #334155', cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ padding: '20px' }}>
              <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '16px' }}>
                残す選手を選択してください。もう一方の選手レコードは削除され、大会申込・練習参加データが統合されます。
              </p>

              {/* Option 1 */}
              <label
                style={{
                  display: 'flex', gap: '12px', padding: '14px 16px',
                  borderRadius: '8px', marginBottom: '8px', cursor: 'pointer',
                  backgroundColor: keepId === confirmTarget.id1 ? '#1e293b' : '#0c1220',
                  border: `1px solid ${keepId === confirmTarget.id1 ? '#3b82f6' : '#1e293b'}`,
                  transition: 'all 0.15s',
                }}
              >
                <input
                  type="radio"
                  name="keep"
                  checked={keepId === confirmTarget.id1}
                  onChange={() => setKeepId(confirmTarget.id1)}
                  style={{ accentColor: '#3b82f6', marginTop: '2px' }}
                />
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#e2e8f0', marginBottom: '4px' }}>
                    {confirmTarget.name1}
                    <span style={{ fontSize: '11px', color: '#475569', marginLeft: '8px' }}>
                      ID: {confirmTarget.id1}
                    </span>
                    {keepId === confirmTarget.id1 && (
                      <span style={{
                        marginLeft: '8px', padding: '2px 8px', borderRadius: '6px',
                        fontSize: '11px', backgroundColor: '#064e3b', color: '#6ee7b7',
                      }}>残す</span>
                    )}
                    {keepId !== confirmTarget.id1 && (
                      <span style={{
                        marginLeft: '8px', padding: '2px 8px', borderRadius: '6px',
                        fontSize: '11px', backgroundColor: '#7f1d1d', color: '#fca5a5',
                      }}>削除</span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                    Discord: {confirmTarget.discord1 || '未登録'} / 生年月日: {formatBirth(confirmTarget.birth1)}
                  </div>
                </div>
              </label>

              {/* Option 2 */}
              <label
                style={{
                  display: 'flex', gap: '12px', padding: '14px 16px',
                  borderRadius: '8px', marginBottom: '20px', cursor: 'pointer',
                  backgroundColor: keepId === confirmTarget.id2 ? '#1e293b' : '#0c1220',
                  border: `1px solid ${keepId === confirmTarget.id2 ? '#3b82f6' : '#1e293b'}`,
                  transition: 'all 0.15s',
                }}
              >
                <input
                  type="radio"
                  name="keep"
                  checked={keepId === confirmTarget.id2}
                  onChange={() => setKeepId(confirmTarget.id2)}
                  style={{ accentColor: '#3b82f6', marginTop: '2px' }}
                />
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#e2e8f0', marginBottom: '4px' }}>
                    {confirmTarget.name2}
                    <span style={{ fontSize: '11px', color: '#475569', marginLeft: '8px' }}>
                      ID: {confirmTarget.id2}
                    </span>
                    {keepId === confirmTarget.id2 && (
                      <span style={{
                        marginLeft: '8px', padding: '2px 8px', borderRadius: '6px',
                        fontSize: '11px', backgroundColor: '#064e3b', color: '#6ee7b7',
                      }}>残す</span>
                    )}
                    {keepId !== confirmTarget.id2 && (
                      <span style={{
                        marginLeft: '8px', padding: '2px 8px', borderRadius: '6px',
                        fontSize: '11px', backgroundColor: '#7f1d1d', color: '#fca5a5',
                      }}>削除</span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                    Discord: {confirmTarget.discord2 || '未登録'} / 生年月日: {formatBirth(confirmTarget.birth2)}
                  </div>
                </div>
              </label>

              {/* Discord ID引き継ぎの注意 */}
              {(() => {
                if (!keepId || !confirmTarget) return null
                const removePlayer = keepId === confirmTarget.id1
                  ? { discord: confirmTarget.discord2 }
                  : { discord: confirmTarget.discord1 }
                const keepPlayer = keepId === confirmTarget.id1
                  ? { discord: confirmTarget.discord1 }
                  : { discord: confirmTarget.discord2 }
                if (removePlayer.discord && !keepPlayer.discord) {
                  return (
                    <div style={{
                      padding: '10px 14px', borderRadius: '8px', marginBottom: '16px',
                      backgroundColor: '#1e3a8a20', border: '1px solid #1e3a8a',
                      fontSize: '12px', color: '#93c5fd',
                    }}>
                      削除される選手のDiscord ID ({removePlayer.discord}) が残す選手に引き継がれます。
                    </div>
                  )
                }
                return null
              })()}

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setConfirmTarget(null)}
                  disabled={merging}
                  style={{
                    padding: '10px 20px', borderRadius: '6px',
                    backgroundColor: 'transparent', color: '#94a3b8',
                    border: '1px solid #334155', fontSize: '13px',
                    fontWeight: '500', cursor: 'pointer',
                  }}
                >
                  キャンセル
                </button>
                <button
                  onClick={handleMerge}
                  disabled={merging || !keepId}
                  style={{
                    padding: '10px 20px', borderRadius: '6px',
                    backgroundColor: merging ? '#1e293b' : '#dc2626',
                    color: '#fff', border: 'none', fontSize: '13px',
                    fontWeight: '500', cursor: merging ? 'not-allowed' : 'pointer',
                  }}
                >
                  {merging ? '処理中...' : '統合を実行'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
