import { useEffect, useRef, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useAppStore } from '../store.js'
import { getSocket } from '../socket.js'
import { AVATAR_MAP } from '../views/MenuView.jsx'
import MinimapOverlay from './MinimapOverlay.jsx'
import TaskOverlay from './tasks/TaskOverlay.jsx'
import GameChatOverlay from './GameChatOverlay.jsx'

const TIPS = [
  'Đừng tin tưởng ai cả...',
  'Hoàn thành nhiệm vụ để giành chiến thắng!',
  'Kẻ phản bội luôn ở gần bạn hơn bạn nghĩ.',
  'Họp khẩn khi phát hiện điều bất thường.',
  'Báo cáo xác chết ngay khi tìm thấy!',
  'Impostor không bao giờ làm nhiệm vụ thật.',
  'Đi theo nhóm để an toàn hơn.',
]

const COLOR_HEX = {
  red:'#e74c3c', blue:'#3b82f6', green:'#22c55e', orange:'#f97316',
  yellow:'#eab308', pink:'#ec4899', black:'#94a3b8', brown:'#b45309',
  purple:'#a855f7', white:'#f1f5f9',
}

function SceneBg() {
  const orbs = [
    { cx: '20%', cy: '25%', r: 350, c: '#0ea5e9' },
    { cx: '75%', cy: '65%', r: 300, c: '#8b5cf6' },
    { cx: '55%', cy: '5%',  r: 220, c: '#06b6d4' },
    { cx: '8%',  cy: '75%', r: 200, c: '#6366f1' },
  ]
  const stars = useMemo(() => Array.from({ length: 100 }, (_, i) => ({
    id: i, x: Math.random() * 100, y: Math.random() * 100,
    s: Math.random() * 1.5 + 0.5, dur: Math.random() * 3000 + 1500,
  })), [])
  return (
    <div className="scene-bg-wrapper">
      <div className="scene-bg-gradient" />
      {orbs.map((o, i) => (
        <div key={i} className="bg-orb"
          style={{ left: o.cx, top: o.cy, width: o.r * 2, height: o.r * 2,
                   background: `radial-gradient(circle,${o.c}18 0%,transparent 70%)` }} />
      ))}
      {stars.map(s => (
        <div key={s.id} className="bg-star"
          style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s,
                   animationDuration: `${s.dur}ms` }} />
      ))}
    </div>
  )
}

function GameLoadingScreen({ pct, tip }) {
  return (
    <motion.div
      className="w-screen h-screen flex flex-col items-center justify-center relative overflow-hidden"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'absolute', inset: 0, zIndex: 50, background: '#020617' }}>
      <SceneBg />
      <div className="relative z-10 flex flex-col items-center gap-8">
        <motion.div className="flex flex-col items-center gap-3"
          initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }}>
          <img src="assets/Images/logo/logo.png" alt="logo" className="loading-logo" />
          <p className="text-white text-3xl font-black tracking-[10px]">MOONIVERSE</p>
          <p className="text-cyan-400 text-[11px] tracking-[5px]">ĐANG VÀO TRẬN...</p>
        </motion.div>
        <motion.div className="loading-bar-container"
          initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4 }}>
          <div className="flex justify-between text-xs">
            <span className="text-white/50 tracking-widest uppercase">
              loading{'.'.repeat(Math.floor(pct / 14) % 8 + 1)}
            </span>
            <span className="text-white font-bold">{pct}%</span>
          </div>
          <div className="loading-bar-bg">
            <motion.div className="loading-bar-fill" style={{ width: `${pct}%` }}
              transition={{ duration: 0.1 }} />
          </div>
          <AnimatePresence mode="wait">
            <motion.p key={tip}
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
              className="text-center text-[11px] text-white/30 italic tracking-wide mt-1">
              💡 {tip}
            </motion.p>
          </AnimatePresence>
        </motion.div>
      </div>
    </motion.div>
  )
}

