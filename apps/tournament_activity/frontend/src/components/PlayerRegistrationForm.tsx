import { useState } from 'react'
import type { UserPermissionInfo } from '../utils/permissions'

interface PlayerRegistrationFormProps {
  auth: any
  permissionInfo?: UserPermissionInfo
  isRequired?: boolean
  onCompleted?: () => void
  onNavigate?: (page: string) => void
}

export default function PlayerRegistrationForm({ auth, permissionInfo, isRequired = false, onCompleted, onNavigate }: PlayerRegistrationFormProps) {
  const memberLevel = permissionInfo?.memberLevel ?? 2
  const [isCompletedState, setIsCompletedState] = useState(false)
  const [formData, setFormData] = useState({
    lastName: '', firstName: '', lastNameKana: '', firstNameKana: '', jstaNumber: '', birthDate: '',
    sex: '0', postalCode: '', address: '', phoneNumber: '', affiliatedClub: '',
  })
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [matchedPlayer, setMatchedPlayer] = useState<any>(null)
  const [skipMatch, setSkipMatch] = useState(false)

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  const clearForm = () => {
    setFormData({
      lastName: '', firstName: '', lastNameKana: '', firstNameKana: '', jstaNumber: '', birthDate: '',
      sex: '0', postalCode: '', address: '', phoneNumber: '', affiliatedClub: '',
    })
    setMessage('')
  }

  const handlePostalCodeChange = async (postalCode: string) => {
    setFormData(prev => ({ ...prev, postalCode }))
    const cleanCode = postalCode
      .replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
      .replace(/[-\u2010\u2011\u2012\u2013\u2014\u2015\u2212\u30FC\uFF0D\uFF70]/g, '')
    console.log('[郵便番号]', { input: postalCode, cleanCode, len: cleanCode.length, match: /^\d{7}$/.test(cleanCode) })
    if (cleanCode.length === 7 && /^\d{7}$/.test(cleanCode)) {
      try {
        const response = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${cleanCode}`)
        const data = await response.json()
        console.log('[郵便番号] API response:', data.status, data.results?.[0])
        if (data.status === 200 && data.results) {
          const result = data.results[0]
          setFormData(prev => ({ ...prev, postalCode, address: `${result.address1}${result.address2}${result.address3}` }))
        }
      } catch (err) {
        console.error('[郵便番号] fetch error:', err)
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      // 住所バリデーション
      if (formData.address && !/[\d０-９]/.test(formData.address)) {
        setMessage('エラー: 住所に番地が含まれていません。正確な住所を入力してください。')
        setLoading(false)
        return
      }

      // 電話番号バリデーション
      if (formData.phoneNumber) {
        const digits = formData.phoneNumber.replace(/[-\s\u2010-\u2015\u2212\u30FC\uFF0D\uFF70]/g, '')
          .replace(/[０-９]/g, (s: string) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
        if (digits.length < 10 || digits.length > 11) {
          setMessage('エラー: 電話番号は10〜11桁で入力してください。')
          setLoading(false); return
        }
        if (!digits.startsWith('0')) {
          setMessage('エラー: 電話番号が不正です。正しい番号を入力してください。')
          setLoading(false); return
        }
        if (/^(\d)\1+$/.test(digits)) {
          setMessage('エラー: 電話番号が不正です。正しい番号を入力してください。')
          setLoading(false); return
        }
        const seq = '01234567890'
        if (digits.length >= 10 && seq.includes(digits.slice(0, 10))) {
          setMessage('エラー: 電話番号が不正です。正しい番号を入力してください。')
          setLoading(false); return
        }
      }

      const playerName = `${formData.lastName} ${formData.firstName}`
      const kana = (formData.lastNameKana || formData.firstNameKana)
        ? `${formData.lastNameKana} ${formData.firstNameKana}`.trim()
        : null

      // 既存選手とのマッチングチェック（自己登録時のみ）
      if (isRequired && !skipMatch) {
        try {
          const birthDate = formData.birthDate.replace(/\//g, '-')
          const matchRes = await fetch(`${apiUrl}/api/players/match?player_name=${encodeURIComponent(playerName)}&birth_date=${encodeURIComponent(birthDate)}`)
          if (matchRes.ok) {
            const matches = await matchRes.json()
            const candidate = matches.find((m: any) => !m.discord_id)
            if (candidate) {
              setMatchedPlayer(candidate)
              setLoading(false)
              return
            }
          }
        } catch {
          // マッチングAPIエラーは無視して登録を続行
        }
      }

      const playerData = {
        discord_id: isRequired ? auth.user.id : null,
        player_name: playerName,
        player_name_kana: kana,
        last_name: formData.lastName,
        first_name: formData.firstName,
        last_name_kana: formData.lastNameKana || null,
        first_name_kana: formData.firstNameKana || null,
        jsta_number: formData.jstaNumber ? `JSTA${formData.jstaNumber.replace(/^JSTA/i, '')}` : null,
        birth_date: formData.birthDate,
        sex: parseInt(formData.sex),
        post_number: formData.postalCode,
        address: formData.address,
        phone_number: formData.phoneNumber,
        affiliated_club: formData.affiliatedClub || null,
        member_level: permissionInfo?.memberLevel ?? null,
        created_by: auth.user.id,
      }

      const response = await fetch(`${apiUrl}/api/players`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(playerData),
      })

      if (response.ok) {
        setMessage('選手登録が完了しました')
        setIsCompletedState(true)
        if (isRequired && onCompleted) setTimeout(() => onCompleted(), 1500)
      } else if (response.status === 409) {
        const err = await response.json()
        if (err.detail?.includes('番号')) {
          // 日連登録番号の重複
          setMessage(`エラー: ${err.detail}`)
        } else {
          // discord_id/名前の重複 → 成功扱い
          setMessage('選手登録が完了しました')
          setIsCompletedState(true)
          if (isRequired && onCompleted) setTimeout(() => onCompleted(), 1500)
        }
      } else {
        const error = await response.json()
        setMessage(`エラー: ${error.detail || '登録に失敗しました'}`)
      }
    } catch (e: any) {
      setMessage(`通信エラーが発生しました: ${e?.message || ''}`)
    } finally {
      setLoading(false)
    }
  }

  const handleLinkExisting = async () => {
    if (!matchedPlayer) return
    setLoading(true)
    try {
      const res = await fetch(`${apiUrl}/api/players/${matchedPlayer.player_id}/link-discord`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discord_id: auth.user.id }),
      })
      if (res.ok) {
        setMessage('既存の選手情報にDiscordアカウントを紐付けました')
        setIsCompletedState(true)
        setMatchedPlayer(null)
        if (isRequired && onCompleted) setTimeout(() => onCompleted(), 1500)
      } else {
        const err = await res.json()
        alert(`紐付けに失敗しました: ${err.detail || ''}`)
      }
    } catch { alert('通信エラー') }
    finally { setLoading(false) }
  }

  const handleSkipMatch = () => {
    setMatchedPlayer(null)
    setSkipMatch(true)
  }

  const inputStyle = {
    width: '100%', maxWidth: '100%', padding: '12px 16px', borderRadius: '8px',
    border: '1px solid #1e293b', backgroundColor: '#0c1220',
    color: '#e2e8f0', fontSize: '16px', transition: 'border-color 0.2s',
    boxSizing: 'border-box' as const,
  }
  const labelStyle = {
    display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: '#94a3b8'
  }

  // マッチング候補の確認画面
  if (matchedPlayer) {
    return (
      <div style={{ padding: '40px 20px', maxWidth: '500px', margin: '0 auto' }}>
        <div style={{
          padding: '20px', borderRadius: '12px',
          backgroundColor: '#1e3a8a', border: '1px solid #3b82f6',
          marginBottom: '20px',
        }}>
          <div style={{ fontSize: '16px', fontWeight: '600', color: '#93c5fd', marginBottom: '12px' }}>
            同じ名前・生年月日の選手が見つかりました
          </div>
          <div style={{ fontSize: '14px', color: '#e0e7ff', marginBottom: '16px' }}>
            以前、他のメンバーにより登録された可能性があります。この選手と同一人物であれば、あなたのDiscordアカウントと紐付けます。
          </div>
          <div style={{
            padding: '12px 16px', borderRadius: '8px',
            backgroundColor: '#0f172a', border: '1px solid #1e293b',
          }}>
            <div style={{ fontSize: '14px', color: '#e2e8f0', marginBottom: '4px' }}>
              <strong>{matchedPlayer.player_name}</strong>
            </div>
            <div style={{ fontSize: '13px', color: '#94a3b8' }}>
              生年月日: {matchedPlayer.birth_date}
              {matchedPlayer.affiliated_club && ` / 所属: ${matchedPlayer.affiliated_club}`}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button onClick={handleLinkExisting} disabled={loading} style={{
            padding: '14px', borderRadius: '8px', backgroundColor: '#3b82f6',
            color: '#fff', border: 'none', fontSize: '15px', fontWeight: '600', cursor: 'pointer',
          }}>{loading ? '処理中...' : 'この選手と紐付ける'}</button>
          <button onClick={handleSkipMatch} style={{
            padding: '14px', borderRadius: '8px', backgroundColor: 'transparent',
            color: '#94a3b8', border: '1px solid #334155', fontSize: '14px', cursor: 'pointer',
          }}>別人です（新規登録する）</button>
        </div>
      </div>
    )
  }

  if (isCompletedState) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <div style={{
          width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#10b981',
          margin: '0 auto 24px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '40px', color: '#ffffff'
        }}>✓</div>
        <h2 style={{ fontSize: '28px', fontWeight: '600', color: '#f1f5f9', marginBottom: '16px' }}>選手登録完了</h2>
        <p style={{ fontSize: '15px', color: '#94a3b8', marginBottom: '32px' }}>
          {isRequired ? '選手情報の登録が完了しました' : '選手を登録しました'}
        </p>
        {!isRequired && (
          <button onClick={() => onNavigate ? onNavigate('dashboard') : (setIsCompletedState(false), clearForm())} style={{
            padding: '14px 32px', borderRadius: '8px', backgroundColor: '#3b82f6',
            color: '#fff', border: 'none', fontSize: '15px', fontWeight: '500', cursor: 'pointer',
          }}>トップへ</button>
        )}
      </div>
    )
  }

  return (
    <div>
      <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#e2e8f0', marginBottom: '16px' }}>
        選手登録
      </h2>

      {isRequired && (
        <div style={{
          padding: '16px', backgroundColor: '#1e40af', borderRadius: '8px',
          marginBottom: '24px', border: '1px solid #3b82f6', color: '#e0e7ff'
        }}>
          まずは自身の選手情報を登録してください
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '100%', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label style={labelStyle}>姓 *</label>
            <input type="text" value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
              required placeholder="山田" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>名 *</label>
            <input type="text" value={formData.firstName}
              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
              required placeholder="太郎" style={inputStyle} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label style={labelStyle}>セイ</label>
            <input type="text" value={formData.lastNameKana}
              onChange={(e) => setFormData({ ...formData, lastNameKana: e.target.value })}
              placeholder="ヤマダ" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>メイ</label>
            <input type="text" value={formData.firstNameKana}
              onChange={(e) => setFormData({ ...formData, firstNameKana: e.target.value })}
              placeholder="タロウ" style={inputStyle} />
          </div>
        </div>

        <div>
          <label style={labelStyle}>性別 *</label>
          <select value={formData.sex}
            onChange={(e) => setFormData({ ...formData, sex: e.target.value })}
            required style={inputStyle}>
            <option value="0">男子</option>
            <option value="1">女子</option>
          </select>
        </div>

        {memberLevel < 2 && (
        <div>
          <label style={labelStyle}>生年月日 *</label>
          <input type="date" value={formData.birthDate}
            onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
            required style={inputStyle} />
        </div>
        )}

        {/* 正会員: 必須, 準会員: 任意, ゲスト: 非表示 */}
        {memberLevel < 2 && (
        <div>
          <label style={labelStyle}>日本連盟登録番号{memberLevel === 0 ? ' *' : ''}</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0' }}>
            <span style={{
              padding: '12px 14px', borderRadius: '8px 0 0 8px', backgroundColor: '#1e293b',
              color: '#94a3b8', fontSize: '16px', border: '1px solid #1e293b', borderRight: 'none',
              whiteSpace: 'nowrap',
            }}>JSTA</span>
            <input type="text" value={formData.jstaNumber}
              onChange={(e) => setFormData({ ...formData, jstaNumber: e.target.value })}
              required={memberLevel === 0}
              placeholder={memberLevel === 0 ? '' : '任意'}
              style={{ ...inputStyle, borderRadius: '0 8px 8px 0' }} />
          </div>
        </div>
        )}

        {memberLevel < 2 && (
        <>
        <div>
          <label style={labelStyle}>郵便番号 *</label>
          <input type="text" inputMode="tel" value={formData.postalCode}
            onChange={(e) => handlePostalCodeChange(e.target.value)}
            required placeholder="123-4567（7桁入力で自動検索）" style={inputStyle} />
        </div>

        <div>
          <label style={labelStyle}>住所 *</label>
          {!formData.postalCode.replace(/[-\s]/g, '').replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)).match(/^\d{7}$/) && !formData.address && (
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>郵便番号を入力すると住所が自動入力されます</div>
          )}
          <textarea value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            required
            disabled={!formData.postalCode && !formData.address}
            placeholder={formData.postalCode ? "番地・建物名を追記してください" : "郵便番号を先に入力してください"}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', opacity: (!formData.postalCode && !formData.address) ? 0.5 : 1 }} />
        </div>

        <div>
          <label style={labelStyle}>電話番号 *</label>
          <input type="tel" value={formData.phoneNumber}
            onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
            required placeholder="090-1234-5678" style={inputStyle} />
        </div>

        <div>
          <label style={labelStyle}>所属クラブ{isRequired && ' *'}</label>
          <input type="text" value={formData.affiliatedClub}
            onChange={(e) => setFormData({ ...formData, affiliatedClub: e.target.value })}
            required={isRequired}
            placeholder={isRequired ? '' : '任意'} style={inputStyle} />
        </div>
        </>
        )}

        {message && (
          <div style={{
            padding: '16px', borderRadius: '8px',
            backgroundColor: message.includes('完了') || message.includes('更新しました') || message.includes('登録しました') ? '#064e3b' : '#7f1d1d',
            color: '#fff',
            border: `1px solid ${message.includes('完了') || message.includes('更新しました') || message.includes('登録しました') ? '#10b981' : '#ef4444'}`,
            fontSize: '14px'
          }}>
            {message}
          </div>
        )}

        <button type="submit" disabled={loading} style={{
          padding: '16px', borderRadius: '8px',
          backgroundColor: loading ? '#475569' : '#3b82f6',
          color: '#fff', border: 'none', fontSize: '16px', fontWeight: '600',
          cursor: loading ? 'not-allowed' : 'pointer', marginTop: '8px'
        }}>
          {loading ? '処理中...' : '登録する'}
        </button>
      </form>
    </div>
  )
}
