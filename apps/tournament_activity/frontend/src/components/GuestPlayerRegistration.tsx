import { useState } from 'react'
import { getJstaNumberIssue, normalizeJstaNumber } from '../utils/jsta'
import { isAddressValid, isPhoneValid } from '../utils/playerValidation'

// ログイン不要の本人登録ページ（/guest-register）。
// 大会申込でペアの情報を申込者が代わりに入力する手間を省くため、ペア本人がここで
// 自分の選手情報を登録する。Discord ID は扱わない。
// 登録後は申込画面のペア候補にそのまま出てくるため、申込時に情報不備で弾かれないよう
// 全項目を必須にし、連盟番号・住所・電話番号の検証は選手登録ページと同じ関数を使う。
export default function GuestPlayerRegistration() {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'
  const [formData, setFormData] = useState({
    lastName: '', firstName: '', lastNameKana: '', firstNameKana: '', jstaNumber: '', birthDate: '',
    sex: '0', postalCode: '', address: '', phoneNumber: '', affiliatedClub: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ playerName: string; created: boolean } | null>(null)

  const handlePostalCodeChange = async (postalCode: string) => {
    setFormData(prev => ({ ...prev, postalCode }))
    // 全角→半角変換、ハイフン除去して7桁になったら住所を自動検索（選手登録ページと同じ）
    const cleanCode = postalCode
      .replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
      .replace(/[-‐‑‒–—―−ー－ｰ]/g, '')
    if (cleanCode.length === 7 && /^\d{7}$/.test(cleanCode)) {
      try {
        const response = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${cleanCode}`)
        const data = await response.json()
        if (data.status === 200 && data.results) {
          const r = data.results[0]
          setFormData(prev => ({ ...prev, postalCode, address: `${r.address1}${r.address2}${r.address3}` }))
        }
      } catch {
        // 住所検索に失敗しても手入力できるので無視する
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // 全項目必須。HTMLのrequiredだけでは空白のみの入力が通るため、ここでも確認する
    const requiredFields: [string, string][] = [
      [formData.lastName, '姓'], [formData.firstName, '名'],
      [formData.lastNameKana, 'セイ'], [formData.firstNameKana, 'メイ'],
      [formData.birthDate, '生年月日'], [formData.jstaNumber, '日本連盟登録番号'],
      [formData.postalCode, '郵便番号'], [formData.address, '住所'],
      [formData.phoneNumber, '電話番号'], [formData.affiliatedClub, '所属クラブ'],
    ]
    const missing = requiredFields.filter(([v]) => !v.trim()).map(([, label]) => label)
    if (missing.length > 0) {
      setError(`必須項目が未入力です: ${missing.join('、')}`)
      return
    }

    // 連盟番号: 選手登録ページと同じ形式チェック（JSTA＋数字8桁）。'-' のみは未入力扱い
    const jstaIssue = getJstaNumberIssue(formData.jstaNumber)
    if (jstaIssue) { setError(jstaIssue); return }
    const jstaNumber = normalizeJstaNumber(formData.jstaNumber)
    if (!jstaNumber) { setError('日本連盟登録番号を入力してください'); return }

    if (!isAddressValid(formData.address)) {
      setError('住所に番地が含まれていません。正確な住所を入力してください。')
      return
    }
    if (!isPhoneValid(formData.phoneNumber)) {
      setError('電話番号が不正です。10〜11桁の正しい番号を入力してください（例: 090-1234-5678）。')
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`${apiUrl}/api/players/self-register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          last_name: formData.lastName,
          first_name: formData.firstName,
          last_name_kana: formData.lastNameKana,
          first_name_kana: formData.firstNameKana,
          jsta_number: jstaNumber,
          birth_date: formData.birthDate,
          sex: parseInt(formData.sex),
          post_number: formData.postalCode,
          address: formData.address,
          phone_number: formData.phoneNumber,
          affiliated_club: formData.affiliatedClub,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setResult({
          playerName: data.player_name || `${formData.lastName} ${formData.firstName}`,
          created: data.created !== false,
        })
      } else {
        const err = await response.json().catch(() => ({}))
        const detail = err.detail || '登録に失敗しました'
        // 409 = 連盟番号が登録済み。本人の登録済みなら申込者に選んでもらえばよいので案内する
        setError(response.status === 409
          ? `${detail}。ご自身がすでに登録済みであれば、申込者の方にペア選手として選んでもらってください。番号に誤りがある場合は修正してください。`
          : detail)
      }
    } catch (e: any) {
      setError(`通信エラーが発生しました: ${e?.message || ''}`)
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
    display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: '#94a3b8',
  }
  const pageStyle = {
    minHeight: '100%', backgroundColor: '#0a1628', padding: '32px 16px', boxSizing: 'border-box' as const,
  }
  const cardStyle = {
    maxWidth: '520px', margin: '0 auto', padding: '28px 24px', borderRadius: '16px',
    backgroundColor: '#0f172a', border: '1px solid #1e293b',
  }

  if (result) {
    return (
      <div style={pageStyle}>
        <div style={{ ...cardStyle, textAlign: 'center', padding: '48px 24px' }}>
          <div style={{
            width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#10b981',
            margin: '0 auto 24px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '40px', color: '#ffffff',
          }}>✓</div>
          <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#f1f5f9', marginBottom: '16px' }}>
            {result.created ? '登録が完了しました' : 'すでに登録されています'}
          </h2>
          <p style={{ fontSize: '15px', color: '#94a3b8', lineHeight: '1.8', margin: 0 }}>
            {result.created
              ? <>申込者の方に、大会申込のペア選手で<br /><strong style={{ color: '#e2e8f0' }}>「{result.playerName}」</strong>を選んでもらってください。</>
              : <><strong style={{ color: '#e2e8f0' }}>「{result.playerName}」</strong>は登録済みです。<br />申込者の方に、大会申込のペア選手で選んでもらってください。</>}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <h1 style={{ fontSize: '22px', fontWeight: '600', color: '#f1f5f9', margin: '0 0 12px' }}>
          選手情報の登録
        </h1>
        <div style={{
          padding: '14px 16px', backgroundColor: '#1e3a8a', borderRadius: '8px',
          marginBottom: '24px', border: '1px solid #3b82f6', color: '#e0e7ff', fontSize: '14px', lineHeight: '1.7',
        }}>
          大会申込でペア選手として選んでもらうための情報を登録します。Discordアカウントは不要です。<br />
          登録後、申込者の方にあなたの名前をペア選手として選んでもらってください。<br />
          <span style={{ color: '#bfdbfe' }}>すべての項目が必須です。</span>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '100%', overflow: 'hidden' }}>
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
              <label style={labelStyle}>セイ *</label>
              <input type="text" value={formData.lastNameKana}
                onChange={(e) => setFormData({ ...formData, lastNameKana: e.target.value })}
                required placeholder="ヤマダ" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>メイ *</label>
              <input type="text" value={formData.firstNameKana}
                onChange={(e) => setFormData({ ...formData, firstNameKana: e.target.value })}
                required placeholder="タロウ" style={inputStyle} />
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

          <div>
            <label style={labelStyle}>生年月日 *</label>
            <input type="date" value={formData.birthDate}
              onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
              required style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>日本連盟登録番号 *</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0' }}>
              <span style={{
                padding: '12px 14px', borderRadius: '8px 0 0 8px', backgroundColor: '#1e293b',
                color: '#94a3b8', fontSize: '16px', border: '1px solid #1e293b', borderRight: 'none',
                whiteSpace: 'nowrap',
              }}>JSTA</span>
              <input type="text" inputMode="numeric" value={formData.jstaNumber}
                onChange={(e) => setFormData({ ...formData, jstaNumber: e.target.value })}
                required placeholder="数字8桁"
                style={{ ...inputStyle, borderRadius: '0 8px 8px 0' }} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>郵便番号 *</label>
            <input type="text" inputMode="tel" value={formData.postalCode}
              onChange={(e) => handlePostalCodeChange(e.target.value)}
              required placeholder="123-4567（7桁入力で自動検索）" style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>住所 *</label>
            {!formData.address && (
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>郵便番号を入力すると住所が自動入力されます</div>
            )}
            <textarea value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              required
              placeholder="番地・建物名まで入力してください"
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
          </div>

          <div>
            <label style={labelStyle}>電話番号 *</label>
            <input type="tel" value={formData.phoneNumber}
              onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
              required placeholder="090-1234-5678" style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>所属クラブ *</label>
            <input type="text" value={formData.affiliatedClub}
              onChange={(e) => setFormData({ ...formData, affiliatedClub: e.target.value })}
              required style={inputStyle} />
          </div>

          {error && (
            <div style={{
              padding: '16px', borderRadius: '8px', backgroundColor: '#7f1d1d',
              color: '#fff', border: '1px solid #ef4444', fontSize: '14px', lineHeight: '1.7',
            }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={{
            padding: '16px', borderRadius: '8px',
            backgroundColor: loading ? '#475569' : '#3b82f6',
            color: '#fff', border: 'none', fontSize: '16px', fontWeight: '600',
            cursor: loading ? 'not-allowed' : 'pointer', marginTop: '4px',
          }}>
            {loading ? '処理中...' : '登録する'}
          </button>
        </form>
      </div>
    </div>
  )
}
