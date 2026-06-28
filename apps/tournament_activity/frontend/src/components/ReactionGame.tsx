import { useEffect, useRef, useState } from 'react'

// ===== 反応強化モード（v1・テスト用の独立画面）=====
// 突然の合図(赤→緑)にすばやくタップ＝単純反応時間(ms)を計測。5試行の中央値で自己ベスト更新＋最近の推移を表示。
// 難しくしすぎない方針：失敗ペナルティ無し（フライングはやり直しのみ）・短時間・前向きな表示だけ。
interface Props { username?: string; discordId?: string; onExit: () => void }

const FONT = "'Mochiy Pop One','Hiragino Maru Gothic ProN','Yu Gothic',sans-serif"
const INK = '#2b2d42', CORAL = '#ff6b5e'
const TRIALS = 5
const FP_MIN = 1.2, FP_MAX = 3.2      // 待ち時間(秒)＝予測できないようランダム
const MIN_RT = 90                      // これ未満は「勘で押した(フライング)」扱い

type Phase = 'intro' | 'wait' | 'go' | 'show' | 'early' | 'done'

export default function ReactionGame({ username, discordId, onExit }: Props) {
  const who = discordId || username || 'dev'
  const bestKey = 'jujo_reaction_best_v1_' + who
  const histKey = 'jujo_reaction_hist_v1_' + who

  const [phase, setPhase] = useState<Phase>('intro')
  const [trial, setTrial] = useState(0)
  const [lastRt, setLastRt] = useState<number | null>(null)
  const [best, setBest] = useState<number>(() => { try { return parseInt(localStorage.getItem(bestKey) || '0', 10) || 0 } catch { return 0 } })
  const [hist, setHist] = useState<number[]>(() => { try { const v = JSON.parse(localStorage.getItem(histKey) || '[]'); return Array.isArray(v) ? v : [] } catch { return [] } })
  const [result, setResult] = useState<null | { median: number; fastest: number; spread: number; newBest: boolean }>(null)

  const phaseRef = useRef<Phase>('intro')
  const cueTimeRef = useRef(0)
  const rtsRef = useRef<number[]>([])
  const trialRef = useRef(0)
  const timer = useRef<number | undefined>(undefined)

  const setP = (p: Phase) => { phaseRef.current = p; setPhase(p) }
  const clear = () => { if (timer.current) { window.clearTimeout(timer.current); timer.current = undefined } }
  useEffect(() => () => clear(), [])

  const startTrial = () => {
    setLastRt(null); setP('wait')
    const fp = (FP_MIN + Math.random() * (FP_MAX - FP_MIN)) * 1000
    clear(); timer.current = window.setTimeout(() => { cueTimeRef.current = performance.now(); setP('go') }, fp)
  }

  const begin = () => { rtsRef.current = []; trialRef.current = 0; setTrial(0); setResult(null); startTrial() }

  const finish = () => {
    const arr = [...rtsRef.current].sort((a, b) => a - b)
    const n = arr.length
    const median = n % 2 ? arr[(n - 1) / 2] : Math.round((arr[n / 2 - 1] + arr[n / 2]) / 2)
    const fastest = arr[0], spread = arr[n - 1] - arr[0]
    const newBest = !best || median < best
    if (newBest) { try { localStorage.setItem(bestKey, String(median)) } catch { /* noop */ } setBest(median) }
    const nh = [...hist, median].slice(-12)
    try { localStorage.setItem(histKey, JSON.stringify(nh)) } catch { /* noop */ }
    setHist(nh); setResult({ median, fastest, spread, newBest }); setP('done')
  }

  const press = () => {
    const p = phaseRef.current
    if (p === 'intro' || p === 'done') { begin(); return }
    if (p === 'show') return                                  // 表示中は無視
    if (p === 'early') { startTrial(); return }               // フライング後：同じ試行をやり直し
    if (p === 'wait') { clear(); setP('early'); return }      // 合図前に押した＝フライング
    if (p === 'go') {
      const rt = Math.round(performance.now() - cueTimeRef.current)
      if (rt < MIN_RT) { setP('early'); return }              // 速すぎ＝勘。やり直し
      rtsRef.current.push(rt); setLastRt(rt)
      trialRef.current += 1; setTrial(trialRef.current)
      setP('show')
      clear(); timer.current = window.setTimeout(() => { if (trialRef.current >= TRIALS) finish(); else startTrial() }, 750)
    }
  }

  // キーボード(スペース/Enter)でも反応できるように
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); press() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // 画面の色・大文字（言語に頼らず直感的に）
  const panel = phase === 'go' ? '#22c55e' : phase === 'wait' ? '#ef4444' : phase === 'early' ? '#3b82f6' : '#0d1a30'
  const bigText = phase === 'wait' ? 'まて…' : phase === 'go' ? 'いま！' : phase === 'early' ? '早すぎ！' : phase === 'show' ? `${lastRt} ms` : ''

  const wrap: React.CSSProperties = { fontFamily: FONT, color: '#fff', minHeight: '100%', display: 'flex', flexDirection: 'column' }
  const popBtn = (bg: string): React.CSSProperties => ({ padding: '12px 20px', borderRadius: 12, background: bg, color: '#fff', border: 'none', boxShadow: '0 4px 0 rgba(0,0,0,0.22)', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: FONT })

  // ---- イントロ / 結果（タップ待ち以外のオーバーレイUI） ----
  if (phase === 'intro' || phase === 'done') {
    const card: React.CSSProperties = { background: '#fffdf6', border: `4px solid ${CORAL}`, borderRadius: 18, color: INK, padding: '22px 20px', maxWidth: 420, width: '100%', boxShadow: '0 8px 0 rgba(0,0,0,0.18)' }
    return (
      <div style={{ ...wrap, background: 'linear-gradient(180deg,#13233f,#0d1a30)', alignItems: 'center', justifyContent: 'center', padding: 20, gap: 16 }}>
        <div style={card}>
          {phase === 'intro' ? (
            <>
              <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>⚡ 反応強化モード</div>
              <p style={{ fontSize: 13, lineHeight: 1.7, color: '#555' }}>画面が<strong style={{ color: '#ef4444' }}>赤</strong>から<strong style={{ color: '#16a34a' }}>緑</strong>に変わった<strong>瞬間</strong>にタップ！<br />全{TRIALS}回・約30秒。テニスに効く「反応の速さ」を測って自己ベスト更新を目指そう。</p>
              {best > 0 && <div style={{ fontSize: 14, marginTop: 8 }}>自己ベスト：<strong style={{ color: CORAL, fontSize: 18 }}>{best} ms</strong></div>}
            </>
          ) : result && (
            <>
              <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>{result.newBest ? '🎉 自己ベスト更新！' : 'おつかれさま！'}</div>
              <div style={{ fontSize: 13, color: '#666' }}>今回の反応速度（中央値）</div>
              <div style={{ fontSize: 44, fontWeight: 800, color: CORAL, lineHeight: 1.1 }}>{result.median}<span style={{ fontSize: 18 }}> ms</span></div>
              <div style={{ fontSize: 12, color: '#777', marginTop: 6 }}>最速 {result.fastest}ms ／ ばらつき {result.spread}ms ／ 自己ベスト {best}ms</div>
            </>
          )}
          {hist.length > 1 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>最近の記録（短いほど速い＝上達）</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 56 }}>
                {hist.map((m, i) => {
                  const mx = Math.max(...hist), mn = Math.min(...hist)
                  const h = mx === mn ? 28 : 12 + 40 * (1 - (m - mn) / (mx - mn))   // 速い(小)ほど高い棒
                  const isBest = m === mn
                  return <div key={i} title={`${m}ms`} style={{ flex: 1, height: h, background: isBest ? '#16a34a' : i === hist.length - 1 ? CORAL : '#fcd9b6', borderRadius: 4 }} />
                })}
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button onClick={begin} style={popBtn(CORAL)}>{phase === 'intro' ? '▶ スタート' : 'もう一回'}</button>
            <button onClick={onExit} style={popBtn('#64748b')}>とじる</button>
          </div>
        </div>
        <div style={{ fontSize: 11, color: '#7f93b0' }}>※ms値は端末のタップ反応も少し含みます。同じ端末での「伸び」で見てください。</div>
      </div>
    )
  }

  // ---- 計測中：全面の合図パネル（タップ領域） ----
  return (
    <div onPointerDown={press} style={{ ...wrap, background: panel, alignItems: 'center', justifyContent: 'center', cursor: 'pointer', userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'manipulation', position: 'relative', transition: 'background .05s' }}>
      <div style={{ position: 'absolute', top: 14, left: 0, right: 0, textAlign: 'center', fontSize: 14, opacity: 0.9 }}>{trial} / {TRIALS}</div>
      <div style={{ fontSize: phase === 'show' ? 56 : 40, fontWeight: 800, textAlign: 'center', padding: 20 }}>{bigText}</div>
      {phase === 'wait' && <div style={{ position: 'absolute', bottom: 40, fontSize: 14, opacity: 0.9 }}>緑になったら押す！</div>}
      {phase === 'early' && <div style={{ position: 'absolute', bottom: 40, fontSize: 14, opacity: 0.95 }}>タップでもう一度</div>}
    </div>
  )
}
