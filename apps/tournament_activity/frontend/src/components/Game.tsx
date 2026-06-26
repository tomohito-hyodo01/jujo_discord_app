import { useState, useEffect, useRef, useCallback } from 'react'

// ============================================================
//  十条ソフトテニス団 ―― 冒険者ギルドRPG（試作版 / 管理者のみ）
//  キャラ素材は NanoBanana(Gemini画像生成) で生成し public/game/ に配置。
//  マゼンタ背景をブラウザ側で塗り抜いて透過スプライト化し Canvas に描画。
//  シーン: 町(town) ⇄ ギルド内(guild)。ギルド内に掲示板(依頼)と仲間NPC。
// ============================================================

interface GameProps { username?: string; onExit?: () => void; discordId?: string }

const PX = 38 // 描画時の1タイルのピクセル（FF2寄りに引きの画面＝多くのタイルが映る）

type Scene = 'town' | 'guild'
type Dir = 'up' | 'down' | 'left' | 'right'

// 一枚絵マップ(town_bg)に合わせた当たり判定。T=森 H=山小屋 D=入口(扉) F=噴水 w=池 .=歩ける
// 石壁で囲った石畳の町（FF2/DQ3風）。#=石壁 :=石畳 H=城(ギルド入口) B=家 S=店 F=噴水 .=芝 T=木 / 南の門から野原へ
const TOWN_MAP: string[] = [
  '....TT................TT....',
  '..TT...............TT.......',
  '...####################.....',
  '...#:::::::HHHH:::::::#.....',
  '...#:BBB:::HHHH:BBB:::#.....',
  '...#:BBB:::HDHH:BBB:::#.....',
  '...#::::::::::::::::::#.....',
  '...#::::::::FF::::::::#.....',
  '...#:BBB::::FF::BBB:::#.....',
  '...#:BBB::::::::BBB:::#.....',
  '...#::::::::::::::::::#.....',
  '...#:::BBB::::SSS:::::#.....',
  '...#:::BBB::::SSS:::::#.....',
  '...#::::::::::::::::::#.....',
  '...#::::::::::::::::::#.....',
  '...#########::#########.....',
  '............::..............',
  '............::..............',
  '............::..............',
  '.....TT.....::....TT........',
  '............................',
  '......TT..........TT........',
  '............................',
  '...TT..................TT...',
  '............................',
  '............................',
]
const GUILD_MAP: string[] = [
  '########################',
  '#______________________#',
  '#_PPP_____KKKK_________#',
  '#_PPP_____KKKK_________#',
  '#______________________#',
  '#____I_____cc_____I____#',
  '#__________cc__________#',
  '#__________cc__________#',
  '#__O_I_____cc__O__I____#',
  '#__________cc__________#',
  '#_______O__cc_______O__#',
  '#____I_____cc_____I____#',
  '#__________cc__________#',
  '#__________cc__________#',
  '#__________cc__________#',
  '###########XX###########',
]

const WALKABLE: Record<string, boolean> = {
  '.': true, ':': true, c: true, D: true,
  T: false, w: false, H: false, '=': false, f: false, F: false,
  _: true, r: true, X: true, '#': false, P: false, K: false,
  B: false, S: false, I: false, O: false,
}

interface Entity { id: string; kind: 'npc' | 'monster'; sprite: string; x: number; y: number; name: string; text: string }

const TOWN_ENTITIES: Entity[] = [
  { id: 't-guide', kind: 'npc', sprite: 'warrior_m', x: 15, y: 13, name: '門番', text: 'ようこそ、城塞ギルド〈十条ソフトテニス団〉へ！\n奥の城がギルド本部だ。中の掲示板で依頼を受けられる。' },
  { id: 't-quest', kind: 'npc', sprite: 'town_m', x: 9, y: 10, name: '町の人', text: '南の門を出た野原に“スライム”が湧いて困っとる…\n討伐の依頼はギルドの掲示板に貼ってあるよ。' },
  { id: 't-master', kind: 'npc', sprite: 'elder_m', x: 16, y: 10, name: '老賢者', text: '日々の鍛錬（実際の練習に参加）で力がつく。\n大会で結果を出せば、一気に飛躍するぞ！' },
  { id: 'm1', kind: 'monster', sprite: 'slime', x: 7, y: 20, name: 'スライム', text: '' },
  { id: 'm2', kind: 'monster', sprite: 'slime', x: 17, y: 20, name: 'スライム', text: '' },
  { id: 'm5', kind: 'monster', sprite: 'slime', x: 21, y: 22, name: 'スライム', text: '' },
  { id: 'm4', kind: 'monster', sprite: 'slime', x: 5, y: 23, name: 'スライム', text: '' },
  { id: 'm3', kind: 'monster', sprite: 'boss', x: 10, y: 24, name: 'キングスライム', text: '' },
]
const GUILD_ENTITIES: Entity[] = [
  { id: 'g-reception', kind: 'npc', sprite: 'town_f', x: 12, y: 4, name: 'ギルド受付', text: 'おかえり、団員！\n掲示板の依頼、もう確認したかい？' },
]


interface Quest { id: string; title: string; desc: string; reward: { exp: number; gold: number }; target?: { sprite: string; count: number } }
interface Enemy { name: string; sprite: string; hp: number; hpMax: number; atk: number; reward: number; gold: number }
interface Battle {
  id: string; enemies: Enemy[]
  php: number; phpMax: number; pmp: number; pmpMax: number; patk: number; plevel: number
  msg: string; over: null | 'win' | 'lose'
  fanfare?: { exp: number; gold: number; leveledTo: number | null }
}
// レベル＝EXP（実際の練習でも増える想定）から算出。HP/MP/攻撃力が伸びる。
const WEAPONS = [
  { name: '木のぼう', atk: 0, cost: 0 },
  { name: 'どうのつるぎ', atk: 4, cost: 40 },
  { name: 'はがねのつるぎ', atk: 9, cost: 140 },
  { name: 'ほのおの剣', atk: 16, cost: 360 },
]
const ARMORS = [
  { name: 'たびのふく', hp: 0, cost: 0 },
  { name: 'かわのよろい', hp: 14, cost: 40 },
  { name: 'くさりかたびら', hp: 32, cost: 140 },
  { name: 'プレートメイル', hp: 60, cost: 360 },
]
const POTION_COST = 12, POTION_HEAL = 28
// 活動EXP換算：練習1回=20、大会1出場=80（老賢者の「鍛錬で力がつく・大会で飛躍」に対応）
const EXP_PER_PRACTICE = 20, EXP_PER_TOURNAMENT = 80
function playerStats(exp: number, weaponLv = 0, armorLv = 0) {
  const level = 1 + Math.floor(exp / 100)
  return {
    level,
    maxHp: 40 + (level - 1) * 8 + (ARMORS[armorLv]?.hp ?? 0),
    maxMp: 8 + (level - 1) * 3,
    atk: 6 + (level - 1) * 2 + (WEAPONS[weaponLv]?.atk ?? 0),
  }
}
function enemyStats(sprite: string) {
  return sprite === 'boss' ? { hpMax: 80, atk: 9, reward: 120, gold: 50 } : { hpMax: 16, atk: 3, reward: 30, gold: 8 }
}
const SKILL_MP = 4, HEAL_MP = 3
// ===== FFの青窓スタイル（SFC FF4〜6風。ぼかし無しの二重ベベル枠＋ドット風フォント） =====
const JG_FONT = "'DotGothic16','MS PGothic','Hiragino Kaku Gothic ProN',monospace"
const ffWin = {
  background: 'linear-gradient(180deg,#2632c4 0%,#1820b0 55%,#121a86 100%)',
  border: '3px solid #f8fafc', outline: '2px solid #0a0e3a', borderRadius: 8,
  boxShadow: 'inset 0 0 0 2px #5b8fe6, inset 0 0 0 4px #1820b0, 0 3px 0 #06093a',
} as const
const ffInset = { background: 'rgba(8,12,58,0.66)', border: '1px solid #4860c0', borderRadius: 4 } as const // 窓内の小パネル
const ffBtn = { // HUD/モーダルの小ボタン
  padding: '6px 10px', borderRadius: 4, background: '#28349c', color: '#fff', border: '2px solid #cfe0ff',
  boxShadow: 'inset -2px -2px 0 #101860, inset 2px 2px 0 #4f63d8', fontSize: 12, fontWeight: 700, cursor: 'pointer', textShadow: '1px 1px 0 #06093a',
} as const
const cmdStyle = (bg: string) => { // 戦闘コマンド等。bg='#334155' は呼び出し側の「無効」サイン
  const off = bg === '#334155'
  return {
    minHeight: 44, padding: '9px 10px', borderRadius: 4,
    background: off ? '#1a1f52' : bg, color: off ? '#6b74b8' : '#fff',
    border: `2px solid ${off ? '#2a3170' : '#cfe0ff'}`,
    boxShadow: off ? 'none' : 'inset -2px -2px 0 rgba(0,0,0,0.45), inset 2px 2px 0 rgba(255,255,255,0.22)',
    textShadow: off ? 'none' : '1px 1px 0 rgba(0,0,0,0.6)',
    fontWeight: 700, fontSize: 14, letterSpacing: 1, cursor: off ? 'default' : 'pointer',
  } as const
}
// SFC風ゲージ（上半分テカリ＋濃紺トラック＋淡青枠）
function Gauge({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ height: 7, background: '#0a0e3a', border: '1px solid #4860c0', borderRadius: 2, overflow: 'hidden', boxShadow: 'inset 0 1px 0 #000' }}>
      <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', background: `linear-gradient(180deg, rgba(255,255,255,0.45) 0 38%, ${color} 38%)`, transition: 'width .2s' }} />
    </div>
  )
}
// 生存中の敵全員の反撃（22%で特殊攻撃＝1.7倍）。戻り値 [被ダメージ, メッセージ]
function enemiesAttack(enemies: Enemy[]): [number, string] {
  let dmg = 0, special = false
  for (const en of enemies.filter((x) => x.hp > 0)) {
    let d = en.atk + Math.floor(Math.random() * 4)
    if (Math.random() < 0.22) { d = Math.round(d * 1.7); special = true }
    dmg += d
  }
  return [dmg, special ? `てきの とくしゅこうげき！ ${dmg} うけた！` : `てきの こうげき！ ${dmg} うけた。`]
}
const QUESTS: Quest[] = [
  { id: 'q1', title: 'スライムの討伐', desc: '野原に湧いた“スライム”を3体退治する。', reward: { exp: 30, gold: 15 }, target: { sprite: 'slime', count: 3 } },
  { id: 'q2', title: '野原の主を討て', desc: '巨大な“キングスライム”を倒す。', reward: { exp: 100, gold: 60 }, target: { sprite: 'boss', count: 1 } },
  { id: 'q3', title: '新たな仲間を', desc: '練習に来たことのない人を誘って連れてくる。', reward: { exp: 50, gold: 20 } }, // 手動報告
  { id: 'q4', title: '修練を積む', desc: '実際の練習に参加して力を磨く。', reward: { exp: 40, gold: 20 } }, // 手動報告（将来③練習EXP連携で自動化）
]
// クエストの報酬表示
function questRewardText(q: Quest): string { return `EXP +${q.reward.exp}${q.reward.gold ? ` / G +${q.reward.gold}` : ''}` }

