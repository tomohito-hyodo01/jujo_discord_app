import { useState } from 'react'

interface PlayerRegistrationFormProps {
  auth: any
  isRequired?: boolean
  onCompleted?: () => void
}

export default function PlayerRegistrationForm({ auth, isRequired = false, onCompleted }: PlayerRegistrationFormProps) {
  const [isCompletedState, setIsCompletedState] = useState(false)
  const [formData, setFormData] = useState({
    lastName: '',
    firstName: '',
    jstaNumber: '',
    birthDate: '',
    sex: '0',
    postalCode: '',
    address: '',
    phoneNumber: '',
  })

  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handlePostalCodeChange = async (postalCode: string) => {
    setFormData({ ...formData, postalCode })
    
    // ハイフンを除去して7桁になったら自動検索
    const cleanCode = postalCode.replace('-', '').replace('−', '')
    if (cleanCode.length === 7 && /^\d{7}$/.test(cleanCode)) {
      try {
        const response = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${cleanCode}`)
        const data = await response.json()

        if (data.status === 200 && data.results) {
          const result = data.results[0]
          const fullAddress = `${result.address1}${result.address2}${result.address3}`
          setFormData({ ...formData, postalCode, address: fullAddress })
        }
      } catch (error) {
        // エラーは無視（ユーザーに表示しない）
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      const playerData = {
        discord_id: isRequired ? auth.user.id : auth.user.id,  // 初回登録時はauth.user.idを使用
        player_name: `${formData.lastName} ${formData.firstName}`,
        jsta_number: formData.jstaNumber || null,
        birth_date: formData.birthDate,
        sex: parseInt(formData.sex),
        post_number: formData.postalCode,
        address: formData.address,
        phone_number: formData.phoneNumber,
      }

      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'
      
      const response = await fetch(`${apiUrl}/api/players`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(playerData),
      })

      if (response.ok) {
        setMessage('選手登録が完了しました')
        setIsCompletedState(true)
        
        // 親コンポーネントに完了を通知
        if (onCompleted) {
          setTimeout(() => onCompleted(), 1500)
        }
      } else {
        const error = await response.json()
        setMessage(`エラー: ${error.detail || '登録に失敗しました'}`)
      }
    } catch (error) {
      setMessage('❌ 通信エラーが発生しました')
    } finally {
      setLoading(false)
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

  // 完了画面
  if (isCompletedState && isRequired) {
    return (
      <div style={{ 
        textAlign: 'center',
        padding: '60px 20px'
      }}>
        <div style={{
          width: '80px',
          height: '80px',
          borderRadius: '50%',
          backgroundColor: '#10b981',
          margin: '0 auto 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '40px',
          color: '#ffffff'
        }}>
          ✓
        </div>
        
        <h2 style={{
          fontSize: '28px',
          fontWeight: '600',
          color: '#f1f5f9',
          marginBottom: '16px'
        }}>
          選手登録完了
        </h2>
        
        <p style={{
          fontSize: '15px',
          color: '#94a3b8',
          marginBottom: '40px'
        }}>
          選手情報の登録が完了しました<br />
          引き続き大会申込を行います
        </p>
      </div>
    )
  }

  return (
    <div>
      {isRequired && (
        <div style={{
          padding: '16px',
          backgroundColor: '#1e40af',
          borderRadius: '8px',
          marginBottom: '24px',
          border: '1px solid #3b82f6',
          color: '#e0e7ff'
        }}>
          まずは自身の選手情報を登録してください
        </div>
      )}
      
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* 氏名 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label style={labelStyle}>姓 *</label>
            <input
              type="text"
              value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
              required
              placeholder="山田"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>名 *</label>
            <input
              type="text"
              value={formData.firstName}
              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
              required
              placeholder="太郎"
              style={inputStyle}
            />
          </div>
        </div>

        {/* 性別 */}
        <div>
          <label style={labelStyle}>性別 *</label>
          <select
            value={formData.sex}
            onChange={(e) => setFormData({ ...formData, sex: e.target.value })}
            required
            style={inputStyle}
          >
            <option value="0">男子</option>
            <option value="1">女子</option>
          </select>
        </div>

        {/* 生年月日 */}
        <div>
          <label style={labelStyle}>生年月日 *</label>
          <input
            type="date"
            value={formData.birthDate}
            onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
            required
            style={inputStyle}
          />
        </div>

        {/* 日本連盟登録番号 */}
        <div>
          <label style={labelStyle}>日本連盟登録番号</label>
          <input
            type="text"
            value={formData.jstaNumber}
            onChange={(e) => setFormData({ ...formData, jstaNumber: e.target.value })}
            placeholder="任意"
            style={inputStyle}
          />
        </div>

        {/* 郵便番号 */}
        <div>
          <label style={labelStyle}>郵便番号 *</label>
          <input
            type="text"
            value={formData.postalCode}
            onChange={(e) => handlePostalCodeChange(e.target.value)}
            required
            placeholder="123-4567（7桁入力で自動検索）"
            style={inputStyle}
          />
        </div>

        {/* 住所 */}
        <div>
          <label style={labelStyle}>住所 *</label>
          <textarea
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            required
            placeholder="東京都渋谷区渋谷1-2-3"
            rows={3}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
          />
        </div>

        {/* 電話番号 */}
        <div>
          <label style={labelStyle}>電話番号 *</label>
          <input
            type="tel"
            value={formData.phoneNumber}
            onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
            required
            placeholder="090-1234-5678"
            style={inputStyle}
          />
        </div>

        {/* メッセージ表示 */}
        {message && (
          <div style={{ 
            padding: '16px',
            borderRadius: '8px',
            backgroundColor: message.includes('完了') ? '#064e3b' : '#7f1d1d',
            color: '#fff',
            border: `1px solid ${message.includes('完了') ? '#10b981' : '#ef4444'}`,
            fontSize: '14px'
          }}>
            {message}
          </div>
        )}

        {/* 送信ボタン */}
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '16px',
            borderRadius: '8px',
            backgroundColor: loading ? '#475569' : '#3b82f6',
            color: '#fff',
            border: 'none',
            fontSize: '16px',
            fontWeight: '600',
            cursor: loading ? 'not-allowed' : 'pointer',
            marginTop: '8px'
          }}
        >
          {loading ? '登録中...' : '登録する'}
        </button>
      </form>
    </div>
  )
}

