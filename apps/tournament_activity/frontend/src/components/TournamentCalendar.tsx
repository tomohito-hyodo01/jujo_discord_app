import { useState, useMemo, useEffect } from 'react'

interface TournamentCalendarProps {
  tournaments: any[]
  registrations: any[]
  practices?: any[]
  refTrainings?: any[]
  wards: any[]
  discordId?: string
  myPlayerId: number | null
  joinedPracticeIds: Set<number>
  onPracticeJoin: (practiceId: number) => Promise<void>
  onPracticeLeave: (practiceId: number) => Promise<void>
  onNavigate: (page: string, tournamentId?: string) => void
  onOpenTournamentModal?: (tournament: any) => void
  onOpenPracticeModal?: (practice: any) => void
  customEvents?: any[]
  onOpenEventModal?: (event: any) => void
}

export default function TournamentCalendar({ tournaments, registrations: _registrations, practices = [], refTrainings = [], wards: _wards, myPlayerId: _myPlayerId, joinedPracticeIds, onPracticeJoin: _onPracticeJoin, onPracticeLeave: _onPracticeLeave, onNavigate: _onNavigate, onOpenTournamentModal, onOpenPracticeModal, customEvents = [], onOpenEventModal }: TournamentCalendarProps) {
  const [currentDate, setCurrentDate] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  // モーダルはEventList側で表示するため、カレンダー内では不要

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
    practices
      .filter(p => p.visibility !== 'invited' || (p.invited_player_ids || []).includes(_myPlayerId))
      .forEach(p => {
        const dateStr = p.practice_date
        if (!map[dateStr]) map[dateStr] = []
        map[dateStr].push(p)
      })
    return map
  }, [practices, _myPlayerId])

  const refTrainingsByDate = useMemo(() => {
    const map: Record<string, any[]> = {}
    refTrainings.forEach(r => {
      const dateStr = r.training_date
      if (!map[dateStr]) map[dateStr] = []
      map[dateStr].push(r)
    })
    return map
  }, [refTrainings])

  const customEventsByDate = useMemo(() => {
    const map: Record<string, any[]> = {}
    customEvents
      .filter(e => e.status !== 'cancelled')
      .filter(e => e.visibility !== 'invited' || (e.invited_player_ids || []).includes(_myPlayerId))
      .forEach(e => {
        const dateStr = e.event_date
        if (!map[dateStr]) map[dateStr] = []
        map[dateStr].push(e)
      })
    return map
  }, [customEvents, _myPlayerId])

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

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    const weekdays = ['日', '月', '火', '水', '木', '金', '土']
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}(${weekdays[d.getDay()]})`
  }

  const formatTime = (time: string | null) => {
    if (!time) return null
    return time.substring(0, 5)
  }

  // 選択された日付の大会・練習一覧
  const tournamentsOnDate = selectedDate ? (tournamentsByDate[selectedDate] || []) : []
  const practicesOnDate = selectedDate ? (practicesByDate[selectedDate] || []) : []
  const refTrainingsOnDate = selectedDate ? (refTrainingsByDate[selectedDate] || []) : []

  // 当月の全イベント（日付順）
  const monthEvents = useMemo(() => {
    const ym = `${year}-${String(month + 1).padStart(2, '0')}`
    const events: { date: string; type: 'tournament' | 'practice' | 'custom_event'; data: any }[] = []
    tournaments.forEach(t => {
      if (t.tournament_date?.startsWith(ym)) events.push({ date: t.tournament_date, type: 'tournament', data: t })
    })
    practices
      .filter(p => p.visibility !== 'invited' || (p.invited_player_ids || []).includes(_myPlayerId))
      .forEach(p => {
        if (p.practice_date?.startsWith(ym)) events.push({ date: p.practice_date, type: 'practice', data: p })
      })
    customEvents
      .filter(e => e.status !== 'cancelled')
      .filter(e => e.visibility !== 'invited' || (e.invited_player_ids || []).includes(_myPlayerId))
      .forEach(e => {
        if (e.event_date?.startsWith(ym)) events.push({ date: e.event_date, type: 'custom_event', data: e })
      })
    events.sort((a, b) => a.date.localeCompare(b.date))
    return events
  }, [tournaments, practices, customEvents, _myPlayerId, year, month])

  const formatShortDate = (dateStr: string) => {
    const d = new Date(dateStr)
    const wds = ['日', '月', '火', '水', '木', '金', '土']
    return `${d.getMonth() + 1}/${d.getDate()}(${wds[d.getDay()]})`
  }



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
        <div style={{
          fontSize: '11px', padding: '1px 8px', borderRadius: '2px',
          backgroundColor: '#0e4429', color: '#6ee7b7',
          lineHeight: '16px',
        }}>イベント</div>
      </div>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#94a3b8' }}>
        <div style={{ width: '14px', height: '14px', borderRadius: '3px', backgroundColor: '#713f12', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', color: '#fbbf24', lineHeight: '14px' }}>審</div>
        審判講習
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
            const dayRefTrainings = refTrainingsByDate[dateStr] || []
            const dayCustomEvents = customEventsByDate[dateStr] || []
            const hasEvents = dayTournaments.length > 0 || dayPractices.length > 0 || dayRefTrainings.length > 0 || dayCustomEvents.length > 0
            const isToday = dateStr === todayStr
            const isSelected = dateStr === selectedDate
            const dayOfWeek = (new Date(year, month, day)).getDay()

            return (
              <div
                key={dateStr}
                className="cal-cell"
                onClick={() => {
                  if (!hasEvents) return
                  const totalCount = dayTournaments.length + dayPractices.length + dayRefTrainings.length
                  if (totalCount === 1) {
                    setSelectedDate(dateStr)
                    if (dayTournaments.length === 1 && onOpenTournamentModal) {
                      onOpenTournamentModal(dayTournaments[0])
                    } else if (dayPractices.length === 1 && onOpenPracticeModal) {
                      onOpenPracticeModal(dayPractices[0])
                    } else {
                      // refTraining等は一覧表示
                    }
                  } else {
                    setSelectedDate(dateStr)
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
                  {dayRefTrainings.slice(0, 1).map((r: any) => (
                    <div key={`r-${r.id}`} className="cal-ev" style={{
                      fontSize: '10px', padding: '0px 3px', borderRadius: '2px',
                      backgroundColor: '#713f12', color: '#fbbf24',
                      whiteSpace: 'nowrap', lineHeight: '15px', overflow: 'hidden',
                    }}>
                      {r.grade}
                    </div>
                  ))}
                  {dayCustomEvents.slice(0, 1).map((e: any) => (
                    <div key={`e-${e.id}`} className="cal-ev" style={{
                      fontSize: '10px', padding: '0px 3px', borderRadius: '2px',
                      backgroundColor: '#0e4429', color: '#6ee7b7',
                      whiteSpace: 'nowrap', lineHeight: '15px', overflow: 'hidden',
                    }}>
                      {truncate(e.title)}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      </div>

      {/* 予定一覧: 日付選択時はその日のみ、未選択時は月全体 */}
      {(() => {
        const showingDate = !!selectedDate
        const events = showingDate
          ? [
              ...tournamentsOnDate.map((t: any) => ({ date: selectedDate!, type: 'tournament' as const, data: t })),
              ...practicesOnDate.map((p: any) => ({ date: selectedDate!, type: 'practice' as const, data: p })),
              ...refTrainingsOnDate.map((r: any) => ({ date: selectedDate!, type: 'referee' as const, data: r })),
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
                  onClick={() => onOpenTournamentModal ? onOpenTournamentModal(ev.data) : null}
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
              ) : ev.type === 'referee' ? (
                <div key={`r-${ev.data.id}-${i}`} style={{
                  padding: '12px 16px', borderBottom: '1px solid #1e293b',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      {!showingDate && <span style={{ fontSize: '12px', color: '#64748b', flexShrink: 0 }}>{formatShortDate(ev.date)}</span>}
                      <span style={{ fontSize: '14px', fontWeight: '500', color: '#e2e8f0' }}>{ev.data.grade} {ev.data.session_name}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#94a3b8' }}>{ev.data.venue}</div>
                  </div>
                  <span style={{
                    padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '500',
                    backgroundColor: '#713f12', color: '#fbbf24', border: '1px solid #a16207',
                    flexShrink: 0, marginLeft: '12px',
                  }}>審判講習</span>
                </div>
              ) : ev.type === 'custom_event' ? (
                <div key={`ce-${ev.data.id}-${i}`}
                  onClick={() => onOpenEventModal ? onOpenEventModal(ev.data) : null}
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
                      {!showingDate && <span style={{ fontSize: '12px', color: '#64748b', flexShrink: 0 }}>{formatShortDate(ev.date)}</span>}
                      <span style={{ fontSize: '14px', fontWeight: '500', color: '#e2e8f0' }}>{ev.data.title}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                      {ev.data.start_time && `${ev.data.start_time}${ev.data.end_time ? `-${ev.data.end_time}` : ''}`}
                      {ev.data.location && ` / ${ev.data.location}`}
                      {` / ${ev.data.participant_count || 0}名参加`}
                    </div>
                  </div>
                  <span style={{
                    padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '500',
                    backgroundColor: '#0e4429', color: '#6ee7b7', border: '1px solid #16a34a',
                    flexShrink: 0, marginLeft: '12px',
                  }}>イベント</span>
                </div>
              ) : (() => {
                  const p = ev.data
                  const deadlinePassed = p.deadline_date && new Date(p.deadline_date) < new Date()
                  return (
                <div
                  key={`p-${p.id}-${i}`}
                  onClick={() => onOpenPracticeModal ? onOpenPracticeModal(p) : null}
                  style={{
                    padding: '12px 16px', borderBottom: '1px solid #1e293b',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    cursor: 'pointer', transition: 'background-color 0.15s',
                    opacity: deadlinePassed ? 0.6 : 1,
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
                        {p.location}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                      {formatTime(p.start_time)} - {formatTime(p.end_time)} / {p.participant_count || 0}名参加
                    </div>
                  </div>
                  <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0, marginLeft: '12px' }}>
                    {(() => {
                      if (joinedPracticeIds.has(p.id)) {
                        return <span style={{ padding: '3px 10px', borderRadius: '6px', fontSize: '12px', color: '#64748b', backgroundColor: '#1e293b' }}>参加済</span>
                      }
                      if (deadlinePassed) {
                        return <span style={{ padding: '3px 10px', borderRadius: '6px', fontSize: '12px', color: '#475569', backgroundColor: '#1e293b' }}>申込終了</span>
                      }
                      return (
                        <span style={{
                          padding: '3px 10px', borderRadius: '6px', fontSize: '12px',
                          backgroundColor: practiceColor.bg, color: practiceColor.text,
                          border: `1px solid ${practiceColor.border}`,
                        }}>練習</span>
                      )
                    })()}
                  </div>
                </div>
                  )
                })())}
            </div>
          </div>
        )
      })()}


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

