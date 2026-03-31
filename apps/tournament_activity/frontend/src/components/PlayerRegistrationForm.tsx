import { useState } from 'react'
import type { UserPermissionInfo } from '../utils/permissions'

interface PlayerRegistrationFormProps {
  auth: any
  permissionInfo?: UserPermissionInfo
  isRequired?: boolean
  onCompleted?: () => void
}

export default function PlayerRegistrationForm({ auth, permissionInfo, isRequired = false, onCompleted }: PlayerRegistrationFormProps) {
  const memberLevel = permissionInfo?.memberLevel ?? 2
  const [isCompletedState, setIsCompletedState] = useState(false)
  const [formData, setFormData] = useState({
    lastName: '', firstName: '', lastNameKana: '', firstNameKana: '', jstaNumber: '', birthDate: '',
    sex: '0', postalCode: '', address: '', phoneNumber: '', affiliatedClub: '',
  })
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

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
      const kana = (formData.lastNameKana || formData.firstNameKana)
        ? `${formData.lastNameKana} ${formData.firstNameKana}`.trim()
        : null
      const playerData = {
        discord_id: isRequired ? auth.user.id : null,
        player_name: `${formData.lastName} ${formData.firstName}`,
        player_name_kana: kana,
        jsta_number: formData.jstaNumber || null,
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
        if (isRequired) {
          setMessage('選手登録が完了しました')
          setIsCompletedState(true)
          if (onCompleted) setTimeout(() => onCompleted(), 1500)
        } else {
          setMessage('選手を登録しました')
          clearForm()
        }
      } else {
        const error = await response.json()
        setMessage(`エラー: ${error.detail || '登録に失敗しました'}`)
      }
    } catch {
      setMessage('通信エラーが発生しました')
    } finally {
      setLoading(false)
    }
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

  if (isCompletedState && isRequired) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <div style={{
          width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#10b981',
          margin: '0 auto 24px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '40px', color: '#ffffff'
        }}>✓</div>
        <h2 style={{ fontSize: '28px', fontWeight: '600', color: '#f1f5f9', marginBottom: '16px' }}>選手登録完了</h2>
        <p style={{ fontSize: '15px', color: '#94a3b8' }}>
          選手情報の登録が完了しました<br />
          ダッシュボードが表示されますのでお待ちください。
        </p>
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
          <input type="text" value={formData.jstaNumber}
            onChange={(e) => setFormData({ ...formData, jstaNumber: e.target.value })}
            required={memberLevel === 0}
            placeholder={memberLevel === 0 ? '' : '任意'} style={inputStyle} />
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
          <textarea value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            required placeholder="東京都渋谷区渋谷1-2-3" rows={3}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
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