// NanoBanana生成のFF2風ドット絵素材（/game/ff 配下）
const GROUND: Record<string, string> = { grass: '/game/ff/t_grass.png', path: '/game/ff/t_path.png', water: '/game/ff/t_water.png', wood: '/game/ff/t_wood.png', wall: '/game/ff/t_wall.png', castle: '/game/ff/t_castle.png', twall: '/game/ff/t_wall.png' }
const OBJS: Record<string, string> = { house: '/game/ff/o_house.png', house2: '/game/ff/o_house2.png', house3: '/game/ff/o_house3.png', house4: '/game/ff/o_house4.png', tree: '/game/ff/o_tree.png', fountain: '/game/ff/o_fountain.png', sign: '/game/ff/o_sign.png', board: '/game/ff/o_board.png', counter: '/game/ff/o_counter.png', barrel: '/game/ff/o_barrel.png', plant: '/game/ff/o_plant.png', castle: '/game/ff/o_castle.png', shop: '/game/ff/o_shop.png', pillar: '/game/ff/o_pillar.png', carpet: '/game/ff/o_carpet.png', table: '/game/ff/o_table.png', flowers: '/game/ff/o_flowers.png', rock: '/game/ff/o_rock.png', bush: '/game/ff/o_bush.png' }
const HOUSE_KEYS = ['house', 'house2', 'house3', 'house4'] // 家ブロックごとに違うデザインを割当
const CHARS: Record<string, string> = { slime: '/game/ff/c_slime.png', boss: '/game/ff/c_boss.png' }
const HERO_SHEET_URL = '/game/ff/c_hero_sheet.png'
const AV = '?v=13' // アセットのキャッシュ破棄用（同名で更新しても新しい画像が読まれるよう、変更のたびに上げる）
const BLOBS = new Set(['slime', 'boss'])
// キャラの画面上の見かけ高さ（プレイヤー/NPCで統一）。スライム等の塊は小さめ。
const CHAR_H = 1.3 * PX, BLOB_H = 1.0 * PX // FF2寄り：キャラはタイル1個強の小ぶりに
// タイル文字 → 地面画像の種類
function groundOf(scene: Scene, ch: string): string {
  if (scene === 'guild') return ch === '#' ? 'wall' : 'castle'
  if (ch === 'w') return 'water'
  if (ch === '#') return 'twall' // 街の石壁
  if (ch === '.' || ch === 'T') return 'grass' // 街の外＝芝生（木も芝の上に立つ）
  return 'path' // 街の中＝石畳（: D H B S F の下）
}
// dual-grid マーチングスクエア法による「石畳ブロック」の輪郭(16ケース)。
// 芝の上に石畳の島を描き、外側の角は凸の四分円、内側の角は凹の四分円で“丸み”を付ける（FF/DQ風の幾何学的なつなぎめ）。
// PX=タイル, H=半タイル, R=角丸半径。すべて直線＋arc＝補間ぼかし無しのくっきりした縁。
function buildCobblePath(gx: CanvasRenderingContext2D, mask: number, PX: number, H: number, R: number) {
  const cTL = [0, 0], cTR = [PX, 0], cBR = [PX, PX], cBL = [0, PX] // 角
  const mT = [H, 0], mR = [PX, H], mB = [H, PX], mL = [0, H]       // 各辺の中点(arcの始終点)
  const PI = Math.PI
  switch (mask) {
    case 15: gx.rect(0, 0, PX, PX); break // 全面
    // 1隅だけ石畳＝凸の角丸
    case 1: gx.moveTo(mL[0], mL[1]); gx.lineTo(cTL[0], cTL[1]); gx.lineTo(mT[0], mT[1]); gx.arc(0, 0, R, 0, PI / 2); gx.closePath(); break
    case 2: gx.moveTo(mT[0], mT[1]); gx.lineTo(cTR[0], cTR[1]); gx.lineTo(mR[0], mR[1]); gx.arc(PX, 0, R, PI / 2, PI); gx.closePath(); break
    case 4: gx.moveTo(mR[0], mR[1]); gx.lineTo(cBR[0], cBR[1]); gx.lineTo(mB[0], mB[1]); gx.arc(PX, PX, R, PI, PI * 1.5); gx.closePath(); break
    case 8: gx.moveTo(mB[0], mB[1]); gx.lineTo(cBL[0], cBL[1]); gx.lineTo(mL[0], mL[1]); gx.arc(0, PX, R, PI * 1.5, PI * 2); gx.closePath(); break
    // 隣り合う2隅＝直線の縁(半分)
    case 3: gx.rect(0, 0, PX, H); break
    case 6: gx.rect(H, 0, H, PX); break
    case 12: gx.rect(0, H, PX, H); break
    case 9: gx.rect(0, 0, H, PX); break
    // 3隅石畳＝空いた隅を凹の角丸で削る
    case 14: gx.moveTo(mT[0], mT[1]); gx.lineTo(cTR[0], cTR[1]); gx.lineTo(cBR[0], cBR[1]); gx.lineTo(cBL[0], cBL[1]); gx.lineTo(mL[0], mL[1]); gx.arc(0, 0, R, PI / 2, 0, true); gx.closePath(); break
    case 13: gx.moveTo(mR[0], mR[1]); gx.lineTo(cBR[0], cBR[1]); gx.lineTo(cBL[0], cBL[1]); gx.lineTo(cTL[0], cTL[1]); gx.lineTo(mT[0], mT[1]); gx.arc(PX, 0, R, PI, PI / 2, true); gx.closePath(); break
    case 11: gx.moveTo(mB[0], mB[1]); gx.lineTo(cBL[0], cBL[1]); gx.lineTo(cTL[0], cTL[1]); gx.lineTo(cTR[0], cTR[1]); gx.lineTo(mR[0], mR[1]); gx.arc(PX, PX, R, PI * 1.5, PI, true); gx.closePath(); break
    case 7: gx.moveTo(mL[0], mL[1]); gx.lineTo(cTL[0], cTL[1]); gx.lineTo(cTR[0], cTR[1]); gx.lineTo(cBR[0], cBR[1]); gx.lineTo(mB[0], mB[1]); gx.arc(0, PX, R, 0, PI * 1.5, true); gx.closePath(); break
    // 対角＝凸2つ
    case 5: gx.moveTo(mL[0], mL[1]); gx.lineTo(cTL[0], cTL[1]); gx.lineTo(mT[0], mT[1]); gx.arc(0, 0, R, 0, PI / 2); gx.closePath(); gx.moveTo(mR[0], mR[1]); gx.lineTo(cBR[0], cBR[1]); gx.lineTo(mB[0], mB[1]); gx.arc(PX, PX, R, PI, PI * 1.5); gx.closePath(); break
    case 10: gx.moveTo(mT[0], mT[1]); gx.lineTo(cTR[0], cTR[1]); gx.lineTo(mR[0], mR[1]); gx.arc(PX, 0, R, PI / 2, PI); gx.closePath(); gx.moveTo(mB[0], mB[1]); gx.lineTo(cBL[0], cBL[1]); gx.lineTo(mL[0], mL[1]); gx.arc(0, PX, R, PI * 1.5, PI * 2); gx.closePath(); break
  }
}
// 地面を1枚のオフスクリーンに焼き込む。街は「芝の上に角丸の石畳ブロック＋縁石」をFF風オートタイルで描く
// （ぼかしでなく、幾何学的に丸めた“つなぎめ”）。石壁はその上にくっきり四角で重ねる。
function bakeGround(scene: Scene, map: string[], tex: Record<string, HTMLImageElement>, ready: boolean): HTMLCanvasElement {
  const ROWS = map.length, COLS = map[0].length
  const W = COLS * PX, H = ROWS * PX
  const gc = document.createElement('canvas'); gc.width = W; gc.height = H
  const gx = gc.getContext('2d')!; gx.imageSmoothingEnabled = false
  const terr: string[][] = map.map((row) => Array.from(row, (ch) => groundOf(scene, ch)))
  const fallback: Record<string, string> = { water: '#2f6fb0', wall: '#3a3a44', twall: '#3a3a44', castle: '#8c8c96', wood: '#b98a55', path: '#9a9a9a', grass: '#4a9a52' }
  const drawTile = (t: string, x: number, y: number) => {
    const img = tex[t]
    if (img) {
      // 壁(t_wall 76x41)など非正方形タイルは正方領域をサンプリングして潰れを防ぐ
      const sq = Math.min(img.width, img.height), nonSquare = img.width !== img.height
      if (nonSquare) gx.drawImage(img, 0, 0, sq, sq, x * PX, y * PX, PX, PX)
      else gx.drawImage(img, 0, 0, img.width, img.height, x * PX, y * PX, PX, PX)
    }
    else { gx.fillStyle = fallback[t] || '#4a9a52'; gx.fillRect(x * PX, y * PX, PX, PX) }
    if (t === 'wall' || t === 'twall') { gx.fillStyle = 'rgba(18,16,28,0.34)'; gx.fillRect(x * PX, y * PX, PX, PX) } // 壁を床より暗く
  }
  const grassImg = tex['grass']
  const hasGrass = terr.some((r) => r.includes('grass'))
  if (!ready || !hasGrass || !grassImg) { // 読込中／芝の無いシーン(ギルド城内)はタイルをそのまま敷く（重い縁取り処理はしない）
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) drawTile(terr[y][x], x, y)
    return gc
  }
  // 1) 芝ベースを全面に敷く（石畳ブロックは常に芝の上に乗る）
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) gx.drawImage(grassImg, 0, 0, grassImg.width, grassImg.height, x * PX, y * PX, PX, PX)
  // 2) dual-grid マスク作成。石畳ブロック=「芝でも水でもない地面」(石畳:と街の石壁#)。芝との境界だけ角を丸める
  const isSolid = (x: number, y: number) => x >= 0 && y >= 0 && x < COLS && y < ROWS && terr[y][x] !== 'grass' && terr[y][x] !== 'water'
  const Hh = PX * 0.5, R = PX * 0.5
  const mc = document.createElement('canvas'); mc.width = W; mc.height = H
  const mx = mc.getContext('2d')!; mx.imageSmoothingEnabled = false; mx.fillStyle = '#ffffff'
  for (let dy = 0; dy <= ROWS; dy++) for (let dx = 0; dx <= COLS; dx++) {
    const tl = isSolid(dx - 1, dy - 1), tr = isSolid(dx, dy - 1), br = isSolid(dx, dy), bl = isSolid(dx - 1, dy)
    const mask = (tl ? 1 : 0) | (tr ? 2 : 0) | (br ? 4 : 0) | (bl ? 8 : 0)
    if (mask === 0) continue
    const ox = Math.round(dx * PX - Hh), oy = Math.round(dy * PX - Hh)
    mx.save(); mx.translate(ox, oy); mx.beginPath(); buildCobblePath(mx, mask, PX, Hh, R); mx.fill(); mx.restore()
  }
  // 3) 石畳テクスチャをマスクで切り抜き芝の上へ（タイルは world 原点基準で連続＝ブロック内部に継ぎ目を出さない）
  const pc = document.createElement('canvas'); pc.width = PX; pc.height = PX
  const pcx = pc.getContext('2d')!; pcx.imageSmoothingEnabled = false
  const cob = tex['path']
  if (cob) pcx.drawImage(cob, 0, 0, cob.width, cob.height, 0, 0, PX, PX); else { pcx.fillStyle = '#9a9a9a'; pcx.fillRect(0, 0, PX, PX) }
  const cl = document.createElement('canvas'); cl.width = W; cl.height = H
  const clx = cl.getContext('2d')!; clx.imageSmoothingEnabled = false
  clx.fillStyle = clx.createPattern(pc, 'repeat')!; clx.fillRect(0, 0, W, H)
  clx.globalCompositeOperation = 'destination-in'; clx.drawImage(mc, 0, 0)
  gx.drawImage(cl, 0, 0)
  // 4) 縁石＝石畳ブロックの輪郭1pxを暗くして“つなぎめ”を際立たせる（黒縁取りでなく1段暗い石色）
  const md = mx.getImageData(0, 0, W, H).data
  const aAt = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : md[(y * W + x) * 4 + 3]
  gx.fillStyle = '#5a5a64'
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (md[(y * W + x) * 4 + 3] > 128 && (aAt(x - 1, y) <= 128 || aAt(x + 1, y) <= 128 || aAt(x, y - 1) <= 128 || aAt(x, y + 1) <= 128)) gx.fillRect(x, y, 1, 1)
  }
  // 5) 街の石壁を上にくっきり四角で重ねる（角丸石畳の上＝壁はシャープなまま）
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) { const t = terr[y][x]; if (t === 'twall' || t === 'wall' || t === 'water') drawTile(t, x, y) }
  return gc
}
// 会員NPCは主人公と同じ歩行シート(4方向×4コマ)で動かす。性別で出し分け。
// 職業×年代/性別の種別キャラ。全て主人公シートと同じ4方向×4コマ・同じ画調で生成。h=表示身長倍率(子供は低く)
interface CharDef { key: string; url: string; h: number }
const CHAR_DEFS: CharDef[] = [
  { key: 'warrior_m', url: '/game/ff/c_warrior_m.png', h: 1.0 },  // 戦士・若い男
  { key: 'warrior_f', url: '/game/ff/c_warrior_f.png', h: 1.0 },  // 戦士・若い女
  { key: 'mage_m', url: '/game/ff/c_mage_m.png', h: 1.0 },        // 魔法使い・男
  { key: 'mage_f', url: '/game/ff/c_mage_f.png', h: 1.0 },        // 魔法使い・女
  { key: 'town_m', url: '/game/ff/c_town_m.png', h: 1.0 },        // 町人・若い男
  { key: 'town_f', url: '/game/ff/c_town_f.png', h: 1.0 },        // 町人・若い女
  { key: 'merchant_m', url: '/game/ff/c_merchant_m.png', h: 1.0 },// 商人・男
  { key: 'child_m', url: '/game/ff/c_child_m.png', h: 0.72 },     // 子供・男の子
  { key: 'child_f', url: '/game/ff/c_child_f.png', h: 0.72 },     // 子供・女の子
  { key: 'elder_m', url: '/game/ff/c_elder_m.png', h: 0.95 },     // 老人
]
// 性別ごとのスプライトプール（会員の実アカウント性別 sex 0=男/1=女 に合わせて割当。同性内で順送りして多様化）
const MALE_SPRITES = ['warrior_m', 'mage_m', 'town_m', 'merchant_m', 'child_m', 'elder_m']
const FEMALE_SPRITES = ['warrior_f', 'mage_f', 'town_f', 'child_f']
// 城ギルドホールのNPC配置。生活感を出すため挙動を割り当てる: sit=食卓で食事 / wander=徘徊 / stand=立ち話
type NpcBehavior = 'sit' | 'wander' | 'stand'
interface NpcSlot { x: number; y: number; behavior: NpcBehavior; flip?: boolean }
const GUILD_TABLES: [number, number][] = [[3, 8], [8, 10], [15, 8], [20, 10]] // マップ上の 'O'
const WANDER_HOMES: [number, number][] = [[8, 6], [15, 6], [6, 6], [20, 5], [4, 13], [9, 13], [15, 13], [20, 13]]
// 掲示板(左上 cols2-4)の前 row4 は通路として空ける（プレイヤーが掲示板に近づけるように）。立ちNPCは右側/下段へ。
const STAND_SPOTS: [number, number][] = [[2, 6], [16, 4], [6, 11], [20, 4], [9, 6], [14, 4], [6, 13], [17, 13]]
// 食卓を左右から挟む席（着席NPC）/ 徘徊 / 立ちを交互に並べ、人数が少なくても多様に見せる
const GUILD_NPC_SLOTS: NpcSlot[] = (() => {
  const sit: NpcSlot[] = GUILD_TABLES.flatMap(([tx, ty]): NpcSlot[] => [{ x: tx - 1, y: ty, behavior: 'sit', flip: false }, { x: tx + 1, y: ty, behavior: 'sit', flip: true }])
  const wander: NpcSlot[] = WANDER_HOMES.map(([x, y]): NpcSlot => ({ x, y, behavior: 'wander' }))
  const stand: NpcSlot[] = STAND_SPOTS.map(([x, y]): NpcSlot => ({ x, y, behavior: 'stand' }))
  const out: NpcSlot[] = []
  const n = Math.max(sit.length, wander.length, stand.length)
  for (let i = 0; i < n; i++) { if (sit[i]) out.push(sit[i]); if (wander[i]) out.push(wander[i]); if (stand[i]) out.push(stand[i]) }
  return out
})()
// 実行時のNPC状態（徘徊の補間・向き・揺れ）
interface NpcRt {
  id: string; name: string; text: string; sprite: string
  behavior: NpcBehavior; homeX: number; homeY: number
  tileX: number; tileY: number; fromX: number; fromY: number
  moving: boolean; startedAt: number; nextMoveAt: number
  dir: Dir; flip: boolean; phase: number
}
const NPC_STEP_MS = 300

// マップ上で同じ文字が連結したブロック群（建物など）の各バウンディングboxを返す
function findBlocks(map: string[], ch: string): { minX: number; minY: number; maxX: number; maxY: number }[] {
  const H = map.length, W = map[0].length
  const seen = Array.from({ length: H }, () => new Array<boolean>(W).fill(false))
  const blocks: { minX: number; minY: number; maxX: number; maxY: number }[] = []
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (map[y][x] !== ch || seen[y][x]) continue
    let minX = x, minY = y, maxX = x, maxY = y
    const stack: [number, number][] = [[x, y]]; seen[y][x] = true
    while (stack.length) {
      const [cx, cy] = stack.pop()!
      if (cx < minX) minX = cx; if (cx > maxX) maxX = cx
      if (cy < minY) minY = cy; if (cy > maxY) maxY = cy
      for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]] as [number, number][]) {
        if (nx >= 0 && ny >= 0 && nx < W && ny < H && !seen[ny][nx] && map[ny][nx] === ch) { seen[ny][nx] = true; stack.push([nx, ny]) }
      }
    }
    blocks.push({ minX, minY, maxX, maxY })
  }
  return blocks
}

