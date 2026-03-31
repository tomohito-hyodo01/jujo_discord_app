import { useState, useEffect } from 'react'
import type { UserPermissionInfo } from '../utils/permissions'

interface ProfileCompletionFormProps {
  discordId: string
  permissionInfo: UserPermissionInfo
  onCompleted: () => void
}

export default function ProfileCompletionForm({ discordId, permissionInfo, onCompleted }: ProfileCompletionFormProps) {
  const memberLevel = permissionInfo.memberLevel
  const [player, setPlayer] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [formData, setFormData] = useState({
    birthDate: '', jstaNumber: '', postalCode: '', address: '', phoneNumber: '', affiliatedClub: '',
  })

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${apiUrl}/api/players/discord/${discordId}`)
        if (res.ok) {
          const p = await res.json()
          if (p && p.player_id) {
            setPlayer(p)
            setFormData({
              birthDate: p.birth_date ? p.birth_date.split('T')[0] : '',
              jstaNumber: p.jsta_number || '',
              postalCode: p.post_number || '',
              address: p.address || '',
              phoneNumber: p.phone_number || '',
              affiliatedClub: p.affiliated_club || '',
            })
          }
        }
      } catch {} finally { setLoading(false) }
    }
    load()
  }, [discordId])

  const handlePostalCodeChange = async (postalCode: string) => {
    setFormData(prev => ({ ...prev, postalCode }))
    const cleanCode = postalCode
      .replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
      .replace(/[-\u2010\u2011\u2012\u2013\u2014\u2015\u2212\u30FC\uFF0D\uFF70]/g, '')
    if (cleanCode.length === 7 && /^\d{7}$/.test(cleanCode)) {
      try {
        const response = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${cleanCode}`)
        const data = await response.json()
        if (data.status === 200 && data.results) {
          const result = data.results[0]
          setFormData(prev => ({ ...prev, postalCode, address: `${result.address1}${result.address2}${result.address3}` }))
        }
      } catch {}
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMessage('')

    try {
      const updateData: Record<string, any> = {}
      if (!player.birth_date && formData.birthDate) updateData.birth_date = formData.birthDate
      if (!player.jsta_number && formData.jstaNumber) updateData.jsta_number = formData.jstaNumber
      if (!player.post_number && formData.postalCode) updateData.post_number = formData.postalCode
      if (!player.address && formData.address) updateData.address = formData.address
      if (!player.phone_number && formData.phoneNumber) updateData.phone_number = formData.phoneNumber
      if (!player.affiliated_club && formData.affiliatedClub) updateData.affiliated_club = formData.affiliatedClub

      const res = await fetch(`${apiUrl}/api/players/discord/${discordId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      })

      if (res.ok) {
        setMessage('プロフィールを更新しました')
        setTimeout(() => onCompleted(), 1500)
      } else {
        const err = await res.json()
        setMessage(`エラー: ${err.detail || '更新に失敗しました'}`)
      }
    } catch {
      setMessage('通信エラーが発生しました')
    } finally {
      setSaving(false)
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

  if (loading) return <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>読み込み中...</div>
  if (!player) return <div style={{ padding: '40px', color: '#94a3b8' }}>選手情報が見つかりません</div>

  // 未入力の項目のみ表示
  const missingFields: string[] = []
  if (!player.birth_date) missingFields.push('birth_date')
  if (!player.jsta_number) missingFields.push('jsta_number')
  if (!player.post_number) missingFields.push('post_number')
  if (!player.address) missingFields.push('address')
  if (!player.phone_number) missingFields.push('phone_number')
  if (!player.affiliated_club) missingFields.push('affiliated_club')

  return (
    <div>
      <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#e2e8f0', marginBottom: '16px' }}>
        プロフィール補完
      </h2>

      <div style={{
        padding: '16px', backgroundColor: '#1e40af', borderRadius: '8px',
        marginBottom: '24px', border: '1px solid #3b82f6', color: '#e0e7ff'
      }}>
        会員種別が変更されました。追加の情報を入力してください。
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '100%', overflow: 'hidden' }}>
        {missingFields.includes('birth_date') && (
          <div>
            <label style={labelStyle}>生年月日 *</label>
            <input type="date" value={formData.birthDate}
              onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
              required style={inputStyle} />
          </div>
        )}

        {missingFields.includes('jsta_number') && (
          <div>
            <label style={labelStyle}>日本連盟登録番号{memberLevel === 0 ? ' *' : ''}</label>
            <input type="text" value={formData.jstaNumber}
              onChange={(e) => setFormData({ ...formData, jstaNumber: e.target.value })}
              required={memberLevel === 0}
              placeholder={memberLevel === 0 ? '' : '任意'} style={inputStyle} />
          </div>
        )}

        {missingFields.includes('post_number') && (
          <div>
            <label style={labelStyle}>郵便番号 *</label>
            <input type="text" inputMode="tel" value={formData.postalCode}
              onChange={(e) => handlePostalCodeChange(e.target.value)}
              required placeholder="123-4567（7桁入力で自動検索）" style={inputStyle} />
          </div>
        )}

        {missingFields.includes('address') && (
          <div>
            <label style={labelStyle}>住所 *</label>
            <textarea value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              required placeholder="東京都渋谷区渋谷1-2-3" rows={3}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
          </div>
        )}

        {missingFields.includes('phone_number') && (
          <div>
            <label style={labelStyle}>電話番号 *</label>
            <input type="tel" value={formData.phoneNumber}
              onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
              required placeholder="090-1234-5678" style={inputStyle} />
          </div>
        )}

        {missingFields.includes('affiliated_club') && (
          <div>
            <label style={labelStyle}>所属クラブ</label>
            <input type="text" value={formData.affiliatedClub}
              onChange={(e) => setFormData({ ...formData, affiliatedClub: e.target.value })}
              placeholder="任意" style={inputStyle} />
          </div>
        )}

        {message && (
          <div style={{
            padding: '16px', borderRadius: '8px',
            backgroundColor: message.includes('更新しました') ? '#064e3b' : '#7f1d1d',
            color: '#fff',
            border: `1px solid ${message.includes('更新しました') ? '#10b981' : '#ef4444'}`,
            fontSize: '14px'
          }}>
            {message}
          </div>
        )}

        <button type="submit" disabled={saving} style={{
          padding: '16px', borderRadius: '8px',
          backgroundColor: saving ? '#475569' : '#3b82f6',
          color: '#fff', border: 'none', fontSize: '16px', fontWeight: '600',
          cursor: saving ? 'not-allowed' : 'pointer', marginTop: '8px'
        }}>
          {saving ? '処理中...' : '登録する'}
        </button>
      </form>
    </div>
  )
}
