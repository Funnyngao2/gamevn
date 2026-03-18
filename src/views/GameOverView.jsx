import { useEffect, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '../store.js'
import { getSocket } from '../socket.js'
import { AVATAR_MAP } from './MenuView.jsx'

const COLOR_HEX = {
  red:'#e74c3c', blue:'#3b82f6', green:'#22c55e', orange:'#f97316',
  yellow:'#eab308', pink:'#ec4899', black:'#94a3b8', brown:'#b45309',
  purple:'#a855f7', white:'#f1f5f9',
}

export default function GameOverView() {
  const { gameResult, gameData, playerName, playerColor, returnToLobby, setView } = useAppStore()
  const [countdown, setCountdown] = useState(15)
  const [phase, setPhase] = useState('reveal') // reveal → stats

  const winner   = gameResult?.winner
  const isCrew   = winner === 'crew'
  const isLeft   = winner === null
  const isImpost = winner === 'impostor'

  const accent = isCrew ? '#22c55e' : isLeft ? '#94a3b8' : '#ef4444'
  const accentB = isCrew ? '#16a34a' : isLeft ? '#64748b'  : '#b91c1c'

  const players = gameData?.players || []
  const myColor = playerColor

  useEffect(() => {
    const t = setTimeout(() => setPhase('stats'), 1200)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const t = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(t); returnToLobby(); return 0 }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [])

  const handleMenu = () => { getSocket()?.disconnect(); setView('menu') }

  const stars = useMemo(() => Array.from({ length: 120 }, (_, i) => ({
    id: i, x: Math.random()*100, y: Math.random()*100,
    s: Math.random()*1.8+0.4, dur: Math.random()*3000+1500,
  })), [])

  // Particles for win/lose
  const particles = useMemo(() => Array.from({ length: 24 }, (_, i) => ({
    id: i,
    x: Math.random()*100,
    delay: Math.random()*1.5,
    dur: Math.random()*2+2,
    size: Math.random()*8+4,
    color: [accent, accentB, '#8b5cf6', '#06b6d4'][Math.floor(Math.random()*4)],
  })), [accent])

  return (
    <div className="w-screen h-screen flex flex-col items-center justify-center relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg,#020617 0%,#080d1a 50%,#050b18 100%)' }}>

      {/* Stars */}
      <div className="absolute inset-0 pointer-events-none">
        {stars.map(s => (
          <div key={s.id} className="absolute rounded-full bg-white animate-pulse"
            style={{ left:`${s.x}%`, top:`${s.y}%`, width:s.s, height:s.s,
                     animationDuration:`${s.dur}ms`, opacity:0.15+Math.random()*0.3 }} />
        ))}
      </div>

      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background:`radial-gradient(ellipse 80% 60% at 50% 50%, ${accent}12 0%, transparent 70%)` }} />

      {/* Floating particles */}
      {phase === 'stats' && particles.map(p => (
        <motion.div key={p.id} className="absolute rounded-full pointer-events-none"
          style={{ left:`${p.x}%`, bottom:0, width:p.size, height:p.size, background:p.color, opacity:0.6 }}
          animate={{ y: [0, -window.innerHeight - 100], opacity: [0.6, 0] }}
          transition={{ delay: p.delay, duration: p.dur, repeat: Infinity, ease: 'linear' }} />
      ))}

      {/* ── MAIN CARD ── */}
      <motion.div className="relative z-10 flex flex-col items-center gap-6 w-full max-w-2xl px-6"
        initial={{ opacity:0, y:30 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.6, ease:'easeOut' }}>

        {/* Result banner */}
        <motion.div className="flex flex-col items-center gap-3"
          initial={{ scale:0.7, opacity:0 }} animate={{ scale:1, opacity:1 }}
          transition={{ delay:0.2, type:'spring', stiffness:200, damping:18 }}>

          {/* Big icon */}
          <div className="relative">
            <motion.div className="w-28 h-28 rounded-full flex items-center justify-center text-5xl"
              style={{ background:`linear-gradient(135deg,${accent}30,${accentB}20)`,
                       border:`2px solid ${accent}60`,
                       boxShadow:`0 0 60px ${accent}40, 0 0 120px ${accent}15` }}
              animate={{ boxShadow:[`0 0 40px ${accent}30`,`0 0 80px ${accent}60`,`0 0 40px ${accent}30`] }}
              transition={{ duration:2, repeat:Infinity, ease:'easeInOut' }}>
              {isLeft ? '🚪' : isCrew ? '🏆' : '💀'}
            </motion.div>
            {/* Ring */}
            <motion.div className="absolute inset-0 rounded-full"
              style={{ border:`1px solid ${accent}30` }}
              animate={{ scale:[1, 1.4, 1], opacity:[0.6, 0, 0.6] }}
              transition={{ duration:2.5, repeat:Infinity }} />
          </div>

          {/* Title */}
          <motion.h1 className="text-5xl font-black text-center tracking-tight"
            style={{ color: accent, textShadow:`0 0 40px ${accent}80, 0 0 80px ${accent}30` }}
            initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.4 }}>
            {isLeft ? 'Đã rời trận' : isCrew ? 'CREWMATES THẮNG!' : 'IMPOSTOR THẮNG!'}
          </motion.h1>

          <motion.p className="text-white/40 text-base text-center"
            initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.6 }}>
            {isLeft ? 'Bạn đã rời khỏi trận đấu'
              : isCrew ? 'Tất cả nhiệm vụ đã hoàn thành — Phi hành đoàn chiến thắng!'
              : 'Kẻ phản bội đã loại bỏ tất cả — Impostor chiến thắng!'}
          </motion.p>
        </motion.div>

        {/* Player list */}
        <AnimatePresence>
          {phase === 'stats' && players.length > 0 && (
            <motion.div className="w-full rounded-2xl overflow-hidden"
              initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
              transition={{ delay:0.1 }}
              style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', backdropFilter:'blur(20px)' }}>
              <div className="px-5 py-3 flex items-center gap-2"
                style={{ borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
                <span className="text-white/50 text-[10px] font-bold tracking-widest">NGƯỜI CHƠI</span>
                <span className="ml-auto text-white/25 text-[10px]">{players.length} người</span>
              </div>
              <div className="grid gap-0" style={{ gridTemplateColumns: players.length > 4 ? '1fr 1fr' : '1fr' }}>
                {players.map((p, i) => {
                  const pHex = COLOR_HEX[p.color] || '#888'
                  const isMe = p.color === myColor
                  const isImposterPlayer = p.isImposter
                  return (
                    <motion.div key={p.id || i}
                      initial={{ opacity:0, x:-10 }} animate={{ opacity:1, x:0 }}
                      transition={{ delay: 0.15 + i * 0.06 }}
                      className="flex items-center gap-3 px-4 py-3 transition-all"
                      style={{ borderBottom:'1px solid rgba(255,255,255,0.04)',
                               background: isMe ? `${pHex}08` : 'transparent' }}>
                      <div className="w-9 h-9 rounded-xl overflow-hidden shrink-0"
                        style={{ border:`2px solid ${pHex}50`, boxShadow:`0 0 10px ${pHex}25` }}>
                        <img src={`assets/Images/avatar/${AVATAR_MAP[p.color] || 'nam1.png'}`} alt=""
                          style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-white text-sm font-semibold truncate">{p.name}</p>
                          {isMe && <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                            style={{ background:`${pHex}20`, color:pHex }}>Bạn</span>}
                        </div>
                        <p className="text-[10px] capitalize" style={{ color:`${pHex}90` }}>{p.color}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isImposterPlayer && (
                          <span className="text-[9px] px-2 py-0.5 rounded-full font-bold"
                            style={{ background:'rgba(239,68,68,0.15)', color:'#ef4444', border:'1px solid rgba(239,68,68,0.3)' }}>
                            ☠ Impostor
                          </span>
                        )}
                        {!isImposterPlayer && (
                          <span className="text-[9px] px-2 py-0.5 rounded-full font-bold"
                            style={{ background:'rgba(6,182,212,0.1)', color:'#06b6d4', border:'1px solid rgba(6,182,212,0.2)' }}>
                            👨‍🚀 Crew
                          </span>
                        )}
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Actions */}
        <motion.div className="flex gap-3 w-full"
          initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.8 }}>
          <motion.button onClick={returnToLobby}
            whileHover={{ scale:1.02 }} whileTap={{ scale:0.97 }}
            className="flex-1 py-3.5 rounded-xl font-bold text-sm tracking-wide transition-all"
            style={{ background:`linear-gradient(135deg,${accent},${accentB})`,
                     color: isCrew ? '#000' : '#fff',
                     boxShadow:`0 4px 24px ${accent}40` }}>
            ↩ Quay lại phòng
          </motion.button>
          <motion.button onClick={handleMenu}
            whileHover={{ scale:1.02 }} whileTap={{ scale:0.97 }}
            className="px-8 py-3.5 rounded-xl font-bold text-sm text-white/60 hover:text-white transition-all"
            style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)' }}>
            Menu chính
          </motion.button>
        </motion.div>

        {/* Countdown */}
        <motion.div className="flex items-center gap-3"
          initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:1 }}>
          <div className="relative w-8 h-8">
            <svg className="w-8 h-8 -rotate-90" viewBox="0 0 32 32">
              <circle cx="16" cy="16" r="13" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2.5" />
              <motion.circle cx="16" cy="16" r="13" fill="none" stroke={accent} strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 13}`}
                strokeDashoffset={`${2 * Math.PI * 13 * (1 - countdown / 15)}`}
                transition={{ duration:0.9, ease:'linear' }} />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white/60">
              {countdown}
            </span>
          </div>
          <p className="text-white/30 text-xs">Tự động quay lại phòng</p>
        </motion.div>

      </motion.div>
    </div>
  )
}