// マゼンタ背景を「画像の縁から繋がっている領域」だけ塗り抜く（内部の紫=ボス本体は残す）
function keyImage(img: HTMLImageElement): HTMLCanvasElement {
  const W = 128
  const H = Math.max(1, Math.round(img.height * (W / img.width)))
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingEnabled = false // 補間でマゼンタと混色させない（縁の輪を防ぐ）
  ctx.drawImage(img, 0, 0, W, H)
  const id = ctx.getImageData(0, 0, W, H); const p = id.data
  // マゼンタ/紫の色相（赤も青も緑を上回る）で判定。明暗に関わらず背景を捉える。
  const isMag = (idx: number) => {
    const r = p[idx * 4], g = p[idx * 4 + 1], b = p[idx * 4 + 2]
    return (r - g) > 18 && (b - g) > 10
  }
  const visited = new Uint8Array(W * H)
  const stack: number[] = []
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return
    const idx = y * W + x
    if (visited[idx] || !isMag(idx)) return
    visited[idx] = 1; stack.push(idx)
  }
  for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1) }
  for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y) }
  while (stack.length) {
    const idx = stack.pop()!
    p[idx * 4 + 3] = 0
    const x = idx % W, y = (idx / W) | 0
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1)
  }
  // 縁に残るマゼンタかぶり（ピンクの輪郭）を、透明に隣接するピンク画素から数px削る
  const pink = (idx: number) => {
    if (p[idx * 4 + 3] === 0) return false
    const r = p[idx * 4], g = p[idx * 4 + 1], b = p[idx * 4 + 2]
    return (r - g) > 12 && (b - g) > 6
  }
  const transparentNeighbor = (x: number, y: number) =>
    (y > 0 && p[((y - 1) * W + x) * 4 + 3] === 0) || (y < H - 1 && p[((y + 1) * W + x) * 4 + 3] === 0) ||
    (x > 0 && p[(y * W + x - 1) * 4 + 3] === 0) || (x < W - 1 && p[(y * W + x + 1) * 4 + 3] === 0)
  for (let pass = 0; pass < 4; pass++) {
    const clear: number[] = []
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const idx = y * W + x
      if (pink(idx) && transparentNeighbor(x, y)) clear.push(idx)
    }
    for (const idx of clear) p[idx * 4 + 3] = 0
  }
  // 最大連結成分（=本体）だけ残し、背景に散った小さなゴミ画素を除去（切り抜き範囲の暴れを防ぐ）
  {
    const label = new Int32Array(W * H).fill(-1)
    let cur = 0, best = -1, bestSize = 0
    const st: number[] = []
    for (let i = 0; i < W * H; i++) {
      if (p[i * 4 + 3] <= 20 || label[i] !== -1) continue
      let size = 0; st.length = 0; st.push(i); label[i] = cur
      while (st.length) {
        const idx = st.pop()!; size++
        const x = idx % W, y = (idx / W) | 0
        const ns = [x + 1 < W ? idx + 1 : -1, x - 1 >= 0 ? idx - 1 : -1, y + 1 < H ? idx + W : -1, y - 1 >= 0 ? idx - W : -1]
        for (const ni of ns) { if (ni >= 0 && p[ni * 4 + 3] > 20 && label[ni] === -1) { label[ni] = cur; st.push(ni) } }
      }
      if (size > bestSize) { bestSize = size; best = cur }
      cur++
    }
    for (let i = 0; i < W * H; i++) if (p[i * 4 + 3] > 20 && label[i] !== best) p[i * 4 + 3] = 0
  }
  ctx.putImageData(id, 0, 0)
  let minX = W, minY = H, maxX = 0, maxY = 0, found = false
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (p[(y * W + x) * 4 + 3] > 20) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; found = true }
  }
  if (!found) return c
  const cw = maxX - minX + 1, ch = maxY - minY + 1
  const out = document.createElement('canvas'); out.width = cw; out.height = ch
  out.getContext('2d')!.drawImage(c, minX, minY, cw, ch, 0, 0, cw, ch)
  return out
}

function loadKeyed(url: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(keyImage(img))
    img.onerror = reject
    img.src = url
  })
}

// 歩行スプライトシート(4列×4行)のマゼンタを色相で全面透過（切り抜きせず512x512を維持）
const SHEET = 256, CELL = 64, SHEET_COLS = 4 // 表示サイズに近づけて補間なしでもくっきり
function loadSheet(url: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = SHEET; c.height = SHEET
      const ctx = c.getContext('2d')!; ctx.imageSmoothingEnabled = false
      ctx.drawImage(img, 0, 0, SHEET, SHEET)
      const id = ctx.getImageData(0, 0, SHEET, SHEET); const p = id.data
      for (let i = 0; i < p.length; i += 4) {
        const r = p[i], g = p[i + 1], b = p[i + 2]
        if ((r - g) > 18 && (b - g) > 10) p[i + 3] = 0 // マゼンタ/紫の色相を透過
      }
      ctx.putImageData(id, 0, 0); resolve(c)
    }
    img.onerror = reject
    img.src = url
  })
}
// シート全フレーム統合のキャラ内容バウンディングbox（セル内座標）。足元揃え＆スケール統一に使う。
function cellContentBox(sheet: HTMLCanvasElement): { top: number; bottom: number; left: number; right: number } {
  const ctx = sheet.getContext('2d')!
  const d = ctx.getImageData(0, 0, SHEET, SHEET).data
  const rows = SHEET / CELL, M = 0 // 余白を削らない（頭・足が見切れるのを防ぐ）。基本シートはグリッド線なしなので0でOK
  let top = CELL, bottom = 0, left = CELL, right = 0, found = false
  for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < SHEET_COLS; cx++)
    for (let y = M; y < CELL - M; y++) for (let x = M; x < CELL - M; x++) {
      if (d[(((cy * CELL + y) * SHEET) + (cx * CELL + x)) * 4 + 3] > 24) {
        if (y < top) top = y; if (y > bottom) bottom = y
        if (x < left) left = x; if (x > right) right = x; found = true
      }
    }
  return found ? { top, bottom, left, right } : { top: M, bottom: CELL - 1 - M, left: M, right: CELL - 1 - M }
}
// 向き→シートの行（生成シート: 0=正面 1=左 2=右 3=背面）
const DIR_ROW: Record<Dir, number> = { down: 0, left: 1, right: 2, up: 3 }

const DIR_DELTA: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }
// プレイヤー→NPC の差分から「NPCがこちらへ向き直る向き」を返す（話しかけられたら正対）
function facingFromDelta(dx: number, dy: number): Dir {
  if (dx === 0 && dy === 0) return 'down'
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'left' : 'right' // NPCがプレイヤーの右側→NPCは左を向く
  return dy > 0 ? 'up' : 'down'                                       // NPCが下側→上を向く
}
// 町の芝(. )タイルの装飾種別を決める唯一のロジック（描画と当たり判定で必ず一致させる）
function decorAt(x: number, y: number): '' | 'flowers' | 'bush' | 'rock' {
  const hu = (((x * 73856093) ^ (y * 19349663)) >>> 0) % 100
  if (hu < 7) return 'flowers'
  if (hu < 11) return 'bush'
  if (hu < 14) return 'rock'
  return ''
}
const DECOR_SOLID: Record<string, boolean> = { rock: true, bush: false, flowers: false, '': false } // 岩は通行不可（茂み/花は通れる）

interface Member { player_name?: string; affiliated_club?: string; skill_grade?: string; referee_qualification?: string; discord_id?: string; member_level?: number; sex?: number }
const SAMPLE_MEMBERS: Member[] = [
  { player_name: '十条 太郎', affiliated_club: '十条クラブ', skill_grade: '2', referee_qualification: '2級', sex: 0 },
  { player_name: '墨田 花子', affiliated_club: '十条クラブ', skill_grade: '1', sex: 1 },
  { player_name: '江東 健', affiliated_club: '十条クラブ', skill_grade: '3', sex: 0 },
  { player_name: '荒川 みう', affiliated_club: '十条クラブ', referee_qualification: '3級', sex: 1 },
  { player_name: '足立 大地', affiliated_club: '十条クラブ', skill_grade: 'SP', sex: 0 },
  { player_name: '中央 さくら', affiliated_club: '十条クラブ', sex: 1 },
  { player_name: '台東 玲', affiliated_club: '十条クラブ', skill_grade: '2', sex: 1 },
  { player_name: '葛飾 翔', affiliated_club: '十条クラブ', referee_qualification: '2級', sex: 0 },
  { player_name: '北 もえ', affiliated_club: '十条クラブ', skill_grade: '4', sex: 1 },
  { player_name: '練馬 隼人', affiliated_club: '十条クラブ', skill_grade: '1', referee_qualification: '1級', sex: 0 },
  { player_name: '品川 結衣', affiliated_club: '十条クラブ', sex: 1 },
  { player_name: '世田谷 楓', affiliated_club: '十条クラブ', skill_grade: '3', sex: 0 },
]
// 文字列ハッシュ（メンバーごとに見た目・口調を安定させる）
function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
// ペルソナ別セリフ（writerパネルで生成）。性別に合わせて男性/女性の口調プールから固定割り当て。
const MALE_PERSONAS: string[][] = [
  [ // 古参の団員
    '……おう、来たか。焦るな。鍛錬ってのは、一日で実る花じゃねえからな。',
    '俺もな、昔は野原のスライム一匹に手こずってた。今のお前さんと、変わらんよ。',
    '傷を負ったら、無理に進むな。生きて帰ってこそ、明日の鍛錬がある。',
    '強さってのは、誰かを守れる重さのことだ。お前にはもう、その重さがあるさ。',
    '野原に出るなら、一人で気張るな。仲間の背中ってのは、思ったより頼りになる。',
    '派手な技なんざいらねえ。地味な一歩を、何千回。それが本物だ。',
    '焦って奥へ進むより、野原のスライムで地道にレベルを上げな。EXPは裏切らねえ。',
    'やくそうは安いうちに、多めに持っとけ。いざ主と向き合った時、その一枚が命を分ける。',
    '迷ったら、初めて掲示板の前に立った日を思い出せ。あの頃より、ずっと遠くまで来た。',
    '……無理すんなよ。お前が欠けたら、このギルドは少し寂しくなる。',
  ],
  [ // 新米団員
    'あ、あの、おはようございます！…って、もうお昼でしたっけ。す、すみません！',
    'ぼく、まだ野原のスライムでも手がふるえちゃって。いつか、堂々と倒したいんです。',
    '鍛錬って、地味ですけど…昨日できなかったことが今日できると、ちょっと泣きそうになります。',
    'せ、先輩がたみたいに強くなりたくて。背中を追ってたら、ここまで来ちゃいました。',
    'やくそう、もう三回も使っちゃって。今度こそ無駄にしないって、決めたんです。',
    '掲示板の依頼、まずは野原の弱いスライムからがいいって教わりました。少しずつ、だそうです。',
    '受付の人に名前を覚えてもらえました！それだけで、今日はもう胸がいっぱいで。',
    '次の大会、ぼくなんかが出ていいのかな…でも、誘ってもらえたの、すごく嬉しくて。',
    'やくそうは安いうちに買いだめがいいって。ぼくはすぐ切らしちゃうので…気をつけてくださいね。',
    'あっ、あなたが噂の…！い、いえ、なんでもないです。緊張で、つい。',
  ],
  [ // 熱血漢の団員
    'おう、いい顔してるな！その目、昨日よりずっと強くなってるぜ！',
    'ガッハッハ！朝から鍛錬で汗かいてきた！この汗が宝物よ！',
    'まだやれる、まだいける！俺はそう叫んで生きてきたんだ！',
    'へこむ日もあるさ。だがな、立ち上がりゃそれでもう勝ちだ！',
    '仲間がいる、それだけで百人力よ！背中はまかせろ、ドンと来い！',
    '野原で汗を流せ！スライム一匹倒すごとに、お前はちゃんと強くなってんだ！',
    '掲示板の依頼、迷ってんなら飛び込め！受付の姐さんが笑って待ってるぜ！',
    'なあ聞いてくれ、今日の空、最高に青いと思わねえか！？',
    '次の大会、俺ァ燃えてるぜ！お前も一緒に燃えようや、なあ！',
    'うおおっ、力がみなぎる！今ならスライム百匹でもかかってこい！',
  ],
  [ // 戦術家の団員
    'ふむ、いい目をしている。\n焦らず、まず相手の動きを見極めることだ。',
    '勝敗は戦う前に半分決まっている。\n備えのある者が、最後に笑うのさ。',
    '強敵に正面からぶつかるな。\n弱点を見抜けば、力の差はくつがえせる。',
    '我が見たかぎり、君は伸びる。\n足りないのは才ではなく、積み重ねだけだ。',
    '退くのも立派な戦術だ。\n生きてさえいれば、明日また挑める。',
    '体力が半分を切ったら、迷わずやくそうを使え。\n惜しんで倒れては元も子もない。',
    '掲示板の依頼は易しいものから片付けろ。\n小さな鍛錬が、やがて主に届く力になる。',
    '数の多い敵こそ、一体ずつ片付けるに限る。\n慌てる者から崩れていくものだ。',
    '地図は頭の中に描いておけ。\nどこで戦い、どこで退くか——それが分かれ目だ。',
    'ひとりで抱え込むな。\n仲間と組めば、戦況は思いのほか軽くなる。',
  ],
  [ // お調子者の団員
    'よっ、調子はどうだい！おれ？おれはいつでも絶好調に決まってんだろ！',
    '聞いてくれよ、けさスライムに三回もコケて笑われたんだ。…って何で君まで笑うんだよ！',
    'むずかしい顔すんなって。鍛錬も笑いながらやりゃ、あっという間さ。',
    'おれの夢かい？そりゃもう、野原の主の前で派手にズッコケて伝説になることよ！',
    '受付の姉ちゃんに『真面目にやれ』って毎日叱られてんだ。へへ、もはや日課だな。',
    '掲示板の依頼、地味なやつほど経験値おいしいんだぜ。レベル上げに飽きたらのぞいてみな！',
    '野原の主と殴り合うなら、やくそうは多めに持ってけ。手ぶらで挑むのはおれくらいで十分さ！',
    'なあ、やくそう一個賭けようぜ。次の依頼、おれと君どっちが先に終わるかってさ！',
    '大会前って、みんなピリピリしすぎなんだよ。ほら、肩の力ぬけぬけ〜。',
    'おれが転んだら笑え、君が転んだらおれが笑う。これが仲間ってもんだろ？',
  ],
]
const FEMALE_PERSONAS: string[][] = [
  [ // 癒し系の団員
    'あらあら、ようこそ。\nお茶でも飲んで、ひと息ついていってね。',
    'ふぁ……ごめんなさい、日向ぼっこしてたら、うとうとしちゃって。',
    'あせらなくていいのよ。きみのペースで、ゆっくり進めばいいわ。',
    'スライムさんたちもね、お日さまの下だと気持ちよさそうにしてるの。',
    '誰かのために頑張れるって、それだけで、もう立派なことよ。',
    'やくそうはね、たくさん持っておくと安心よ。お守りがわりに、ね。',
    '鍛錬をこつこつ重ねると、いつのまにかレベルが上がってるものなのよ。',
    '今日もぶじに帰ってきてくれて、ほんとうによかった。',
    'むりは禁物。つかれたら、ここで腰をおろしていってね。',
    'ふふ、きみのお顔を見ると、なんだかあったかい気持ちになるわ。',
  ],
  [ // 姉御肌の団員
    'おう、来たね。困ったらあたしを頼りな。背中はまかせときな。',
    'なに辛気くさい顔してんの。ほら、ぐっと胸を張りな！',
    '野原のスライムくらい、あたしがついててやる。安心しな。',
    '無茶はおよし。生きて帰る、それが一番強いんだよ。',
    'やくそうは多めに持ちな。備えあれば憂いなし、ってね。',
    'あんたならやれるさ。このあたしが見込んだんだ。',
    '掲示板の依頼、迷ってんなら一緒に選んでやろうか。',
    '大会前ってのは気が立つもんさ。ま、肩の力を抜きな。',
  ],
  [ // 元気っ子の団員
    'あっ、来た来た！ねえ、今日も一緒に鍛錬する？',
    'あたし、強くなってくのが楽しくてしょうがないんだ！',
    'スライム、最初はこわかったけど…今はちょっと平気！',
    '一緒に依頼いこうよ！えへへ、心強いもん。',
    'やくそう買った？あたし、ついつい使いすぎちゃうんだよね〜。',
    'レベル上がると、できること増えてうれしいよねっ！',
    'うー、今日も一日がんばるぞー！おーっ！',
    'あなたの笑った顔見ると、あたしも元気でちゃう！',
  ],
  [ // しっかり者の団員
    'ようこそお越しくださいました。ごゆっくりどうぞ。',
    '掲示板のご依頼は、もうご覧になりましたか？',
    '無理は禁物です。お体を大切になさってくださいね。',
    'やくそうは余裕をもってお持ちになると安心ですよ。',
    '日々の鍛錬の積み重ねが、確かな力になります。',
    '野原の主は手強い相手。十分に備えてから挑んでくださいね。',
    'お帰りなさいませ。ご無事で何よりです。',
    'わたくしにできることがあれば、何なりとお申し付けを。',
  ],
  [ // 物静かな団員
    '…あ。こんにちは。今日も、よろしくね。',
    '…鍛錬は、嘘をつかないから。…好き。',
    'スライムは…ちょっと、こわい。でも、がんばる。',
    '…無理は、しないで。ね。',
    '…そばにいるよ。困ったら、言って。',
    'やくそう…持った？…うん、ならよかった。',
    '…今日も、会えてよかった。',
    '…ふふ。なんでもない。',
  ],
]
const MEMBER_TIPS: string[] = [
  '掲示板には依頼が貼ってある。まずは易しいものから受けるといい。',
  '野原に出ればスライムが湧く。倒せばEXPが手に入り、レベルが上がる。',
  'やくそうは安いうちに、多めに買っておくと心強い。',
  '体力が半分を切ったら、ためらわずやくそうを使うこと。',
  '野原の主は手ごわい。十分にレベルを上げてから挑むといい。',
  '仲間と組めば、一人では届かぬ敵にも手が届く。',
  '無理に奥へ進まず、生きて帰ることを第一に。',
  '鍛錬の積み重ねが、いつのまにか大きな力になっている。',
]
// メンバー属性 → 肩書きの一節（名前は会話枠のヘッダに出るので省略）
function memberIdentity(m: Member): string {
  const parts: string[] = []
  if (m.affiliated_club) parts.push(`${m.affiliated_club}所属`)
  if (m.skill_grade) parts.push(`技術${m.skill_grade}`)
  if (m.referee_qualification) parts.push(`審判${m.referee_qualification}`)
  return parts.length ? parts.join('・') + '。' : ''
}
// メンバーごとに安定したセリフ（肩書き＋固定ペルソナの一言＋たまにヒント）
function memberDialogue(m: Member): string {
  const h = hashStr(m.player_name || '仲間')
  // 性別に合わせた口調プール（不明な場合はハッシュで男女どちらかに）
  const personas = m.sex === 1 ? FEMALE_PERSONAS : m.sex === 0 ? MALE_PERSONAS : (h & 1 ? FEMALE_PERSONAS : MALE_PERSONAS)
  const lines = personas[h % personas.length]
  const flavor = lines[(h >>> 3) % lines.length]
  const id = memberIdentity(m)
  let text = id ? `${id}\n${flavor}` : flavor
  if (h % 4 === 0) text += `\n${MEMBER_TIPS[(h >>> 6) % MEMBER_TIPS.length]}`
  return text
}

