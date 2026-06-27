import { useEffect, useRef, useState } from 'react'

// ===== 「エビ走」エンドレスラン。RPGとは別の独自デザイン（明るいポップな世界＋丸文字UI）。指定キャラが走る =====
// 物理・移動・距離は全て時間(dt)ベース＝端末のfpsに依存しない。距離は 50m/8秒(=6.25m/s) 一定。
interface RunnerProps { username?: string; discordId?: string; onExit?: () => void }

// 走り8フレーム（等サイズ・頭部x＋足元で正規化済み＝そのまま使う）＋ジャンプ＋被弾（悲しい顔）
const HERO_FRAMES = ['1', '2', '3', '4', '5', '6'].map((n) => `/game/run/hero_run${n}.png?v=11`)
const HERO_SLEEP_FRAMES = ['1', '2', '3', '4', '5', '6'].map((n) => `/game/run/hero_run${n}_sleep.png?v=1`)  // 夜の寝顔（閉じ目を絵に描き込んだ走りフレーム）
const HERO_JUMP = '/game/run/hero_jump.png?v=1'
const HERO_HURT_FRAMES = ['1', '2', '3'].map((n) => `/game/run/hero_hurt${n}.png?v=12`)  // やられ顔・複数パターン（ランダム表示）
const E_BOAR = '/game/run/enemy_boar.png?v=1'
const E_SWORD = '/game/run/enemy_sword.png?v=5'  // サイコパス・ケンジ（カード画像の人物）。主人公と同じチビ頭身で再生成＝サイズ感を合わせた
const E_SNIPER = '/game/run/enemy_sniper.png?v=5'  // 「初代サウスポー・アズマ」（ブタメンTシャツの選手）。主人公と同じチビ頭身で再生成＝サイズ感を統一
const E_TENNIS = '/game/run/enemy_tennis.png?v=8'  // 鈴木選手（一般男子優勝）。主人公と同じチビ頭身で再生成＝サイズ感を統一
// 障害物スプライト（主人公と同じセルシェード調の生成素材。手描き図形→リアル質感に差し替え。未ロード時は手描きにフォールバック）
const O_CONE = '/game/run/obs_cone.png?v=1'
const O_CRATE = '/game/run/obs_crate.png?v=1'
const O_ROCK = '/game/run/obs_rock.png?v=1'
const O_STONE = '/game/run/obs_stone.png?v=1'
const O_COIN = '/game/run/coin.png?v=1'  // 金貨（障害物・主人公と同じセルシェード調。flat円から差し替え）

const M_PER_S = 50 / 8          // 距離カウンタの増加ペース：50メートル / 8秒（実スクロール速度とは別）
const GAME_KEY = 'ebi_run'      // サーバ側ランキングのゲーム識別子
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
interface BoardRow { rank: number; discord_id: string; display_name: string; best_score: number; best_coins: number }

// 独自UI（丸ポップ。FFの青窓とは別系統）
const POP_FONT = "'Mochiy Pop One','Hiragino Maru Gothic ProN','Yu Gothic',sans-serif"
const CORAL = '#ff6b5e', SUN = '#ffb13c', INK = '#2b2d42'
const cardStyle = { background: '#fffdf6', border: `4px solid ${CORAL}`, borderRadius: 18, boxShadow: '0 8px 0 rgba(0,0,0,0.18), 0 2px 10px rgba(0,0,0,0.25)', color: INK } as const
const pill = { background: 'rgba(255,255,255,0.92)', borderRadius: 999, padding: '5px 12px', color: INK, fontSize: 14, boxShadow: '0 2px 6px rgba(0,0,0,0.18)' } as const
const popBtn = (bg: string) => ({ padding: '10px 18px', borderRadius: 12, background: bg, color: '#fff', border: 'none', boxShadow: '0 4px 0 rgba(0,0,0,0.22)', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: POP_FONT } as const)

// 時間帯パレット（朝→昼→夕方→夜）。経過時間で巡回し各色を補間。各時間帯の前70%はその色で固定、後30%で次へ滑らかに遷移。
type DayPalette = { sky: number[][]; sun: number[]; sunPos: number[]; sunR: number; hillB: number[]; hillF: number[]; grass: number[]; grassEdge: number[]; dirt: number[]; cloud: number[] }
const PALETTES: DayPalette[] = [
  { sky: [[120, 170, 225], [250, 200, 160], [255, 228, 200]], sun: [255, 210, 120], sunPos: [0.78, 0.26], sunR: 0.10, hillB: [150, 205, 150], hillF: [110, 185, 135], grass: [105, 190, 85], grassEdge: [90, 170, 65], dirt: [200, 165, 110], cloud: [255, 242, 235, 0.92] }, // 朝
  { sky: [[95, 176, 255], [174, 227, 255], [230, 247, 255]], sun: [255, 246, 176], sunPos: [0.82, 0.20], sunR: 0.09, hillB: [159, 220, 131], hillF: [116, 199, 92], grass: [105, 189, 79], grassEdge: [87, 168, 63], dirt: [202, 160, 106], cloud: [255, 255, 255, 0.95] }, // 昼
  { sky: [[58, 74, 140], [255, 158, 94], [255, 214, 150]], sun: [255, 120, 70], sunPos: [0.80, 0.33], sunR: 0.12, hillB: [120, 140, 100], hillF: [95, 118, 78], grass: [95, 150, 70], grassEdge: [80, 128, 58], dirt: [172, 138, 98], cloud: [255, 198, 168, 0.85] }, // 夕方
  { sky: [[10, 16, 46], [26, 40, 86], [46, 58, 108]], sun: [235, 240, 255], sunPos: [0.80, 0.20], sunR: 0.085, hillB: [42, 66, 54], hillF: [33, 52, 42], grass: [40, 82, 52], grassEdge: [30, 64, 40], dirt: [78, 66, 52], cloud: [170, 185, 220, 0.42] }, // 夜
]
const DAY_PERIOD = 8    // 1時間帯の長さ(秒)。×4=1日=32秒で朝に戻る（朝昼夕夜の巡りを少し速く）。
const STARS = Array.from({ length: 46 }, (_, i) => ({ x: ((i * 79 + 13) % 100) / 100, y: ((i * 47 + 7) % 48) / 100, r: 1 + (i % 3), p: (i * 1.7) % 6.283 }))

// マゼンタ抜き。crop=true=内容に切り詰め（敵の単体スプライト用）／crop=false=サイズ維持（走り連番は正規化済み）。
function keyImage(img: HTMLImageElement, crop: boolean): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
  const x = c.getContext('2d')!; x.imageSmoothingEnabled = false; x.drawImage(img, 0, 0)
  const d = x.getImageData(0, 0, c.width, c.height), a = d.data
  let minX = c.width, minY = c.height, maxX = 0, maxY = 0, found = false
  for (let i = 0; i < a.length; i += 4) {
    const r = a[i], g = a[i + 1], b = a[i + 2]
    if (r > 150 && b > 120 && g < 140 && (r - g) > 40 && (b - g) > 18) { a[i + 3] = 0; continue }
    if (a[i + 3] > 0) { const p = i / 4, px = p % c.width, py = (p / c.width) | 0; if (px < minX) minX = px; if (px > maxX) maxX = px; if (py < minY) minY = py; if (py > maxY) maxY = py; found = true }
  }
  x.putImageData(d, 0, 0)
  if (!crop || !found) return c
  const cw = maxX - minX + 1, ch = maxY - minY + 1
  const out = document.createElement('canvas'); out.width = cw; out.height = ch
  out.getContext('2d')!.drawImage(c, minX, minY, cw, ch, 0, 0, cw, ch)
  return out
}
const loadImg = (url: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url })
const loadKeyed = (url: string, crop = true) => loadImg(url).then((i) => keyImage(i, crop))

