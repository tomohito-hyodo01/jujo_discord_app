interface CompletePageProps {
  tournamentName: string
  type: string
  pairName?: string
  teamMembers?: string[]
  onBackToForm?: () => void
  onNavigateToEventList?: () => void
}

const checkmark = '\u2713'

export default function CompletePage({ tournamentName, type, pairName, teamMembers, onNavigateToEventList }: CompletePageProps) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <div style={{
        width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#10b981',
        margin: '0 auto 24px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '40px', color: '#ffffff'
      }}>
        {checkmark}
      </div>

      <h2 style={{ fontSize: '28px', fontWeight: '600', color: '#f1f5f9', marginBottom: '16px' }}>
        申込完了
      </h2>

      <p style={{ fontSize: '15px', color: '#94a3b8', marginBottom: '40px' }}>
        大会への申込が完了しました
      </p>

      <div style={{
        backgroundColor: '#0c1220', borderRadius: '12px', padding: '24px',
        marginBottom: '32px', border: '1px solid #1e293b', textAlign: 'left'
      }}>
        <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#cbd5e1', marginBottom: '16px' }}>
          申込内容
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#94a3b8', fontSize: '14px' }}>大会名</span>
            <span style={{ color: '#e2e8f0', fontSize: '14px', fontWeight: '500' }}>{tournamentName}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#94a3b8', fontSize: '14px' }}>種別</span>
            <span style={{ color: '#e2e8f0', fontSize: '14px', fontWeight: '500' }}>{type}</span>
          </div>

          {teamMembers ? (
            <div>
              <span style={{ color: '#94a3b8', fontSize: '14px', display: 'block', marginBottom: '8px' }}>チームメンバー</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {teamMembers.map((name, i) => (
                  <span key={i} style={{ color: '#e2e8f0', fontSize: '14px', fontWeight: '500', paddingLeft: '8px' }}>
                    {i + 1}. {name}
                  </span>
                ))}
              </div>
            </div>
          ) : pairName ? (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#94a3b8', fontSize: '14px' }}>ペア</span>
              <span style={{ color: '#e2e8f0', fontSize: '14px', fontWeight: '500' }}>{pairName}</span>
            </div>
          ) : null}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
        {onNavigateToEventList && (
          <button onClick={onNavigateToEventList} style={{
            padding: '14px 32px', borderRadius: '8px', backgroundColor: '#3b82f6',
            color: '#ffffff', border: 'none', fontSize: '15px', fontWeight: '500', cursor: 'pointer'
          }}>
            イベント一覧へ戻る
          </button>
        )}
      </div>
    </div>
  )
}