const STEP_MS = 150
interface PlayerRef { tileX: number; tileY: number; dir: Dir; moving: boolean; fromX: number; fromY: number; startedAt: number }

// ===== セーブ（進捗をlocalStorageに保存・復元）=====
const SAVE_PREFIX = 'jujo_game_save_v1_'
interface GameSave { exp: number; gold: number; weaponLv: number; armorLv: number; potions: number; accepted: string[]; questKills: Record<string, number>; completedQuests: string[] }
function saveKeyFor(discordId?: string, username?: string): string { return SAVE_PREFIX + (discordId || username || 'dev') }
function loadGameSave(key: string): GameSave | null {
  try {
    const raw = localStorage.getItem(key); if (!raw) return null
    const d = JSON.parse(raw); if (!d || typeof d.exp !== 'number') return null
    return {
      exp: d.exp || 0, gold: d.gold || 0, weaponLv: d.weaponLv || 0, armorLv: d.armorLv || 0,
      potions: typeof d.potions === 'number' ? d.potions : 2, accepted: Array.isArray(d.accepted) ? d.accepted : [],
      questKills: (d.questKills && typeof d.questKills === 'object') ? d.questKills : {}, completedQuests: Array.isArray(d.completedQuests) ? d.completedQuests : [],
    }
  } catch { return null }
}

