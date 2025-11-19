import { useState, FormEvent, ChangeEvent } from 'react'

interface TournamentData {
  tournament_id: string
  tournament_name: string
  registrated_ward: number
  deadline_date: string
  tournament_date: string
  classification: number
  mix_flg: boolean
  type: string[]
}

function TournamentRegistrationForm() {
  const [formData, setFormData] = useState<TournamentData>({
    tournament_id: '',
    tournament_name: '',
    registrated_ward: 0,
    deadline_date: '',
    tournament_date: '',
    classification: 0,
    mix_flg: false,
    type: []
  })
  const [isUploading, setIsUploading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [selectedModel, setSelectedModel] = useState<'claude' | 'gemini'>('claude')

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  const wardOptions = [
    { id: 17, name: '北区' },
    { id: 18, name: '荒川区' },
    { id: 23, name: '江戸川区' }
  ]

  const typeOptions = ['一般', '35', '45', '55', '60', '65', '70']

  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target as HTMLInputElement

    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked
      setFormData(prev => ({ ...prev, [name]: checked }))
    } else if (name === 'registrated_ward' || name === 'classification') {
      setFormData(prev => ({ ...prev, [name]: parseInt(value, 10) }))
    } else {
      setFormData(prev => ({ ...prev, [name]: value }))
    }
  }

  const handleTypeChange = (typeValue: string) => {
    setFormData(prev => {
      const currentTypes = prev.type || []
      const newTypes = currentTypes.includes(typeValue)
        ? currentTypes.filter(t => t !== typeValue)
        : [...currentTypes, typeValue]
      return { ...prev, type: newTypes }
    })
  }

  const handlePdfUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    setMessage(null)

    try {
      const uploadFormData = new FormData()
      uploadFormData.append('file', file)

      const response = await fetch(`${apiUrl}/api/tournaments/parse-pdf?model=${selectedModel}`, {
        method: 'POST',
        body: uploadFormData
      })

      if (!response.ok) {
        throw new Error('PDF解析に失敗しました')
      }

      const result = await response.json()

      if (result.success && result.data) {
        setFormData(prev => ({
          ...prev,
          ...result.data
        }))
        setMessage({
          type: 'success',
          text: `PDFから情報を抽出しました（使用モデル: ${result.model_used === 'claude' ? 'Claude Sonnet 4' : 'Gemini 2.5 Flash'}）`
        })
      }
    } catch (error) {
      console.error('PDF upload error:', error)
      setMessage({ type: 'error', text: 'PDF解析中にエラーが発生しました' })
    } finally {
      setIsUploading(false)
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setMessage(null)

    try {
      const response = await fetch(`${apiUrl}/api/tournaments/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      })

      if (!response.ok) {
        throw new Error('大会登録に失敗しました')
      }

      const result = await response.json()

      if (result.success) {
        setMessage({ type: 'success', text: result.message })
        // フォームをリセット
        setFormData({
          tournament_id: '',
          tournament_name: '',
          registrated_ward: 0,
          deadline_date: '',
          tournament_date: '',
          classification: 0,
          mix_flg: false,
          type: []
        })
      }
    } catch (error) {
      console.error('Submit error:', error)
      setMessage({ type: 'error', text: '大会登録中にエラーが発生しました' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const inputStyle = {
    width: '100%',
    padding: '12px 16px',
    backgroundColor: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '8px',
    color: '#e2e8f0',
    fontSize: '15px',
    outline: 'none',
    transition: 'all 0.2s'
  }

  const labelStyle = {
    display: 'block',
    marginBottom: '8px',
    color: '#94a3b8',
    fontSize: '14px',
    fontWeight: '500'
  }

  const buttonStyle = {
    width: '100%',
    padding: '14px',
    backgroundColor: '#3b82f6',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s'
  }

  return (
    <div style={{ position: 'relative' }}>
      {/* Full-screen loader during PDF parsing */}
      {isUploading && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            width: '60px',
            height: '60px',
            border: '4px solid #1e293b',
            borderTop: '4px solid #3b82f6',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }} />
          <p style={{
            color: '#e2e8f0',
            fontSize: '18px',
            fontWeight: '600',
            marginTop: '24px'
          }}>
            PDFを解析中...
          </p>
          <p style={{
            color: '#94a3b8',
            fontSize: '14px',
            marginTop: '8px'
          }}>
            しばらくお待ちください
          </p>
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      )}

      <h2 style={{
        fontSize: '24px',
        fontWeight: '600',
        color: '#e2e8f0',
        marginBottom: '24px'
      }}>
        大会登録
      </h2>

      {message && (
        <div style={{
          padding: '16px',
          marginBottom: '24px',
          backgroundColor: message.type === 'success' ? '#064e3b' : '#7f1d1d',
          border: `1px solid ${message.type === 'success' ? '#059669' : '#dc2626'}`,
          borderRadius: '8px',
          color: '#e2e8f0'
        }}>
          {message.text}
        </div>
      )}

      {/* PDF Upload Section */}
      <div style={{ marginBottom: '32px' }}>
        <label style={labelStyle}>
          PDF要項アップロード（任意）
        </label>

        {/* AI Model Selection */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ ...labelStyle, marginBottom: '12px' }}>
            使用するAIモデル
          </label>
          <div style={{ display: 'flex', gap: '16px' }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              padding: '12px 16px',
              backgroundColor: selectedModel === 'claude' ? '#1e3a8a' : '#0f172a',
              border: `1px solid ${selectedModel === 'claude' ? '#3b82f6' : '#1e293b'}`,
              borderRadius: '8px',
              color: '#e2e8f0',
              fontSize: '15px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              flex: 1
            }}>
              <input
                type="radio"
                name="model"
                value="claude"
                checked={selectedModel === 'claude'}
                onChange={(e) => setSelectedModel(e.target.value as 'claude' | 'gemini')}
                style={{ marginRight: '8px', cursor: 'pointer' }}
              />
              <div>
                <div style={{ fontWeight: '600' }}>Claude Sonnet 4</div>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                  高精度・約6.8円/回
                </div>
              </div>
            </label>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              padding: '12px 16px',
              backgroundColor: selectedModel === 'gemini' ? '#1e3a8a' : '#0f172a',
              border: `1px solid ${selectedModel === 'gemini' ? '#3b82f6' : '#1e293b'}`,
              borderRadius: '8px',
              color: '#e2e8f0',
              fontSize: '15px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              flex: 1
            }}>
              <input
                type="radio"
                name="model"
                value="gemini"
                checked={selectedModel === 'gemini'}
                onChange={(e) => setSelectedModel(e.target.value as 'claude' | 'gemini')}
                style={{ marginRight: '8px', cursor: 'pointer' }}
              />
              <div>
                <div style={{ fontWeight: '600' }}>Gemini 2.5 Flash</div>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                  高速・約0.8円/回
                </div>
              </div>
            </label>
          </div>
        </div>

        <input
          type="file"
          accept=".pdf"
          onChange={handlePdfUpload}
          disabled={isUploading}
          style={{
            ...inputStyle,
            padding: '12px'
          }}
        />
      </div>

      <form onSubmit={handleSubmit}>
        {/* Tournament Name */}
        <div style={{ marginBottom: '24px' }}>
          <label style={labelStyle}>
            大会名 <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <input
            type="text"
            name="tournament_name"
            value={formData.tournament_name}
            onChange={handleInputChange}
            required
            style={inputStyle}
            placeholder="例: 春季オープンテニス大会"
          />
        </div>

        {/* Registrated Ward */}
        <div style={{ marginBottom: '24px' }}>
          <label style={labelStyle}>
            主催区 <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <select
            name="registrated_ward"
            value={formData.registrated_ward}
            onChange={handleInputChange}
            required
            style={inputStyle}
          >
            <option value={0}>選択してください</option>
            {wardOptions.map(ward => (
              <option key={ward.id} value={ward.id}>
                {ward.name}
              </option>
            ))}
          </select>
        </div>

        {/* Deadline Date */}
        <div style={{ marginBottom: '24px' }}>
          <label style={labelStyle}>
            申込締切日 <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <input
            type="date"
            name="deadline_date"
            value={formData.deadline_date}
            onChange={handleInputChange}
            required
            style={inputStyle}
          />
        </div>

        {/* Tournament Date */}
        <div style={{ marginBottom: '24px' }}>
          <label style={labelStyle}>
            大会開催日 <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <input
            type="date"
            name="tournament_date"
            value={formData.tournament_date}
            onChange={handleInputChange}
            required
            style={inputStyle}
          />
        </div>

        {/* Classification */}
        <div style={{ marginBottom: '24px' }}>
          <label style={labelStyle}>
            競技形式 <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <select
            name="classification"
            value={formData.classification}
            onChange={handleInputChange}
            required
            style={inputStyle}
          >
            <option value={0}>個人戦</option>
            <option value={1}>団体戦</option>
          </select>
        </div>

        {/* Mix Flag */}
        <div style={{ marginBottom: '24px' }}>
          <label style={{
            display: 'flex',
            alignItems: 'center',
            color: '#94a3b8',
            fontSize: '15px',
            cursor: 'pointer'
          }}>
            <input
              type="checkbox"
              name="mix_flg"
              checked={formData.mix_flg}
              onChange={handleInputChange}
              style={{
                marginRight: '8px',
                width: '18px',
                height: '18px',
                cursor: 'pointer'
              }}
            />
            ミックスダブルス
          </label>
        </div>

        {/* Type (Age Categories) */}
        <div style={{ marginBottom: '32px' }}>
          <label style={labelStyle}>
            種別 <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '12px'
          }}>
            {typeOptions.map(typeValue => (
              <label
                key={typeValue}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '12px',
                  backgroundColor: formData.type.includes(typeValue) ? '#1e3a8a' : '#0f172a',
                  border: `1px solid ${formData.type.includes(typeValue) ? '#3b82f6' : '#1e293b'}`,
                  borderRadius: '8px',
                  color: '#e2e8f0',
                  fontSize: '15px',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                <input
                  type="checkbox"
                  checked={formData.type.includes(typeValue)}
                  onChange={() => handleTypeChange(typeValue)}
                  style={{
                    marginRight: '8px',
                    cursor: 'pointer'
                  }}
                />
                {typeValue}
              </label>
            ))}
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSubmitting}
          style={{
            ...buttonStyle,
            backgroundColor: isSubmitting ? '#475569' : '#3b82f6',
            cursor: isSubmitting ? 'not-allowed' : 'pointer'
          }}
        >
          {isSubmitting ? '登録中...' : '大会を登録'}
        </button>
      </form>
    </div>
  )
}

export default TournamentRegistrationForm
