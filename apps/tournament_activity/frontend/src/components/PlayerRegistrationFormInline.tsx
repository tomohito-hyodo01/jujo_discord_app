import { useState } from 'react'

interface PlayerRegistrationFormInlineProps {
  discordId: string
  onDataChange: (data: any) => void
}

export default function PlayerRegistrationFormInline({ discordId, onDataChange }: PlayerRegistrationFormInlineProps) {
  const [formData, setFormData] = useState({
    lastName: '',
    firstName: '',
    lastNameKana: '',
    firstNameKana: '',
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
    const kana = (newData.lastNameKana || newData.firstNameKana)
      ? `${newData.lastNameKana} ${newData.firstNameKana}`.trim()
      : null
    const playerData = {
      discord_id: discordId || null,
      player_name: `${newData.lastName} ${newData.firstName}`,
      player_name_kana: kana,
      last_name: newData.lastName,
      first_name: newData.firstName,
      last_name_kana: newData.lastNameKana || null,
      first_name_kana: newData.firstNameKana || null,
      jsta_number: newData.jstaNumber ? `JSTA${newData.jstaNumber.replace(/^JSTA/i, '')}` : null,
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
    
    // 全角→半角変換、ハイフン除去して7桁になったら自動検索
    const cleanCode = postalCode
      .replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
      .replace(/[-\u2010\u2011\u2012\u2013\u2014\u2015\u2212\u30FC\uFF0D\uFF70]/g, '')
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

      {/* フリガナ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <label style={labelStyle}>セイ</label>
          <input type="text" value={formData.lastNameKana}
            onChange={(e) => updateFormData({ ...formData, lastNameKana: e.target.value })}
            placeholder="ヤマダ" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>メイ</label>
          <input type="text" value={formData.firstNameKana}
            onChange={(e) => updateFormData({ ...formData, firstNameKana: e.target.value })}
            placeholder="タロウ" style={inputStyle} />
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0' }}>
          <span style={{
            padding: '12px 14px', borderRadius: '8px 0 0 8px', backgroundColor: '#1e293b',
            color: '#94a3b8', fontSize: '16px', border: '1px solid #1e293b', borderRight: 'none',
            whiteSpace: 'nowrap',
          }}>JSTA</span>
          <input type="text" value={formData.jstaNumber}
            onChange={(e) => updateFormData({ ...formData, jstaNumber: e.target.value })}
            placeholder="任意"
            style={{ ...inputStyle, borderRadius: '0 8px 8px 0' }} />
        </div>
      </div>

      {/* 郵便番号 */}
      <div>
        <label style={labelStyle}>郵便番号 *</label>
        <input
          type="text"
          inputMode="tel"
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
        {!formData.postalCode && !formData.address && (
          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>郵便番号を入力すると住所が自動入力されます</div>
        )}
        <textarea
          value={formData.address}
          onChange={(e) => updateFormData({ ...formData, address: e.target.value })}
          required
          disabled={!formData.postalCode && !formData.address}
          placeholder={formData.postalCode ? "番地・建物名を追記してください" : "郵便番号を先に入力してください"}
          rows={2}
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', opacity: (!formData.postalCode && !formData.address) ? 0.5 : 1 }}
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