type ObsType = 'cone' | 'crate' | 'rock' | 'stone'
type EnemyType = 'boar' | 'sword' | 'sniper' | 'tennis'
interface Obstacle { x: number; w: number; h: number; type: ObsType }
interface Enemy { x: number; w: number; h: number; type: EnemyType; vx: number; aimT: number; aiming: boolean; fired: boolean; bob: number }
interface Bullet { x: number; y: number; r: number; vy: number; bounce: boolean }
interface Pit { x: number; w: number }
interface Platform { x: number; y: number; w: number }   // 空中の足場（上から乗れる）
interface Coin { x: number; y: number; taken: boolean }

interface St {
  heroY: number; vy: number; jumps: number; falling: boolean; grounded: boolean; distM: number; coins: number; playT: number
  obstacles: Obstacle[]; enemies: Enemy[]; bullets: Bullet[]; pits: Pit[]; platforms: Platform[]; coinsArr: Coin[]
  nextSpawnT: number; nextCoinT: number; nextPlatT: number; scroll: number
}

export default function RunnerGame({ username, discordId, onExit }: RunnerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const scoreElRef = useRef<HTMLSpanElement | null>(null)
  const bestKey = 'jujo_run_best_v1_' + (discordId || username || 'dev')
  const [phase, setPhase] = useState<'ready' | 'playing' | 'over'>('ready')
  const [result, setResult] = useState<{ score: number; coins: number; best: number; newBest: boolean; cause: string } | null>(null)
  const [showCard, setShowCard] = useState(false)
  const [assetsReady, setAssetsReady] = useState(false)
  const [invincible, setInvincible] = useState(false)   // 管理者専用の無敵モード（ステージ変化の確認用）
  const [best, setBest] = useState<number>(() => { try { return parseInt(localStorage.getItem(bestKey) || '0', 10) || 0 } catch { return 0 } })
  const [board, setBoard] = useState<BoardRow[] | null>(null)   // ベスト5ランキング（null=未取得/読込中）
  const [myRank, setMyRank] = useState<number | null>(null)
  const [showRank, setShowRank] = useState(false)              // ランキングパネルの表示
  const [rankRows, setRankRows] = useState<BoardRow[] | null>(null)  // パネル用の取得結果（null=読込中）
  const [rankingSaved, setRankingSaved] = useState(true)       // 直近のランがランキングに記録されたか（無敵モードはfalse）
  const [levelUp, setLevelUp] = useState(false)                // 「LEVEL UP！」バナーの表示
  const showRankRef = useRef(false)                            // 表示中はタップ/スペースでゲームを開始させない
  const isAdmin = discordId === '1427112485047242945'
  // 描画ループは []依存で初期propsを捕捉するため、最新の識別情報はrefで参照する
  const discordIdRef = useRef(discordId); discordIdRef.current = discordId
  const usernameRef = useRef(username); usernameRef.current = username

  const A = useRef<{ run: HTMLCanvasElement[]; runSleep: HTMLCanvasElement[]; jump?: HTMLCanvasElement; hurts: HTMLCanvasElement[]; boar?: HTMLCanvasElement; sword?: HTMLCanvasElement; sniper?: HTMLCanvasElement; tennis?: HTMLCanvasElement; coin?: HTMLCanvasElement; obs: Record<ObsType, HTMLCanvasElement | undefined> }>({ run: [], runSleep: [], hurts: [], obs: { cone: undefined, crate: undefined, rock: undefined, stone: undefined } })
  const phaseRef = useRef<'ready' | 'playing' | 'over'>('ready')
  const hurtIdxRef = useRef(0)
  const assetsReadyRef = useRef(false)
  const invincibleRef = useRef(false)
  const usedInvincibleRef = useRef(false)   // このランで一度でも無敵モードを使ったか（使ったら記録しない）
  const levelRef = useRef(0)                // 到達したレベル（1日終えるごとに+1）
  const levelUpTimer = useRef<number | undefined>(undefined)
  const showCardRef = useRef(false)
  const overTimer = useRef<number | undefined>(undefined)
  const stRef = useRef<St>({ heroY: 0, vy: 0, jumps: 0, falling: false, grounded: true, distM: 0, coins: 0, playT: 0, obstacles: [], enemies: [], bullets: [], pits: [], platforms: [], coinsArr: [], nextSpawnT: 0, nextCoinT: 0, nextPlatT: 0, scroll: 0 })

  // ジャンプ初速・重力（時間ベース）：頂点≒heroH*1.5、滞空≒0.78秒になるよう算出
  const jumpParams = (h: number) => { const heroH = Math.min(110, Math.max(60, h * 0.16)); const apex = heroH * 0.82, T = 0.6; const VJ = 4 * apex / T; return { VJ, GRAV: 2 * VJ / T } }

  useEffect(() => {
    let alive = true
    let runDone = false, hurtDone = false
    const markReady = () => { if (alive && runDone && hurtDone) { assetsReadyRef.current = true; setAssetsReady(true) } }
    Promise.all(HERO_FRAMES.map((u) => loadKeyed(u, false).then((c) => c, () => null)))
      .then((cs) => { if (alive) { A.current.run = cs.filter(Boolean) as HTMLCanvasElement[]; runDone = true; markReady() } })
    Promise.all(HERO_SLEEP_FRAMES.map((u) => loadKeyed(u, false).then((c) => c, () => null)))
      .then((cs) => { if (alive) A.current.runSleep = cs.filter(Boolean) as HTMLCanvasElement[] })   // 夜の寝顔フレーム（任意・無くても通常フレームにフォールバック）
    loadKeyed(HERO_JUMP).then((c) => { if (alive) A.current.jump = c }).catch(() => {})
    Promise.all(HERO_HURT_FRAMES.map((u) => loadKeyed(u).then((c) => c, () => null)))
      .then((cs) => { if (alive) A.current.hurts = cs.filter(Boolean) as HTMLCanvasElement[]; hurtDone = true; markReady() })
    loadKeyed(E_BOAR).then((c) => { if (alive) A.current.boar = c }).catch(() => {})
    loadKeyed(E_SWORD).then((c) => { if (alive) A.current.sword = c }).catch(() => {})
    loadKeyed(E_SNIPER).then((c) => { if (alive) A.current.sniper = c }).catch(() => {})
    loadKeyed(E_TENNIS).then((c) => { if (alive) A.current.tennis = c }).catch(() => {})
    // 障害物スプライト（マゼンタ抜き。失敗時は手描きフォールバックのまま）
    loadKeyed(O_CONE).then((c) => { if (alive) A.current.obs.cone = c }).catch(() => {})
    loadKeyed(O_CRATE).then((c) => { if (alive) A.current.obs.crate = c }).catch(() => {})
    loadKeyed(O_ROCK).then((c) => { if (alive) A.current.obs.rock = c }).catch(() => {})
    loadKeyed(O_STONE).then((c) => { if (alive) A.current.obs.stone = c }).catch(() => {})
    loadKeyed(O_COIN).then((c) => { if (alive) A.current.coin = c }).catch(() => {})
    return () => { alive = false }
  }, [])

  useEffect(() => {
    const resize = () => { const c = canvasRef.current; if (!c) return; c.width = Math.max(320, c.clientWidth); c.height = Math.max(240, c.clientHeight) }
    resize(); window.addEventListener('resize', resize)
    const id = window.setTimeout(resize, 60)
    return () => { window.removeEventListener('resize', resize); window.clearTimeout(id) }
  }, [])

  const startGame = () => {
    const c = canvasRef.current; if (!c) return
    const groundH = Math.round(c.height * 0.22), baseY = c.height - groundH
    stRef.current = { heroY: baseY, vy: 0, jumps: 0, falling: false, grounded: true, distM: 0, coins: 0, playT: 0, obstacles: [], enemies: [], bullets: [], pits: [], platforms: [], coinsArr: [], nextSpawnT: 1.0, nextCoinT: 1.2, nextPlatT: 3.0, scroll: 0 }
    if (overTimer.current) { window.clearTimeout(overTimer.current); overTimer.current = undefined }
    showCardRef.current = false; setShowCard(false)
    usedInvincibleRef.current = false   // 新しいランは無敵未使用からスタート
    levelRef.current = 0; setLevelUp(false); if (levelUpTimer.current) { window.clearTimeout(levelUpTimer.current); levelUpTimer.current = undefined }
    setBoard(null); setMyRank(null)
    phaseRef.current = 'playing'; setPhase('playing'); setResult(null)
  }
  const jump = () => { const st = stRef.current, c = canvasRef.current; if (!c || phaseRef.current !== 'playing') return; if (st.jumps < 2) { st.vy = -jumpParams(c.height).VJ; st.jumps += 1 } }
  const press = () => {
    if (showRankRef.current) return   // ランキング表示中は入力でゲームを始めない
    if (phaseRef.current === 'ready') { if (assetsReadyRef.current) startGame() }
    else if (phaseRef.current === 'playing') jump()
    else if (phaseRef.current === 'over' && showCardRef.current) startGame()
  }
  // ランキング取得：一般はベスト5、管理者は全員（管理者だけ全件閲覧可）
  const openRanking = () => {
    showRankRef.current = true; setShowRank(true); setRankRows(null)
    fetch(`${API_URL}/api/game_scores/top?game=${GAME_KEY}&limit=${isAdmin ? 500 : 5}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setRankRows((d && d.top) || []))
      .catch(() => setRankRows([]))
  }
  const closeRanking = () => { showRankRef.current = false; setShowRank(false) }
  // 管理者用：自分のランキング記録をリセット（無敵モードで汚れた記録の消去）。ローカルBESTも初期化。
  const resetMyRanking = () => {
    const did = discordIdRef.current
    if (!did || !isAdmin) return
    setRankRows(null)
    try { localStorage.setItem(bestKey, '0') } catch { /* */ }
    setBest(0)
    fetch(`${API_URL}/api/game_scores/${GAME_KEY}/${did}`, { method: 'DELETE' })
      .then(() => fetch(`${API_URL}/api/game_scores/top?game=${GAME_KEY}&limit=${isAdmin ? 500 : 5}`))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setRankRows((d && d.top) || []))
      .catch(() => setRankRows([]))
  }

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'Enter') { e.preventDefault(); press() } }
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key)
  }, [])

  useEffect(() => {
    const c = canvasRef.current; if (!c) return
    const ctx = c.getContext('2d')!
    let raf = 0, lastTs = 0

    const hill = (W: number, baseY: number, scroll: number, color: string, amp: number, period: number, yOff: number) => {
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, baseY + 40)
      for (let x = 0; x <= W; x += 10) ctx.lineTo(x, baseY - yOff - amp * (0.5 + 0.5 * Math.sin((x + scroll) / period)))
      ctx.lineTo(W, baseY + 40); ctx.closePath(); ctx.fill()
    }
    const cloud = (x: number, y: number, s: number, style: string) => {
      ctx.fillStyle = style
      for (const [dx, dy, r] of [[0, 0, 1], [s * 0.5, -s * 0.18, 0.8], [s, 0, 0.95], [s * 0.5, s * 0.12, 0.7]] as number[][]) { ctx.beginPath(); ctx.arc(x + dx, y + dy, s * 0.5 * r, 0, Math.PI * 2); ctx.fill() }
    }
    const obstacle = (o: Obstacle, baseY: number) => {
      const x = Math.round(o.x), w = Math.round(o.w), h = Math.round(o.h), top = Math.round(baseY - h)
      const spr = A.current.obs[o.type]
      if (spr) {                                                      // 生成スプライト：高さフィット・アスペクト維持・o.w内で中央寄せ・接地
        const dh = h, dw = Math.round(spr.width * (h / spr.height))
        ctx.drawImage(spr, Math.round(x + (w - dw) / 2), Math.round(baseY - dh), dw, dh)
        return
      }
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.55)'         // 以下フォールバック（画像未ロード時の手描き）
      if (o.type === 'cone') {
        ctx.fillStyle = '#ff7a3c'; ctx.beginPath(); ctx.moveTo(x + w / 2, top); ctx.lineTo(x + w * 0.85, baseY); ctx.lineTo(x + w * 0.15, baseY); ctx.closePath(); ctx.fill(); ctx.stroke()
        ctx.fillStyle = '#fff'; ctx.fillRect(x + w * 0.28, top + h * 0.42, w * 0.44, h * 0.13)
        ctx.fillStyle = '#e85d2a'; ctx.fillRect(x + w * 0.05, baseY - 5, w * 0.9, 5)
      } else if (o.type === 'crate') {
        ctx.fillStyle = '#b5793b'; ctx.fillRect(x, top, w, h); ctx.strokeRect(x, top, w, h)
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x + w, baseY); ctx.moveTo(x + w, top); ctx.lineTo(x, baseY); ctx.stroke()
      } else {
        ctx.fillStyle = '#9aa0a8'; ctx.beginPath(); ctx.moveTo(x + w * 0.1, baseY); ctx.lineTo(x + w * 0.25, top + h * 0.3); ctx.lineTo(x + w * 0.55, top); ctx.lineTo(x + w * 0.85, top + h * 0.35); ctx.lineTo(x + w * 0.92, baseY); ctx.closePath(); ctx.fill(); ctx.stroke()
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x + w * 0.3, top + h * 0.25, w * 0.2, h * 0.12)
      }
    }
    const drawSprite = (spr: HTMLCanvasElement, cx: number, baseY: number, h: number, bob = 0) => {
      const scale = h / spr.height, w = spr.width * scale
      ctx.drawImage(spr, Math.round(cx - w / 2), Math.round(baseY - h - bob), Math.round(w), Math.round(h))
    }
    const isShooter = (e: Enemy) => e.type === 'sniper' || e.type === 'tennis'
    const muzzleY = (e: Enemy, baseY: number) => e.type === 'tennis' ? baseY - e.h * 0.62 : baseY - e.h * 0.58

    const die = (cause: string) => {
      if (phaseRef.current !== 'playing') return
      if (invincibleRef.current) return   // 管理者の無敵モード：ゲームオーバーにならない
      const st = stRef.current
      phaseRef.current = 'over'
      const tainted = usedInvincibleRef.current   // 無敵モードを使ったラン＝記録・ベスト更新の対象外
      const score = Math.floor(st.distM) + st.coins * 10
      let bn = 0; try { bn = parseInt(localStorage.getItem(bestKey) || '0', 10) || 0 } catch { /* */ }
      const nb = !tainted && score > bn; if (nb) { try { localStorage.setItem(bestKey, String(score)) } catch { /* */ }; setBest(score) }
      hurtIdxRef.current = Math.floor(Math.random() * Math.max(1, A.current.hurts.length))   // やられ顔をランダム選択
      setRankingSaved(!tainted)
      setResult({ score, coins: st.coins, best: tainted ? bn : Math.max(bn, score), newBest: nb, cause }); setPhase('over')
      overTimer.current = window.setTimeout(() => { showCardRef.current = true; setShowCard(true) }, 950)

      // サーバへスコア送信＝利用者間で共有するベスト5ランキングを取得（無敵モードのランは送信しない）
      const did = discordIdRef.current
      if (did && !tainted) {
        setBoard(null)   // 読込中表示
        fetch(`${API_URL}/api/game_scores`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ game: GAME_KEY, discord_id: did, display_name: usernameRef.current, score, coins: st.coins }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            if (d) { setBoard(d.top || []); setMyRank(typeof d.rank === 'number' ? d.rank : null); if (typeof d.best === 'number') setBest(d.best) }
            else setBoard([])
          })
          .catch(() => setBoard([]))
      } else {
        setBoard([])   // 無敵モード or discord_id未取得＝ランキング非対応
      }
    }

    const render = (ts: number) => {
      if (!lastTs) lastTs = ts
      const dt = Math.min(0.05, (ts - lastTs) / 1000); lastTs = ts
      const W = c.width, H = c.height, groundH = Math.round(H * 0.22), baseY = H - groundH
      const st = stRef.current, heroH = Math.round(Math.min(110, Math.max(60, H * 0.16)))
      const heroCenterX = Math.round(W * 0.28)
      // 実スクロール速度（px/秒）＝元の軽快な速さに復帰。距離カウンタ(distM=50m/8秒)とは分離。
      // 1日(=4×DAY_PERIOD=40秒)を終えるごとにレベルが上がり、速度を段階的に上げる。
      const level = Math.floor(st.playT / (4 * DAY_PERIOD))
      const speedMul = 1 + level * 0.15   // 1日終えるたびに +15%
      const SCROLL = Math.min(W * 0.66 + 420, W * 0.24 + 252 + (W * 0.0105 + 4.2) * st.playT) * speedMul
      const { GRAV } = jumpParams(H)
      const playing = phaseRef.current === 'playing'
      if (playing && invincibleRef.current) usedInvincibleRef.current = true   // 無敵を使ったランは記録対象外にする
      const AIM_LEAD = Math.max(180, Math.min(360, W * 0.42))

      // 時間帯（朝→昼→夕方→夜→…）を経過時間で算出し、各色を補間
      const tod = (st.playT % (4 * DAY_PERIOD)) / DAY_PERIOD
      const di = Math.floor(tod) % 4, dn = (di + 1) % 4, dfrac = tod - Math.floor(tod)
      const HOLD = 0.7
      const dblend = dfrac < HOLD ? 0 : (dfrac - HOLD) / (1 - HOLD)
      const PA = PALETTES[di], PB = PALETTES[dn]
      const lp = (a: number[], b: number[]) => a.map((v, i) => v + (b[i] - v) * dblend)
      const rgbS = (a: number[]) => `rgb(${a[0] | 0},${a[1] | 0},${a[2] | 0})`
      const P = { sky: [lp(PA.sky[0], PB.sky[0]), lp(PA.sky[1], PB.sky[1]), lp(PA.sky[2], PB.sky[2])], sun: lp(PA.sun, PB.sun), sunPos: [PA.sunPos[0] + (PB.sunPos[0] - PA.sunPos[0]) * dblend, PA.sunPos[1] + (PB.sunPos[1] - PA.sunPos[1]) * dblend], sunR: PA.sunR + (PB.sunR - PA.sunR) * dblend, hillB: lp(PA.hillB, PB.hillB), hillF: lp(PA.hillF, PB.hillF), grass: lp(PA.grass, PB.grass), grassEdge: lp(PA.grassEdge, PB.grassEdge), dirt: lp(PA.dirt, PB.dirt), cloud: lp(PA.cloud, PB.cloud) }
      const nightA = (di === 3 ? 1 - dblend : 0) + (dn === 3 ? dblend : 0)   // 夜パレットの混合比（0〜1）

      const sky = ctx.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, rgbS(P.sky[0])); sky.addColorStop(0.55, rgbS(P.sky[1])); sky.addColorStop(1, rgbS(P.sky[2]))
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H)
      // 星（夜のみ・チカチカ）
      if (nightA > 0.04) { ctx.save(); ctx.fillStyle = '#fff'; for (const s of STARS) { const tw = 0.55 + 0.45 * Math.sin(st.playT * 2.2 + s.p); ctx.globalAlpha = nightA * tw * 0.9; ctx.fillRect(Math.round(s.x * W), Math.round(s.y * H), s.r, s.r) } ctx.restore() }
      // 天体（昼=太陽／夜=月）。月は背景色の円をずらして重ね、欠けを表現。
      const cbX = W * P.sunPos[0], cbY = H * P.sunPos[1], cbR = Math.min(60, H * P.sunR)
      ctx.fillStyle = rgbS(P.sun); ctx.beginPath(); ctx.arc(cbX, cbY, cbR, 0, Math.PI * 2); ctx.fill()
      if (nightA > 0.05) { ctx.save(); ctx.globalAlpha = nightA; ctx.fillStyle = rgbS(P.sky[0]); ctx.beginPath(); ctx.arc(cbX - cbR * 0.42, cbY - cbR * 0.3, cbR * 0.92, 0, Math.PI * 2); ctx.fill(); ctx.restore() }

      if (playing) {
        st.playT += dt
        // 1日を終えた瞬間にレベルアップ＝速度が上がり、上部に「LEVEL UP！」を表示
        const lv = Math.floor(st.playT / (4 * DAY_PERIOD))
        if (lv > levelRef.current) {
          levelRef.current = lv
          setLevelUp(true)
          if (levelUpTimer.current) window.clearTimeout(levelUpTimer.current)
          levelUpTimer.current = window.setTimeout(() => setLevelUp(false), 1600)
        }
        st.distM += M_PER_S * dt               // 距離は時間ベース＝50m/8秒一定
        const prevY = st.heroY
        st.vy += GRAV * dt; st.heroY += st.vy * dt
        const feetOverPit = !invincibleRef.current && st.pits.some((p) => heroCenterX > p.x + 6 && heroCenterX < p.x + p.w - 6)
        // 着地できる面：地面(穴の上は無し)＋上から乗れる空中ブロック（一方通行）
        let support = feetOverPit ? Infinity : baseY
        for (const pl of st.platforms) {
          if (heroCenterX > pl.x + 6 && heroCenterX < pl.x + pl.w - 6 && st.vy >= 0 && prevY <= pl.y + 8 && pl.y < support) support = pl.y
        }
        if (st.heroY >= support) { st.heroY = support; st.vy = 0; st.jumps = 0; st.falling = false; st.grounded = true }
        else { st.grounded = false; if (feetOverPit && st.heroY >= baseY) st.falling = true }               // 接地していない＝空中。穴に踏み外したら落下確定
        if (st.falling && st.heroY > baseY + groundH * 0.55) die('pit')
        const dx = st.falling ? 0 : SCROLL * dt                                    // 落下中は世界を止めて穴へ垂直に落とす
        st.scroll += dx

        // 出現：障害物は「連続した塊（クラスター）」でランダムに配置。各塊は必ず1ジャンプで越えられる幅(reach)に収め、塊と塊の間には着地できる地面(島)をあける＝2段ジャンプで必ずクリア可能。
        st.nextSpawnT -= dt
        if (st.nextSpawnT <= 0) {
          const m = st.distM
          const reach = SCROLL * 0.6 - heroH * 0.5            // 1ジャンプ(滞空0.6s)で越えられる接地ハザード幅の安全側見積り
          const maxRun = Math.max(heroH * 0.9, reach * 0.82)  // 1つの連続塊の最大幅（マージン込み）
          const island = heroH * 1.5                          // 塊と塊の間にあける着地用の地面
          // レベル別の難易度テーブル（ユーザー表記 Lv = level+1）
          //  Lv1: 穴(少) ／ Lv2: 穴(普)+障害物(少) ／ Lv3: +敵(少) ／ Lv4: 敵(普) ／ Lv5+: 全部(多)
          const LV = Math.min(level, 4)
          const ENEMY_CHANCE = [0, 0, 0.16, 0.28, 0.42][LV]   // 出現枠が敵になる確率（Lv1-2は敵なし、Lv3から）
          const PIT_CHANCE = [0.35, 0.6, 0.5, 0.5, 0.55][LV]  // 障害物枠内で穴になる確率（残りは地上障害物）
          const OBSTACLES_ON = LV >= 1                         // 地上障害物はLv2から
          const EXTRA_GROUP = [0, 0, 0.15, 0.25, 0.55][LV]    // 塊を1つ増やす確率（多め化）
          const GAP_MUL = [1.0, 1.0, 0.9, 0.8, 0.6][LV]       // クラスター間隔の倍率（小さいほど密＝多め）
          // 敵：テニス・スナイパー・侍は等頻度（＋ボア）。Lv3から出現し、レベルで増える。
          const enemyKinds: EnemyType[] = ['boar', 'tennis', 'sword', 'sniper']
          if (Math.random() < ENEMY_CHANCE) {
            const type = enemyKinds[Math.floor(Math.random() * enemyKinds.length)]
            if (type === 'boar') { const h = heroH * 0.46; st.enemies.push({ x: W + 30, w: h * 1.5, h, type, vx: SCROLL * 0.18, aimT: 0, aiming: false, fired: true, bob: 0 }) }
            else if (type === 'sword') { const h = heroH; st.enemies.push({ x: W + 30, w: h * 0.7, h, type, vx: SCROLL * 0.1, aimT: 0, aiming: false, fired: true, bob: 0 }) }  // sword：主人公と同じチビ頭身スプライト＝h=heroHで頭身もスケールも一致（アスペクト445/540≒0.82）
            else if (type === 'sniper') { const h = heroH; st.enemies.push({ x: W + 30, w: h * 0.79, h, type, vx: 0, aimT: 0, aiming: false, fired: false, bob: 0 }) }  // sniper：主人公と同じ高さ（heroH）。スプライトのアスペクト(429/540≒0.79)で幅
            else { const h = heroH; st.enemies.push({ x: W + 30, w: h * 0.7, h, type, vx: 0, aimT: 0, aiming: false, fired: false, bob: 0 }) }  // tennis：主人公と同じ高さ（heroH）。スプライトのアスペクト(492/720≒0.68)で幅
            st.nextSpawnT = Math.max(0.85, 1.15 - m * 0.0003) + Math.random() * 0.7
          } else {
            const pitsAllowed = m >= 12
            let groups = 1                                    // 塊の数（レベルで増える。各塊は単独でクリア可能なので破綻しない）
            if (Math.random() < EXTRA_GROUP) groups++
            if (LV >= 4 && Math.random() < 0.4) groups++      // Lv5は最大3塊＝多め
            let cx = W + 30, rightmost = cx
            for (let g = 0; g < groups; g++) {
              if (pitsAllowed && Math.random() < PIT_CHANCE) {
                // 穴。たまに2連続（合計幅は1ジャンプ内に収める）＝「連続してる穴」
                const single = Math.min(heroH * 1.05, W * 0.13)
                if (Math.random() < 0.4 && single * 2 + heroH * 0.1 <= maxRun) {
                  st.pits.push({ x: cx, w: single }); st.pits.push({ x: cx + single + heroH * 0.1, w: single })
                  rightmost = cx + single * 2 + heroH * 0.1
                } else { const pw = Math.min(heroH * 1.25, W * 0.15, maxRun); st.pits.push({ x: cx, w: pw }); rightmost = cx + pw }
              } else if (OBSTACLES_ON) {
                // 地上障害物はLv2から。Lv1は穴だけ＝この分岐に来ても何も置かない。
                // 地上障害物を1〜2個連続で（石＋箱 など）。合計幅は maxRun 以内にクランプ＝必ず越えられる
                const count = Math.random() < (LV >= 4 ? 0.6 : LV >= 2 ? 0.45 : 0.2) ? 2 : 1
                let ox = cx
                for (let k = 0; k < count; k++) {
                  const types: ObsType[] = ['cone', 'crate', 'rock', 'stone']
                  const type = types[Math.floor(Math.random() * types.length)]
                  const grow = Math.min(0.22, m * 0.0004)
                  const base = count === 2 ? 0.42 : (Math.random() < (0.3 + Math.min(0.3, m * 0.0004)) ? 0.6 : 0.45)
                  const h = heroH * Math.min(0.74, base + grow) * (type === 'crate' ? 0.95 : type === 'stone' ? 0.5 : 1)  // 石は低く平たい
                  let w = type === 'crate' ? h : type === 'stone' ? h * 2.0 : type === 'cone' ? h * 0.7 : h * 0.95  // 当たり判定幅を各スプライトの見た目幅に合わせる（コーン細い/石は横長）
                  if (ox + w - cx > maxRun) w = Math.max(heroH * 0.3, maxRun - (ox - cx))   // 連続塊が reach を超えない
                  st.obstacles.push({ x: ox, w, h, type })
                  ox += w + (k < count - 1 ? heroH * 0.12 : 0)                              // 連続は密着気味に
                  rightmost = ox
                }
              }
              cx = rightmost + island                          // 次の塊は着地島をあけて配置
            }
            // 直前に出した障害物に既存コインが被るなら、コインを障害物の上へ退避＝被り解消（後から障害物が出るケース）
            for (const cn of st.coinsArr) {
              if (cn.taken) continue
              for (const o of st.obstacles) {
                if (cn.x > o.x - 14 && cn.x < o.x + o.w + 14 && cn.y > baseY - o.h - 8) { cn.y = baseY - o.h - 18; break }
              }
            }
            const lead = rightmost - (W + 30)                  // クラスター全長(px)
            const gapPx = heroH * (2.2 + Math.random() * 2.6) * GAP_MUL  // クラスター後の空き(px)。高レベルほど密＝多め
            st.nextSpawnT = (lead + gapPx) / SCROLL            // px→秒に換算＝次のクラスターと重ならない
          }
        }
        st.nextPlatT -= dt
        if (st.nextPlatT <= 0) {
          if (st.distM >= 35) {
            const pw = heroH * (2.0 + Math.random() * 1.8), py = baseY - heroH * (1.0 + Math.random() * 0.4)
            const plat = { x: W + 30, y: py, w: pw }
            st.platforms.push(plat)   // 空中の足場（上から乗れる）
            // 既に出ているコインがこの足場と重なるなら足場の上へ載せ替え＝コインと足場が被らない
            for (const cn of st.coinsArr) {
              if (!cn.taken && cn.x > plat.x - 12 && cn.x < plat.x + plat.w + 12 && cn.y > plat.y - 22 && cn.y < plat.y + heroH * 0.36 + 22) cn.y = plat.y - 20
            }
          }
          st.nextPlatT = 2.2 + Math.random() * 3.0
        }
        st.nextCoinT -= dt
        if (st.nextCoinT <= 0) {
          const n = 3 + Math.floor(Math.random() * 3)
          const rowX0 = W + 24, rowX1 = W + 24 + (n - 1) * 34
          // この行のx範囲に重なる足場があれば、その上に整列＝足場と被らない（乗って取るごほうび）。無ければ地面寄りのランダム高さ
          const pl = st.platforms.find((p) => rowX1 > p.x - 16 && rowX0 < p.x + p.w + 16)
          let cy = pl ? pl.y - 20 : baseY - heroH * (0.5 + Math.random() * 0.9)
          if (!pl) {   // 行xに重なる障害物があれば、その上端より上へ持ち上げる＝コインと障害物が被らない（ジャンプで取れる）
            let topY = Infinity
            for (const o of st.obstacles) if (rowX1 > o.x - 14 && rowX0 < o.x + o.w + 14) topY = Math.min(topY, baseY - o.h)
            if (topY < Infinity) cy = Math.min(cy, topY - 18)
          }
          for (let i = 0; i < n; i++) st.coinsArr.push({ x: W + 24 + i * 34, y: cy, taken: false })
          st.nextCoinT = 1.4 + Math.random() * 1.2
        }

        // 移動（全て px/秒 × dt）
        for (const o of st.obstacles) o.x -= dx
        for (const p of st.pits) p.x -= dx
        for (const pl of st.platforms) pl.x -= dx
        for (const cn of st.coinsArr) cn.x -= dx
        for (const e of st.enemies) {
          if (isShooter(e) && !e.fired) {
            if (!e.aiming && e.x - heroCenterX <= AIM_LEAD) e.aiming = true
            if (e.aiming) {           // 構え中はその場で狙う（前方の公平な距離から撃つ）
              e.aimT += dt
              if (e.aimT >= 0.55) {
                const my = muzzleY(e, baseY)
                if (e.type === 'tennis') st.bullets.push({ x: e.x, y: my, r: Math.max(7, heroH * 0.12), vy: -jumpParams(H).VJ * 0.5, bounce: true })
                else st.bullets.push({ x: e.x, y: my, r: Math.max(5, heroH * 0.09), vy: 0, bounce: false })
                e.fired = true
              }
            } else e.x -= dx
          } else e.x -= dx + e.vx * dt
          if (e.type === 'boar') e.bob = Math.abs(Math.sin(st.playT * 9)) * (e.h * 0.12)
        }
        for (const b of st.bullets) {
          if (b.bounce) { b.x -= SCROLL * 1.5 * dt; b.vy += GRAV * dt; b.y += b.vy * dt; if (b.y > baseY - b.r) { b.y = baseY - b.r; b.vy = -b.vy * 0.6 } }
          else b.x -= SCROLL * 2.0 * dt
        }
        st.obstacles = st.obstacles.filter((o) => o.x + o.w > -20)
        st.pits = st.pits.filter((p) => p.x + p.w > -20)
        st.platforms = st.platforms.filter((pl) => pl.x + pl.w > -20)
        st.enemies = st.enemies.filter((e) => e.x + e.w > -60)
        st.bullets = st.bullets.filter((b) => b.x > -40)
        st.coinsArr = st.coinsArr.filter((cn) => cn.x > -20 && !cn.taken)

        // 当たり判定は描画より前に（死亡時は最初から悲しい顔だけ）
        const hbW = heroH * 0.46, hbH = heroH * 0.8
        const hb = { x: heroCenterX - hbW / 2, y: st.heroY - hbH, w: hbW, h: hbH }
        for (const o of st.obstacles) { if (hb.x < o.x + o.w * 0.82 && hb.x + hb.w > o.x + o.w * 0.18 && st.heroY > baseY - o.h * 0.82) { die('obstacle'); break } }
        if (phaseRef.current === 'playing') for (const e of st.enemies) { if (isShooter(e)) continue; if (hb.x < e.x + e.w * 0.82 && hb.x + hb.w > e.x + e.w * 0.18 && st.heroY > baseY - e.h * 0.82) { die('enemy'); break } }
        if (phaseRef.current === 'playing') for (const b of st.bullets) { if (b.x + b.r > hb.x && b.x - b.r < hb.x + hb.w && b.y + b.r > hb.y && b.y - b.r < hb.y + hb.h) { die(b.bounce ? 'ball' : 'shot'); break } }
        if (phaseRef.current === 'playing') for (const cn of st.coinsArr) { if (!cn.taken && Math.abs(cn.x - (hb.x + hb.w / 2)) < 22 && Math.abs(cn.y - (hb.y + hb.h / 2)) < heroH * 0.6) { cn.taken = true; st.coins++ } }
      }

      // 雲（パララックス）
      const cs = st.scroll * 0.2
      const cloudStyle = `rgba(${P.cloud[0] | 0},${P.cloud[1] | 0},${P.cloud[2] | 0},${P.cloud[3]})`
      for (let i = 0; i < 3; i++) { const cx = ((i * (W / 2 + 90) - cs) % (W + 220) + (W + 220)) % (W + 220) - 110; cloud(cx, H * (0.16 + i * 0.07), Math.min(90, W * 0.09), cloudStyle) }
      hill(W, baseY, st.scroll * 0.25, rgbS(P.hillB), H * 0.10, 230, groundH * 0.35)
      hill(W, baseY, st.scroll * 0.45, rgbS(P.hillF), H * 0.07, 150, 4)
      ctx.fillStyle = rgbS(P.grass); ctx.fillRect(0, baseY, W, groundH)
      ctx.fillStyle = rgbS(P.grassEdge); ctx.fillRect(0, baseY, W, 5)
      ctx.fillStyle = rgbS(P.dirt); ctx.fillRect(0, baseY + Math.round(groundH * 0.5), W, groundH)
      ctx.fillStyle = `rgba(255,255,255,${(0.5 - nightA * 0.28).toFixed(3)})`
      for (let x = -((st.scroll) % 60); x < W; x += 60) ctx.fillRect(Math.round(x), baseY + Math.round(groundH * 0.72), 22, 4)
      // 落とし穴（地面をくり抜いた暗い谷）
      const pitGrad = ctx.createLinearGradient(0, baseY, 0, H); pitGrad.addColorStop(0, '#3a2b1e'); pitGrad.addColorStop(1, '#14100a')   // 1フレーム1回生成（穴ごとに作らない）
      for (const p of st.pits) {
        const px = Math.round(p.x), pw = Math.round(p.w)
        ctx.fillStyle = pitGrad; ctx.fillRect(px, baseY - 2, pw, groundH + 2)
        ctx.fillStyle = '#7a5a36'; ctx.fillRect(px - 4, baseY - 2, 4, groundH + 2); ctx.fillRect(px + pw, baseY - 2, 4, groundH + 2)
        ctx.fillStyle = '#3f7d2c'; ctx.fillRect(px - 4, baseY - 2, 4, 6); ctx.fillRect(px + pw, baseY - 2, 4, 6)
      }

      const coinSpr = A.current.coin
      for (const cn of st.coinsArr) {
        if (cn.taken) continue
        if (coinSpr) {                                                  // 金貨スプライト：直径は主人公基準。横幅を伸縮させてくるくる回転風に
          const D = Math.max(20, heroH * 0.22)
          const sx = Math.abs(Math.cos(st.playT * 4 + cn.x * 0.03))
          const dw = Math.max(2, D * (0.22 + 0.78 * sx))
          ctx.drawImage(coinSpr, Math.round(cn.x - dw / 2), Math.round(cn.y - D / 2), Math.round(dw), Math.round(D))
        } else {                                                        // フォールバック（画像未ロード時）
          ctx.beginPath(); ctx.arc(cn.x, cn.y, 11, 0, Math.PI * 2); ctx.fillStyle = '#ffd23f'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#c98a12'; ctx.stroke(); ctx.fillStyle = '#fff2a8'; ctx.fillRect(cn.x - 5, cn.y - 6, 3, 5)
        }
      }
      for (const o of st.obstacles) obstacle(o, baseY)
      // 空中の足場（乗れる）
      for (const pl of st.platforms) {
        const px = Math.round(pl.x), pw = Math.round(pl.w), py = Math.round(pl.y), th = Math.round(heroH * 0.36)
        ctx.fillStyle = rgbS(P.dirt); ctx.fillRect(px, py, pw, th)
        ctx.fillStyle = rgbS(P.grass); ctx.fillRect(px, py, pw, Math.max(4, Math.round(th * 0.34)))
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.strokeRect(px, py, pw, th)
      }
      ctx.imageSmoothingEnabled = false
      for (const e of st.enemies) {
        const spr = e.type === 'boar' ? A.current.boar : e.type === 'sword' ? A.current.sword : e.type === 'sniper' ? A.current.sniper : A.current.tennis
        if (spr) drawSprite(spr, e.x + e.w / 2, baseY, e.h, e.bob)
        else { ctx.fillStyle = '#8a4b2a'; ctx.fillRect(e.x, baseY - e.h, e.w, e.h) }
        if (isShooter(e) && e.aiming && !e.fired) {
          const my = muzzleY(e, baseY)
          ctx.save(); ctx.strokeStyle = 'rgba(255,70,70,0.5)'; ctx.lineWidth = 2; ctx.setLineDash([8, 6]); ctx.beginPath(); ctx.moveTo(e.x, my); ctx.lineTo(heroCenterX, my); ctx.stroke(); ctx.restore()
          const pulse = 4 + Math.abs(Math.sin(st.playT * 12)) * 4
          ctx.fillStyle = e.type === 'tennis' ? '#c8e84a' : '#ff4646'; ctx.beginPath(); ctx.arc(e.x, my, pulse, 0, Math.PI * 2); ctx.fill()
        }
      }
      for (const b of st.bullets) {
        if (b.bounce) { ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fillStyle = '#d6ef4a'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#7a8c1f'; ctx.stroke() }
        else { ctx.fillStyle = 'rgba(255,200,90,0.5)'; ctx.fillRect(b.x, b.y - 2, 26, 4); ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fillStyle = '#3a3a3a'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#ffd23f'; ctx.stroke() }
      }

      // 主人公（くっきり描画）
      ctx.imageSmoothingEnabled = false
      const over = phaseRef.current === 'over'
      const airborne = !st.grounded                                  // 地面でも足場でも、接地中は走り姿勢（ジャンプ姿勢は空中だけ）
      if (over) {
        ctx.fillStyle = 'rgba(16,22,40,0.55)'; ctx.fillRect(0, 0, W, H)
        const spr = A.current.hurts[hurtIdxRef.current] || A.current.hurts[0] || A.current.run[0]
        if (spr) { const bigH = Math.min(H * 0.5, 260), scale = bigH / spr.height, bw = spr.width * scale; ctx.save(); ctx.translate(W * 0.5, H * 0.5); ctx.rotate(-0.1); ctx.drawImage(spr, -bw / 2, -bigH / 2, Math.round(bw), Math.round(bigH)); ctx.restore() }
        ctx.textAlign = 'center'; ctx.fillStyle = '#ffe27a'; ctx.font = `700 ${Math.round(Math.min(46, W * 0.07))}px ${POP_FONT}`
        ctx.fillText('やられた…', W * 0.5, H * 0.2); ctx.textAlign = 'left'
      } else {
        const frames = A.current.run
        const STRIDE = heroH * 0.34                                   // 1コマ進む地面スクロール量（小さめ＝コマ速UPで滑らか）
        const fi = frames.length ? Math.floor(st.scroll / STRIDE) % frames.length : 0  // 地面に同期するコマ番号
        const runSpr = frames.length ? frames[fi] : undefined
        const sleeping = nightA > 0.45                                  // 夜は「走りながら寝てる風」
        const sleepFrames = A.current.runSleep                         // 閉じ目を絵に描き込んだ寝顔フレーム
        const runSleepSpr = (sleeping && sleepFrames.length) ? sleepFrames[fi % sleepFrames.length] : undefined
        // 夜＆接地中は寝顔フレーム（閉じ目）／空中はジャンプ／それ以外は通常の走り
        const spr = (airborne && A.current.jump) ? A.current.jump : (runSleepSpr || runSpr || A.current.jump || A.current.hurts[0])
        const tilt = sleeping ? 0.30 + 0.04 * Math.sin(st.playT * 1.0) : 0   // 腰を支点に頭をしっかり前へ下げる（ゆっくりコクリ）
        const pvx = heroCenterX, pvy = st.heroY - heroH * 0.40
        if (spr) {
          ctx.save()
          if (sleeping) { ctx.translate(pvx, pvy); ctx.rotate(tilt); ctx.translate(-pvx, -pvy) }   // 前傾＝頭が下がる
          drawSprite(spr, heroCenterX, st.heroY, heroH, 0)             // 走り中の上下バウンドは無し（頭が揺れない）
          if (sleeping) {
            // 鼻提灯（呼吸でふくらむ）。傾いた頭に追従させるため同じ変換内で描く。
            const br = 0.5 + 0.5 * Math.sin(st.playT * 1.7)
            const bubR = heroH * (0.045 + 0.17 * br)
            const noseX = heroCenterX + heroH * 0.16, noseY = st.heroY - heroH * 0.70
            const bcx = noseX + bubR * 0.85, bcy = noseY + bubR * 0.55
            ctx.globalAlpha = nightA * 0.92
            ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = Math.max(1.5, heroH * 0.012)
            ctx.beginPath(); ctx.arc(bcx, bcy, bubR, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
            ctx.globalAlpha = nightA * 0.85; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(bcx - bubR * 0.3, bcy - bubR * 0.35, Math.max(1, bubR * 0.22), 0, Math.PI * 2); ctx.fill()
          }
          ctx.restore()
        }
        if (sleeping) {
          // 頭上に Z が浮かんで消える（こちらは直立のまま上へ流す）
          ctx.save(); ctx.textAlign = 'left'; ctx.fillStyle = '#fff'
          const zbx = heroCenterX + heroH * 0.18, zby = st.heroY - heroH * 1.02
          for (let i = 0; i < 3; i++) { const zt = (st.playT * 0.7 + i * 0.34) % 1; const fs = Math.round(heroH * (0.14 + zt * 0.18)); ctx.globalAlpha = nightA * (1 - zt) * 0.95; ctx.font = `800 ${fs}px ${POP_FONT}`; ctx.fillText('Z', zbx + zt * heroH * 0.5, zby - zt * heroH * 0.7) }
          ctx.restore(); ctx.textAlign = 'left'; ctx.globalAlpha = 1
        }
      }

      if (scoreElRef.current && phaseRef.current === 'playing') scoreElRef.current.textContent = `${Math.floor(st.distM)}m 🪙${st.coins}`
      // 検証用フック（localhost / /preview のみ。本番では無効）。クリア可能性・被り判定の自動計測に使う。
      if (typeof window !== 'undefined' && (location.hostname === 'localhost' || location.pathname.includes('/preview/'))) (window as { __ebi?: unknown }).__ebi = { st, baseY, heroH, heroCenterX, SCROLL, W, H, groundH, phase: phaseRef.current }
      raf = requestAnimationFrame(render)
    }
    raf = requestAnimationFrame(render)
    return () => { cancelAnimationFrame(raf); if (overTimer.current) window.clearTimeout(overTimer.current); if (levelUpTimer.current) window.clearTimeout(levelUpTimer.current) }
  }, [])

  const causeText = (cause?: string) => cause === 'pit' ? '穴に落ちてしまった…' : cause === 'shot' ? '撃たれてしまった…' : cause === 'ball' ? 'テニスボールが直撃…' : cause === 'enemy' ? '敵にぶつかった…' : cause === 'obstacle' ? '障害物にぶつかった…' : ''

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#5fb0ff', overflow: 'hidden', touchAction: 'none', fontFamily: POP_FONT }}
      onPointerDown={(e) => { e.preventDefault(); press() }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', touchAction: 'none' }} />

      {/* 上部バー：全幅フレックスで左右に振り分け＝スマホでもスコアとBESTが重ならない */}
      <div style={{ position: 'absolute', top: 8, left: 8, right: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, pointerEvents: 'none' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'nowrap', minWidth: 0, flexShrink: 1 }}>
          <span style={{ ...pill, fontWeight: 700, fontSize: 12, padding: '4px 9px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flexShrink: 1 }}>🦐 {username || 'ランナー'}</span>
          <span ref={scoreElRef} style={{ ...pill, color: CORAL, fontWeight: 800, fontSize: 12, padding: '4px 8px', whiteSpace: 'nowrap', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>0m 🪙0</span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          <span style={{ ...pill, color: '#1f9d55', fontWeight: 700, fontSize: 11, padding: '4px 8px', whiteSpace: 'nowrap' }}>BEST {best}m</span>
          <button onClick={(e) => { e.stopPropagation(); onExit && onExit() }} onPointerDown={(e) => e.stopPropagation()} style={{ ...popBtn('#ff5a52'), padding: '5px 10px', fontSize: 14, fontWeight: 800, pointerEvents: 'auto' }}>×</button>
        </div>
      </div>

      {levelUp && (
        <div style={{ position: 'absolute', top: '15%', left: 0, right: 0, display: 'flex', justifyContent: 'center', pointerEvents: 'none', zIndex: 6 }}>
          <div style={{ fontFamily: POP_FONT, fontWeight: 800, fontSize: 'clamp(28px, 8vw, 56px)', color: '#fff', WebkitTextStroke: '2px #e23b3b', textShadow: `0 4px 0 ${SUN}, 0 0 18px rgba(255,177,60,0.8)`, animation: 'ebiLevelUp 1.6s ease-out forwards' }}>⚡ LEVEL UP！</div>
        </div>
      )}

      {isAdmin && (
        <button
          onClick={(e) => { e.stopPropagation(); const v = !invincibleRef.current; invincibleRef.current = v; setInvincible(v) }}
          onPointerDown={(e) => e.stopPropagation()}
          style={{ position: 'absolute', left: 8, bottom: 8, padding: '6px 12px', borderRadius: 12, border: 'none', fontFamily: POP_FONT, fontWeight: 800, fontSize: 13, cursor: 'pointer', color: '#fff', background: invincible ? '#16a34a' : '#64748b', boxShadow: '0 3px 0 rgba(0,0,0,0.22)', pointerEvents: 'auto' }}
        >🛡 無敵: {invincible ? 'ON' : 'OFF'}</button>
      )}

      {phase === 'ready' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', pointerEvents: 'none' }}>
          <div style={{ ...cardStyle, padding: '22px 26px' }}>
            <div style={{ fontSize: 34, fontWeight: 800, color: CORAL, lineHeight: 1, textShadow: `2px 2px 0 ${SUN}`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><img src={HERO_FRAMES[0]} alt="" style={{ width: 38, height: 38, objectFit: 'contain', imageRendering: 'pixelated' }} />エビ走</div>
            <div style={{ fontSize: 14, lineHeight: 1.9, marginTop: 12 }}>タップ／スペースでジャンプ（2段ジャンプOK）<br />障害物・穴・敵をよけて走りぬけろ！</div>
            <div style={{ fontSize: 16, color: assetsReady ? CORAL : '#9aa3b2', fontWeight: 700, marginTop: 14, animation: 'ebiBlink 1.1s ease-in-out infinite' }}>{assetsReady ? '▶ タップ／スペースでスタート' : '🦐 よみこみ中…'}</div>
            <button
              onClick={(e) => { e.stopPropagation(); openRanking() }}
              onPointerDown={(e) => e.stopPropagation()}
              style={{ ...popBtn(SUN), marginTop: 16, fontSize: 14, pointerEvents: 'auto' }}
            >🏆 ランキング</button>
          </div>
        </div>
      )}

      {phase === 'over' && result && showCard && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: '6%', display: 'flex', justifyContent: 'center' }}>
          <div onPointerDown={(e) => e.stopPropagation()} style={{ ...cardStyle, padding: '16px 24px', textAlign: 'center', minWidth: 250 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#e23b3b' }}>ゲームオーバー…</div>
            {causeText(result.cause) && <div style={{ fontSize: 13, color: '#8a5a3c', marginTop: 2 }}>{causeText(result.cause)}</div>}
            <div style={{ fontSize: 19, marginTop: 6 }}>スコア {result.score}m</div>
            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>距離 {result.score - result.coins * 10}m ／ コイン {result.coins}（×10）</div>
            {result.newBest ? <div style={{ fontSize: 16, color: SUN, fontWeight: 800, marginTop: 8 }}>🎉 ベスト更新！ {result.best}m</div> : <div style={{ fontSize: 13, color: '#1f9d55', marginTop: 8 }}>BEST {result.best}m</div>}

            {!rankingSaved && <div style={{ fontSize: 12, color: '#b45309', fontWeight: 700, marginTop: 6 }}>🛡 無敵モードのため記録は保存されません</div>}

            {/* 利用者間で共有するベスト5ランキング */}
            <div style={{ marginTop: 12, borderTop: '2px dashed #ffd6cf', paddingTop: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: CORAL }}>🏆 みんなのベスト5</div>
              {board === null ? (
                <div style={{ fontSize: 12, color: '#9aa3b2', marginTop: 8 }}>読み込み中…</div>
              ) : board.length === 0 ? (
                <div style={{ fontSize: 12, color: '#9aa3b2', marginTop: 8 }}>まだ記録がありません</div>
              ) : (
                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {board.map((row) => {
                    const isMe = row.discord_id === discordId
                    const medal = row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : row.rank === 3 ? '🥉' : `${row.rank}.`
                    return (
                      <div key={row.discord_id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '3px 8px', borderRadius: 8, background: isMe ? '#fff2cc' : 'transparent', fontWeight: isMe ? 800 : 600 }}>
                        <span style={{ width: 22, textAlign: 'center', flexShrink: 0 }}>{medal}</span>
                        <span style={{ flex: 1, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.display_name}{isMe && ' (あなた)'}</span>
                        <span style={{ color: CORAL, fontWeight: 800, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{row.best_score}m</span>
                      </div>
                    )
                  })}
                  {myRank && myRank > board.length && (
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>あなたの順位: {myRank}位</div>
                  )}
                </div>
              )}
              {isAdmin && (
                <button onClick={(e) => { e.stopPropagation(); openRanking() }} style={{ ...popBtn(SUN), marginTop: 10, fontSize: 13 }}>👑 全員を見る</button>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 14 }}>
              <button onClick={(e) => { e.stopPropagation(); startGame() }} style={popBtn(CORAL)}>もう一度</button>
              <button onClick={(e) => { e.stopPropagation(); onExit && onExit() }} style={popBtn('#9aa3b2')}>やめる</button>
            </div>
          </div>
        </div>
      )}

      {showRank && (
        <div
          onPointerDown={(e) => { e.stopPropagation(); closeRanking() }}
          style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, pointerEvents: 'auto', zIndex: 10 }}
        >
          <div onPointerDown={(e) => e.stopPropagation()} style={{ ...cardStyle, padding: '18px 20px', width: 'min(420px, 92vw)', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: CORAL, textAlign: 'center' }}>
              🏆 {isAdmin ? `ランキング（全${rankRows ? rankRows.length : 0}人）` : 'みんなのベスト5'}
            </div>
            <div style={{ marginTop: 12, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
              {rankRows === null ? (
                <div style={{ fontSize: 13, color: '#9aa3b2', textAlign: 'center', padding: '12px 0' }}>読み込み中…</div>
              ) : rankRows.length === 0 ? (
                <div style={{ fontSize: 13, color: '#9aa3b2', textAlign: 'center', padding: '12px 0' }}>まだ記録がありません</div>
              ) : (
                rankRows.map((row) => {
                  const isMe = row.discord_id === discordId
                  const medal = row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : row.rank === 3 ? '🥉' : `${row.rank}.`
                  return (
                    <div key={row.discord_id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '4px 8px', borderRadius: 8, background: isMe ? '#fff2cc' : 'transparent', fontWeight: isMe ? 800 : 600 }}>
                      <span style={{ width: 28, textAlign: 'center', flexShrink: 0 }}>{medal}</span>
                      <span style={{ flex: 1, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.display_name}{isMe && ' (あなた)'}</span>
                      <span style={{ color: CORAL, fontWeight: 800, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{row.best_score}m</span>
                    </div>
                  )
                })
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 14, flexWrap: 'wrap' }}>
              {isAdmin && (
                <button onClick={(e) => { e.stopPropagation(); resetMyRanking() }} style={{ ...popBtn('#ef4444'), fontSize: 13 }}>🗑 自分の記録をリセット</button>
              )}
              <button onClick={(e) => { e.stopPropagation(); closeRanking() }} style={popBtn('#9aa3b2')}>とじる</button>
            </div>
          </div>
        </div>
      )}

      <style>{`@import url('https://fonts.googleapis.com/css2?family=Mochiy+Pop+One&display=swap');
@keyframes ebiBlink{0%,100%{opacity:1}50%{opacity:.45}}
@keyframes ebiLevelUp{0%{opacity:0;transform:scale(.4) translateY(10px)}18%{opacity:1;transform:scale(1.15) translateY(0)}30%{transform:scale(1)}80%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1) translateY(-14px)}}`}</style>
    </div>
  )
}
