import { useState } from 'react'

interface PlayerRegistrationFormInlineProps {
  discordId: string
  onDataChange: (data: any) => void
}

export default function PlayerRegistrationFormInline({ discordId, onDataChange }: PlayerRegistrationFormInlineProps) {
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
  
  // フォームデータが変更されたら親に通知
  const updateFormData = (newData: any) => {
    setFormData(newData)
    
    // 親コンポーネントにデータを渡す
    const playerData = {
      discord_id: discordId || null,  // 空文字列の場合はnullに
      player_name: `${newData.lastName} ${newData.firstName}`,
      jsta_number: newData.jstaNumber || null,
      birth_date: newData.birthDate,
      sex: parseInt(newData.sex),
      post_number: newData.postalCode,
      address: newData.address,
      phone_number: newData.phoneNumber,
    }
    
    // 必須項目が全て入力されている場合のみ親に渡す
    if (newData.lastName && newData.firstName && newData.birthDate && 
        newData.postalCode && newData.address && newData.phoneNumber) {
      onDataChange(playerData)
    } else {
      onDataChange(null)
    }
  }

  const handlePostalCodeChange = async (postalCode: string) => {
    const newData = { ...formData, postalCode }
    
    // ハイフンを除去して7桁になったら自動検索
    const cleanCode = postalCode.replace('-', '').replace('−', '')
    if (cleanCode.length === 7 && /^\d{7}$/.test(cleanCode)) {
      try {
        const response = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${cleanCode}`)
        const data = await response.json()

        if (data.status === 200 && data.results) {
          const result = data.results[0]
          const fullAddress = `${result.address1}${result.address2}${result.address3}`
          updateFormData({ ...newData, address: fullAddress })
          return
        }
      } catch (error) {
        // エラーは無視
      }
    }
    
    updateFormData(newData)
  }

  // このコンポーネントでは送信処理は行わない（親の申込ボタンで一緒に処理）
  // フォームのバリデーションのみ行う

  const inputStyle = {
    width: '100%',
    padding: '10px 14px',
    borderRadius: '6px',
    border: '1px solid #1e293b',
    backgroundColor: '#0a1220',
    color: '#e2e8f0',
    fontSize: '14px',
  }

  const labelStyle = {
    display: 'block',
    marginBottom: '6px',
    fontSize: '13px',
    fontWeight: '500',
    color: '#94a3b8'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* 氏名 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <label style={labelStyle}>姓 *</label>
          <input
            type="text"
            value={formData.lastName}
            onChange={(e) => updateFormData({ ...formData, lastName: e.target.value })}
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
            onChange={(e) => updateFormData({ ...formData, firstName: e.target.value })}
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
          onChange={(e) => updateFormData({ ...formData, sex: e.target.value })}
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
          onChange={(e) => updateFormData({ ...formData, birthDate: e.target.value })}
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
          onChange={(e) => updateFormData({ ...formData, jstaNumber: e.target.value })}
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
          onChange={(e) => updateFormData({ ...formData, address: e.target.value })}
          required
          placeholder="東京都渋谷区渋谷1-2-3"
          rows={2}
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
        />
      </div>

      {/* 電話番号 */}
      <div>
        <label style={labelStyle}>電話番号 *</label>
        <input
          type="tel"
          value={formData.phoneNumber}
          onChange={(e) => updateFormData({ ...formData, phoneNumber: e.target.value })}
          required
          placeholder="090-1234-5678"
          style={inputStyle}
        />
      </div>

    </div>
  )
}