function RoleRevealOverlay({ isImposter, playerColor, onDone }) {
  const [flipped, setFlipped]     = useState(false)
  const [countdown, setCountdown] = useState(4)
  const hex     = COLOR_HEX[playerColor] || '#06b6d4'
  const roleColor = isImposter ? '#ef4444' : '#22c55e'
  const roleName  = isImposter ? 'KẺ PHẢN BỘI' : 'PHI HÀNH GIA'
  const roleDesc  = isImposter ? 'Giết tất cả phi hành gia trước khi bị phát hiện!' : 'Hoàn thành nhiệm vụ và tìm ra kẻ phản bội!'
  const roleIcon  = isImposter ? '☠' : '🚀'
  const bgColor   = isImposter ? 'rgba(30,0,0,0.97)' : 'rgba(0,15,10,0.97)'

  useEffect(() => {
    const t = setTimeout(() => setFlipped(true), 1000)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!flipped) return
    const iv = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000)
    return () => clearInterval(iv)
  }, [flipped])

  useEffect(() => {
    if (flipped && countdown === 0) onDone()
  }, [flipped, countdown])

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.5 } }}
      style={{ position: 'absolute', inset: 0, zIndex: 60, background: bgColor,
               display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 32 }}>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
                    background: `radial-gradient(ellipse 60% 50% at 50% 50%, ${roleColor}18 0%, transparent 70%)` }} />
      <motion.p
        initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
        style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 800,
                 letterSpacing: '0.3em', textTransform: 'uppercase' }}>
        VAI TRÒ CỦA BẠN
      </motion.p>
      <div style={{ perspective: 1000, width: 220, height: 320 }}>
        <motion.div
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
          style={{ width: '100%', height: '100%', position: 'relative', transformStyle: 'preserve-3d' }}>
          <div style={{
            position: 'absolute', inset: 0, backfaceVisibility: 'hidden',
            borderRadius: 24, border: '2px solid rgba(255,255,255,0.12)',
            background: 'linear-gradient(160deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))',
            backdropFilter: 'blur(20px)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12,
          }}>
            <motion.div animate={{ scale: [1, 1.08, 1] }} transition={{ duration: 1.2, repeat: Infinity }}
              style={{ fontSize: 96, lineHeight: 1, filter: 'drop-shadow(0 0 20px rgba(255,255,255,0.3))' }}>🎴</motion.div>
            <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 13, letterSpacing: '0.2em', fontWeight: 700 }}>ĐANG XÁC ĐỊNH...</p>
          </div>
          <div style={{
            position: 'absolute', inset: 0, backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
            borderRadius: 24,
            border: `2px solid ${roleColor}60`,
            background: `linear-gradient(160deg, ${roleColor}18, rgba(5,10,20,0.98))`,
            boxShadow: `0 0 60px ${roleColor}30, 0 0 120px ${roleColor}10`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16,
            padding: '24px 20px',
          }}>
            <div style={{ width: 80, height: 80, borderRadius: '50%', border: `3px solid ${hex}`, boxShadow: `0 0 24px ${hex}60`, overflow: 'hidden', background: 'rgba(0,0,0,0.4)' }}>
              <img src={`assets/Images/avatar/${AVATAR_MAP[playerColor] || 'nam1.png'}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
            </div>
            <div style={{ fontSize: 52, lineHeight: 1, filter: `drop-shadow(0 0 16px ${roleColor})` }}>{roleIcon}</div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: roleColor, fontSize: 22, fontWeight: 900, letterSpacing: '0.08em', textShadow: `0 0 20px ${roleColor}80` }}>{roleName}</p>
              <div style={{ width: 40, height: 2, background: roleColor, margin: '8px auto', borderRadius: 2, opacity: 0.6 }} />
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, lineHeight: 1.5, fontStyle: 'italic', maxWidth: 160 }}>{roleDesc}</p>
            </div>
          </div>
        </motion.div>
      </div>
      <AnimatePresence>
        {flipped && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div style={{ position: 'relative', width: 48, height: 48 }}>
              <svg width="48" height="48" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
                <motion.circle cx="24" cy="24" r="20" fill="none" stroke={roleColor} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 20}`} strokeDashoffset={`${2 * Math.PI * 20 * (1 - countdown / 4)}`} transition={{ duration: 0.9, ease: 'linear' }} />
              </svg>
              <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: 800 }}>{countdown}</span>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11, letterSpacing: '0.15em' }}>BẮT ĐẦU SAU {countdown}S</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function InGameHUD() {
  const { gameAlert, gamePrompt, setGameAlert } = useAppStore()
  useEffect(() => {
    if (gameAlert) {
      const t = setTimeout(() => setGameAlert(null), gameAlert.duration || 3000)
      return () => clearTimeout(t)
    }
  }, [gameAlert])
  return (
    <div className="absolute inset-0 pointer-events-none z-40 overflow-hidden">
      <AnimatePresence>
        {gameAlert && (
          <motion.div initial={{ y: -100, opacity: 0 }} animate={{ y: 20, opacity: 1 }} exit={{ y: -100, opacity: 0 }}
            className="absolute top-0 left-1/2 -translate-x-1/2 px-6 py-3 rounded-2xl border backdrop-blur-md flex flex-col items-center gap-1 shadow-2xl"
            style={{ backgroundColor: gameAlert.type === 'danger' ? 'rgba(239, 68, 68, 0.9)' : 'rgba(14, 165, 233, 0.9)', borderColor: 'rgba(255,255,255,0.2)' }}>
            <span className="text-white font-black tracking-widest text-sm uppercase">THÔNG BÁO KHẨN CẤP</span>
            <p className="text-white font-bold text-center">{gameAlert.text}</p>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {gamePrompt && (
          <motion.div initial={{ scale: 0.8, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.8, opacity: 0, y: 20 }}
            className="absolute bottom-32 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/60 border border-white/20 rounded-xl backdrop-blur-sm">
            <span className="text-yellow-400 font-black tracking-wide text-xs">{gamePrompt.text}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function PhaserGame({ visible }) {
  const containerRef = useRef(null)
  const gameRef      = useRef(null)
  const { gameData, playerName, playerColor, endGame, setGameAlert, setGamePrompt, setActiveTask } = useAppStore()
  const [loadPct,    setLoadPct]    = useState(0)
  const [showLoad,   setShowLoad]   = useState(false)
  const [tipIdx,     setTipIdx]     = useState(0)
  const [roleReveal, setRoleReveal] = useState(null)

  useEffect(() => {
    if (!showLoad) return
    const iv = setInterval(() => setTipIdx(i => (i + 1) % TIPS.length), 2500)
    return () => clearInterval(iv)
  }, [showLoad])

  useEffect(() => {
    if (!visible || !gameData) return
    setLoadPct(0); setShowLoad(true)
    let game = gameRef.current
    const launchGame = (Phaser, scenes) => {
      if (game) { game.destroy(true); gameRef.current = null }
      const { PreloadScene, GameScene, TaskScene, MeetingScene } = scenes
      game = new Phaser.Game({
        type: Phaser.AUTO, backgroundColor: '#000000', parent: containerRef.current,
        physics: { default: 'arcade', arcade: { debug: false } },
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: window.innerWidth, height: window.innerHeight },
        render: { pixelArt: false, antialias: true, roundPixels: true },
        autoFocus: true, disableVisibilityChange: true,
        scene: [PreloadScene, GameScene, MeetingScene, TaskScene],
      })
      game.registry.set('playerName',  playerName)
      game.registry.set('playerColor', playerColor)
      game.registry.set('isImposter',  gameData.isImposter)
      game.registry.set('roomId',      gameData.roomId)
      game.registry.set('allPlayers',  gameData.players)
      game.registry.set('socket',      getSocket())
      game.registry.set('onGameEnd',   (winner) => endGame({ winner, roomId: gameData.roomId }))
      game.registry.set('onAlert',     (text, type, duration) => setGameAlert({ text, type, duration }))
      game.registry.set('onPrompt',    (text) => setGamePrompt(text ? { text } : null))
      game.registry.set('onOpenTask',  (id, name) => setActiveTask({ id, name }))
      game.registry.set('onLoadProgress', (v) => setLoadPct(Math.round(v * 100)))
      game.registry.set('onLoadComplete', () => { setLoadPct(100); setTimeout(() => setShowLoad(false), 600) })
      game.registry.set('onRoleReveal',   (isImposter, color) => setRoleReveal({ isImposter, playerColor: color }))
      gameRef.current = game; window.phaserGame = game
    }
    Promise.all([
      import('phaser'), import('./scenes/PreloadScene.js'), import('./scenes/GameScene.js'), import('./scenes/TaskScene.js'), import('./scenes/MeetingScene.js'),
    ]).then(([{ default: Phaser }, { PreloadScene }, { GameScene }, { TaskScene }, { MeetingScene }]) => {
      launchGame(Phaser, { PreloadScene, GameScene, TaskScene, MeetingScene })
    })
  }, [visible, gameData])

  useEffect(() => { return () => { gameRef.current?.destroy(true) } }, [])

  return (
    <>
      <div ref={containerRef} style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', overflow: 'hidden', display: visible ? 'block' : 'none' }} />
      <AnimatePresence>{visible && <InGameHUD />}</AnimatePresence>
      <AnimatePresence>{visible && <TaskOverlay />}</AnimatePresence>
      <AnimatePresence>{visible && showLoad && <GameLoadingScreen pct={loadPct} tip={TIPS[tipIdx]} />}</AnimatePresence>
      <AnimatePresence>{visible && roleReveal && <RoleRevealOverlay key="role-reveal" isImposter={roleReveal.isImposter} playerColor={roleReveal.playerColor} onDone={() => setRoleReveal(null)} />}</AnimatePresence>
      {visible && <MinimapOverlay gameRef={gameRef} />}
      {visible && (
        <GameChatOverlay
          gameRef={gameRef}
          socket={getSocket()}
          playerColor={playerColor}
          isImposter={gameData?.isImposter || false}
          socketId={getSocket()?.id}
        />
      )}
    </>
  )
}
