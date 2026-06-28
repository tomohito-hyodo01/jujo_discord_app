import { useState, type ReactNode } from 'react'
import Game from './Game'
import RunnerGame from './RunnerGame'
import ReactionGame from './ReactionGame'

// 左メニュー「⚔️ ゲーム」のハブ。RPG / ラン を選んで起動。各ゲームの「もどる/とじる」で選択へ戻る。
interface GameHubProps { username?: string; discordId?: string; onExitToPortal: () => void }

// RPG(冒険者ギルド)は管理者(兵頭)のみ。エビ走は全ログインユーザーに公開。
const ADMIN_DISCORD_IDS = new Set(['1427112485047242945'])

export default function GameHub({ username, discordId, onExitToPortal }: GameHubProps) {
  const [selected, setSelected] = useState<null | 'rpg' | 'run' | 'react'>(null)
  const isAdmin = ADMIN_DISCORD_IDS.has(discordId || '')

  if (selected === 'rpg') return <Game username={username} discordId={discordId} onExit={() => setSelected(null)} />
  if (selected === 'run') return <RunnerGame username={username} discordId={discordId} onExit={() => setSelected(null)} />
  if (selected === 'react') return <ReactionGame username={username} discordId={discordId} onExit={() => setSelected(null)} />

  const card = (onClick: () => void, icon: ReactNode, title: string, desc: string, accent: string) => (
    <button onClick={onClick} style={{
      flex: '1 1 240px', maxWidth: 340, textAlign: 'left', cursor: 'pointer',
      background: 'linear-gradient(180deg,#13233f,#0d1a30)', border: `2px solid ${accent}`, borderRadius: 14,
      padding: '20px 18px', color: '#e2e8f0', display: 'flex', flexDirection: 'column', gap: 8,
      boxShadow: '0 4px 14px rgba(0,0,0,0.35)', transition: 'transform .1s',
    }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-3px)' }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'none' }}>
      <div style={{ fontSize: 40, lineHeight: 1 }}>{icon}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>{title}</div>
      <div style={{ fontSize: 13, color: '#9fb3d0', lineHeight: 1.6 }}>{desc}</div>
      <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: accent }}>▶ あそぶ</div>
    </button>
  )

  return (
    <div style={{ padding: '28px 20px', maxWidth: 820, margin: '0 auto' }}>
      <h2 style={{ margin: '0 0 6px', fontSize: 22, color: '#fff' }}>🎮 ゲームをえらぶ</h2>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: '#94a3b8' }}>遊びたいゲームを選んでください（試作）。</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        {isAdmin && card(() => setSelected('rpg'), '⚔️', '冒険者ギルド（RPG）', '町とギルドを冒険。掲示板の依頼を受けて討伐。実際の練習・大会でもレベルが上がる。', '#3b82f6')}
        {card(() => setSelected('run'), <img src="/game/run/hero_run1.png?v=11" alt="エビ走" style={{ width: 40, height: 40, objectFit: 'contain', imageRendering: 'pixelated' }} />, 'エビ走', '自動で走り続けるアクション。ジャンプで障害物を避け、コインを集めて距離をのばそう。ベスト記録に挑戦！', '#f59e0b')}
        {isAdmin && card(() => setSelected('react'), '⚡', '反応強化モード（テスト）', '突然の合図にすばやく反応！反応速度を測って自己ベストを更新。テニスに効く瞬発力トレ。', '#22c55e')}
      </div>
      <button onClick={onExitToPortal} style={{ marginTop: 24, padding: '8px 14px', borderRadius: 8, background: '#1e293b', color: '#cbd5e1', border: '1px solid #334155', fontSize: 13, cursor: 'pointer' }}>← ポータルに戻る</button>
    </div>
  )
}
