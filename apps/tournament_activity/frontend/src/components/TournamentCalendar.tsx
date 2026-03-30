import { useState, useMemo, useEffect } from 'react'

interface TournamentCalendarProps {
  tournaments: any[]
  registrations: any[]
  practices?: any[]
  wards: any[]
  discordId?: string
  myPlayerId: number | null
  joinedPracticeIds: Set<number>
  onPracticeJoin: (practiceId: number) => Promise<void>
  onPracticeLeave: (practiceId: number) => Promise<void>
  onNavigate: (page: string, tournamentId?: string) => void
}

export default function TournamentCalendar({ tournaments, registrations, practices = [], wards, myPlayerId, joinedPracticeIds, onPracticeJoin, onPracticeLeave, onNavigate }: TournamentCalendarProps) {
  const [currentDate, setCurrentDate] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedTournament, setSelectedTournament] = useState<any | null>(null)
  const [selectedPractice, setSelectedPractice] = useState<any | null>(null)
  const [practiceParticipants, setPracticeParticipants] = useState<any[]>([])
  const [joining, setJoining] = useState(false)
  const [modalLoading, setModalLoading] = useState(false)

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  const handleJoin = async (practiceId: number) => {
    setJoining(true)
    try {
      await onPracticeJoin(practiceId)
      if (selectedPractice?.id === practiceId) {
        const pRes = await fetch(`${apiUrl}/api/practice/${practiceId}/participants`)
        if (pRes.ok) setPracticeParticipants(await pRes.json())
      }
    } finally { setJoining(false) }
  }

  const handleLeave = async (practiceId: number) => {
    if (!confirm('参加をキャンセルしますか？')) return
    await onPracticeLeave(practiceId)
    if (selectedPractice?.id === practiceId) {
      setPracticeParticipants(prev => prev.filter(pt => pt.player_id !== myPlayerId))
    }
  }

  const openPracticeDetail = async (practice: any) => {
    setSelectedPractice(practice)
    setModalLoading(true)
    try {
      const res = await fetch(`${apiUrl}/api/practice/${practice.id}/participants`)
      if (res.ok) setPracticeParticipants(await res.json())
    } catch {} finally { setModalLoading(false) }
  }

  // 画面幅に応じた表示文字数を計算
  const [cellChars, setCellChars] = useState(() => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1024
    return Math.max(2, Math.floor((w / 7 - 12) / 8))
  })

  useEffect(() => {
    const calc = () => {
      const cellWidth = window.innerWidth / 7 - 12 // padding分引く
      // 全角1文字 ≈ PC:10px, スマホ:8px
      const charWidth = window.innerWidth <= 640 ? 8 : 10
      setCellChars(Math.max(2, Math.floor(cellWidth / charWidth)))
    }
    calc()
    window.addEventListener('resize', calc)
    return () => window.removeEventListener('resize', calc)
  }, [])

  const truncate = (text: string) => {
    if (text.length <= cellChars) return text
    return text.slice(0, cellChars) + '..'
  }

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const prevMonth = () => { setCurrentDate(new Date(year, month - 1, 1)); setSelectedDate(null) }
  const nextMonth = () => { setCurrentDate(new Date(year, month + 1, 1)); setSelectedDate(null) }
  const goToday = () => {
    const now = new Date()
    setCurrentDate(new Date(now.getFullYear(), now.getMonth(), 1))
    setSelectedDate(null)
  }

  // 大会を日付でグループ化
  const tournamentsByDate = useMemo(() => {
    const map: Record<string, any[]> = {}
    tournaments.forEach(t => {
      const dateStr = t.tournament_date
      if (!map[dateStr]) map[dateStr] = []
      map[dateStr].push(t)
    })
    return map
  }, [tournaments])

  // 練習を日付でグループ化
  const practicesByDate = useMemo(() => {
    const map: Record<string, any[]> = {}
    practices.forEach(p => {
      const dateStr = p.practice_date
      if (!map[dateStr]) map[dateStr] = []
      map[dateStr].push(p)
    })
    return map
  }, [practices])

  // カレンダーグリッド生成
  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay() // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const days: (number | null)[] = []

    for (let i = 0; i < firstDay; i++) days.push(null)
    for (let d = 1; d <= daysInMonth; d++) days.push(d)
    // 末尾を7の倍数に
    while (days.length % 7 !== 0) days.push(null)

    return days
  }, [year, month])

  const getDateStr = (day: number) => {
    const m = String(month + 1).padStart(2, '0')
    const d = String(day).padStart(2, '0')
    return `${year}-${m}-${d}`
  }

  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const tournamentColor = { bg: '#1e3a8a', text: '#93c5fd', border: '#2563eb' }
  const practiceColor = { bg: '#4a1d96', text: '#c4b5fd', border: '#6d28d9' }

  const getWardName = (wardId: number) => {
    const w = wards.find((wd: any) => wd.ward_id === wardId)
    return w?.ward_name || ''
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    const weekdays = ['日', '月', '火', '水', '木', '金', '土']
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}（${weekdays[d.getDay()]}）`
  }

  const formatTime = (time: string | null) => {
    if (!time) return null
    return time.substring(0, 5)
  }

  // 選択された日付の大会・練習一覧
  const tournamentsOnDate = selectedDate ? (tournamentsByDate[selectedDate] || []) : []
  const practicesOnDate = selectedDate ? (practicesByDate[selectedDate] || []) : []

  // 当月の全イベント（日付順）
  const monthEvents = useMemo(() => {
    const ym = `${year}-${String(month + 1).padStart(2, '0')}`
    const events: { date: string; type: 'tournament' | 'practice'; data: any }[] = []
    tournaments.forEach(t => {
      if (t.tournament_date?.startsWith(ym)) events.push({ date: t.tournament_date, type: 'tournament', data: t })
    })
    practices.forEach(p => {
      if (p.practice_date?.startsWith(ym)) events.push({ date: p.practice_date, type: 'practice', data: p })
    })
    events.sort((a, b) => a.date.localeCompare(b.date))
    return events
  }, [tournaments, practices, year, month])

  const formatShortDate = (dateStr: string) => {
    const d = new Date(dateStr)
    const wds = ['日', '月', '火', '水', '木', '金', '土']
    return `${d.getMonth() + 1}/${d.getDate()}(${wds[d.getDay()]})`
  }

  // モーダルの大会に対するユーザーの申込情報
  const getRegistration = (tournamentId: string) =>
    registrations.find(r => r.tournament_id === tournamentId)

  const weekdays = ['日', '月', '火', '水', '木', '金', '土']

  return (
    <div>
      {/* ヘッダー: ナビゲーション */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '16px',
      }}>
        <button onClick={prevMonth} style={navBtnStyle}>&lt;</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#e2e8f0', margin: 0 }}>
            {year}年{month + 1}月
          </h3>
          <button onClick={goToday} style={{
            padding: '3px 10px', borderRadius: '4px', fontSize: '12px',
            backgroundColor: '#1e293b', color: '#94a3b8', border: '1px solid #334155',
            cursor: 'pointer',
          }}>今月</button>
        </div>
        <button onClick={nextMonth} style={navBtnStyle}>&gt;</button>
      </div>

      {/* 凡例 */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <div style={{
          fontSize: '11px', padding: '1px 8px', borderRadius: '2px',
          backgroundColor: tournamentColor.bg, color: tournamentColor.text,
          lineHeight: '16px',
        }}>大会</div>
        <div style={{
          fontSize: '11px', padding: '1px 8px', borderRadius: '2px',
          backgroundColor: practiceColor.bg, color: practiceColor.text,
          lineHeight: '16px',
        }}>練習</div>
      </div>

      {/* カレンダーグリッド */}
      <div style={{
        borderRadius: '10px', border: '1px solid #1e293b', overflow: 'hidden',
        backgroundColor: '#0c1220',
      }}>
      <div>
        {/* 曜日ヘッダー */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {weekdays.map((wd, i) => (
            <div key={wd} style={{
              padding: '8px 4px', textAlign: 'center', fontSize: '12px', fontWeight: '600',
              color: i === 0 ? '#f87171' : i === 6 ? '#60a5fa' : '#64748b',
              backgroundColor: '#070e1b', borderBottom: '2px solid #1e293b',
            }}>
              {wd}
            </div>
          ))}
        </div>

        {/* 日付セル */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {calendarDays.map((day, idx) => {
            if (day === null) {
              return <div key={`empty-${idx}`} className="cal-empty" style={emptyCellStyle} />
            }

            const dateStr = getDateStr(day)
            const dayTournaments = tournamentsByDate[dateStr] || []
            const dayPractices = practicesByDate[dateStr] || []
            const hasEvents = dayTournaments.length > 0 || dayPractices.length > 0
            const isToday = dateStr === todayStr
            const isSelected = dateStr === selectedDate
            const dayOfWeek = (new Date(year, month, day)).getDay()

            return (
              <div
                key={dateStr}
                className="cal-cell"
                onClick={() => {
                  if (hasEvents) {
                    setSelectedDate(dateStr)
                    setSelectedTournament(null)
                  }
                }}
                style={{
                  minHeight: '70px',
                  padding: '4px',
                  borderBottom: '1px solid #1e293b',
                  borderRight: (idx + 1) % 7 !== 0 ? '1px solid #0f1a2e' : 'none',
                  backgroundColor: isSelected ? '#162032' : 'transparent',
                  cursor: hasEvents ? 'pointer' : 'default',
                  transition: 'background-color 0.15s',
                }}
              >
                <div style={{
                  fontSize: '13px', fontWeight: isToday ? '700' : '400',
                  color: isToday ? '#3b82f6' : dayOfWeek === 0 ? '#f87171' : dayOfWeek === 6 ? '#60a5fa' : '#94a3b8',
                  marginBottom: '2px', textAlign: 'right', paddingRight: '4px',
                }}>
                  {isToday ? (
                    <span style={{
                      display: 'inline-block', width: '24px', height: '24px', lineHeight: '24px',
                      borderRadius: '50%', backgroundColor: '#3b82f6', color: '#fff', textAlign: 'center',
                    }}>{day}</span>
                  ) : day}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                  {dayTournaments.slice(0, 2).map((t: any) => (
                      <div key={t.tournament_id} className="cal-ev" style={{
                        fontSize: '10px', padding: '0px 3px', borderRadius: '2px',
                        backgroundColor: tournamentColor.bg, color: tournamentColor.text,
                        whiteSpace: 'nowrap', lineHeight: '15px', overflow: 'hidden',
                      }}>
                        {truncate(t.tournament_name)}
                      </div>
                  ))}
                  {dayTournaments.length > 2 && (
                    <div className="cal-ev-more" style={{ fontSize: '9px', color: '#64748b', textAlign: 'center', lineHeight: '12px' }}>
                      +{dayTournaments.length - 2}
                    </div>
                  )}
                  {dayPractices.slice(0, 1).map((p: any) => (
                    <div key={`p-${p.id}`} className="cal-ev" style={{
                      fontSize: '10px', padding: '0px 3px', borderRadius: '2px',
                      backgroundColor: '#4a1d96', color: '#c4b5fd',
                      whiteSpace: 'nowrap', lineHeight: '15px', overflow: 'hidden',
                    }}>
                      {truncate(p.location)}
                    </div>
                  ))}
                  {dayPractices.length > 1 && (
                    <div className="cal-ev-more" style={{ fontSize: '9px', color: '#64748b', textAlign: 'center', lineHeight: '12px' }}>
                      +{dayPractices.length - 1}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      </div>

      {/* 予定一覧: 日付選択時はその日のみ、未選択時は月全体 */}
      {!selectedTournament && (() => {
        const showingDate = !!selectedDate
        const events = showingDate
          ? [
              ...tournamentsOnDate.map((t: any) => ({ date: selectedDate!, type: 'tournament' as const, data: t })),
              ...practicesOnDate.map((p: any) => ({ date: selectedDate!, type: 'practice' as const, data: p })),
            ]
          : monthEvents

        if (events.length === 0) return null

        return (
          <div style={{
            marginTop: '16px', borderRadius: '10px', border: '1px solid #1e293b',
            backgroundColor: '#0c1220', overflow: 'hidden',
          }}>
            <div style={{
              padding: '12px 16px', backgroundColor: '#070e1b',
              borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontSize: '14px', fontWeight: '600', color: '#e2e8f0' }}>
                {showingDate ? formatDate(selectedDate!) : `${month + 1}月の予定`}
              </span>
              {showingDate && (
                <button onClick={() => setSelectedDate(null)} style={closeBtnStyle}>
                  全予定
                </button>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {events.map((ev, i) => ev.type === 'tournament' ? (
                <div
                  key={`t-${ev.data.tournament_id}-${i}`}
                  onClick={() => setSelectedTournament(ev.data)}
                  style={{
                    padding: '12px 16px', borderBottom: '1px solid #1e293b',
                    cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#162032')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      {!showingDate && (
                        <span style={{ fontSize: '12px', color: '#64748b', flexShrink: 0 }}>{formatShortDate(ev.date)}</span>
                      )}
                      <span style={{ fontSize: '14px', fontWeight: '500', color: '#e2e8f0' }}>
                        {ev.data.tournament_name}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {(Array.isArray(ev.data.type) ? ev.data.type : []).map((tp: string) => (
                        <span key={tp} style={{
                          padding: '1px 7px', borderRadius: '6px', fontSize: '11px',
                          backgroundColor: '#1e293b', color: '#94a3b8',
                        }}>{tp}</span>
                      ))}
                    </div>
                  </div>
                  <span style={{
                    padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '500',
                    backgroundColor: tournamentColor.bg, color: tournamentColor.text, border: `1px solid ${tournamentColor.border}`,
                    flexShrink: 0, marginLeft: '12px',
                  }}>大会</span>
                </div>
              ) : (
                <div
                  key={`p-${ev.data.id}-${i}`}
                  onClick={() => openPracticeDetail(ev.data)}
                  style={{
                    padding: '12px 16px', borderBottom: '1px solid #1e293b',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    cursor: 'pointer', transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#162032')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      {!showingDate && (
                        <span style={{ fontSize: '12px', color: '#64748b', flexShrink: 0 }}>{formatShortDate(ev.date)}</span>
                      )}
                      <span style={{ fontSize: '14px', fontWeight: '500', color: '#e2e8f0' }}>
                        {ev.data.location}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                      {formatTime(ev.data.start_time)} - {formatTime(ev.data.end_time)} / {ev.data.participant_count || 0}名参加
                    </div>
                  </div>
                  <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0, marginLeft: '12px' }}>
                    {myPlayerId && (joinedPracticeIds.has(ev.data.id) ? (
                      <span style={{
                        padding: '3px 10px', borderRadius: '6px', fontSize: '12px',
                        color: '#64748b', backgroundColor: '#1e293b',
                      }}>参加済</span>
                    ) : (
                      <button onClick={() => handleJoin(ev.data.id)} disabled={joining} style={{
                        padding: '3px 10px', borderRadius: '6px', fontSize: '12px',
                        backgroundColor: practiceColor.bg, color: practiceColor.text,
                        border: `1px solid ${practiceColor.border}`, cursor: 'pointer',
                      }}>参加</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* 大会詳細モーダル */}
      {selectedTournament && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '16px',
        }} onClick={() => setSelectedTournament(null)}>
          <div
            style={{
              backgroundColor: '#0f172a', borderRadius: '12px', border: '1px solid #1e293b',
              maxWidth: '500px', width: '100%', maxHeight: '80vh', overflowY: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            {(() => {
              const t = selectedTournament
              const reg = getRegistration(t.tournament_id)

              return (
                <>
                  {/* モーダルヘッダー */}
                  <div style={{
                    padding: '16px 20px', borderBottom: '1px solid #1e293b',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                  }}>
                    <div style={{ flex: 1 }}>
                      <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#e2e8f0', margin: '0 0 6px 0' }}>
                        {t.tournament_name}
                      </h3>
                      <span style={{
                        padding: '2px 10px', borderRadius: '6px', fontSize: '12px',
                        backgroundColor: tournamentColor.bg, color: tournamentColor.text, border: `1px solid ${tournamentColor.border}`,
                      }}>
                        大会
                      </span>
                    </div>
                    <button onClick={() => setSelectedTournament(null)} style={closeBtnStyle}>
                      ✕
                    </button>
                  </div>

                  {/* 大会情報 */}
                  <div style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '8px 12px', fontSize: '13px' }}>
                      <span style={detailLabelStyle}>開催日</span>
                      <span style={detailValueStyle}>{formatDate(t.tournament_date)}</span>

                      <span style={detailLabelStyle}>締切日</span>
                      <span style={detailValueStyle}>{formatDate(t.deadline_date)}</span>

                      <span style={detailLabelStyle}>主催</span>
                      <span style={detailValueStyle}>{getWardName(t.registrated_ward)}</span>

                      <span style={detailLabelStyle}>種別</span>
                      <span style={detailValueStyle}>
                        <span style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {(Array.isArray(t.type) ? t.type : []).map((tp: string) => (
                            <span key={tp} style={{
                              padding: '1px 7px', borderRadius: '6px', fontSize: '11px',
                              backgroundColor: '#1e293b', color: '#94a3b8',
                            }}>{tp}</span>
                          ))}
                        </span>
                      </span>

                      <span style={detailLabelStyle}>形式</span>
                      <span style={detailValueStyle}>{t.classification === 0 ? '個人戦' : '団体戦'}</span>

                      {t.venue && (
                        <>
                          <span style={detailLabelStyle}>会場</span>
                          <span style={detailValueStyle}>{t.venue}</span>
                        </>
                      )}

                      {(t.reception_time || t.opening_time || t.match_start_time) && (
                        <>
                          <span style={detailLabelStyle}>時刻</span>
                          <span style={detailValueStyle}>
                            {[
                              t.reception_time && `受付 ${formatTime(t.reception_time)}`,
                              t.opening_time && `開会式 ${formatTime(t.opening_time)}`,
                              t.match_start_time && `試合開始 ${formatTime(t.match_start_time)}`,
                            ].filter(Boolean).join(' / ')}
                          </span>
                        </>
                      )}

                      {t.entry_fee && (
                        <>
                          <span style={detailLabelStyle}>参加費</span>
                          <span style={detailValueStyle}>{t.entry_fee}</span>
                        </>
                      )}
                    </div>

                    {/* 申込情報 */}
                    {reg && (
                      <div style={{
                        marginTop: '16px', padding: '12px 14px', borderRadius: '8px',
                        backgroundColor: '#1e3a8a20', border: '1px solid #1e3a8a',
                      }}>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: '#93c5fd', marginBottom: '6px' }}>
                          あなたの申込情報
                        </div>
                        <div style={{ fontSize: '13px', color: '#cbd5e1' }}>
                          種別: {reg.type}
                        </div>
                      </div>
                    )}

                    {/* 要項PDFリンク */}
                    {t.guideline_pdf_path && (
                      <div style={{ marginTop: '12px' }}>
                        <a
                          href={`${apiUrl}/api/tournaments/guideline/${t.tournament_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'inline-block', padding: '8px 16px', borderRadius: '6px',
                            backgroundColor: '#1e293b', color: '#93c5fd', border: '1px solid #334155',
                            fontSize: '13px', textDecoration: 'none', cursor: 'pointer',
                          }}
                        >
                          大会要項PDFを表示
                        </a>
                      </div>
                    )}

                    {/* 申込ボタン */}
                    {(() => { const dl = new Date(t.deadline_date); dl.setHours(23,59,59); return new Date() <= dl && !reg; })() && (
                      <button
                        onClick={() => {
                          setSelectedTournament(null)
                          setSelectedDate(null)
                          onNavigate('apply', t.tournament_id)
                        }}
                        style={{
                          marginTop: '16px', width: '100%', padding: '10px',
                          borderRadius: '8px', backgroundColor: '#1e3a8a', color: '#93c5fd',
                          border: '1px solid #2563eb', fontSize: '14px', fontWeight: '600',
                          cursor: 'pointer',
                        }}
                      >
                        この大会に申し込む
                      </button>
                    )}
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}
      {/* 練習詳細モーダル */}
      {selectedPractice && (
        <div onClick={() => setSelectedPractice(null)} style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            backgroundColor: '#0f172a', borderRadius: '12px', border: '1px solid #1e293b',
            maxWidth: '480px', width: '100%', maxHeight: '80vh', overflowY: 'auto',
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '16px 20px', borderBottom: '1px solid #1e293b',
            }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#f1f5f9', margin: 0 }}>練習詳細</h3>
              <button onClick={() => setSelectedPractice(null)} style={closeBtnStyle}>✕</button>
            </div>
            <div style={{ padding: '16px 20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr', gap: '8px 12px', fontSize: '14px', marginBottom: '20px' }}>
                <span style={detailLabelStyle}>日付</span>
                <span style={detailValueStyle}>{formatDate(selectedPractice.practice_date)}</span>
                <span style={detailLabelStyle}>時間</span>
                <span style={detailValueStyle}>{formatTime(selectedPractice.start_time)} - {formatTime(selectedPractice.end_time)}</span>
                <span style={detailLabelStyle}>場所</span>
                <span style={detailValueStyle}>{selectedPractice.location}</span>
              </div>

              {myPlayerId && (
                <div style={{ marginBottom: '20px' }}>
                  {joinedPracticeIds.has(selectedPractice.id) ? (
                    <button onClick={() => handleLeave(selectedPractice.id)} style={{
                      padding: '10px', borderRadius: '6px', backgroundColor: 'transparent',
                      color: '#f87171', border: '1px solid #7f1d1d', fontSize: '14px',
                      fontWeight: '500', cursor: 'pointer', width: '100%',
                    }}>参加をキャンセル</button>
                  ) : (
                    <button onClick={() => handleJoin(selectedPractice.id)} disabled={joining} style={{
                      padding: '10px', borderRadius: '6px', backgroundColor: '#3b82f6',
                      color: '#fff', border: 'none', fontSize: '14px',
                      fontWeight: '600', cursor: 'pointer', width: '100%',
                    }}>{joining ? '処理中...' : '参加する'}</button>
                  )}
                </div>
              )}

              <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#e2e8f0', marginBottom: '10px' }}>
                参加者（{practiceParticipants.length}名）
              </h4>
              {modalLoading ? (
                <p style={{ color: '#94a3b8', fontSize: '13px' }}>読み込み中...</p>
              ) : practiceParticipants.length === 0 ? (
                <p style={{ color: '#64748b', fontSize: '13px' }}>まだ参加者がいません</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {practiceParticipants.map((pt: any) => (
                    <div key={pt.player_id} style={{
                      padding: '8px 12px', backgroundColor: '#0c1220', borderRadius: '6px',
                      border: '1px solid #1e293b', fontSize: '14px', color: '#e2e8f0',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <span>{pt.player_name}</span>
                      {pt.player_id === myPlayerId && (
                        <span style={{ fontSize: '11px', color: '#64748b' }}>あなた</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 640px) {
          .cal-cell { min-height: 52px !important; padding: 2px 1px !important; }
          .cal-cell .cal-ev { font-size: 8px !important; line-height: 13px !important; padding: 0 2px !important; }
          .cal-cell .cal-ev-more { font-size: 8px !important; line-height: 10px !important; }
          .cal-empty { min-height: 52px !important; }
        }
      `}</style>
    </div>
  )
}

const navBtnStyle: React.CSSProperties = {
  padding: '6px 14px', borderRadius: '6px', fontSize: '16px', fontWeight: '600',
  backgroundColor: '#1e293b', color: '#94a3b8', border: '1px solid #334155',
  cursor: 'pointer',
}

const closeBtnStyle: React.CSSProperties = {
  padding: '4px 10px', borderRadius: '5px', fontSize: '12px',
  backgroundColor: 'transparent', color: '#94a3b8', border: '1px solid #334155',
  cursor: 'pointer',
}

const emptyCellStyle: React.CSSProperties = {
  minHeight: '70px', backgroundColor: '#080f1d',
  borderBottom: '1px solid #1e293b',
}

const detailLabelStyle: React.CSSProperties = {
  color: '#64748b', fontWeight: '500',
}

const detailValueStyle: React.CSSProperties = {
  color: '#e2e8f0',
}
