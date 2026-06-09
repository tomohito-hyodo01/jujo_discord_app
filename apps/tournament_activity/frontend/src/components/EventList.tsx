import { useState, useEffect, useMemo } from 'react'
import TournamentCalendar from './TournamentCalendar'
import { filterPairCandidates } from '../utils/playerFilter'
import CommentSection from './CommentSection'

interface EventListProps {
  discordId: string
  onNavigate: (page: string, tournamentId?: string) => void
  guestMode?: boolean
}

export default function EventList({ discordId, onNavigate, guestMode = false }: EventListProps) {
  const [allTournaments, setAllTournaments] = useState<any[]>([])
  const [tournaments, setTournaments] = useState<any[]>([])
  const [wards, setWards] = useState<any[]>([])
  const [registrations, setRegistrations] = useState<any[]>([])
  const [practices, setPractices] = useState<any[]>([])
  const [refTrainings, setRefTrainings] = useState<any[]>([])
  const [refRegisteredIds, setRefRegisteredIds] = useState<Set<number>>(new Set())
  const [refJoiningId, setRefJoiningId] = useState<number | null>(null)
  const [selectedRefTraining, setSelectedRefTraining] = useState<any>(null)
  const [refParticipants, setRefParticipants] = useState<any[]>([])
  const [refModalLoading, setRefModalLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [eventFilter, setEventFilter] = useState<'all' | 'tournament' | 'practice' | 'referee'>(guestMode ? 'practice' : 'all')
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list')
  const [myPlayerId, setMyPlayerId] = useState<number | null>(null)
  const [myAdminRole, setMyAdminRole] = useState<number>(2)
  const [myPracticeAdmin, setMyPracticeAdmin] = useState<number>(0)
  const [mySex, setMySex] = useState<number | null>(null)
  const [myMemberLevel, setMyMemberLevel] = useState<number | null>(null)
  const [adminAddPlayerId, setAdminAddPlayerId] = useState<string>('')
  const [courtReservations, setCourtReservations] = useState<any[]>([])
  const [newReservation, setNewReservation] = useState({ start_time: '', end_time: '', reserver_name: '' })
  const [editingReservationId, setEditingReservationId] = useState<number | null>(null)
  const [editReservation, setEditReservation] = useState({ start_time: '', end_time: '', reserver_name: '' })
  const [joinedPracticeIds, setJoinedPracticeIds] = useState<Set<number>>(new Set())
  const [joiningId, setJoiningId] = useState<number | null>(null)
  const [selectedTournament, setSelectedTournament] = useState<any>(null)
  const [tournamentReg, setTournamentReg] = useState<any>(null)
  const [players, setPlayers] = useState<any[]>([])
  const [editingPair, setEditingPair] = useState(false)
  const [updatingPair, setUpdatingPair] = useState(false)
  const [courtInput, setCourtInput] = useState('')
  const [savingCourt, setSavingCourt] = useState(false)
  const [editingCourt, setEditingCourt] = useState(false)
  const [cancellingReg, setCancellingReg] = useState(false)
  const [tournamentRegs, setTournamentRegs] = useState<any[]>([])
  const [tournamentRegsLoading, setTournamentRegsLoading] = useState(false)
  const [selectedPractice, setSelectedPractice] = useState<any>(null)
  const [practiceParticipants, setPracticeParticipants] = useState<any[]>([])
  const [modalLoading, setModalLoading] = useState(false)
  // 汎用イベント
  const [customEvents, setCustomEvents] = useState<any[]>([])
  const [joinedEventIds, setJoinedEventIds] = useState<Set<number>>(new Set())
  const [joiningEventId, setJoiningEventId] = useState<number | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<any>(null)
  const [eventParticipants, setEventParticipants] = useState<any[]>([])
  const [eventModalLoading, setEventModalLoading] = useState(false)
  const [showCreateEvent, setShowCreateEvent] = useState(false)
  const [newEvent, setNewEvent] = useState({ title: '', event_date: '', start_time: '', end_time: '', location: '', deadline_date: '', max_participants: '', visibility: 'public' })
  const [newEventInvitedIds, setNewEventInvitedIds] = useState<number[]>([])
  const [creatingEvent, setCreatingEvent] = useState(false)
  const [editingEvent, setEditingEvent] = useState(false)
  const [editEventForm, setEditEventForm] = useState({ title: '', event_date: '', start_time: '', end_time: '', location: '', deadline_date: '', max_participants: '', visibility: 'public' })
  const [editEventInvitedIds, setEditEventInvitedIds] = useState<number[]>([])
  const [savingEvent, setSavingEvent] = useState(false)

  useEffect(() => {
    const loadData = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'

        let practiceData: any[] = []

        if (guestMode) {
          const practRes = await fetch(`${apiUrl}/api/practice`)
          if (practRes.ok) {
            practiceData = await practRes.json()
            setPractices(practiceData)
          }
        } else {
          const [tourRes, wardRes, regRes, practRes] = await Promise.all([
            fetch(`${apiUrl}/api/tournaments`),
            fetch(`${apiUrl}/api/wards`),
            fetch(`${apiUrl}/api/registrations/user/${discordId}`),
            fetch(`${apiUrl}/api/practice`),
          ])

          if (tourRes.ok) {
            const data = await tourRes.json()
            setAllTournaments(data)
            const today = new Date().toLocaleDateString('sv-SE')
            const upcoming = data
              .filter((t: any) => t.tournament_date >= today)
              .sort((a: any, b: any) => a.tournament_date.localeCompare(b.tournament_date))
            setTournaments(upcoming)
          }

          if (wardRes.ok) setWards(await wardRes.json())
          if (regRes.ok) setRegistrations(await regRes.json())
          const plRes = await fetch(`${apiUrl}/api/players`)
          if (plRes.ok) setPlayers(await plRes.json())

          // 審判講習
          const refRes = await fetch(`${apiUrl}/api/referee-training`)
          if (refRes.ok) {
            const refData = await refRes.json()
            setRefTrainings(refData)
            const refJoined = new Set<number>()
            for (const rt of refData) {
              const pRes = await fetch(`${apiUrl}/api/referee-training/${rt.id}/participants`)
              if (pRes.ok) {
                const pts = await pRes.json()
                if (pts.some((p: any) => p.discord_id === discordId)) refJoined.add(rt.id)
              }
            }
            setRefRegisteredIds(refJoined)
          }
          if (practRes.ok) {
            practiceData = await practRes.json()
            setPractices(practiceData)
          }
        }

        // プレイヤー情報と練習参加状況
        if (discordId) {
          const meRes = await fetch(`${apiUrl}/api/players/discord/${discordId}`)
          if (meRes.ok) {
            const me = await meRes.json()
            if (me?.player_id) {
              setMyPlayerId(me.player_id)
              if (me.admin_role != null) setMyAdminRole(me.admin_role)
              if (me.practice_admin != null) setMyPracticeAdmin(me.practice_admin)
              if (me.sex != null) setMySex(me.sex)
              if (me.member_level != null) setMyMemberLevel(me.member_level)
              if (practiceData.length > 0) {
                const joined = new Set<number>()
                await Promise.all(practiceData.map(async (p: any) => {
                  const pRes = await fetch(`${apiUrl}/api/practice/${p.id}/participants`)
                  if (pRes.ok) {
                    const pts = await pRes.json()
                    if (pts.some((pt: any) => pt.player_id === me.player_id)) joined.add(p.id)
                  }
                }))
                setJoinedPracticeIds(joined)
              }

              // 汎用イベント取得と参加状況チェック
              const evRes = await fetch(`${apiUrl}/api/events`)
              if (evRes.ok) {
                const evData = await evRes.json()
                setCustomEvents(evData)
                const evJoined = new Set<number>()
                await Promise.all(evData.map(async (ev: any) => {
                  const ptRes = await fetch(`${apiUrl}/api/events/${ev.id}/participants`)
                  if (ptRes.ok) {
                    const pts = await ptRes.json()
                    if (pts.some((pt: any) => pt.player_id === me.player_id)) evJoined.add(ev.id)
                  }
                }))
                setJoinedEventIds(evJoined)
              }
            }
          }
        }
      } catch {} finally { setLoading(false) }
    }

    loadData()
  }, [discordId])

  // 汎用イベント操作
  const handleEventJoin = async (eventId: number) => {
    if (!myPlayerId || joinedEventIds.has(eventId)) return
    setJoiningEventId(eventId)
    try {
      const res = await fetch(`${apiUrlRef}/api/events/${eventId}/join`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: myPlayerId }),
      })
      if (res.ok) {
        setJoinedEventIds(prev => new Set(prev).add(eventId))
        const evRes = await fetch(`${apiUrlRef}/api/events`)
        if (evRes.ok) setCustomEvents(await evRes.json())
      }
    } catch { alert('通信エラー') }
    finally { setJoiningEventId(null) }
  }

  const handleEventLeave = async (eventId: number) => {
    if (!myPlayerId) return
    if (!confirm('参加をキャンセルしますか？')) return
    try {
      const res = await fetch(`${apiUrlRef}/api/events/${eventId}/leave/${myPlayerId}`, { method: 'DELETE' })
      if (res.ok) {
        setJoinedEventIds(prev => { const n = new Set(prev); n.delete(eventId); return n })
        const evRes = await fetch(`${apiUrlRef}/api/events`)
        if (evRes.ok) setCustomEvents(await evRes.json())
        if (selectedEvent?.id === eventId) {
          setEventParticipants(prev => prev.filter(pt => pt.player_id !== myPlayerId))
        }
      }
    } catch { alert('通信エラー') }
  }

  // @ts-ignore - used in event modal
  const openEventDetail = async (ev: any) => {
    setSelectedEvent(ev)
    setEventModalLoading(true)
    try {
      const res = await fetch(`${apiUrlRef}/api/events/${ev.id}/participants`)
      if (res.ok) setEventParticipants(await res.json())
    } catch {} finally { setEventModalLoading(false) }
  }

  const handleCreateEvent = async () => {
    if (!newEvent.title || !newEvent.event_date) { alert('タイトルと開催日は必須です'); return }
    setCreatingEvent(true)
    try {
      const data: any = { ...newEvent, created_by: discordId }
      if (!data.start_time) delete data.start_time
      if (!data.end_time) delete data.end_time
      if (!data.location) delete data.location
      if (!data.deadline_date) delete data.deadline_date
      if (data.max_participants) { data.max_participants = parseInt(data.max_participants) } else { delete data.max_participants }
      const res = await fetch(`${apiUrlRef}/api/events`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (res.ok) {
        // invited の場合、招待者を保存
        if (newEvent.visibility === 'invited') {
          const created = await res.json()
          if (created?.id) {
            await fetch(`${apiUrlRef}/api/events/${created.id}/invitations`, {
              method: 'PUT', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ player_ids: newEventInvitedIds }),
            })
          }
        }
        setShowCreateEvent(false)
        setNewEvent({ title: '', event_date: '', start_time: '', end_time: '', location: '', deadline_date: '', max_participants: '', visibility: 'public' })
        setNewEventInvitedIds([])
        const evRes = await fetch(`${apiUrlRef}/api/events`)
        if (evRes.ok) setCustomEvents(await evRes.json())
      } else { alert('イベント作成に失敗しました') }
    } catch { alert('通信エラー') }
    finally { setCreatingEvent(false) }
  }

  const openEditEvent = () => {
    if (!selectedEvent) return
    setEditEventForm({
      title: selectedEvent.title || '',
      event_date: selectedEvent.event_date?.split('T')[0] || '',
      start_time: selectedEvent.start_time?.slice(0, 5) || '',
      end_time: selectedEvent.end_time?.slice(0, 5) || '',
      location: selectedEvent.location || '',
      deadline_date: selectedEvent.deadline_date ? selectedEvent.deadline_date.replace(' ', 'T').slice(0, 16) : '',
      max_participants: selectedEvent.max_participants != null ? String(selectedEvent.max_participants) : '',
      visibility: selectedEvent.visibility || 'public',
    })
    setEditEventInvitedIds(selectedEvent.invited_player_ids || [])
    setEditingEvent(true)
  }

  const handleSaveEvent = async () => {
    if (!selectedEvent) return
    setSavingEvent(true)
    try {
      const data: any = { ...editEventForm }
      if (!data.start_time) data.start_time = undefined
      if (!data.end_time) data.end_time = undefined
      if (!data.location) data.location = undefined
      if (!data.deadline_date) data.deadline_date = undefined
      data.max_participants = data.max_participants ? parseInt(data.max_participants) : null

      const res = await fetch(`${apiUrlRef}/api/events/${selectedEvent.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (data.visibility === 'invited') {
        await fetch(`${apiUrlRef}/api/events/${selectedEvent.id}/invitations`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ player_ids: editEventInvitedIds }),
        })
      }

      if (res.ok) {
        setEditingEvent(false)
        setSelectedEvent(null)
        const evRes = await fetch(`${apiUrlRef}/api/events`)
        if (evRes.ok) setCustomEvents(await evRes.json())
      } else { alert('更新に失敗しました') }
    } catch { alert('通信エラー') }
    finally { setSavingEvent(false) }
  }

  const handleDeleteEvent = async () => {
    if (!selectedEvent) return
    if (!confirm(`「${selectedEvent.title}」を削除しますか？`)) return
    try {
      const res = await fetch(`${apiUrlRef}/api/events/${selectedEvent.id}`, { method: 'DELETE' })
      if (res.ok) {
        setSelectedEvent(null)
        setEditingEvent(false)
        const evRes = await fetch(`${apiUrlRef}/api/events`)
        if (evRes.ok) setCustomEvents(await evRes.json())
      } else { alert('削除に失敗しました') }
    } catch { alert('通信エラー') }
  }

  const handleCancelEvent = async () => {
    if (!selectedEvent) return
    if (!confirm(`「${selectedEvent.title}」を中止にしますか？`)) return
    try {
      const res = await fetch(`${apiUrlRef}/api/events/${selectedEvent.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      })
      if (res.ok) {
        setSelectedEvent(null)
        const evRes = await fetch(`${apiUrlRef}/api/events`)
        if (evRes.ok) setCustomEvents(await evRes.json())
      } else { alert('中止に失敗しました') }
    } catch { alert('通信エラー') }
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    const weekdays = ['日', '月', '火', '水', '木', '金', '土']
    return `${d.getMonth() + 1}/${d.getDate()}(${weekdays[d.getDay()]})`
  }

  const formatTime = (t: string) => t?.slice(0, 5) || ''

  // 締切判定: 日付のみ(または時刻0:00)の締切は当日終日(23:59:59)まで有効とみなす
  const isDeadlinePassed = (deadline?: string | null): boolean => {
    if (!deadline) return false
    let s = String(deadline).replace(' ', 'T')
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += 'T23:59:59'
    const d = new Date(s)
    if (isNaN(d.getTime())) return false
    if (d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0) {
      d.setHours(23, 59, 59)
    }
    return d < new Date()
  }

  const apiUrlRef = import.meta.env.VITE_API_URL || 'http://localhost:8000'

  const openTournamentModal = async (t: any) => {
    setSelectedTournament(t)
    setEditingPair(false)
    const reg = registrations.find(r => r.tournament_id === t.tournament_id)
    setTournamentReg(reg || null)
    // 申込一覧を取得
    setTournamentRegsLoading(true)
    try {
      const res = await fetch(`${apiUrlRef}/api/registrations/tournament/${t.tournament_id}`)
      if (res.ok) setTournamentRegs(await res.json())
      else setTournamentRegs([])
    } catch { setTournamentRegs([]) }
    finally { setTournamentRegsLoading(false) }
  }
  const handleRegPairChange = async (registrationId: number, newPairId: number) => {
    setUpdatingPair(true)
    try {
      const res = await fetch(`${apiUrlRef}/api/registrations/${registrationId}/pair`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pair1: newPairId }),
      })
      if (res.ok) {
        setTournamentReg((prev: any) => prev ? { ...prev, pair1: newPairId } : prev)
        setRegistrations(prev => prev.map(r => r.registration_id === registrationId ? { ...r, pair1: newPairId } : r))
        setEditingPair(false)
      } else {
        const err = await res.json()
        alert(`ペア変更に失敗しました: ${err.detail || ''}`)
      }
    } catch { alert('通信エラー') }
    finally { setUpdatingPair(false) }
  }

  const handleRegCancel = async (registrationId: number, tournamentName: string) => {
    if (!confirm(`「${tournamentName}」の申込をキャンセルしますか？`)) return
    setCancellingReg(true)
    try {
      const res = await fetch(`${apiUrlRef}/api/registrations/${registrationId}`, { method: 'DELETE' })
      if (res.ok) {
        setRegistrations(prev => prev.filter(r => r.registration_id !== registrationId))
        setSelectedTournament(null)
      } else {
        const err = await res.json()
        alert(`キャンセルに失敗しました: ${err.detail || ''}`)
      }
    } catch { alert('通信エラー') }
    finally { setCancellingReg(false) }
  }

  const handleAdminRegCancel = async (registrationId: number, applicantName: string, tournamentId: string) => {
    if (!confirm(`${applicantName}さんの申込をキャンセルしますか？`)) return
    try {
      const res = await fetch(`${apiUrlRef}/api/registrations/${registrationId}`, { method: 'DELETE' })
      if (res.ok) {
        setRegistrations(prev => prev.filter(r => r.registration_id !== registrationId))
        // 申込一覧を再取得
        const regsRes = await fetch(`${apiUrlRef}/api/registrations/tournament/${tournamentId}`)
        if (regsRes.ok) setTournamentRegs(await regsRes.json())
      } else {
        const err = await res.json()
        alert(`キャンセルに失敗しました: ${err.detail || ''}`)
      }
    } catch { alert('通信エラー') }
  }

  const openPracticeModal = async (p: any) => {
    setSelectedPractice(p)
    setCourtInput(p.court_number || '')
    setEditingCourt(false)
    setModalLoading(true)
    setCourtReservations([])
    setNewReservation({ start_time: '', end_time: '', reserver_name: '' })
    try {
      const [pRes, rRes] = await Promise.all([
        fetch(`${apiUrlRef}/api/practice/${p.id}/participants`),
        fetch(`${apiUrlRef}/api/practice/${p.id}/reservations`),
      ])
      if (pRes.ok) setPracticeParticipants(await pRes.json())
      if (rRes.ok) setCourtReservations(await rRes.json())
    } catch {} finally { setModalLoading(false) }
  }

  const handleSaveCourt = async (practiceId: number) => {
    setSavingCourt(true)
    try {
      const res = await fetch(`${apiUrlRef}/api/practice/${practiceId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ court_number: courtInput }),
      })
      if (res.ok) {
        setSelectedPractice((prev: any) => prev ? { ...prev, court_number: courtInput || null } : prev)
        setPractices(prev => prev.map(p => p.id === practiceId ? { ...p, court_number: courtInput || null } : p))
        setEditingCourt(false)
      } else { alert('保存に失敗しました') }
    } catch { alert('通信エラー') }
    finally { setSavingCourt(false) }
  }

  const handlePracticeJoin = async (practiceId: number) => {
    if (!myPlayerId || joinedPracticeIds.has(practiceId)) return
    setJoiningId(practiceId)
    try {
      const res = await fetch(`${apiUrlRef}/api/practice/${practiceId}/join`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: myPlayerId }),
      })
      if (res.ok) {
        setJoinedPracticeIds(prev => new Set(prev).add(practiceId))
        const pRes = await fetch(`${apiUrlRef}/api/practice`)
        if (pRes.ok) setPractices(await pRes.json())
      }
    } catch { alert('通信エラー') }
    finally { setJoiningId(null) }
  }

  const handlePracticeLeave = async (practiceId: number) => {
    if (!myPlayerId) return
    try {
      const res = await fetch(`${apiUrlRef}/api/practice/${practiceId}/leave/${myPlayerId}`, { method: 'DELETE' })
      if (res.ok) {
        setJoinedPracticeIds(prev => { const n = new Set(prev); n.delete(practiceId); return n })
        const pRes = await fetch(`${apiUrlRef}/api/practice`)
        if (pRes.ok) setPractices(await pRes.json())
      }
    } catch { alert('通信エラー') }
  }

  const handleAdminAddParticipant = async (practiceId: number, playerId: number) => {
    try {
      const res = await fetch(`${apiUrlRef}/api/practice/${practiceId}/join`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: playerId }),
      })
      if (res.ok) {
        const pRes = await fetch(`${apiUrlRef}/api/practice/${practiceId}/participants`)
        if (pRes.ok) setPracticeParticipants(await pRes.json())
        setAdminAddPlayerId('')
        const practRes = await fetch(`${apiUrlRef}/api/practice`)
        if (practRes.ok) setPractices(await practRes.json())
      } else {
        const err = await res.json()
        alert(err.detail || '追加に失敗しました')
      }
    } catch { alert('通信エラー') }
  }

  const handleAdminRemoveParticipant = async (practiceId: number, playerId: number, playerName: string) => {
    if (!confirm(`${playerName}さんを参加者から削除しますか？`)) return
    try {
      const res = await fetch(`${apiUrlRef}/api/practice/${practiceId}/leave/${playerId}?discord_id=${encodeURIComponent(discordId)}`, { method: 'DELETE' })
      if (res.ok) {
        setPracticeParticipants(prev => prev.filter((p: any) => p.player_id !== playerId))
        const practRes = await fetch(`${apiUrlRef}/api/practice`)
        if (practRes.ok) setPractices(await practRes.json())
      } else {
        const e = await res.json().catch(() => ({}))
        alert(e.detail || '削除に失敗しました')
      }
    } catch { alert('通信エラー') }
  }

  const handleAddReservation = async (practiceId: number) => {
    if (!newReservation.start_time || !newReservation.end_time || !newReservation.reserver_name) return
    try {
      const res = await fetch(`${apiUrlRef}/api/practice/${practiceId}/reservations`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newReservation),
      })
      if (res.ok) {
        const rRes = await fetch(`${apiUrlRef}/api/practice/${practiceId}/reservations`)
        if (rRes.ok) setCourtReservations(await rRes.json())
        setNewReservation({ start_time: '', end_time: '', reserver_name: '' })
      }
    } catch { alert('通信エラー') }
  }

  const handleUpdateReservation = async (reservationId: number, practiceId: number) => {
    if (!editReservation.start_time || !editReservation.end_time || !editReservation.reserver_name) return
    try {
      const res = await fetch(`${apiUrlRef}/api/practice/reservations/${reservationId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editReservation),
      })
      if (res.ok) {
        const rRes = await fetch(`${apiUrlRef}/api/practice/${practiceId}/reservations`)
        if (rRes.ok) setCourtReservations(await rRes.json())
        setEditingReservationId(null)
      }
    } catch { alert('通信エラー') }
  }

  const handleDeleteReservation = async (reservationId: number, _practiceId: number) => {
    if (!confirm('この予約を削除しますか？')) return
    try {
      const res = await fetch(`${apiUrlRef}/api/practice/reservations/${reservationId}`, { method: 'DELETE' })
      if (res.ok) {
        setCourtReservations(prev => prev.filter(r => r.id !== reservationId))
      }
    } catch { alert('通信エラー') }
  }

  const handleToggleClosed = async (practiceId: number) => {
    try {
      const res = await fetch(`${apiUrlRef}/api/practice/${practiceId}/toggle-closed`, { method: 'PUT' })
      if (res.ok) {
        const data = await res.json()
        setPractices(prev => prev.map(p => p.id === practiceId ? { ...p, closed: data.closed } : p))
        setSelectedPractice((prev: any) => prev?.id === practiceId ? { ...prev, closed: data.closed } : prev)
      }
    } catch { alert('通信エラー') }
  }

  const getDaysUntil = (dateStr: string) => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const target = new Date(dateStr); target.setHours(0, 0, 0, 0)
    return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  }

  // 申込済み大会IDのSet
  const registeredTournamentIds = useMemo(() => {
    return new Set(registrations.map(r => r.tournament_id))
  }, [registrations])

  // 公開設定に応じて閲覧可否を判定
  const canViewByVisibility = (item: any): boolean => {
    const v = item.visibility
    if (!v || v === 'public') return true
    if (v === 'members_all') return myMemberLevel === 0 || myMemberLevel === 1
    if (v === 'members_regular') return myMemberLevel === 0
    if (v === 'invited') return (item.invited_player_ids || []).includes(myPlayerId)
    return true
  }

  // カレンダー用: 日付制限なしで公開設定のみ適用
  const visiblePractices = useMemo(
    () => practices.filter(canViewByVisibility),
    [practices, myPlayerId, myMemberLevel]
  )
  const visibleCustomEvents = useMemo(
    () => customEvents.filter(canViewByVisibility),
    [customEvents, myPlayerId, myMemberLevel]
  )

  // 大会と練習を統合して日付順にソート
  const upcomingPractices = useMemo(() => {
    const today = new Date().toLocaleDateString('sv-SE')
    return practices
      .filter(p => p.practice_date >= today)
      .filter(canViewByVisibility)
      .sort((a, b) => a.practice_date.localeCompare(b.practice_date))
  }, [practices, myPlayerId, myMemberLevel])

  type EventItem = { kind: 'tournament'; date: string; data: any } | { kind: 'practice'; date: string; data: any } | { kind: 'referee'; date: string; data: any } | { kind: 'custom_event'; date: string; data: any }

  const upcomingRefTrainings = useMemo(() => {
    const today = new Date().toLocaleDateString('sv-SE')
    return refTrainings.filter(t => t.training_date >= today)
  }, [refTrainings])

  const upcomingCustomEvents = useMemo(() => {
    const today = new Date().toLocaleDateString('sv-SE')
    return customEvents
      .filter(e => e.event_date >= today && e.status !== 'cancelled')
      .filter(canViewByVisibility)
      .sort((a, b) => a.event_date.localeCompare(b.event_date))
  }, [customEvents, myPlayerId, myMemberLevel])

  const allEvents = useMemo(() => {
    const items: EventItem[] = []
    if (eventFilter === 'all' || eventFilter === 'tournament') {
      tournaments.forEach(t => items.push({ kind: 'tournament', date: t.tournament_date, data: t }))
    }
    if (eventFilter === 'all' || eventFilter === 'practice') {
      upcomingPractices.forEach(p => items.push({ kind: 'practice', date: p.practice_date, data: p }))
    }
    if (eventFilter === 'all' || eventFilter === 'referee') {
      upcomingRefTrainings.forEach(r => items.push({ kind: 'referee', date: r.training_date, data: r }))
    }
    if (eventFilter === 'all') {
      upcomingCustomEvents.forEach(e => items.push({ kind: 'custom_event', date: e.event_date, data: e }))
    }
    items.sort((a, b) => a.date.localeCompare(b.date))
    return items
  }, [tournaments, upcomingPractices, upcomingRefTrainings, upcomingCustomEvents, eventFilter])

  // 締切間近の大会（3日以内、受付中かつ未申込のみ）
  const urgentDeadlines = tournaments.filter(t => {
    if (registeredTournamentIds.has(t.tournament_id)) return false
    const deadlineClosed = isDeadlinePassed(t.deadline_date)
    if (deadlineClosed) return false
    const days = getDaysUntil(t.deadline_date)
    return days >= 0 && days <= 3
  })

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>読み込み中...</div>
  }

  const filterBtnStyle = (active: boolean) => ({
    padding: '5px 12px', borderRadius: '14px', fontSize: '12px',
    border: `1px solid ${active ? '#2563eb' : '#334155'}`,
    backgroundColor: active ? '#1e3a8a' : 'transparent',
    color: active ? '#93c5fd' : '#94a3b8',
    cursor: 'pointer' as const,
  })

  return (
    <div>
      {/* 締切リマインダー */}
      {!guestMode && urgentDeadlines.length > 0 && (
        <div style={{
          padding: '14px 16px', marginBottom: '16px', borderRadius: '10px',
          backgroundColor: '#7f1d1d', border: '1px solid #dc2626',
        }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#fca5a5', marginBottom: '6px' }}>
            締切間近の大会があります
          </div>
          {urgentDeadlines.map(t => (
            <div key={t.tournament_id} style={{ fontSize: '13px', color: '#fecaca', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
              <span>{t.tournament_name} - 締切 {formatDate(t.deadline_date)}</span>
              <button onClick={() => onNavigate('apply', t.tournament_id)} style={{
                padding: '3px 10px', borderRadius: '4px', backgroundColor: '#dc2626', color: '#fff',
                border: 'none', fontSize: '12px', cursor: 'pointer', flexShrink: 0, marginLeft: '8px',
              }}>申込</button>
            </div>
          ))}
        </div>
      )}

      {/* タイトル + タブ切替 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#e2e8f0', margin: 0 }}>
          {viewMode === 'list' ? 'イベント一覧' : 'カレンダー'}
        </h2>
        <div style={{ display: 'flex', borderRadius: '6px', border: '1px solid #334155', overflow: 'hidden' }}>
          <button onClick={() => setViewMode('list')} style={{
            padding: '6px 14px', fontSize: '13px', border: 'none', cursor: 'pointer',
            backgroundColor: viewMode === 'list' ? '#1e3a8a' : '#0f172a',
            color: viewMode === 'list' ? '#93c5fd' : '#64748b',
          }}>一覧</button>
          <button onClick={() => setViewMode('calendar')} style={{
            padding: '6px 14px', fontSize: '13px', border: 'none', cursor: 'pointer',
            backgroundColor: viewMode === 'calendar' ? '#1e3a8a' : '#0f172a',
            color: viewMode === 'calendar' ? '#93c5fd' : '#64748b',
          }}>カレンダー</button>
        </div>
      </div>

      {viewMode === 'calendar' ? (
        <TournamentCalendar
          tournaments={guestMode ? [] : allTournaments}
          registrations={guestMode ? [] : registrations}
          practices={visiblePractices}
          refTrainings={refTrainings}
          wards={guestMode ? [] : wards}
          discordId={discordId}
          myPlayerId={myPlayerId}
          joinedPracticeIds={joinedPracticeIds}
          onPracticeJoin={handlePracticeJoin}
          onPracticeLeave={handlePracticeLeave}
          onNavigate={onNavigate}
          onOpenTournamentModal={openTournamentModal}
          onOpenPracticeModal={openPracticeModal}
          customEvents={visibleCustomEvents}
          onOpenEventModal={openEventDetail}
        />
      ) : (
      <>
        {/* フィルター */}
        {!guestMode && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={() => setEventFilter('all')} style={filterBtnStyle(eventFilter === 'all')}>すべて</button>
          <button onClick={() => setEventFilter('tournament')} style={filterBtnStyle(eventFilter === 'tournament')}>大会のみ</button>
          <button onClick={() => setEventFilter('practice')} style={filterBtnStyle(eventFilter === 'practice')}>練習のみ</button>
          <button onClick={() => setEventFilter('referee')} style={filterBtnStyle(eventFilter === 'referee')}>審判講習</button>
          <span style={{ fontSize: '12px', color: '#64748b', marginLeft: '4px' }}>{allEvents.length}件</span>
        </div>
        )}

        {allEvents.length === 0 ? (
          <div style={{
            padding: '40px', textAlign: 'center', color: '#94a3b8',
            backgroundColor: '#0c1220', borderRadius: '12px', border: '1px solid #1e293b'
          }}>
            予定されているイベントはありません
          </div>
        ) : (
          <div style={{
            borderRadius: '10px', border: '1px solid #1e293b',
            backgroundColor: '#0c1220', overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {allEvents.map((ev, i) => ev.kind === 'custom_event' ? (() => {
                const ce = ev.data
                const deadlinePassed = isDeadlinePassed(ce.deadline_date)
                const isJoined = joinedEventIds.has(ce.id)
                return (
                  <div key={`ce-${ce.id}-${i}`} onClick={() => openEventDetail(ce)} style={{
                    padding: '12px 16px', borderBottom: '1px solid #1e293b',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    cursor: 'pointer', transition: 'background-color 0.15s',
                    opacity: deadlinePassed && !isJoined ? 0.6 : 1,
                  }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#162032')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '12px', color: '#64748b', flexShrink: 0 }}>{formatDate(ev.date)}</span>
                        <span style={{ fontSize: '14px', fontWeight: '500', color: '#e2e8f0' }}>{ce.title}</span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                        {ce.start_time && `${ce.start_time}${ce.end_time ? `-${ce.end_time}` : ''}`}
                        {ce.location && ` / ${ce.location}`}
                        {` / ${ce.participant_count || 0}名参加`}
                      </div>
                    </div>
                    <span style={{
                      padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '500',
                      backgroundColor: isJoined ? '#1e293b' : '#0e4429', color: isJoined ? '#64748b' : '#6ee7b7',
                      border: `1px solid ${isJoined ? '#334155' : '#16a34a'}`,
                      flexShrink: 0, marginLeft: '12px',
                    }}>{isJoined ? '参加済' : 'イベント'}</span>
                  </div>
                )
              })() : ev.kind === 'referee' ? (() => {
                const rt = ev.data
                const joined = refRegisteredIds.has(rt.id)
                const expired = rt.deadline_date && new Date(rt.deadline_date + 'T23:59:59') < new Date()
                let tagText = '審判講習'
                let tagBg = '#713f12'
                let tagColor = '#fbbf24'
                let tagBorder = '#a16207'
                if (joined) { tagText = '審判講習（申込済）'; tagBg = '#1e293b'; tagColor = '#64748b'; tagBorder = '#334155' }
                else if (expired) { tagText = '受付終了'; tagBg = '#1e293b'; tagColor = '#475569'; tagBorder = '#334155' }
                return (
                <div key={`r-${rt.id}-${i}`}
                  onClick={() => {
                    setSelectedRefTraining(rt)
                    setRefModalLoading(true)
                    fetch(`${apiUrlRef}/api/referee-training/${rt.id}/participants`)
                      .then(r => r.ok ? r.json() : []).then(setRefParticipants).finally(() => setRefModalLoading(false))
                  }}
                  style={{
                    padding: '12px 16px', borderBottom: '1px solid #1e293b', cursor: 'pointer',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    transition: 'background-color 0.15s', opacity: expired && !joined ? 0.6 : 1,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#162032')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '12px', color: '#64748b', flexShrink: 0 }}>{formatDate(ev.date)}</span>
                      <span style={{ fontSize: '14px', fontWeight: '500', color: '#e2e8f0' }}>{rt.grade} {rt.session_name}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '12px', color: '#94a3b8' }}>
                      <span>{rt.venue}</span>
                      <span>{rt.participant_count || 0}名申込</span>
                    </div>
                  </div>
                  <span style={{
                    padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '500',
                    backgroundColor: tagBg, color: tagColor, border: `1px solid ${tagBorder}`,
                    flexShrink: 0, marginLeft: '12px',
                  }}>{tagText}</span>
                </div>
                )
              })() : ev.kind === 'tournament' ? (() => {
                const t = ev.data
                const isRegistered = registeredTournamentIds.has(t.tournament_id)
                const deadlineClosed = isDeadlinePassed(t.deadline_date)

                const isFull = t.max_entries != null && (t.entry_count || 0) >= t.max_entries
                const sexRestricted = t.sex_restriction != null && mySex != null && t.sex_restriction !== mySex

                let tagText = '大会申込'
                let tagBg = '#1e3a8a'
                let tagColor = '#93c5fd'
                let tagBorder = '#2563eb'
                if (isRegistered) {
                  tagText = '大会（申込済）'; tagBg = '#1e293b'; tagColor = '#64748b'; tagBorder = '#334155'
                } else if (sexRestricted) {
                  tagText = t.sex_restriction === 0 ? '男子限定' : '女子限定'; tagBg = '#1e293b'; tagColor = '#475569'; tagBorder = '#334155'
                } else if (deadlineClosed) {
                  tagText = '受付終了'; tagBg = '#1e293b'; tagColor = '#475569'; tagBorder = '#334155'
                } else if (isFull) {
                  tagText = '定員'; tagBg = '#1e293b'; tagColor = '#475569'; tagBorder = '#334155'
                }

                return (
                <div
                  key={`t-${t.tournament_id}-${i}`}
                  onClick={() => openTournamentModal(t)}
                  style={{
                    padding: '12px 16px', borderBottom: '1px solid #1e293b',
                    cursor: 'pointer',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    transition: 'background-color 0.15s',
                    opacity: (deadlineClosed || sexRestricted) ? 0.6 : 1,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#162032')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '12px', color: '#64748b', flexShrink: 0 }}>{formatDate(ev.date)}</span>
                      <span style={{ fontSize: '14px', fontWeight: '500', color: '#e2e8f0' }}>
                        {t.tournament_name}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                      {(Array.isArray(t.type) ? t.type : []).map((tp: string) => (
                        <span key={tp} style={{
                          padding: '1px 7px', borderRadius: '6px', fontSize: '11px',
                          backgroundColor: '#1e293b', color: '#94a3b8',
                        }}>{tp}</span>
                      ))}
                      <span style={{ fontSize: '11px', color: '#64748b', marginLeft: '4px' }}>
                        {t.entry_count || 0}{t.max_entries != null ? `/${t.max_entries}` : ''}組
                      </span>
                    </div>
                  </div>
                  <span style={{
                    padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '500',
                    backgroundColor: tagBg, color: tagColor, border: `1px solid ${tagBorder}`,
                    flexShrink: 0, marginLeft: '12px',
                  }}>{tagText}</span>
                </div>
                )
              })() : (() => {
                const p = ev.data
                const pDeadlinePassed = isDeadlinePassed(p.deadline_date)
                return (
                <div
                  key={`p-${p.id}-${i}`}
                  onClick={() => openPracticeModal(p)}
                  style={{
                    padding: '12px 16px', borderBottom: '1px solid #1e293b',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    cursor: 'pointer', transition: 'background-color 0.15s',
                    opacity: pDeadlinePassed ? 0.6 : 1,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#162032')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '12px', color: '#64748b', flexShrink: 0 }}>{formatDate(ev.date)}</span>
                      <span style={{ fontSize: '14px', fontWeight: '500', color: '#e2e8f0' }}>
                        {ev.data.location}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                      {formatTime(ev.data.start_time)} - {formatTime(ev.data.end_time)} / {ev.data.participant_count || 0}名参加
                      {ev.data.participant_names && ev.data.participant_names.length > 0 && (
                        <span style={{ color: '#64748b', marginLeft: '8px' }}>{ev.data.participant_names.join('、')}</span>
                      )}
                    </div>
                  </div>
                  <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0, marginLeft: '12px' }}>
                    {(() => {
                      const p = ev.data
                      const deadlinePassed = isDeadlinePassed(p.deadline_date)
                      const isClosed = p.closed === 1
                      if (joinedPracticeIds.has(p.id)) {
                        return <span style={{ padding: '3px 10px', borderRadius: '6px', fontSize: '12px', color: '#64748b', backgroundColor: '#1e293b' }}>練習（参加済）</span>
                      }
                      if (deadlinePassed || isClosed) {
                        return <span style={{ padding: '3px 10px', borderRadius: '6px', fontSize: '12px', color: '#475569', backgroundColor: '#1e293b' }}>{isClosed ? '練習（締切）' : '練習（申込終了）'}</span>
                      }
                      return (
                        <button onClick={() => handlePracticeJoin(p.id)} disabled={joiningId === p.id || !myPlayerId} style={{
                          padding: '3px 10px', borderRadius: '6px', fontSize: '12px',
                          backgroundColor: '#4a1d96', color: '#c4b5fd',
                          border: '1px solid #6d28d9', cursor: !myPlayerId ? 'not-allowed' : 'pointer',
                          opacity: !myPlayerId ? 0.5 : 1,
                        }}>{joiningId === p.id ? '...' : '練習参加'}</button>
                      )
                    })()}
                  </div>
                </div>
                )
              })())}
            </div>
          </div>
        )}
      </>
      )}

      {/* 大会詳細モーダル */}
      {selectedTournament && (
        <div onClick={() => setSelectedTournament(null)} style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            backgroundColor: '#0f172a', borderRadius: '12px', border: '1px solid #1e293b',
            maxWidth: '500px', width: '100%', maxHeight: '80vh', overflowY: 'auto',
          }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#f1f5f9', margin: 0 }}>{selectedTournament.tournament_name}</h3>
              <button onClick={() => setSelectedTournament(null)} style={{ padding: '4px 10px', borderRadius: '5px', fontSize: '12px', backgroundColor: 'transparent', color: '#94a3b8', border: '1px solid #334155', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ padding: '16px 20px' }}>
              {(() => {
                const t = selectedTournament
                const fmtT = (s: string) => s?.slice(0, 5) || ''
                const timeBits = [
                  t.reception_time && `受付 ${fmtT(t.reception_time)}`,
                  t.opening_time && `開会式 ${fmtT(t.opening_time)}`,
                  t.match_start_time && `試合開始 ${fmtT(t.match_start_time)}`,
                ].filter(Boolean).join(' / ')
                const rows: [string, any][] = [
                  ['開催日', formatDate(t.tournament_date)],
                  ['締切日', formatDate(t.deadline_date)],
                  ['主催', wards.find((w: any) => w.ward_id === t.registrated_ward)?.ward_name || ''],
                  ['形式', t.classification === 0 ? '個人戦' : '団体戦'],
                  ['申込数', `${t.entry_count || 0}${t.max_entries != null ? ` / ${t.max_entries}` : ''}`],
                ]
                if (t.venue) rows.push(['会場', t.venue])
                if (timeBits) rows.push(['時刻', timeBits])
                if (t.entry_fee) rows.push(['参加費', t.entry_fee])
                return rows.map(([label, val]) => (
                  <div key={String(label)} style={{ display: 'flex', padding: '8px 0', borderBottom: '1px solid #1e293b', fontSize: '14px' }}>
                    <span style={{ width: '80px', flexShrink: 0, color: '#64748b', fontSize: '13px' }}>{label}</span>
                    <span style={{ color: '#e2e8f0', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{val}</span>
                  </div>
                ))
              })()}
              <div style={{ display: 'flex', padding: '8px 0', borderBottom: '1px solid #1e293b', fontSize: '14px' }}>
                <span style={{ width: '80px', flexShrink: 0, color: '#64748b', fontSize: '13px' }}>種別</span>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {(Array.isArray(selectedTournament.type) ? selectedTournament.type : []).map((tp: string) => (
                    <span key={tp} style={{ padding: '1px 7px', borderRadius: '6px', fontSize: '11px', backgroundColor: '#1e293b', color: '#94a3b8' }}>{tp}</span>
                  ))}
                </div>
              </div>

              {(() => {
                const hasPdf = !!selectedTournament.has_guideline
                const url = hasPdf ? `${apiUrlRef}/api/tournaments/guideline/${encodeURIComponent(selectedTournament.tournament_id)}` : ''
                return (
                  <div style={{ marginTop: '12px' }}>
                    <a
                      href={hasPdf ? url : undefined}
                      target={hasPdf ? '_blank' : undefined}
                      rel="noreferrer"
                      onClick={hasPdf ? undefined : (e) => e.preventDefault()}
                      style={{
                        display: 'inline-block', padding: '8px 16px', borderRadius: '6px',
                        fontSize: '13px', fontWeight: '500', textAlign: 'center',
                        textDecoration: 'none',
                        backgroundColor: hasPdf ? '#1e3a8a' : '#1e293b',
                        color: hasPdf ? '#93c5fd' : '#475569',
                        border: `1px solid ${hasPdf ? '#2563eb' : '#334155'}`,
                        cursor: hasPdf ? 'pointer' : 'not-allowed',
                      }}
                    >{hasPdf ? '要項の確認' : '要項なし'}</a>
                  </div>
                )
              })()}

              {tournamentReg ? (
                <div style={{ marginTop: '16px' }}>
                  <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: '#0c1220', border: '1px solid #1e293b', marginBottom: '12px' }}>
                    <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '6px' }}>申込情報</div>
                    <div style={{ fontSize: '14px', color: '#e2e8f0' }}>
                      <div>種別: {tournamentReg.type}</div>
                      {selectedTournament?.classification === 1 ? (
                        <div style={{ marginTop: '4px' }}>
                          メンバー: {(() => {
                            const allIds = ([tournamentReg.pair1].filter(Boolean)).concat(tournamentReg.pair2 || [])
                            return allIds.map((id: number) => players.find(p => p.player_id === id)?.player_name || '不明').join('、') || '-'
                          })()}
                        </div>
                      ) : tournamentReg.pair1 ? (
                        <div style={{ marginTop: '4px' }}>
                          ペア: {(() => {
                            const isApplicant = tournamentReg.is_applicant !== false
                            const p = isApplicant
                              ? players.find(pl => pl.player_id === tournamentReg.pair1)
                              : players.find(pl => pl.discord_id === tournamentReg.discord_id)
                            return p?.player_name || '-'
                          })()}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {/* ペア変更（個人戦のみ） */}
                  {selectedTournament?.classification !== 1 && tournamentReg.is_applicant !== false && (
                    editingPair ? (
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                        <select
                          defaultValue={tournamentReg.pair1}
                          onChange={e => handleRegPairChange(tournamentReg.registration_id, parseInt(e.target.value))}
                          disabled={updatingPair}
                          style={{ flex: 1, padding: '8px', borderRadius: '6px', backgroundColor: '#0c1220', color: '#e2e8f0', border: '1px solid #334155', fontSize: '13px' }}
                        >
                          {(() => {
                            const me = players.find(pl => pl.discord_id === discordId)
                            return filterPairCandidates(
                              players, discordId, me?.sex ?? null,
                              tournamentReg.type, selectedTournament?.tournament_date, selectedTournament?.registrated_ward
                            ).map(p => (
                              <option key={p.player_id} value={p.player_id}>{p.player_name}</option>
                            ))
                          })()}
                        </select>
                        <button onClick={() => setEditingPair(false)} style={{
                          padding: '8px 12px', borderRadius: '6px', backgroundColor: 'transparent',
                          color: '#94a3b8', border: '1px solid #334155', fontSize: '13px', cursor: 'pointer',
                        }}>戻る</button>
                      </div>
                    ) : (
                      <button onClick={() => setEditingPair(true)} style={{
                        width: '100%', padding: '10px', borderRadius: '6px', marginBottom: '8px',
                        backgroundColor: '#1e3a8a', color: '#93c5fd', border: '1px solid #2563eb',
                        fontSize: '14px', cursor: 'pointer',
                      }}>ペア変更</button>
                    )
                  )}

                  {/* キャンセル */}
                  <button
                    onClick={() => handleRegCancel(tournamentReg.registration_id, selectedTournament.tournament_name)}
                    disabled={cancellingReg}
                    style={{
                      width: '100%', padding: '10px', borderRadius: '6px',
                      backgroundColor: 'transparent', color: '#f87171', border: '1px solid #7f1d1d',
                      fontSize: '14px', cursor: cancellingReg ? 'not-allowed' : 'pointer',
                    }}
                  >{cancellingReg ? 'キャンセル中...' : '申込をキャンセル'}</button>
                </div>
              ) : (() => {
                const expired = isDeadlinePassed(selectedTournament.deadline_date)
                const sexBlocked = selectedTournament.sex_restriction != null && mySex != null && selectedTournament.sex_restriction !== mySex
                if (expired) return <div style={{ marginTop: '16px', padding: '10px', borderRadius: '8px', backgroundColor: '#1e293b', textAlign: 'center', fontSize: '14px', color: '#64748b' }}>受付終了</div>
                if (sexBlocked) return <div style={{ marginTop: '16px', padding: '10px', borderRadius: '8px', backgroundColor: '#1e293b', textAlign: 'center', fontSize: '14px', color: '#64748b' }}>{selectedTournament.sex_restriction === 0 ? '男子' : '女子'}限定の大会です</div>
                return (
                  <button onClick={() => { setSelectedTournament(null); onNavigate('apply', selectedTournament.tournament_id) }} style={{
                    marginTop: '16px', width: '100%', padding: '10px', borderRadius: '8px',
                    backgroundColor: '#1e3a8a', color: '#93c5fd', border: '1px solid #2563eb',
                    fontSize: '14px', fontWeight: '600', cursor: 'pointer',
                  }}>この大会に申し込む</button>
                )
              })()}

              {/* 申込状況一覧 */}
              <div style={{ marginTop: '20px', borderTop: '1px solid #1e293b', paddingTop: '16px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#e2e8f0', marginBottom: '10px' }}>
                  申込状況（{tournamentRegs.length}件）
                </h4>
                {tournamentRegsLoading ? (
                  <p style={{ color: '#94a3b8', fontSize: '13px' }}>読み込み中...</p>
                ) : tournamentRegs.length === 0 ? (
                  <p style={{ color: '#64748b', fontSize: '13px' }}>まだ申込はありません</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {tournamentRegs.map((r: any, i: number) => (
                      <div key={i} style={{
                        padding: '8px 12px', backgroundColor: '#0c1220', borderRadius: '6px',
                        border: '1px solid #1e293b', fontSize: '13px',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ color: '#e2e8f0' }}>
                            <span style={{ fontWeight: '500' }}>{r.applicant_name || r.discord_id}</span>
                            {selectedTournament?.classification === 1 ? (
                              (() => {
                                const allIds = ([r.pair1].filter(Boolean)).concat(r.pair2 || [])
                                const names = allIds.map((id: number) => players.find(p => p.player_id === id)?.player_name || '').filter(Boolean)
                                return names.length > 0 ? <span style={{ color: '#94a3b8' }}> / {names.join('、')}</span> : null
                              })()
                            ) : r.pair_name ? (
                              <span style={{ color: '#94a3b8' }}> / {r.pair_name}</span>
                            ) : null}
                          </div>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                            <span style={{ padding: '1px 7px', borderRadius: '6px', fontSize: '11px', backgroundColor: '#1e293b', color: '#94a3b8' }}>
                              {r.type}
                            </span>
                            {r.team_status === 1 && (
                              <span style={{ padding: '1px 7px', borderRadius: '6px', fontSize: '11px', backgroundColor: '#78350f', color: '#fbbf24' }}>
                                参加希望
                              </span>
                            )}
                            {myAdminRole === 0 && (
                              <button onClick={() => handleAdminRegCancel(r.registration_id, r.applicant_name || r.discord_id, selectedTournament.tournament_id)} style={{
                                padding: '2px 8px', borderRadius: '4px', backgroundColor: 'transparent',
                                color: '#f87171', border: '1px solid #7f1d1d', fontSize: '11px', cursor: 'pointer',
                              }}>取消</button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {/* 管理者用: 代理申込ボタン */}
                {myAdminRole === 0 && (
                  <button onClick={() => { setSelectedTournament(null); onNavigate('apply', selectedTournament.tournament_id) }} style={{
                    marginTop: '12px', width: '100%', padding: '10px', borderRadius: '6px',
                    backgroundColor: '#1e3a8a', color: '#93c5fd', border: '1px solid #2563eb',
                    fontSize: '13px', cursor: 'pointer',
                  }}>代理申込（申込画面へ）</button>
                )}
              </div>
            </div>
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
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#f1f5f9', margin: 0 }}>練習詳細</h3>
              <button onClick={() => setSelectedPractice(null)} style={{ padding: '4px 10px', borderRadius: '5px', fontSize: '12px', backgroundColor: 'transparent', color: '#94a3b8', border: '1px solid #334155', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ padding: '16px 20px' }}>
              {[
                ['日付', formatDate(selectedPractice.practice_date)],
                ['時間', `${formatTime(selectedPractice.start_time)} - ${formatTime(selectedPractice.end_time)}`],
                ['場所', selectedPractice.location],
                ...(selectedPractice.deadline_date ? [['回答期限', (() => {
                  const d = new Date(selectedPractice.deadline_date)
                  const wd = ['日','月','火','水','木','金','土'][d.getDay()]
                  return `${d.getMonth() + 1}/${d.getDate()}(${wd}) ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
                })()]] : []),
              ].map(([label, val]) => (
                <div key={String(label)} style={{ display: 'flex', padding: '8px 0', borderBottom: '1px solid #1e293b', fontSize: '14px' }}>
                  <span style={{ width: '60px', flexShrink: 0, color: '#64748b', fontSize: '13px' }}>{label}</span>
                  <span style={{ color: '#e2e8f0' }}>{val}</span>
                </div>
              ))}

              {/* コート番号 */}
              <div style={{ display: 'flex', padding: '8px 0', borderBottom: '1px solid #1e293b', fontSize: '14px', alignItems: 'center' }}>
                <span style={{ width: '60px', flexShrink: 0, color: '#64748b', fontSize: '13px' }}>コート</span>
                {editingCourt ? (
                  <div style={{ display: 'flex', gap: '6px', flex: 1, alignItems: 'center' }}>
                    <input type="text" value={courtInput} onChange={e => setCourtInput(e.target.value)}
                      autoFocus placeholder="例: 3"
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveCourt(selectedPractice.id); if (e.key === 'Escape') setEditingCourt(false) }}
                      style={{ flex: 1, padding: '4px 8px', borderRadius: '4px', backgroundColor: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', fontSize: '14px', boxSizing: 'border-box' as const }} />
                    <button onClick={() => handleSaveCourt(selectedPractice.id)} disabled={savingCourt} style={{
                      padding: '4px 10px', borderRadius: '4px', backgroundColor: '#1e3a8a', color: '#93c5fd', border: '1px solid #2563eb', fontSize: '12px', cursor: 'pointer',
                    }}>{savingCourt ? '...' : '保存'}</button>
                    <button onClick={() => setEditingCourt(false)} style={{
                      padding: '4px 8px', borderRadius: '4px', backgroundColor: 'transparent', color: '#94a3b8', border: '1px solid #334155', fontSize: '12px', cursor: 'pointer',
                    }}>戻る</button>
                  </div>
                ) : (
                  <span onClick={() => setEditingCourt(true)} style={{ color: selectedPractice.court_number ? '#e2e8f0' : '#475569', cursor: 'pointer', padding: '4px 8px', borderRadius: '4px', transition: 'background 0.15s' }}
                    onMouseEnter={e => ((e.currentTarget as HTMLElement).style.backgroundColor = '#1e293b')}
                    onMouseLeave={e => ((e.currentTarget as HTMLElement).style.backgroundColor = 'transparent')}
                  >
                    {selectedPractice.court_number ? `${selectedPractice.court_number}番` : '未設定(タップで入力)'}
                  </span>
                )}
              </div>

              {/* コート予約情報（管理者・練習管理者のみ） */}
              {(myAdminRole === 0 || myPracticeAdmin === 1) && courtReservations.length > 0 && (
                <div style={{ marginTop: '12px' }}>
                  <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '6px' }}>コート予約</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {courtReservations.map((r: any) => (
                      <div key={r.id} style={{
                        padding: '6px 10px', backgroundColor: '#0c1220', borderRadius: '6px',
                        border: '1px solid #1e293b', fontSize: '13px',
                      }}>
                        {editingReservationId === r.id ? (
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                            <input type="time" value={editReservation.start_time}
                              onChange={e => setEditReservation(prev => ({ ...prev, start_time: e.target.value }))}
                              style={{ padding: '4px 6px', borderRadius: '4px', backgroundColor: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', fontSize: '12px' }} />
                            <span style={{ color: '#64748b' }}>〜</span>
                            <input type="time" value={editReservation.end_time}
                              onChange={e => setEditReservation(prev => ({ ...prev, end_time: e.target.value }))}
                              style={{ padding: '4px 6px', borderRadius: '4px', backgroundColor: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', fontSize: '12px' }} />
                            <input type="text" value={editReservation.reserver_name}
                              onChange={e => setEditReservation(prev => ({ ...prev, reserver_name: e.target.value }))}
                              style={{ flex: 1, minWidth: '60px', padding: '4px 6px', borderRadius: '4px', backgroundColor: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', fontSize: '12px' }} />
                            <button onClick={() => handleUpdateReservation(r.id, selectedPractice.id)} style={{
                              padding: '3px 8px', borderRadius: '4px', backgroundColor: '#1e3a8a', color: '#93c5fd', border: '1px solid #2563eb', fontSize: '11px', cursor: 'pointer',
                            }}>保存</button>
                            <button onClick={() => setEditingReservationId(null)} style={{
                              padding: '3px 8px', borderRadius: '4px', backgroundColor: 'transparent', color: '#94a3b8', border: '1px solid #334155', fontSize: '11px', cursor: 'pointer',
                            }}>戻る</button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: '#e2e8f0' }}>
                              {r.start_time}〜{r.end_time}　<span style={{ color: '#94a3b8' }}>{r.reserver_name}</span>
                            </span>
                            {(myAdminRole === 0 || myPracticeAdmin === 1) && (
                              <div style={{ display: 'flex', gap: '4px' }}>
                                <button onClick={() => { setEditingReservationId(r.id); setEditReservation({ start_time: r.start_time, end_time: r.end_time, reserver_name: r.reserver_name }) }} style={{
                                  padding: '2px 8px', borderRadius: '4px', backgroundColor: 'transparent', color: '#60a5fa', border: '1px solid #1e3a8a', fontSize: '11px', cursor: 'pointer',
                                }}>編集</button>
                                <button onClick={() => handleDeleteReservation(r.id, selectedPractice.id)} style={{
                                  padding: '2px 8px', borderRadius: '4px', backgroundColor: 'transparent', color: '#f87171', border: '1px solid #7f1d1d', fontSize: '11px', cursor: 'pointer',
                                }}>削除</button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 管理者・練習管理者: コート予約追加 */}
              {(myAdminRole === 0 || myPracticeAdmin === 1) && (
                <div style={{ marginTop: '12px', padding: '12px', backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #1e293b' }}>
                  <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px' }}>コート予約を追加</div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <input type="time" value={newReservation.start_time}
                      onChange={e => setNewReservation(prev => ({ ...prev, start_time: e.target.value }))}
                      style={{ padding: '6px 8px', borderRadius: '5px', backgroundColor: '#0c1220', color: '#e2e8f0', border: '1px solid #334155', fontSize: '13px' }} />
                    <span style={{ color: '#64748b' }}>〜</span>
                    <input type="time" value={newReservation.end_time}
                      onChange={e => setNewReservation(prev => ({ ...prev, end_time: e.target.value }))}
                      style={{ padding: '6px 8px', borderRadius: '5px', backgroundColor: '#0c1220', color: '#e2e8f0', border: '1px solid #334155', fontSize: '13px' }} />
                    <input type="text" value={newReservation.reserver_name}
                      onChange={e => setNewReservation(prev => ({ ...prev, reserver_name: e.target.value }))}
                      placeholder="予約者名"
                      style={{ flex: 1, minWidth: '100px', padding: '6px 8px', borderRadius: '5px', backgroundColor: '#0c1220', color: '#e2e8f0', border: '1px solid #334155', fontSize: '13px' }} />
                    <button onClick={() => handleAddReservation(selectedPractice.id)}
                      disabled={!newReservation.start_time || !newReservation.end_time || !newReservation.reserver_name}
                      style={{
                        padding: '6px 12px', borderRadius: '5px', backgroundColor: '#1e3a8a', color: '#93c5fd',
                        border: '1px solid #2563eb', fontSize: '13px', cursor: 'pointer',
                        opacity: (!newReservation.start_time || !newReservation.end_time || !newReservation.reserver_name) ? 0.5 : 1,
                      }}>追加</button>
                  </div>
                </div>
              )}

              {/* 参加/キャンセルボタン */}
              {myPlayerId && (() => {
                const deadlinePassed = isDeadlinePassed(selectedPractice.deadline_date)
                const isClosed = selectedPractice.closed === 1
                if (deadlinePassed || isClosed) {
                  return <div style={{ marginTop: '16px', padding: '10px', borderRadius: '8px', backgroundColor: '#1e293b', textAlign: 'center', fontSize: '14px', color: '#64748b' }}>
                    {joinedPracticeIds.has(selectedPractice.id) ? '参加済(締切済)' : isClosed ? '締め切りました' : '申込終了'}
                  </div>
                }
                if (joinedPracticeIds.has(selectedPractice.id)) {
                  return <button onClick={() => { handlePracticeLeave(selectedPractice.id); setSelectedPractice(null) }} style={{
                    marginTop: '16px', width: '100%', padding: '10px', borderRadius: '6px',
                    backgroundColor: 'transparent', color: '#f87171', border: '1px solid #7f1d1d',
                    fontSize: '14px', fontWeight: '500', cursor: 'pointer',
                  }}>参加をキャンセル</button>
                }
                return <button onClick={() => { handlePracticeJoin(selectedPractice.id); setSelectedPractice(null) }} disabled={joiningId === selectedPractice.id} style={{
                  marginTop: '16px', width: '100%', padding: '10px', borderRadius: '6px',
                  backgroundColor: '#3b82f6', color: '#fff', border: 'none',
                  fontSize: '14px', fontWeight: '600', cursor: 'pointer',
                }}>参加する</button>
              })()}

              {/* 管理者用：締切/再開ボタン */}
              {myAdminRole === 0 && (
                <button onClick={() => handleToggleClosed(selectedPractice.id)} style={{
                  marginTop: '8px', width: '100%', padding: '10px', borderRadius: '6px',
                  backgroundColor: selectedPractice.closed ? '#1e3a8a' : '#7f1d1d',
                  color: selectedPractice.closed ? '#93c5fd' : '#fca5a5',
                  border: `1px solid ${selectedPractice.closed ? '#2563eb' : '#dc2626'}`,
                  fontSize: '14px', fontWeight: '500', cursor: 'pointer',
                }}>{selectedPractice.closed ? '受付を再開する' : '受付を締め切る'}</button>
              )}

              {/* 参加者一覧 */}
              <div style={{ marginTop: '20px' }}>
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {pt.player_id === myPlayerId && <span style={{ fontSize: '11px', color: '#64748b' }}>あなた</span>}
                          {myAdminRole === 0 && (
                            <button onClick={() => handleAdminRemoveParticipant(selectedPractice.id, pt.player_id, pt.player_name)} style={{
                              padding: '2px 8px', borderRadius: '4px', backgroundColor: 'transparent',
                              color: '#f87171', border: '1px solid #7f1d1d', fontSize: '11px', cursor: 'pointer',
                            }}>削除</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 管理者用: 参加者追加 */}
                {myAdminRole === 0 && (
                  <div style={{ marginTop: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <select value={adminAddPlayerId} onChange={e => setAdminAddPlayerId(e.target.value)} style={{
                      flex: 1, padding: '8px 10px', borderRadius: '6px', backgroundColor: '#0c1220',
                      color: '#e2e8f0', border: '1px solid #334155', fontSize: '13px',
                    }}>
                      <option value="">選手を追加...</option>
                      {players
                        .filter((p: any) => !practiceParticipants.some((pt: any) => pt.player_id === p.player_id))
                        .sort((a: any, b: any) => (a.player_name_kana || '').localeCompare(b.player_name_kana || ''))
                        .map((p: any) => <option key={p.player_id} value={p.player_id}>{p.player_name}</option>)
                      }
                    </select>
                    <button onClick={() => { if (adminAddPlayerId) handleAdminAddParticipant(selectedPractice.id, parseInt(adminAddPlayerId)) }}
                      disabled={!adminAddPlayerId} style={{
                        padding: '8px 14px', borderRadius: '6px', backgroundColor: '#1e3a8a',
                        color: '#93c5fd', border: '1px solid #2563eb', fontSize: '13px',
                        cursor: adminAddPlayerId ? 'pointer' : 'not-allowed', opacity: adminAddPlayerId ? 1 : 0.5,
                      }}>追加</button>
                  </div>
                )}

                <CommentSection targetType="practice" targetId={selectedPractice.id} discordId={discordId} />
              </div>
            </div>
          </div>
        </div>
      )}
      {/* 審判講習モーダル */}
      {selectedRefTraining && (
        <div onClick={() => setSelectedRefTraining(null)} style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            backgroundColor: '#0f172a', borderRadius: '12px', border: '1px solid #1e293b',
            maxWidth: '480px', width: '100%', maxHeight: '80vh', overflowY: 'auto',
          }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#f1f5f9', margin: 0 }}>
                {selectedRefTraining.grade} {selectedRefTraining.session_name}
              </h3>
              <button onClick={() => setSelectedRefTraining(null)} style={{ padding: '4px 10px', borderRadius: '5px', fontSize: '12px', backgroundColor: 'transparent', color: '#94a3b8', border: '1px solid #334155', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ padding: '16px 20px' }}>
              {[
                ['日付', formatDate(selectedRefTraining.training_date)],
                ['会場', selectedRefTraining.venue],
                ['締切', formatDate(selectedRefTraining.deadline_date)],
                ['対象', selectedRefTraining.target || '-'],
                ['費用', selectedRefTraining.total_fee ? `${selectedRefTraining.total_fee.toLocaleString()}円` : '-'],
              ].map(([label, val]) => (
                <div key={String(label)} style={{ display: 'flex', padding: '6px 0', borderBottom: '1px solid #1e293b', fontSize: '14px' }}>
                  <span style={{ width: '60px', flexShrink: 0, color: '#64748b', fontSize: '13px' }}>{label}</span>
                  <span style={{ color: '#e2e8f0' }}>{val}</span>
                </div>
              ))}

              {(() => {
                const joined = refRegisteredIds.has(selectedRefTraining.id)
                const expired = selectedRefTraining.deadline_date && new Date(selectedRefTraining.deadline_date + 'T23:59:59') < new Date()
                if (joined) {
                  return <button onClick={async () => {
                    if (!confirm('申込をキャンセルしますか？')) return
                    const res = await fetch(`${apiUrlRef}/api/referee-training/${selectedRefTraining.id}/cancel/${discordId}`, { method: 'DELETE' })
                    if (res.ok) {
                      setRefRegisteredIds(prev => { const n = new Set(prev); n.delete(selectedRefTraining.id); return n })
                      setRefParticipants(prev => prev.filter(p => p.discord_id !== discordId))
                    }
                  }} style={{
                    marginTop: '16px', width: '100%', padding: '10px', borderRadius: '6px',
                    backgroundColor: 'transparent', color: '#f87171', border: '1px solid #7f1d1d', fontSize: '14px', cursor: 'pointer',
                  }}>申込をキャンセル</button>
                }
                if (expired) {
                  return <div style={{ marginTop: '16px', padding: '10px', borderRadius: '8px', backgroundColor: '#1e293b', textAlign: 'center', fontSize: '14px', color: '#64748b' }}>受付終了</div>
                }
                return <button onClick={async () => {
                  setRefJoiningId(selectedRefTraining.id)
                  const res = await fetch(`${apiUrlRef}/api/referee-training/${selectedRefTraining.id}/register`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ discord_id: discordId }),
                  })
                  if (res.ok) {
                    setRefRegisteredIds(prev => new Set(prev).add(selectedRefTraining.id))
                    const pRes = await fetch(`${apiUrlRef}/api/referee-training/${selectedRefTraining.id}/participants`)
                    if (pRes.ok) setRefParticipants(await pRes.json())
                  }
                  setRefJoiningId(null)
                }} disabled={refJoiningId === selectedRefTraining.id} style={{
                  marginTop: '16px', width: '100%', padding: '10px', borderRadius: '6px',
                  backgroundColor: '#3b82f6', color: '#fff', border: 'none', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
                }}>{refJoiningId === selectedRefTraining.id ? '処理中...' : '申し込む'}</button>
              })()}

              <div style={{ marginTop: '20px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#e2e8f0', marginBottom: '10px' }}>
                  申込者（{refParticipants.length}名）
                </h4>
                {refModalLoading ? <p style={{ color: '#94a3b8', fontSize: '13px' }}>読み込み中...</p>
                : refParticipants.length === 0 ? <p style={{ color: '#64748b', fontSize: '13px' }}>まだ申込者がいません</p>
                : <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {refParticipants.map((pt: any) => (
                      <div key={pt.discord_id} style={{
                        padding: '8px 12px', backgroundColor: '#0c1220', borderRadius: '6px', border: '1px solid #1e293b',
                        fontSize: '14px', color: '#e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      }}>
                        <span>{pt.player_name || pt.discord_id}</span>
                        {pt.discord_id === discordId && <span style={{ fontSize: '11px', color: '#64748b' }}>あなた</span>}
                      </div>
                    ))}
                  </div>
                }
              </div>

              <CommentSection targetType="referee_training" targetId={selectedRefTraining.id} discordId={discordId} />
            </div>
          </div>
        </div>
      )}

      {/* フローティング追加ボタン */}
      {!guestMode && myAdminRole <= 1 && !showCreateEvent && !selectedEvent && !selectedPractice && !selectedTournament && (
        <button onClick={() => setShowCreateEvent(true)} style={{
          position: 'fixed', bottom: '24px', right: '24px', zIndex: 100,
          width: '56px', height: '56px', borderRadius: '50%',
          backgroundColor: '#3b82f6', color: '#fff', border: 'none',
          fontSize: '28px', fontWeight: '300', lineHeight: '1',
          cursor: 'pointer', boxShadow: '0 4px 12px rgba(59,130,246,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      )}

      {/* イベント作成モーダル */}
      {showCreateEvent && (
        <div onClick={() => setShowCreateEvent(false)} style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px', boxSizing: 'border-box',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            backgroundColor: '#0f172a', borderRadius: '12px', border: '1px solid #1e293b',
            maxWidth: '480px', width: '100%', maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box',
          }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#f1f5f9', margin: 0 }}>イベント作成</h3>
              <button onClick={() => setShowCreateEvent(false)} style={{ padding: '4px 10px', borderRadius: '5px', fontSize: '12px', backgroundColor: 'transparent', color: '#94a3b8', border: '1px solid #334155', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>タイトル *</label>
                <input type="text" value={newEvent.title} onChange={e => setNewEvent({ ...newEvent, title: e.target.value })}
                  placeholder="例: 春の合宿" required style={{ width: '100%', padding: '10px', borderRadius: '6px', backgroundColor: '#0c1220', color: '#e2e8f0', border: '1px solid #1e293b', fontSize: '14px', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>開催日 *</label>
                <input type="date" value={newEvent.event_date} onChange={e => setNewEvent({ ...newEvent, event_date: e.target.value })}
                  required style={{ width: '100%', padding: '10px', borderRadius: '6px', backgroundColor: '#0c1220', color: '#e2e8f0', border: '1px solid #1e293b', fontSize: '14px', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>開始</label>
                  <input type="time" value={newEvent.start_time} onChange={e => setNewEvent({ ...newEvent, start_time: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', backgroundColor: '#0c1220', color: '#e2e8f0', border: '1px solid #1e293b', fontSize: '14px', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>終了</label>
                  <input type="time" value={newEvent.end_time} onChange={e => setNewEvent({ ...newEvent, end_time: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', backgroundColor: '#0c1220', color: '#e2e8f0', border: '1px solid #1e293b', fontSize: '14px', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>場所</label>
                <input type="text" value={newEvent.location} onChange={e => setNewEvent({ ...newEvent, location: e.target.value })}
                  placeholder="例: 舎人公園" style={{ width: '100%', padding: '10px', borderRadius: '6px', backgroundColor: '#0c1220', color: '#e2e8f0', border: '1px solid #1e293b', fontSize: '14px', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>参加締切</label>
                <input type="datetime-local" value={newEvent.deadline_date} onChange={e => setNewEvent({ ...newEvent, deadline_date: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', backgroundColor: '#0c1220', color: '#e2e8f0', border: '1px solid #1e293b', fontSize: '14px', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>参加人数上限</label>
                <input type="number" value={newEvent.max_participants} onChange={e => setNewEvent({ ...newEvent, max_participants: e.target.value })}
                  placeholder="未設定の場合は無制限" min="1"
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', backgroundColor: '#0c1220', color: '#e2e8f0', border: '1px solid #1e293b', fontSize: '14px', boxSizing: 'border-box' }} />
              </div>
              {/* 公開設定 */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>公開設定</label>
                <select value={newEvent.visibility} onChange={e => setNewEvent({ ...newEvent, visibility: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: '6px', backgroundColor: '#0c1220', color: '#e2e8f0', border: '1px solid #1e293b', fontSize: '14px', boxSizing: 'border-box' }}>
                  <option value="public">全体公開</option>
                  <option value="invited">メンバー限定</option>
                </select>
              </div>
              {newEvent.visibility === 'invited' && (
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>招待メンバー({newEventInvitedIds.length}名)</label>
                  <div style={{
                    maxHeight: '200px', overflowY: 'auto', padding: '8px',
                    backgroundColor: '#0c1220', borderRadius: '6px', border: '1px solid #1e293b',
                    display: 'flex', flexDirection: 'column', gap: '4px',
                  }}>
                    {players.map(p => {
                      const checked = newEventInvitedIds.includes(p.player_id)
                      return (
                        <label key={p.player_id} style={{
                          display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 6px',
                          borderRadius: '4px', cursor: 'pointer', fontSize: '13px', color: '#e2e8f0',
                          backgroundColor: checked ? '#1e3a8a' : 'transparent',
                        }}>
                          <input type="checkbox" checked={checked}
                            onChange={() => setNewEventInvitedIds(prev =>
                              checked ? prev.filter(id => id !== p.player_id) : [...prev, p.player_id]
                            )}
                            style={{ cursor: 'pointer' }} />
                          {p.player_name}
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}
              <button onClick={handleCreateEvent} disabled={creatingEvent} style={{
                padding: '12px', borderRadius: '6px', backgroundColor: '#3b82f6', color: '#fff',
                border: 'none', fontSize: '14px', fontWeight: '600', cursor: creatingEvent ? 'not-allowed' : 'pointer',
              }}>{creatingEvent ? '作成中...' : 'イベントを作成'}</button>
            </div>
          </div>
        </div>
      )}

      {/* イベント詳細/編集モーダル */}
      {selectedEvent && (
        <div onClick={() => { setSelectedEvent(null); setEditingEvent(false) }} style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px', boxSizing: 'border-box',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            backgroundColor: '#0f172a', borderRadius: '12px', border: '1px solid #1e293b',
            maxWidth: '480px', width: '100%', maxHeight: '80vh', overflowY: 'auto', boxSizing: 'border-box',
          }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#f1f5f9', margin: 0 }}>
                {editingEvent ? 'イベント編集' : selectedEvent.title}
              </h3>
              <div style={{ display: 'flex', gap: '6px' }}>
                {!editingEvent && myAdminRole <= 1 && (
                  <button onClick={openEditEvent} style={{ padding: '4px 10px', borderRadius: '5px', fontSize: '12px', backgroundColor: '#1e3a8a', color: '#93c5fd', border: '1px solid #2563eb', cursor: 'pointer' }}>編集</button>
                )}
                <button onClick={() => { setSelectedEvent(null); setEditingEvent(false) }} style={{ padding: '4px 10px', borderRadius: '5px', fontSize: '12px', backgroundColor: 'transparent', color: '#94a3b8', border: '1px solid #334155', cursor: 'pointer' }}>✕</button>
              </div>
            </div>
            <div style={{ padding: '16px 20px' }}>
              {editingEvent ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div><label style={{ display: 'block', fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>タイトル</label>
                    <input type="text" value={editEventForm.title} onChange={e => setEditEventForm({ ...editEventForm, title: e.target.value })}
                      style={{ width: '100%', padding: '8px', borderRadius: '6px', backgroundColor: '#0c1220', color: '#e2e8f0', border: '1px solid #1e293b', fontSize: '14px', boxSizing: 'border-box' }} /></div>
                  <div><label style={{ display: 'block', fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>開催日</label>
                    <input type="date" value={editEventForm.event_date} onChange={e => setEditEventForm({ ...editEventForm, event_date: e.target.value })}
                      style={{ width: '100%', padding: '8px', borderRadius: '6px', backgroundColor: '#0c1220', color: '#e2e8f0', border: '1px solid #1e293b', fontSize: '14px', boxSizing: 'border-box' }} /></div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div><label style={{ display: 'block', fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>開始</label>
                      <input type="time" value={editEventForm.start_time} onChange={e => setEditEventForm({ ...editEventForm, start_time: e.target.value })}
                        style={{ width: '100%', padding: '8px', borderRadius: '6px', backgroundColor: '#0c1220', color: '#e2e8f0', border: '1px solid #1e293b', fontSize: '14px', boxSizing: 'border-box' }} /></div>
                    <div><label style={{ display: 'block', fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>終了</label>
                      <input type="time" value={editEventForm.end_time} onChange={e => setEditEventForm({ ...editEventForm, end_time: e.target.value })}
                        style={{ width: '100%', padding: '8px', borderRadius: '6px', backgroundColor: '#0c1220', color: '#e2e8f0', border: '1px solid #1e293b', fontSize: '14px', boxSizing: 'border-box' }} /></div>
                  </div>
                  <div><label style={{ display: 'block', fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>場所</label>
                    <input type="text" value={editEventForm.location} onChange={e => setEditEventForm({ ...editEventForm, location: e.target.value })}
                      style={{ width: '100%', padding: '8px', borderRadius: '6px', backgroundColor: '#0c1220', color: '#e2e8f0', border: '1px solid #1e293b', fontSize: '14px', boxSizing: 'border-box' }} /></div>
                  <div><label style={{ display: 'block', fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>締切</label>
                    <input type="datetime-local" value={editEventForm.deadline_date} onChange={e => setEditEventForm({ ...editEventForm, deadline_date: e.target.value })}
                      style={{ width: '100%', padding: '8px', borderRadius: '6px', backgroundColor: '#0c1220', color: '#e2e8f0', border: '1px solid #1e293b', fontSize: '14px', boxSizing: 'border-box' }} /></div>
                  <div><label style={{ display: 'block', fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>参加人数上限</label>
                    <input type="number" value={editEventForm.max_participants} onChange={e => setEditEventForm({ ...editEventForm, max_participants: e.target.value })}
                      placeholder="無制限" min="1" style={{ width: '100%', padding: '8px', borderRadius: '6px', backgroundColor: '#0c1220', color: '#e2e8f0', border: '1px solid #1e293b', fontSize: '14px', boxSizing: 'border-box' }} /></div>
                  <div><label style={{ display: 'block', fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>公開設定</label>
                    <select value={editEventForm.visibility} onChange={e => setEditEventForm({ ...editEventForm, visibility: e.target.value })}
                      style={{ width: '100%', padding: '8px', borderRadius: '6px', backgroundColor: '#0c1220', color: '#e2e8f0', border: '1px solid #1e293b', fontSize: '14px', boxSizing: 'border-box' }}>
                      <option value="public">全体公開</option><option value="invited">メンバー限定</option>
                    </select></div>
                  {editEventForm.visibility === 'invited' && (
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>招待メンバー({editEventInvitedIds.length}名)</label>
                      <div style={{ maxHeight: '150px', overflowY: 'auto', padding: '6px', backgroundColor: '#0c1220', borderRadius: '6px', border: '1px solid #1e293b', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        {players.map(p => (
                          <label key={p.player_id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 4px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', color: '#e2e8f0', backgroundColor: editEventInvitedIds.includes(p.player_id) ? '#1e3a8a' : 'transparent' }}>
                            <input type="checkbox" checked={editEventInvitedIds.includes(p.player_id)}
                              onChange={() => setEditEventInvitedIds(prev => prev.includes(p.player_id) ? prev.filter(id => id !== p.player_id) : [...prev, p.player_id])} style={{ cursor: 'pointer' }} />
                            {p.player_name}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={handleSaveEvent} disabled={savingEvent} style={{ flex: 1, padding: '10px', borderRadius: '6px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
                      {savingEvent ? '保存中...' : '保存'}</button>
                    <button onClick={() => setEditingEvent(false)} style={{ padding: '10px 16px', borderRadius: '6px', backgroundColor: 'transparent', color: '#94a3b8', border: '1px solid #334155', fontSize: '14px', cursor: 'pointer' }}>戻る</button>
                  </div>
                  {selectedEvent.status !== 'cancelled' && (
                    <button onClick={handleCancelEvent} style={{ width: '100%', padding: '10px', borderRadius: '6px', backgroundColor: '#7f1d1d', color: '#fca5a5', border: '1px solid #dc2626', fontSize: '14px', cursor: 'pointer' }}>中止にする</button>
                  )}
                  <button onClick={handleDeleteEvent} style={{ width: '100%', padding: '10px', borderRadius: '6px', backgroundColor: 'transparent', color: '#f87171', border: '1px solid #7f1d1d', fontSize: '14px', cursor: 'pointer' }}>削除</button>
                </div>
              ) : (
                <>
                  {[
                    ['日付', formatDate(selectedEvent.event_date)],
                    ...(selectedEvent.start_time ? [['時間', `${selectedEvent.start_time}${selectedEvent.end_time ? ` - ${selectedEvent.end_time}` : ''}`]] : []),
                    ...(selectedEvent.location ? [['場所', selectedEvent.location]] : []),
                    ...(selectedEvent.deadline_date ? [['締切', (() => {
                      const d = new Date(selectedEvent.deadline_date)
                      const wd = ['日','月','火','水','木','金','土'][d.getDay()]
                      return `${d.getMonth() + 1}/${d.getDate()}(${wd}) ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
                    })()]] : []),
                  ].map(([label, val]) => (
                    <div key={String(label)} style={{ display: 'flex', padding: '8px 0', borderBottom: '1px solid #1e293b', fontSize: '14px' }}>
                      <span style={{ width: '60px', flexShrink: 0, color: '#64748b', fontSize: '13px' }}>{label}</span>
                      <span style={{ color: '#e2e8f0' }}>{val}</span>
                    </div>
                  ))}

                  {myPlayerId && (() => {
                    const deadlinePassed = isDeadlinePassed(selectedEvent.deadline_date)
                    const isFull = selectedEvent.max_participants != null && (selectedEvent.participant_count || 0) >= selectedEvent.max_participants
                    if (joinedEventIds.has(selectedEvent.id)) {
                      if (deadlinePassed) return <div style={{ marginTop: '16px', padding: '10px', borderRadius: '8px', backgroundColor: '#1e293b', textAlign: 'center', fontSize: '14px', color: '#64748b' }}>参加済(締切済)</div>
                      return <button onClick={() => handleEventLeave(selectedEvent.id)} style={{ marginTop: '16px', width: '100%', padding: '10px', borderRadius: '6px', backgroundColor: 'transparent', color: '#f87171', border: '1px solid #7f1d1d', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>参加をキャンセル</button>
                    }
                    if (deadlinePassed) return <div style={{ marginTop: '16px', padding: '10px', borderRadius: '8px', backgroundColor: '#1e293b', textAlign: 'center', fontSize: '14px', color: '#64748b' }}>申込終了</div>
                    if (isFull) return <div style={{ marginTop: '16px', padding: '10px', borderRadius: '8px', backgroundColor: '#1e293b', textAlign: 'center', fontSize: '14px', color: '#64748b' }}>定員に達しています</div>
                    return <button onClick={() => handleEventJoin(selectedEvent.id)} disabled={joiningEventId === selectedEvent.id} style={{ marginTop: '16px', width: '100%', padding: '10px', borderRadius: '6px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>{joiningEventId === selectedEvent.id ? '処理中...' : '参加する'}</button>
                  })()}

                  <div style={{ marginTop: '20px' }}>
                    <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#e2e8f0', marginBottom: '10px' }}>
                      参加者({eventParticipants.length}{selectedEvent.max_participants != null ? `/${selectedEvent.max_participants}` : ''}名)
                    </h4>
                    {eventModalLoading ? (
                      <p style={{ color: '#94a3b8', fontSize: '13px' }}>読み込み中...</p>
                    ) : eventParticipants.length === 0 ? (
                      <p style={{ color: '#64748b', fontSize: '13px' }}>まだ参加者がいません</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {eventParticipants.map((pt: any) => (
                          <div key={pt.player_id} style={{ padding: '8px 12px', backgroundColor: '#0c1220', borderRadius: '6px', border: '1px solid #1e293b', fontSize: '14px', color: '#e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>{pt.player_name}</span>
                            {pt.player_id === myPlayerId && <span style={{ fontSize: '11px', color: '#64748b' }}>あなた</span>}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 管理者用: 参加者追加 */}
                    {myAdminRole <= 1 && (
                      <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                        <select value={adminAddPlayerId} onChange={e => setAdminAddPlayerId(e.target.value)} style={{
                          flex: 1, padding: '8px', borderRadius: '6px', backgroundColor: '#0c1220', color: '#e2e8f0', border: '1px solid #1e293b', fontSize: '13px', boxSizing: 'border-box' as const,
                        }}>
                          <option value="">メンバーを追加...</option>
                          {players.filter(p => !eventParticipants.some(pt => pt.player_id === p.player_id)).map(p => (
                            <option key={p.player_id} value={p.player_id}>{p.player_name}</option>
                          ))}
                        </select>
                        <button onClick={async () => {
                          if (!adminAddPlayerId) return
                          try {
                            const res = await fetch(`${apiUrlRef}/api/events/${selectedEvent.id}/join`, {
                              method: 'POST', headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ player_id: parseInt(adminAddPlayerId) }),
                            })
                            if (res.ok) {
                              const ptRes = await fetch(`${apiUrlRef}/api/events/${selectedEvent.id}/participants`)
                              if (ptRes.ok) setEventParticipants(await ptRes.json())
                              setAdminAddPlayerId('')
                              const evRes = await fetch(`${apiUrlRef}/api/events`)
                              if (evRes.ok) setCustomEvents(await evRes.json())
                            }
                          } catch { alert('通信エラー') }
                        }} disabled={!adminAddPlayerId} style={{
                          padding: '8px 14px', borderRadius: '6px', backgroundColor: '#1e3a8a', color: '#93c5fd',
                          border: '1px solid #2563eb', fontSize: '13px',
                          cursor: adminAddPlayerId ? 'pointer' : 'not-allowed', opacity: adminAddPlayerId ? 1 : 0.5,
                        }}>追加</button>
                      </div>
                    )}
                  </div>

                  <CommentSection targetType="event" targetId={selectedEvent.id} discordId={discordId} />
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