export default function Game({ username, onExit, discordId }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const spritesRef = useRef<Record<string, HTMLCanvasElement>>({})
  const spriteUrlRef = useRef<Record<string, string>>({})
  const groundTexRef = useRef<Record<string, HTMLImageElement>>({})
  const groundBakeRef = useRef<{ key: string; canvas: HTMLCanvasElement } | null>(null) // 焼き込み済み地面（境界をなめらかにした1枚絵）
  const objTexRef = useRef<Record<string, HTMLCanvasElement>>({})
  const heroSheetRef = useRef<HTMLCanvasElement | null>(null)
  const heroBoxRef = useRef<{ top: number; bottom: number; left: number; right: number } | null>(null)
  const npcRuntimeRef = useRef<NpcRt[]>([])
  const walkSheetsRef = useRef<Record<string, { sheet: HTMLCanvasElement; box: { top: number; bottom: number; left: number; right: number }; h: number }>>({})
  const uiPausedRef = useRef(false)
  const playerRef = useRef<PlayerRef>({ tileX: 12, tileY: 13, dir: 'down', moving: false, fromX: 12, fromY: 13, startedAt: 0 })
  const heldDirRef = useRef<Dir | null>(null)
  const sceneRef = useRef<Scene>('town')
  const staticNpcDirRef = useRef<Record<string, Dir>>({}) // 町NPC/受付の向き（話しかけられたら正対）
  const blockedDecorRef = useRef<Set<string>>(new Set())  // 岩で塞ぐタイル（描画と同じ決定的配置）

  const saveKey = saveKeyFor(discordId, username)
  const tutKey = saveKey + ':tut'
  const [saved] = useState(() => loadGameSave(saveKey)) // マウント時に1度だけ読み込み
  const [tutSeen] = useState(() => { try { return localStorage.getItem(tutKey) === '1' } catch { return false } }) // チュートリアル既読
  // 進捗のある（初期値でない）セーブがある時だけ「つづきから」を出す
  const hasSave = !!saved && (saved.exp > 0 || saved.gold > 0 || saved.weaponLv > 0 || saved.armorLv > 0 || saved.accepted.length > 0 || saved.potions !== 2)
  const [, setScene] = useState<Scene>('town')
  // プロローグは新規プレイ時のみ（つづきからの復帰プレイヤーには出さない）
  const [dialog, setDialog] = useState<{ name: string; text: string } | null>(hasSave ? null : {
    name: '物語', text: '——ここは城塞ギルド〈十条ソフトテニス団〉。\n野には魔物が湧き、人々は力ある冒険者を求めていた。\n君もまた、その門を叩いた一人。\n日々の鍛錬と数々の依頼が、君を本物の戦士へと育てていく。\nまずは城の扉からギルドへ入り、掲示板で依頼を受けよう。',
  })
  const [boardOpen, setBoardOpen] = useState(false)
  const [accepted, setAccepted] = useState<string[]>(saved?.accepted ?? [])
  const [questKills, setQuestKills] = useState<Record<string, number>>(saved?.questKills ?? {}) // 討伐系クエストの進捗
  const [completedQuests, setCompletedQuests] = useState<string[]>(saved?.completedQuests ?? []) // 報告済み
  const [exp, setExp] = useState(saved?.exp ?? 0) // 冒険EXP（戦闘・クエスト。セーブ対象）
  // 活動EXP（実際の練習参加・大会出場から算出。毎回サーバから再計算＝セーブしない・二重加算しない）
  const [activityExp, setActivityExp] = useState(0)
  const [activity, setActivity] = useState<{ practices: number; tournaments: number }>({ practices: 0, tournaments: 0 })
  const [gold, setGold] = useState(saved?.gold ?? 0)
  const [weaponLv, setWeaponLv] = useState(saved?.weaponLv ?? 0)
  const [armorLv, setArmorLv] = useState(saved?.armorLv ?? 0)
  const [potions, setPotions] = useState(saved?.potions ?? 2)
  const [menuOpen, setMenuOpen] = useState(false)
  const [showTitle, setShowTitle] = useState(true) // タイトル画面（最初に表示。はじめるでゲームへ）
  const [showTutorial, setShowTutorial] = useState(false) // あそびかた（初回 or 任意表示）
  const closeTutorial = () => { setShowTutorial(false); try { localStorage.setItem(tutKey, '1') } catch { /* noop */ } }
  const [battle, setBattle] = useState<Battle | null>(null)
  const [enemyHit, setEnemyHit] = useState(false)
  const [fx, setFx] = useState<{ kind: 'slash' | 'magic' | 'heal'; id: number } | null>(null) // 戦闘エフェクト
  const fxIdRef = useRef(0)
  const [popups, setPopups] = useState<{ id: number; text: string; color: string; left: string; top: string }[]>([])
  const expRef = useRef(0)
  const activityExpRef = useRef(0)
  const weaponRef = useRef(0)
  const armorRef = useRef(0)
  const potionRef = useRef(0)
  const battleRef = useRef<Battle | null>(null)
  const popupIdRef = useRef(0)
  const defeatedRef = useRef<Set<string>>(new Set())
  const [, setVer] = useState(0)

  const mapFor = (s: Scene) => (s === 'guild' ? GUILD_MAP : TOWN_MAP)
  const entitiesFor = (s: Scene): Entity[] => {
    if (s !== 'guild') return TOWN_ENTITIES.filter((e) => !(e.kind === 'monster' && defeatedRef.current.has(e.id)))
    const rts = npcRuntimeRef.current
    const guild = GUILD_ENTITIES.map((e) => e.id === 'g-reception'
      ? { ...e, text: `おかえり、団員！\n今日は ${rts.length} 人の仲間が集っている。掲示板の依頼は確認したかい？` }
      : e)
    const members: Entity[] = rts.map((n) => ({ id: n.id, kind: 'npc', sprite: n.sprite, x: n.tileX, y: n.tileY, name: n.name, text: n.text }))
    return [...guild, ...members]
  }
  const entityAt = (s: Scene, x: number, y: number) => entitiesFor(s).find((e) => e.x === x && e.y === y)
  const tileWalkable = (s: Scene, x: number, y: number) => {
    const m = mapFor(s)
    if (y < 0 || y >= m.length || x < 0 || x >= m[0].length) return false
    if (!(WALKABLE[m[y][x]] ?? false)) return false
    if (s === 'town' && blockedDecorRef.current.has(`${x},${y}`)) return false // 芝に点在する岩で塞ぐ
    return true
  }

  // FF2素材の読み込み（地面=不透明 / オブジェクト・キャラ=マゼンタ抜き / 歩行シート）
  useEffect(() => {
    let alive = true
    Object.entries(GROUND).forEach(([k, url]) => { const img = new Image(); img.onload = () => { groundTexRef.current[k] = img; setVer((v) => v + 1) }; img.src = url + AV })
    Promise.all(Object.entries(OBJS).map(([k, url]) => loadKeyed(url + AV).then((cv) => [k, cv] as const).catch(() => null)))
      .then((pairs) => { if (!alive) return; const o = objTexRef.current; for (const pr of pairs) if (pr) o[pr[0]] = pr[1]; setVer((v) => v + 1) })
    Promise.all(Object.entries(CHARS).map(([k, url]) => loadKeyed(url + AV).then((cv) => [k, cv] as const).catch(() => null)))
      .then((pairs) => { if (!alive) return; const m = spritesRef.current, u = spriteUrlRef.current; for (const pr of pairs) if (pr) { m[pr[0]] = pr[1]; u[pr[0]] = pr[1].toDataURL() }; setVer((v) => v + 1) })
    // 基本キャラ＝主人公シート。色替えして全NPCに使い回す（サイズ・形は完全同一）
    loadSheet(HERO_SHEET_URL + AV).then((cv) => {
      if (!alive) return
      const box = cellContentBox(cv)
      heroSheetRef.current = cv; heroBoxRef.current = box
      walkSheetsRef.current['hero'] = { sheet: cv, box, h: 1 }
      setVer((v) => v + 1)
    }).catch(() => {})
    // 職業×年代/性別の種別キャラを読み込み（子供は h を下げて低身長に）
    for (const cd of CHAR_DEFS) loadSheet(cd.url + AV).then((cv) => { if (alive) { walkSheetsRef.current[cd.key] = { sheet: cv, box: cellContentBox(cv), h: cd.h }; setVer((v) => v + 1) } }).catch(() => {})
    return () => { alive = false }
  }, [])

  // 装飾の当たり判定セット（描画と同一の決定的配置。町の '.' タイルのみ走査）
  useEffect(() => {
    const blocked = new Set<string>()
    for (let y = 0; y < TOWN_MAP.length; y++) for (let x = 0; x < TOWN_MAP[0].length; x++) {
      if (TOWN_MAP[y][x] !== '.') continue
      if (DECOR_SOLID[decorAt(x, y)]) blocked.add(`${x},${y}`)
    }
    blockedDecorRef.current = blocked
  }, [])

  // キャンバスの内部解像度を表示サイズに同期（全画面・レスポンシブ）
  useEffect(() => {
    const resize = () => {
      const c = canvasRef.current; if (!c) return
      c.width = Math.max(320, Math.floor(c.clientWidth))
      c.height = Math.max(240, Math.floor(c.clientHeight))
    }
    resize()
    window.addEventListener('resize', resize)
    const id = window.setTimeout(resize, 60) // レイアウト確定後にもう一度
    return () => { window.removeEventListener('resize', resize); window.clearTimeout(id) }
  }, [])

  // メンバー取得 → 仲間NPC生成（共有スプライトをローテーション）
  useEffect(() => {
    const build = (members: Member[]) => {
      const rts: NpcRt[] = []
      let maleN = 0, femaleN = 0 // 性別プール内のローテーション（同性内で見た目を多様化）
      members.slice(0, GUILD_NPC_SLOTS.length).forEach((m, i) => {
        const slot = GUILD_NPC_SLOTS[i]
        const name = m.player_name || '仲間'
        // 実アカウントの性別でプール選択（0=男/1=女、不明は名前ハッシュで安定的に振り分け）＝NPCの見た目を本人の性別に一致させる
        const isFemale = m.sex === 1 ? true : m.sex === 0 ? false : (hashStr(name) & 1) === 1
        const pool = isFemale ? FEMALE_SPRITES : MALE_SPRITES
        const sprite = pool[(isFemale ? femaleN++ : maleN++) % pool.length]
        // 着席は食卓の方を向く（左席→右向き / 右席→左向き）。立ち/徘徊は正面から開始。
        const dir: Dir = slot.behavior === 'sit' ? (slot.flip ? 'left' : 'right') : 'down'
        rts.push({
          id: `member-${i}`, name, text: memberDialogue(m), sprite,
          behavior: slot.behavior, homeX: slot.x, homeY: slot.y,
          tileX: slot.x, tileY: slot.y, fromX: slot.x, fromY: slot.y,
          moving: false, startedAt: 0, nextMoveAt: 0,
          dir, flip: !!slot.flip, phase: (hashStr(name) % 360) / 360 * Math.PI * 2,
        })
      })
      npcRuntimeRef.current = rts
      setVer((v) => v + 1)
    }
    const load = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'
        const res = await fetch(`${apiUrl}/api/players`)
        if (res.ok) {
          const all: Member[] = await res.json()
          // 名前のある実プレイヤー。自分(=主人公)は除外。
          const pool = all.filter((m) => m.player_name && (!discordId || m.discord_id !== discordId))
          // 正会員・準会員を優先 → だめなら十条所属 → だめなら全員
          let members = pool.filter((m) => m.member_level === 0 || m.member_level === 1)
          if (!members.length) members = pool.filter((m) => (m.affiliated_club || '').includes('十条'))
          if (!members.length) members = pool
          build(members.length ? members : SAMPLE_MEMBERS); return
        }
      } catch { /* fallthrough */ }
      build(SAMPLE_MEMBERS)
    }
    load()
  }, [discordId])

  const goToScene = useCallback((target: Scene) => {
    sceneRef.current = target
    const p = playerRef.current
    if (target === 'guild') { p.tileX = 11; p.tileY = 13; p.dir = 'up' } else { p.tileX = 12; p.tileY = 6; p.dir = 'down' }
    p.moving = false; p.fromX = p.tileX; p.fromY = p.tileY
    heldDirRef.current = null
    setScene(target); setBoardOpen(false)
    setDialog(target === 'guild'
      ? { name: 'ギルド', text: '冒険者ギルドに入った。\n左奥の「掲示板」に近づいて調べると依頼を受けられる。仲間にも話しかけてみよう。' }
      : { name: '町', text: 'ギルドを出て町に戻った。' })
  }, [])

  const tryStep = useCallback((dir: Dir, now: number) => {
    const p = playerRef.current
    if (p.moving) return
    p.dir = dir
    const s = sceneRef.current
    const m = mapFor(s)
    const [dx, dy] = DIR_DELTA[dir]
    const nx = p.tileX + dx, ny = p.tileY + dy
    if (ny < 0 || ny >= m.length || nx < 0 || nx >= m[0].length) return
    const tile = m[ny][nx]
    // シーン切替は通行判定より先に：扉(D)や小屋(H)に入る、出口(X)で出る
    if (s === 'town' && tile === 'D' && dir === 'up') { goToScene('guild'); return } // 扉(D)から上方向に入る時だけ。城壁(H)は通れない=どこからでも入れない
    if (s === 'guild' && tile === 'X' && dir === 'down') { goToScene('town'); return }
    if (!tileWalkable(s, nx, ny) || entityAt(s, nx, ny)) return
    p.fromX = p.tileX; p.fromY = p.tileY; p.tileX = nx; p.tileY = ny
    p.moving = true; p.startedAt = now; setDialog(null)
  }, [goToScene])

  // ---- 戦闘（討伐） ----
  const flashEnemy = useCallback(() => { setEnemyHit(true); window.setTimeout(() => setEnemyHit(false), 160) }, [])
  const playFx = useCallback((kind: 'slash' | 'magic' | 'heal') => { const id = ++fxIdRef.current; setFx({ kind, id }); window.setTimeout(() => setFx((f) => (f && f.id === id ? null : f)), 560) }, [])
  const addPopup = useCallback((text: string, color: string, left: string, top: string) => {
    const id = ++popupIdRef.current
    setPopups((ps) => [...ps, { id, text, color, left, top }])
    window.setTimeout(() => setPopups((ps) => ps.filter((q) => q.id !== id)), 750)
  }, [])

  const startBattle = useCallback((e: Entity) => {
    heldDirRef.current = null
    setDialog(null); setPopups([])
    const ps = playerStats(expRef.current + activityExpRef.current, weaponRef.current, armorRef.current)
    const mk = (sprite: string, name: string): Enemy => { const s = enemyStats(sprite); return { name, sprite, hp: s.hpMax, hpMax: s.hpMax, atk: s.atk, reward: s.reward, gold: s.gold } }
    const enemies: Enemy[] = e.sprite === 'boss'
      ? [mk('boss', e.name)]
      : Array.from({ length: 1 + Math.floor(Math.random() * 2) }, () => mk('slime', 'スライム'))
    setBattle({
      id: e.id, enemies,
      php: ps.maxHp, phpMax: ps.maxHp, pmp: ps.maxMp, pmpMax: ps.maxMp, patk: ps.atk, plevel: ps.level,
      msg: enemies.length > 1 ? `${enemies.length}体の ${enemies[0].name} が あらわれた！` : `${enemies[0].name} が あらわれた！`,
      over: null,
    })
  }, [])

  // 1ターン：プレイヤー行動 →（敵生存なら）全体反撃
  const doTurn = useCallback((kind: 'attack' | 'skill' | 'heal' | 'item') => {
    const b = battleRef.current
    if (!b || b.over) return
    const enemies = b.enemies.map((e) => ({ ...e }))
    let { php, pmp } = b
    const lines: string[] = []
    const target = enemies.find((e) => e.hp > 0)
    if (kind === 'attack' || kind === 'skill') {
      if (kind === 'skill') { if (pmp < SKILL_MP) { setBattle({ ...b, msg: 'MPが たりない！' }); return } pmp -= SKILL_MP }
      if (target) {
        const dmg = (kind === 'skill' ? Math.round(b.patk * 1.8) : b.patk) + Math.floor(Math.random() * 4)
        target.hp = Math.max(0, target.hp - dmg)
        lines.push(kind === 'skill' ? `とくぎ「つるぎの舞」！ ${dmg} のダメージ！` : `こうげき！ ${dmg} のダメージ！`)
        flashEnemy(); playFx(kind === 'skill' ? 'magic' : 'slash'); addPopup(`-${dmg}`, '#fde68a', '50%', '32%')
        if (target.hp <= 0) lines.push(`${target.name} を たおした！`)
      }
    } else if (kind === 'heal') {
      if (pmp < HEAL_MP) { setBattle({ ...b, msg: 'MPが たりない！' }); return }
      pmp -= HEAL_MP
      const h = 14 + b.plevel * 3; php = Math.min(b.phpMax, php + h)
      lines.push(`いやしの光！ HPが ${h} 回復した。`); playFx('heal'); addPopup(`+${h}`, '#86efac', '16%', '20%')
    } else {
      if (potionRef.current <= 0) { setBattle({ ...b, msg: 'やくそうが ない！' }); return }
      setPotions((n) => n - 1); potionRef.current -= 1
      php = Math.min(b.phpMax, php + POTION_HEAL)
      lines.push(`やくそうを つかった！ HPが ${POTION_HEAL} 回復した。`); playFx('heal'); addPopup(`+${POTION_HEAL}`, '#86efac', '16%', '20%')
    }
    if (enemies.every((e) => e.hp <= 0)) {
      const exp = enemies.reduce((s, e) => s + e.reward, 0)
      const g = enemies.reduce((s, e) => s + e.gold, 0)
      const lv = playerStats(expRef.current + activityExpRef.current + exp, weaponRef.current, armorRef.current).level
      setBattle({ ...b, enemies, php, pmp, over: 'win', msg: `${lines.join('\n')}\nてきを すべて たおした！`, fanfare: { exp, gold: g, leveledTo: lv > b.plevel ? lv : null } })
      return
    }
    const [edmg, emsg] = enemiesAttack(enemies)
    php = Math.max(0, php - edmg); lines.push(emsg); addPopup(`-${edmg}`, '#fca5a5', '16%', '20%')
    if (php <= 0) { setBattle({ ...b, enemies, php: 0, pmp, over: 'lose', msg: `${lines.join('\n')}\nあなたは たおれてしまった…` }); return }
    setBattle({ ...b, enemies, php, pmp, msg: lines.join('\n') })
  }, [flashEnemy, addPopup, playFx])

  const flee = useCallback(() => {
    const b = battleRef.current
    if (!b || b.over) return
    if (Math.random() < 0.6) { setBattle(null); return }
    const enemies = b.enemies.map((e) => ({ ...e }))
    const [edmg] = enemiesAttack(enemies)
    const php = Math.max(0, b.php - edmg); addPopup(`-${edmg}`, '#fca5a5', '16%', '20%')
    const head = `にげられなかった！\nてきの こうげき！ ${edmg} うけた。`
    if (php <= 0) { setBattle({ ...b, php: 0, over: 'lose', msg: `${head}\nあなたは たおれてしまった…` }); return }
    setBattle({ ...b, php, msg: head })
  }, [addPopup])

  // 戦闘を閉じる（「とじる」用）。敗北時は町の入口前で目を覚ます。
  const closeBattle = useCallback(() => {
    const b = battleRef.current
    const wasLose = b?.over === 'lose'
    const wasBossWin = b?.over === 'win' && b.enemies.some((e) => e.sprite === 'boss')
    setBattle(null); setPopups([])
    if (wasLose) {
      sceneRef.current = 'town'; setScene('town')
      const p = playerRef.current
      p.tileX = 12; p.tileY = 13; p.dir = 'down'; p.moving = false
      heldDirRef.current = null
      setDialog({ name: '', text: '気を失った…が、なんとか町まで戻ってきた。' })
    } else if (wasBossWin) {
      // ボス討伐＝物語の区切り（エピローグ）
      setDialog({ name: '物語', text: '野原の主・キングスライムを討ち果たした！\n荒れていた野に、静けさが戻っていく。\n……日々の鍛錬と、仲間との歩みが、君をここまで強くした。\nこれからも、練習と大会で、もっと先へ。' })
    }
  }, [])

  useEffect(() => { expRef.current = exp }, [exp])
  useEffect(() => { activityExpRef.current = activityExp }, [activityExp])
  // 実際の練習参加・大会出場から「活動EXP」を算出（既存APIのみ使用。毎ロード再計算＝二重加算なし）
  useEffect(() => {
    if (!discordId) return // 実ユーザーのみ（プレビュー以外）
    let alive = true
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'
    const j = async (url: string) => { try { const r = await fetch(url); return r.ok ? await r.json() : null } catch { return null } }
    ;(async () => {
      const regs = await j(`${apiUrl}/api/registrations/user/${discordId}`)
      const tournaments = Array.isArray(regs) ? regs.length : 0
      const player = await j(`${apiUrl}/api/players/discord/${discordId}`)
      const pid = player?.player_id
      let practices = 0
      if (pid != null) {
        const list = await j(`${apiUrl}/api/practice`)
        if (Array.isArray(list)) {
          const hits = await Promise.all(list.map(async (pr: { id: number }) => {
            const ps = await j(`${apiUrl}/api/practice/${pr.id}/participants`)
            return Array.isArray(ps) && ps.some((x: { player_id?: number }) => x.player_id === pid)
          }))
          practices = hits.filter(Boolean).length
        }
      }
      if (!alive) return
      setActivity({ practices, tournaments })
      setActivityExp(practices * EXP_PER_PRACTICE + tournaments * EXP_PER_TOURNAMENT)
    })()
    return () => { alive = false }
  }, [discordId])
  useEffect(() => { weaponRef.current = weaponLv }, [weaponLv])
  useEffect(() => { armorRef.current = armorLv }, [armorLv])
  useEffect(() => { potionRef.current = potions }, [potions])
  useEffect(() => { battleRef.current = battle }, [battle])
  // 進捗をlocalStorageへ自動保存（変化のたび）
  useEffect(() => {
    try { localStorage.setItem(saveKey, JSON.stringify({ exp, gold, weaponLv, armorLv, potions, accepted, questKills, completedQuests } as GameSave)) } catch { /* 保存不可でも続行 */ }
  }, [saveKey, exp, gold, weaponLv, armorLv, potions, accepted, questKills, completedQuests])
  // 最初からやり直す（セーブ消去＋初期化してゲーム開始）
  const resetGame = () => {
    try { localStorage.removeItem(saveKey) } catch { /* noop */ }
    setExp(0); setGold(0); setWeaponLv(0); setArmorLv(0); setPotions(2); setAccepted([]); setQuestKills({}); setCompletedQuests([])
    defeatedRef.current = new Set()
    setShowTitle(false)
  }
  // 会話/掲示板/戦闘/メニュー中はNPCの動きを止める（古典JRPG風に世界を一時停止）
  useEffect(() => { uiPausedRef.current = !!dialog || boardOpen || !!battle || menuOpen }, [dialog, boardOpen, battle, menuOpen])

  // 勝利時に1度だけ報酬付与＆討伐済みに＆クエスト進捗を加算
  useEffect(() => {
    if (battle && battle.over === 'win' && battle.fanfare) {
      defeatedRef.current.add(battle.id)
      setExp((e) => e + battle.fanfare!.exp)
      setGold((g) => g + battle.fanfare!.gold)
      // 倒した敵のスプライト別の数を、受注中・未報告の討伐クエストへ加算（上限=必要数）
      const killsBySprite: Record<string, number> = {}
      for (const en of battle.enemies) killsBySprite[en.sprite] = (killsBySprite[en.sprite] || 0) + 1
      setQuestKills((prev) => {
        const next = { ...prev }
        for (const q of QUESTS) {
          if (!q.target || !accepted.includes(q.id) || completedQuests.includes(q.id)) continue
          const got = killsBySprite[q.target.sprite] || 0
          if (got > 0) next[q.id] = Math.min(q.target.count, (next[q.id] || 0) + got)
        }
        return next
      })
    }
  }, [battle?.over]) // eslint-disable-line react-hooks/exhaustive-deps

  const interact = useCallback(() => {
    const p = playerRef.current; const s = sceneRef.current; const m = mapFor(s)
    const order: [number, number][] = [DIR_DELTA[p.dir], [0, -1], [0, 1], [-1, 0], [1, 0]]
    for (const [dx, dy] of order) {
      const tx = p.tileX + dx, ty = p.tileY + dy
      if (ty >= 0 && ty < m.length && tx >= 0 && tx < m[0].length && m[ty][tx] === 'P') { setBoardOpen(true); setDialog(null); return }
    }
    for (const [dx, dy] of order) {
      const ent = entityAt(s, p.tileX + dx, p.tileY + dy)
      if (ent) {
        if (ent.kind === 'monster') { startBattle(ent); return }
        // 話しかけられたNPCはこちら（プレイヤー）へ向き直る
        const face = facingFromDelta(dx, dy)
        const member = npcRuntimeRef.current.find((n) => n.id === ent.id)
        if (member) { member.dir = face; member.moving = false; member.fromX = member.tileX; member.fromY = member.tileY }
        else staticNpcDirRef.current[ent.id] = face // 町NPC/受付は静的なので向きを上書き保存
        setVer((v) => v + 1)
        setDialog({ name: ent.name, text: ent.text })
        return
      }
    }
    setDialog({ name: '', text: '…そこには誰もいない。' })
  }, [startBattle])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingEnabled = false // ドット絵をくっきり（補間のにじみを無くす＝FF/DQらしさ）
    let raf = 0

    // キャラ/敵スプライト（足元をタイル下端へ）
    const drawCharSprite = (img: HTMLCanvasElement, key: string, tx: number, ty: number, bob: number, flip = false) => {
      const targetH = BLOBS.has(key) ? BLOB_H : CHAR_H
      const scale = targetH / img.height
      const w = img.width * scale, h = targetH
      const dx = Math.round(tx * PX + (PX - w) / 2), dy = Math.round((ty + 1) * PX - h + bob)
      if (flip) { ctx.save(); ctx.translate(dx + w, dy); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, w, h); ctx.restore() }
      else ctx.drawImage(img, dx, dy, w, h)
    }
    // 歩行シート(4方向×4コマ)を 方向dir・コマframe で足元揃え描画（主人公と同じ仕組み）
    const drawWalkSheet = (so: { sheet: HTMLCanvasElement; box: { top: number; bottom: number; left: number; right: number }; h: number }, dir: Dir, frame: number, tx: number, ty: number, bob: number) => {
      const { sheet, box } = so
      const sx = frame * CELL + box.left, sy = DIR_ROW[dir] * CELL + box.top
      const sw = box.right - box.left + 1, sh = box.bottom - box.top + 1
      const scale = (CHAR_H * so.h) / sh, w = sw * scale, h = sh * scale
      const dx = Math.round(tx * PX + (PX - w) / 2), dy = Math.round((ty + 1) * PX - h + bob)
      ctx.drawImage(sheet, sx, sy, sw, sh, dx, dy, w, h)
    }

    // 仲間NPCの占有判定（プレイヤー・受付・他NPCのいるタイルには入らない）
    const occupied = (x: number, y: number, selfId: string) => {
      const pl = playerRef.current
      if (pl.tileX === x && pl.tileY === y) return true
      for (const e of GUILD_ENTITIES) if (e.x === x && e.y === y) return true
      for (const n of npcRuntimeRef.current) if (n.id !== selfId && n.tileX === x && n.tileY === y) return true
      return false
    }
    // 徘徊NPCの更新（ホーム周辺2マスをうろつく。会話/戦闘等の一時停止中は止まる）
    const updateNpcs = (now: number) => {
      if (sceneRef.current !== 'guild' || uiPausedRef.current) return
      const R = 2
      for (const n of npcRuntimeRef.current) {
        if (n.behavior !== 'wander') continue
        if (n.moving) { if (now - n.startedAt >= NPC_STEP_MS) { n.moving = false; n.fromX = n.tileX; n.fromY = n.tileY } continue }
        if (now < n.nextMoveAt) continue
        const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]]
        for (let i = dirs.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const tmp = dirs[i]; dirs[i] = dirs[j]; dirs[j] = tmp }
        for (const [dx, dy] of dirs) {
          const nx = n.tileX + dx, ny = n.tileY + dy
          if (Math.abs(nx - n.homeX) > R || Math.abs(ny - n.homeY) > R) continue
          if (!tileWalkable('guild', nx, ny) || occupied(nx, ny, n.id)) continue
          n.fromX = n.tileX; n.fromY = n.tileY; n.tileX = nx; n.tileY = ny
          n.moving = true; n.startedAt = now
          n.dir = dx < 0 ? 'left' : dx > 0 ? 'right' : dy < 0 ? 'up' : 'down'
          break
        }
        n.nextMoveAt = now + 1200 + Math.random() * 2200
      }
    }

    const render = (t: number) => {
      const cw = canvas.width, ch = canvas.height
      const s = sceneRef.current
      const map = mapFor(s)
      const ROWSn = map.length, COLSn = map[0].length
      const worldW = COLSn * PX, worldH = ROWSn * PX

      const p = playerRef.current
      const stepBob = 0 // 歩行時の上下バウンドは廃止（不自然なので）
      let pxX = p.tileX, pxY = p.tileY
      if (p.moving) {
        const prog = Math.min(1, (t - p.startedAt) / STEP_MS)
        pxX = p.fromX + (p.tileX - p.fromX) * prog
        pxY = p.fromY + (p.tileY - p.fromY) * prog
        if (prog >= 1) p.moving = false
      }
      if (!p.moving && heldDirRef.current) tryStep(heldDirRef.current, t)
      updateNpcs(t)

      const cx = (pxX + 0.5) * PX, cy = (pxY + 0.5) * PX
      const camX = worldW <= cw ? (worldW - cw) / 2 : Math.max(0, Math.min(worldW - cw, cx - cw / 2))
      const camY = worldH <= ch ? (worldH - ch) / 2 : Math.max(0, Math.min(worldH - ch, cy - ch / 2))

      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.fillStyle = '#0a1628'; ctx.fillRect(0, 0, cw, ch)
      ctx.translate(-Math.round(camX), -Math.round(camY))

      // 地面レイヤー（境界をなめらかにした1枚絵を焼き込んでから描画。地面は静的なので毎フレーム焼かない）
      // 重い本描画(オートタイル＋縁石の全面走査)は全タイル読込後に1回だけ。読込中は素のタイルで仮表示。
      const gtex = groundTexRef.current
      const ready = Object.keys(GROUND).every((k) => gtex[k])
      const loaded = Object.keys(GROUND).filter((k) => gtex[k]).length
      const bakeKey = s + ':' + (ready ? 'full' : 'load' + loaded)
      if (!groundBakeRef.current || groundBakeRef.current.key !== bakeKey) {
        groundBakeRef.current = { key: bakeKey, canvas: bakeGround(s, map, gtex, ready) }
      }
      ctx.drawImage(groundBakeRef.current.canvas, 0, 0)

      const obj = objTexRef.current
      // ギルドの赤絨毯（床の上・キャラの下に敷く）。正方形の絵を縦に「敷き詰め」る＝伸ばさない
      if (s === 'guild' && obj.carpet) {
        const cb = findBlocks(map, 'c')[0]
        if (cb) {
          const im = obj.carpet, cw = (cb.maxX - cb.minX + 1) * PX, step = cw * (im.height / im.width)
          const x0 = cb.minX * PX, yEnd = (cb.maxY + 1) * PX
          for (let yy = cb.minY * PX; yy < yEnd; yy += step) {
            const sh = Math.min(step, yEnd - yy)
            ctx.drawImage(im, 0, 0, im.width, im.height * (sh / step), x0, yy, cw, sh)
          }
        }
      }

      // 重なり順（y）でソートして描画する物
      const items: { sortY: number; draw: () => void }[] = []
      if (s === 'guild') {
        // ギルド家具は「高さ基準」で描く（幅=ブロック幅にすると正方形の絵が数タイル分に巨大化する）。ブロック中央に配置。
        const drawFurn = (chr: string, key: string, hf: number) => {
          const im = obj[key]; if (!im) return
          findBlocks(map, chr).forEach((b) => {
            const h = hf * PX, w = h * (im.width / im.height)
            const bw = (b.maxX - b.minX + 1) * PX
            const dx = b.minX * PX + (bw - w) / 2, dy = (b.maxY + 1) * PX - h
            items.push({ sortY: b.maxY, draw: () => ctx.drawImage(im, dx, dy, w, h) })
          })
        }
        drawFurn('K', 'counter', 2.3) // 受付カウンター
        drawFurn('P', 'board', 2.0)   // 依頼掲示板
      } else {
        // 街の構造物（連結ブロックごとに1枚）。幅=ブロック幅。家は1棟ごとに違うデザイン
        const structs: [string, string][] = [['H', 'castle'], ['B', 'house'], ['S', 'shop'], ['F', 'fountain']]
        for (const [chr, key] of structs) {
          findBlocks(map, chr).forEach((b, bi) => {
            const im = obj[chr === 'B' ? HOUSE_KEYS[bi % HOUSE_KEYS.length] : key]
            if (!im) return
            const w = (b.maxX - b.minX + 1) * PX, h = w * (im.height / im.width)
            const dx = b.minX * PX, dy = (b.maxY + 1) * PX - h
            items.push({ sortY: b.maxY, draw: () => ctx.drawImage(im, dx, dy, w, h) })
          })
        }
      }
      // 木（town, 各タイル・幅基準）
      if (s !== 'guild' && obj.tree) {
        const im = obj.tree, w = 1.3 * PX, h = w * (im.height / im.width)
        for (let y = 0; y < ROWSn; y++) for (let x = 0; x < COLSn; x++) if (map[y][x] === 'T') {
          const dx = x * PX + (PX - w) / 2, dy = (y + 1) * PX - h
          items.push({ sortY: y, draw: () => ctx.drawImage(im, dx, dy, w, h) })
        }
      }
      // 芝に花・岩・茂みを点在させて自然に（ハッシュで安定配置。建物/壁/木の下には置かない）
      if (s !== 'guild') for (let y = 0; y < ROWSn; y++) for (let x = 0; x < COLSn; x++) {
        if (map[y][x] !== '.') continue
        const key = decorAt(x, y); if (!key) continue // 描画と当たり判定で同一の決定的配置（[[decorAt]]）
        const wf = key === 'bush' ? 0.85 : key === 'rock' ? 0.7 : 0.8
        const im = obj[key]; if (!im) continue
        const w = wf * PX, h = w * (im.height / im.width)
        const dx = x * PX + (PX - w) / 2, dy = (y + 1) * PX - h
        items.push({ sortY: y, draw: () => ctx.drawImage(im, dx, dy, w, h) })
      }
      // 柱（guild, 各タイル・高さ基準）。幅は1タイルに収めて隣と重ならないようにする
      if (s === 'guild' && obj.pillar) {
        const im = obj.pillar
        let h = 2.3 * PX, w = h * (im.width / im.height)
        if (w > 1.0 * PX) { w = 1.0 * PX; h = w * (im.height / im.width) }
        for (let y = 0; y < ROWSn; y++) for (let x = 0; x < COLSn; x++) if (map[y][x] === 'I') {
          const dx = x * PX + (PX - w) / 2, dy = (y + 1) * PX - h
          items.push({ sortY: y, draw: () => ctx.drawImage(im, dx, dy, w, h) })
        }
      }
      // 食卓（guild, 各タイル。両脇に着席NPCが並ぶ）。タイルにほぼ収め、足元をタイル下端に揃える
      if (s === 'guild' && obj.table) {
        const im = obj.table, w = 1.2 * PX, h = w * (im.height / im.width)
        for (let y = 0; y < ROWSn; y++) for (let x = 0; x < COLSn; x++) if (map[y][x] === 'O') {
          const dx = x * PX + (PX - w) / 2, dy = (y + 1) * PX - h
          items.push({ sortY: y, draw: () => ctx.drawImage(im, dx, dy, w, h) })
        }
      }
      // 静的NPC・敵（町=門番/賢者/敵、ギルド=受付）。人は全員 共通の基本キャラ(色替え)を正面向きで、敵(スライム)だけ浮遊
      const sprites = spritesRef.current
      const statics = s === 'guild' ? GUILD_ENTITIES : entitiesFor('town')
      for (const e of statics) {
        if (e.kind === 'monster') {
          const img = sprites[e.sprite]; if (!img) continue
          const bob = Math.round(Math.sin(t / 250 + e.x) * 3)
          items.push({ sortY: e.y, draw: () => drawCharSprite(img, e.sprite, e.x, e.y, bob) })
        } else {
          const so = walkSheetsRef.current[e.sprite]; if (!so) continue
          const ex = e.x, ey = e.y
          const dr = staticNpcDirRef.current[e.id] ?? 'down' // 話しかけられたら正対（既定は正面）
          items.push({ sortY: e.y, draw: () => drawWalkSheet(so, dr, 1, ex, ey, 0) })
        }
      }
      // 生活するメンバーNPC（ギルド：徘徊で歩く / 着席で食事 / 立ち話）。主人公と同じ歩行シートで方向アニメ
      if (s === 'guild') for (const n of npcRuntimeRef.current) {
        let nx = n.tileX, ny = n.tileY, frame = 1
        if (n.moving) {
          const prog = Math.min(1, (t - n.startedAt) / NPC_STEP_MS)
          nx = n.fromX + (n.tileX - n.fromX) * prog
          ny = n.fromY + (n.tileY - n.fromY) * prog
          frame = Math.floor(t / 150) % SHEET_COLS
        }
        const so = walkSheetsRef.current[n.sprite]
        const dX = nx, dY = ny, fr = frame, dr = n.dir
        if (so) items.push({ sortY: ny, draw: () => drawWalkSheet(so, dr, fr, dX, dY, 0) })
      }
      // プレイヤー（歩行アニメ）
      items.push({
        sortY: pxY, draw: () => {
          const sheet = heroSheetRef.current, box = heroBoxRef.current
          if (sheet && box) {
            const row = DIR_ROW[p.dir], col = p.moving ? Math.floor(t / 130) % SHEET_COLS : 1
            const sx = col * CELL + box.left, sy = row * CELL + box.top
            const sw = box.right - box.left + 1, sh = box.bottom - box.top + 1
            const scale = CHAR_H / sh, w = sw * scale, h = sh * scale
            const dx = pxX * PX + (PX - w) / 2, dy = (pxY + 1) * PX - h + stepBob
            ctx.drawImage(sheet, sx, sy, sw, sh, dx, dy, w, h)
          } else { const hk = sprites['villager_m']; if (hk) drawCharSprite(hk, 'hero', pxX, pxY, stepBob) }
        },
      })
      items.sort((a, b) => a.sortY - b.sortY)
      for (const it of items) it.draw()

      ctx.setTransform(1, 0, 0, 1, 0, 0)
      raf = requestAnimationFrame(render)
    }
    raf = requestAnimationFrame(render)
    return () => cancelAnimationFrame(raf)
  }, [tryStep])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (showTitle) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setShowTitle(false) } return } // タイトル中は移動させない／Enterで開始
      if (boardOpen || battle || menuOpen) return
      let dir: Dir | null = null
      switch (e.key) {
        case 'ArrowUp': case 'w': case 'W': dir = 'up'; break
        case 'ArrowDown': case 's': case 'S': dir = 'down'; break
        case 'ArrowLeft': case 'a': case 'A': dir = 'left'; break
        case 'ArrowRight': case 'd': case 'D': dir = 'right'; break
        case ' ': case 'Enter': e.preventDefault(); interact(); return
        default: return
      }
      e.preventDefault(); heldDirRef.current = dir; tryStep(dir, performance.now())
    }
    const up = (e: KeyboardEvent) => { if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'W', 'a', 'A', 's', 'S', 'd', 'D'].includes(e.key)) heldDirRef.current = null }
    window.addEventListener('keydown', down); window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [tryStep, interact, boardOpen, battle, menuOpen, showTitle])

  // タッチ操作：スワイプで移動（離すまで連続）／ほぼ動かさずに離したら「しらべる」
  const swipeRef = useRef<{ x: number; y: number } | null>(null)
  const swipeMovedRef = useRef(false)
  const swipeMove = useCallback((cx: number, cy: number) => {
    const o = swipeRef.current; if (!o) return
    const dx = cx - o.x, dy = cy - o.y
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 12) { heldDirRef.current = null; return }
    swipeMovedRef.current = true
    const dir: Dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up')
    heldDirRef.current = dir
    tryStep(dir, performance.now())
  }, [tryStep])

  const totalExp = exp + activityExp // 冒険EXP＋活動EXP（レベル・表示はこの合計で算出）
  return (
    <div className="jg-root" style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#070e1b', overflow: 'hidden', touchAction: 'none' }}>
      <canvas
        ref={canvasRef}
        onTouchStart={(e) => { const t = e.touches[0]; swipeRef.current = { x: t.clientX, y: t.clientY }; swipeMovedRef.current = false }}
        onTouchMove={(e) => { const t = e.touches[0]; if (t) swipeMove(t.clientX, t.clientY) }}
        onTouchEnd={() => { if (!swipeMovedRef.current) interact(); heldDirRef.current = null; swipeRef.current = null }}
        onTouchCancel={() => { heldDirRef.current = null; swipeRef.current = null }}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
      />
      {/* 周辺減光（雰囲気） */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', boxShadow: 'inset 0 0 140px 40px rgba(0,0,0,0.55)' }} />

      {/* 上部HUD */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', gap: 8, alignItems: 'center', padding: '7px 10px', fontSize: 13, color: '#fff', whiteSpace: 'nowrap', background: 'linear-gradient(180deg,#1820b0 0%,#141a86 100%)', borderBottom: '3px solid #f8fafc', boxShadow: '0 2px 0 #06093a', textShadow: '1px 1px 0 #06093a' }}>
        <b style={{ color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flexShrink: 1 }}>⚔️ {username || 'あなた'}</b>
        <span style={{ color: '#ffe27a', flexShrink: 0 }}>Lv.{playerStats(totalExp, weaponLv, armorLv).level}</span>
        <span style={{ color: '#7dffa0', flexShrink: 0 }}>EXP {totalExp}</span>
        <span style={{ color: '#ffe27a', flexShrink: 0 }}>G {gold}</span>
        {accepted.length > 0 && <span style={{ color: '#ffcf8a', fontSize: 12, flexShrink: 0 }}>受注 {accepted.length}</span>}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexShrink: 0 }}>
          <button onClick={() => setMenuOpen(true)} style={{ ...ffBtn, whiteSpace: 'nowrap' }}>🎒 メニュー</button>
          <button onClick={() => onExit && onExit()} style={{ ...ffBtn, background: '#9c2828', border: '2px solid #ffb3b3', boxShadow: 'inset -2px -2px 0 #5c1010, inset 2px 2px 0 #d85f5f', whiteSpace: 'nowrap' }}>✕ とじる</button>
        </span>
      </div>

          {boardOpen && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(6,9,40,0.6)', display: 'flex', flexDirection: 'column', padding: 14, overflowY: 'auto' }}>
              <div style={{ ...ffWin, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <h3 style={{ margin: 0, fontSize: 16, color: '#ffe27a', textShadow: '1px 1px 0 #06093a' }}>📜 依頼掲示板</h3>
                  <button onClick={() => setBoardOpen(false)} style={ffBtn}>閉じる</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {QUESTS.map((q) => {
                    const completed = completedQuests.includes(q.id)
                    const taken = accepted.includes(q.id)
                    const kills = questKills[q.id] || 0
                    const reportable = taken && !completed && (q.target ? kills >= q.target.count : true) // 討伐達成 or 手動クエスト受注済
                    const inProgress = taken && !completed && !reportable
                    const borderColor = completed ? '#3ad24a' : reportable ? '#ffe27a' : taken ? '#5b8fe6' : '#4860c0'
                    return (
                      <div key={q.id} style={{ ...ffInset, padding: '10px 12px', borderColor }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#fff', textShadow: '1px 1px 0 #06093a' }}>{q.title}</span>
                          {completed ? (
                            <span style={{ ...ffBtn, background: '#15502a', border: '2px solid #3ad24a', boxShadow: 'none', cursor: 'default', whiteSpace: 'nowrap' }}>✓ 達成済</span>
                          ) : reportable ? (
                            <button onClick={() => { setExp((e) => e + q.reward.exp); setGold((g) => g + q.reward.gold); setCompletedQuests((c) => [...c, q.id]); setBoardOpen(false); setDialog({ name: '依頼達成', text: `「${q.title}」を達成した！\n報酬: ${questRewardText(q)}` }) }}
                              style={{ ...ffBtn, background: '#1e7a3a', border: '2px solid #7dffa0', whiteSpace: 'nowrap' }}>報告する</button>
                          ) : inProgress ? (
                            <span style={{ ...ffBtn, background: '#1a1f52', border: '2px solid #2a3170', color: '#cfe0ff', boxShadow: 'none', cursor: 'default', whiteSpace: 'nowrap' }}>{q.target ? `討伐 ${kills}/${q.target.count}` : '受注中'}</span>
                          ) : (
                            <button onClick={() => { setAccepted((a) => [...a, q.id]); setBoardOpen(false); setDialog({ name: '依頼受注', text: `「${q.title}」を受注した！\n${q.desc}\n${q.target ? '倒したら' : '達成したら'}掲示板で報告しよう。` }) }} style={{ ...ffBtn, whiteSpace: 'nowrap' }}>受注する</button>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: '#cfe0ff', marginTop: 4 }}>{q.desc}</div>
                        <div style={{ fontSize: 12, color: '#ffe27a', marginTop: 2 }}>報酬: {questRewardText(q)}{q.target && taken && !completed ? `　（討伐 ${kills}/${q.target.count}）` : ''}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {battle && (
            <div style={{ position: 'absolute', inset: 0, borderRadius: '8px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ flex: 1, backgroundImage: 'url(/game/bg_field.png)', backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 6 }}>
                {/* プレイヤーステータス */}
                <div style={{ ...ffWin, position: 'absolute', top: 8, left: 8, padding: '6px 9px', fontSize: 11, minWidth: 124, color: '#fff', textShadow: '1px 1px 0 #06093a' }}>
                  <div style={{ color: '#ffe27a', fontWeight: 700, marginBottom: 3 }}>あなた Lv.{battle.plevel}</div>
                  <div>HP {battle.php}/{battle.phpMax}</div>
                  <div style={{ margin: '1px 0 4px' }}><Gauge pct={(battle.php / battle.phpMax) * 100} color="#34d058" /></div>
                  <div>MP {battle.pmp}/{battle.pmpMax}</div>
                  <div style={{ marginTop: 1 }}><Gauge pct={(battle.pmp / battle.pmpMax) * 100} color="#36c5f0" /></div>
                </div>
                {/* 敵（複数） */}
                <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end' }}>
                  {battle.enemies.map((en, i) => (
                    <div key={i} style={{ textAlign: 'center', opacity: en.hp <= 0 ? 0.15 : 1, transition: 'opacity .35s' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#fff', textShadow: '0 1px 3px #000' }}>{en.name}</div>
                      <div style={{ width: 78, margin: '2px auto' }}><Gauge pct={(en.hp / en.hpMax) * 100} color="#ef3b3b" /></div>
                      {spriteUrlRef.current[en.sprite] && (
                        <img src={spriteUrlRef.current[en.sprite]} alt={en.name}
                          style={{ height: en.sprite === 'boss' ? 140 : 92, transition: 'transform .1s, filter .1s', transform: enemyHit && en.hp > 0 ? 'translateX(3px) scale(0.95)' : 'none', filter: enemyHit && en.hp > 0 ? 'brightness(2.4)' : 'drop-shadow(0 4px 5px rgba(0,0,0,0.45))' }} />
                      )}
                    </div>
                  ))}
                </div>
                {/* 戦闘エフェクト：斬撃(こうげき)／魔法(とくぎ)／回復(かいふく・どうぐ) */}
                {fx && fx.kind === 'slash' && (
                  <div key={fx.id} aria-hidden style={{ position: 'absolute', left: '50%', top: '34%', transform: 'translate(-50%,-50%) rotate(-35deg)', pointerEvents: 'none', zIndex: 6 }}>
                    <div style={{ width: 170, height: 12, borderRadius: 6, background: 'linear-gradient(90deg, transparent, #ffffff 45%, #cfe0ff 55%, transparent)', boxShadow: '0 0 10px #fff, 0 0 18px #9ecbff', transformOrigin: 'center', animation: 'jgSlash .4s ease-out forwards' }} />
                  </div>
                )}
                {fx && fx.kind === 'magic' && (
                  <div key={fx.id} aria-hidden style={{ position: 'absolute', left: '50%', top: '34%', transform: 'translate(-50%,-50%)', width: 150, height: 150, borderRadius: '50%', border: '5px solid #c4a4ff', boxShadow: '0 0 22px #7dd3fc, inset 0 0 22px #c4a4ff', pointerEvents: 'none', zIndex: 6, animation: 'jgMagic .5s ease-out forwards' }} />
                )}
                {fx && fx.kind === 'heal' && (
                  <div key={fx.id} aria-hidden style={{ position: 'absolute', left: 8, top: 8, width: 150, height: 96, borderRadius: 10, background: 'radial-gradient(circle at 50% 60%, rgba(125,255,160,0.55), rgba(125,255,160,0) 70%)', pointerEvents: 'none', zIndex: 6, animation: 'jgHeal .6s ease-out forwards', textAlign: 'center', color: '#bdffce', fontSize: 18, textShadow: '0 0 6px #7dffa0' }}>✦ ✧ ✦</div>
                )}
                {/* ダメージ等のポップ */}
                {popups.map((pp) => (
                  <div key={pp.id} style={{ position: 'absolute', left: pp.left, top: pp.top, transform: 'translate(-50%,0)', color: pp.color, fontWeight: 800, fontSize: 20, textShadow: '0 2px 3px #000, 0 0 4px #000', pointerEvents: 'none', animation: 'jgPop .75s ease-out forwards' }}>{pp.text}</div>
                ))}
                {/* 勝利ファンファーレ */}
                {battle.over === 'win' && battle.fanfare && (
                  <div style={{ ...ffWin, position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', padding: '12px 18px', animation: 'jgWin .4s ease-out' }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#ffe27a', textShadow: '1px 1px 0 #06093a' }}>🎉 しょうり！</div>
                    <div style={{ fontSize: 13, color: '#fff', marginTop: 4, textShadow: '1px 1px 0 #06093a' }}>EXP +{battle.fanfare.exp} ／ ゴールド +{battle.fanfare.gold}</div>
                    {battle.fanfare.leveledTo && <div style={{ fontSize: 14, color: '#7dffa0', fontWeight: 700, marginTop: 3, textShadow: '1px 1px 0 #06093a' }}>✨ レベル {battle.fanfare.leveledTo} に上がった！</div>}
                  </div>
                )}
              </div>
              <div style={{ background: 'linear-gradient(180deg,#1820b0,#121a86)', borderTop: '3px solid #f8fafc', boxShadow: 'inset 0 2px 0 #5b8fe6', padding: '10px 12px' }}>
                <div style={{ fontSize: 14, color: '#fff', whiteSpace: 'pre-line', minHeight: 46, lineHeight: 1.6, textShadow: '1px 1px 0 #06093a' }}>{battle.msg}</div>
                {!battle.over ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 6 }}>
                    <button onClick={() => doTurn('attack')} style={cmdStyle('#1e3a8a')}>こうげき</button>
                    <button onClick={() => doTurn('skill')} disabled={battle.pmp < SKILL_MP} style={cmdStyle(battle.pmp < SKILL_MP ? '#334155' : '#6d28d9')}>とくぎ (MP{SKILL_MP})</button>
                    <button onClick={() => doTurn('heal')} disabled={battle.pmp < HEAL_MP} style={cmdStyle(battle.pmp < HEAL_MP ? '#334155' : '#15803d')}>かいふく (MP{HEAL_MP})</button>
                    <button onClick={() => doTurn('item')} disabled={potions <= 0} style={cmdStyle(potions <= 0 ? '#334155' : '#b45309')}>どうぐ ×{potions}</button>
                    <button onClick={flee} style={{ ...cmdStyle('#475569'), gridColumn: '1 / -1' }}>にげる</button>
                  </div>
                ) : (
                  <button onClick={closeBattle} style={{ ...cmdStyle(battle.over === 'win' ? '#166534' : '#7f1d1d'), width: '100%', marginTop: 6 }}>とじる</button>
                )}
              </div>
            </div>
          )}
        {dialog && !boardOpen && !battle && (
          <div style={{ ...ffWin, position: 'absolute', left: 12, right: 12, bottom: 34, maxWidth: 680, margin: '0 auto', padding: '12px 16px' }}>
            {dialog.name && <div style={{ fontSize: 13, fontWeight: 700, color: '#ffe27a', marginBottom: 6, letterSpacing: 1, textShadow: '1px 1px 0 #06093a' }}>{dialog.name}</div>}
            <div style={{ fontSize: 15, color: '#fff', whiteSpace: 'pre-line', lineHeight: 1.7, textShadow: '1px 1px 0 #06093a' }}>{dialog.text}</div>
          </div>
        )}

        {!battle && !boardOpen && (
          <div style={{ position: 'absolute', bottom: 8, left: 0, right: 0, textAlign: 'center', fontSize: 11, color: '#cfe0ff', pointerEvents: 'none', textShadow: '1px 1px 0 #06093a' }}>
            スワイプで移動・タップで調べる（PCは矢印/WASD・スペース）
          </div>
        )}

      {menuOpen && (
        <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(6,9,40,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="jg-root" onClick={(e) => e.stopPropagation()} style={{ ...ffWin, width: '100%', maxWidth: 460, maxHeight: '88vh', overflowY: 'auto', padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h3 style={{ margin: 0, fontSize: 16, color: '#ffe27a', textShadow: '1px 1px 0 #06093a' }}>🎒 メニュー</h3>
              <span style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setShowTutorial(true)} style={{ ...ffBtn, background: 'transparent', border: '2px solid #4860c0', boxShadow: 'none', color: '#cfe0ff' }}>あそびかた</button>
                <button onClick={() => setMenuOpen(false)} style={ffBtn}>とじる</button>
              </span>
            </div>
            {(() => { const st = playerStats(totalExp, weaponLv, armorLv); return (
              <div style={{ ...ffInset, padding: '10px 12px', fontSize: 13, color: '#fff', lineHeight: 1.8, textShadow: '1px 1px 0 #06093a' }}>
                <div style={{ color: '#ffe27a', fontWeight: 700 }}>ステータス</div>
                <div>Lv {st.level} ／ EXP {totalExp}（次のLvまで {100 - (totalExp % 100)}）</div>
                <div>さいだいHP {st.maxHp} ／ さいだいMP {st.maxMp} ／ つよさ {st.atk}</div>
                <div>ゴールド {gold} G ／ やくそう ×{potions}</div>
                <div style={{ color: '#cfe0ff' }}>そうび: {WEAPONS[weaponLv].name}・{ARMORS[armorLv].name}</div>
                <div style={{ color: '#7dffa0', fontSize: 12, marginTop: 4 }}>うちわけ: 冒険 {exp} ＋ 活動 {activityExp}</div>
                <div style={{ color: '#9fb0e8', fontSize: 11 }}>鍛錬の証: 練習 ×{activity.practices}（+{activity.practices * EXP_PER_PRACTICE}）／ 大会 ×{activity.tournaments}（+{activity.tournaments * EXP_PER_TOURNAMENT}）</div>
                <div style={{ color: '#64748b', fontSize: 11 }}>※ 実際の練習参加・大会出場でEXPが上がる（自動反映）</div>
              </div>
            ) })()}
            <div style={{ color: '#ffe27a', fontWeight: 700, margin: '12px 0 6px', fontSize: 13, textShadow: '1px 1px 0 #06093a' }}>ショップ（ゴールドで購入）</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(() => { const nx = weaponLv + 1; const it = WEAPONS[nx]; return (
                <ShopRow label={it ? `武器: ${it.name}（つよさ +${it.atk - WEAPONS[weaponLv].atk}）` : '武器: これ以上は無い'} cost={it?.cost} canBuy={!!it && gold >= it.cost} onBuy={() => { if (it && gold >= it.cost) { setGold((g) => g - it.cost); setWeaponLv(nx) } }} />
              ) })()}
              {(() => { const nx = armorLv + 1; const it = ARMORS[nx]; return (
                <ShopRow label={it ? `防具: ${it.name}（HP +${it.hp - ARMORS[armorLv].hp}）` : '防具: これ以上は無い'} cost={it?.cost} canBuy={!!it && gold >= it.cost} onBuy={() => { if (it && gold >= it.cost) { setGold((g) => g - it.cost); setArmorLv(nx) } }} />
              ) })()}
              <ShopRow label={`やくそう（戦闘でHP +${POTION_HEAL}）×1`} cost={POTION_COST} canBuy={gold >= POTION_COST} onBuy={() => { if (gold >= POTION_COST) { setGold((g) => g - POTION_COST); setPotions((p) => p + 1) } }} />
            </div>
          </div>
        </div>
      )}

      {/* タイトル画面（FFの青窓トーンで統一。はじめるでゲーム本編へ） */}
      {showTitle && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 300, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24, overflow: 'hidden', background: 'radial-gradient(120% 100% at 50% 28%, #2a36b0 0%, #1820b0 46%, #0c1252 100%)' }}>
          {/* 星のきらめき（ぼかし無しのドット） */}
          <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.55, backgroundImage: 'radial-gradient(1px 1px at 18% 26%,#fff 50%,transparent 50%),radial-gradient(1px 1px at 72% 18%,#cfe0ff 50%,transparent 50%),radial-gradient(1px 1px at 38% 66%,#fff 50%,transparent 50%),radial-gradient(1px 1px at 86% 58%,#cfe0ff 50%,transparent 50%),radial-gradient(1px 1px at 10% 78%,#fff 50%,transparent 50%),radial-gradient(1px 1px at 60% 84%,#cfe0ff 50%,transparent 50%)' }} />
          <div style={{ ...ffWin, width: 56, height: 56, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>⚔️</div>
          <div style={{ fontSize: 15, color: '#ffe27a', letterSpacing: 4, textShadow: '1px 1px 0 #06093a', marginBottom: 8 }}>冒険者ギルド</div>
          <h1 style={{ margin: 0, fontSize: 'clamp(28px,8vw,54px)', lineHeight: 1.12, color: '#ffe27a', letterSpacing: 2, textShadow: '2px 2px 0 #06093a, 3px 3px 0 #5a3a14' }}>十条ソフトテニス団</h1>
          <div style={{ marginTop: 8, fontSize: 13, color: '#cfe0ff', textShadow: '1px 1px 0 #06093a' }}>〜 城塞ギルド物語 〜</div>
          {hasSave ? (
            <>
              <button onClick={() => setShowTitle(false)} style={{ ...cmdStyle('#28349c'), marginTop: 30, minWidth: 210, fontSize: 18, padding: '12px 20px', textAlign: 'center', animation: 'jgBlink 1.3s ease-in-out infinite' }}>▶ つづきから</button>
              <button onClick={() => { if (window.confirm('最初からやり直しますか？\nこれまでの進捗（レベル・ゴールド・装備）は消えます。')) resetGame() }} style={{ ...ffBtn, marginTop: 12, background: 'transparent', border: '2px solid #4860c0', boxShadow: 'none', color: '#9fb0e8' }}>はじめからやり直す</button>
            </>
          ) : (
            <button onClick={() => { setShowTitle(false); if (!tutSeen) setShowTutorial(true) }} style={{ ...cmdStyle('#28349c'), marginTop: 30, minWidth: 210, fontSize: 18, padding: '12px 20px', textAlign: 'center', animation: 'jgBlink 1.3s ease-in-out infinite' }}>▶ はじめる</button>
          )}
          <button onClick={() => setShowTutorial(true)} style={{ ...ffBtn, marginTop: 12, background: 'transparent', border: '2px solid #4860c0', boxShadow: 'none', color: '#cfe0ff' }}>あそびかた</button>
          <div style={{ marginTop: 14, fontSize: 12, color: '#9fb0e8', textShadow: '1px 1px 0 #06093a' }}>スワイプ/矢印で移動・タップ/スペースで調べる</div>
          <div style={{ position: 'absolute', bottom: 14, fontSize: 11, color: '#7f8fce', textShadow: '1px 1px 0 #06093a' }}>© 十条ソフトテニス団</div>
        </div>
      )}

      {/* あそびかた（チュートリアル）。初回はじめる時に自動表示／タイトル・メニューから再表示 */}
      {showTutorial && (
        <div onClick={closeTutorial} style={{ position: 'absolute', inset: 0, zIndex: 320, background: 'rgba(6,9,40,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...ffWin, width: '100%', maxWidth: 440, maxHeight: '86vh', overflowY: 'auto', padding: 18, color: '#fff', textShadow: '1px 1px 0 #06093a' }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#ffe27a', marginBottom: 10 }}>⚔️ あそびかた</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, fontSize: 13, lineHeight: 1.6 }}>
              <div><span style={{ color: '#ffe27a' }}>◆ 移動</span>：スワイプ／矢印キー・WASD</div>
              <div><span style={{ color: '#ffe27a' }}>◆ しらべる・話す</span>：タップ／スペース・Enter（人・看板・掲示板に向かって）</div>
              <div><span style={{ color: '#ffe27a' }}>◆ 城へ入る</span>：町の中央の城の<b>扉</b>からギルドへ</div>
              <div><span style={{ color: '#ffe27a' }}>◆ 依頼</span>：ギルド奥の<b>掲示板</b>で受注 → 野原で討伐 → 掲示板で<b>報告</b>して報酬</div>
              <div><span style={{ color: '#ffe27a' }}>◆ 戦闘</span>：野原のスライムに話しかけると開始。こうげき／とくぎ／かいふく／どうぐ</div>
              <div><span style={{ color: '#ffe27a' }}>◆ 成長</span>：戦闘・依頼に加え、<b>実際の練習・大会</b>でもEXPが上がる</div>
            </div>
            <button onClick={closeTutorial} style={{ ...cmdStyle('#28349c'), marginTop: 14, width: '100%', textAlign: 'center' }}>とじる</button>
          </div>
        </div>
      )}

      <style>{`@import url('https://fonts.googleapis.com/css2?family=DotGothic16&display=swap');
.jg-root,.jg-root button{font-family:${JG_FONT}}
@keyframes jgPop{0%{opacity:0;transform:translate(-50%,6px) scale(.8)}20%{opacity:1}100%{opacity:0;transform:translate(-50%,-22px) scale(1.1)}}@keyframes jgWin{0%{opacity:0;transform:translate(-50%,-50%) scale(.7)}100%{opacity:1;transform:translate(-50%,-50%) scale(1)}}@keyframes jgBlink{0%,100%{opacity:1}50%{opacity:.6}}@keyframes jgSlash{0%{opacity:0;transform:scaleX(0)}25%{opacity:1;transform:scaleX(1)}100%{opacity:0;transform:scaleX(1.15)}}@keyframes jgMagic{0%{opacity:0;transform:translate(-50%,-50%) scale(.2)}30%{opacity:1}100%{opacity:0;transform:translate(-50%,-50%) scale(1.7)}}@keyframes jgHeal{0%{opacity:0;transform:translateY(8px) scale(.9)}30%{opacity:1}100%{opacity:0;transform:translateY(-10px) scale(1.05)}}`}</style>
    </div>
  )
}

function ShopRow({ label, cost, canBuy, onBuy }: { label: string; cost?: number; canBuy: boolean; onBuy: () => void }) {
  return (
    <div style={{ ...ffInset, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 10px' }}>
      <span style={{ fontSize: 13, color: '#fff', textShadow: '1px 1px 0 #06093a' }}>{label}</span>
      {cost != null ? (
        <button onClick={onBuy} disabled={!canBuy} style={canBuy ? { ...ffBtn, whiteSpace: 'nowrap' } : { ...ffBtn, background: '#1a1f52', border: '2px solid #2a3170', color: '#6b74b8', boxShadow: 'none', cursor: 'default', whiteSpace: 'nowrap' }}>{cost}G で買う</button>
      ) : <span style={{ fontSize: 12, color: '#9fb0e8' }}>—</span>}
    </div>
  )
}

