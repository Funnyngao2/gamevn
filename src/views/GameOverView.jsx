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
  const players  = gameData?.players || []
  
  // Xác định vai trò của bản thân
  const myUUID = localStorage.getItem('playerUUID')
  const me = players.find(p => p.uuid === myUUID)
  const myRole = me?.isImposter ? 'impostor' : 'crew'
  
  // Bạn thắng nếu cùng phe với winner
  const isVictory = winner === myRole
  const isCrewWin = winner === 'crew'
  const isLeft    = winner === null

  // Màu sắc chủ đạo dựa trên Victory/Defeat
  const accent  = isLeft ? '#94a3b8' : isVictory ? '#22c55e' : '#ef4444'
  const accentB = isLeft ? '#64748b' : isVictory ? '#16a34a' : '#b91c1c'
  const statusText = isLeft ? 'RỜI TRẬN' : isVictory ? 'CHIẾN THẮNG' : 'THẤT BẠI'

  useEffect(() => {
    const t = setTimeout(() => setPhase('stats'), 2000)
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

  const particles = useMemo(() => Array.from({ length: 30 }, (_, i) => ({
    id: i, x: Math.random()*100, delay: Math.random()*2, dur: Math.random()*2+2,
    size: Math.random()*6+2, color: [accent, accentB, '#fff'][Math.floor(Math.random()*3)],
  })), [accent])

  return (
    <div className="w-screen h-screen flex flex-col items-center justify-center relative overflow-hidden"
      style={{ background: '#000' }}>

      {/* Stars Background */}
      <div className="absolute inset-0 pointer-events-none opacity-40">
        {stars.map(s => (
          <div key={s.id} className="absolute rounded-full bg-white animate-pulse"
            style={{ left:`${s.x}%`, top:`${s.y}%`, width:s.s, height:s.s, animationDuration:`${s.dur}ms` }} />
        ))}
      </div>

      {/* Shake effect on reveal */}
      <motion.div className="absolute inset-0 pointer-events-none"
        animate={phase === 'reveal' ? { x: [-2, 2, -2, 2, 0], y: [1, -1, 1, -1, 0] } : {}}
        transition={{ duration: 0.1, repeat: 10 }} />

      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background:`radial-gradient(circle at 50% 50%, ${accent}15 0%, transparent 70%)` }} />

      {/* Floating particles */}
      {phase === 'stats' && particles.map(p => (
        <motion.div key={p.id} className="absolute rounded-full pointer-events-none"
          style={{ left:`${p.x}%`, bottom:0, width:p.size, height:p.size, background:p.color, opacity:0.4 }}
          animate={{ y: [0, -window.innerHeight], opacity: [0.4, 0] }}
          transition={{ delay: p.delay, duration: p.dur, repeat: Infinity, ease: 'linear' }} />
      ))}

      {/* ── CONTENT ── */}
      <div className="relative z-10 flex flex-col items-center w-full max-w-4xl px-6">
        
        {/* BIG REVEAL TEXT */}
        <AnimatePresence mode="wait">
          {phase === 'reveal' ? (
            <motion.div key="status"
              initial={{ scale: 2, opacity: 0, filter: 'blur(20px)' }}
              animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
              exit={{ y: -50, opacity: 0 }}
              transition={{ duration: 0.5, type: 'spring', damping: 12 }}
              className="flex flex-col items-center">
              <h1 className="text-8xl font-black italic tracking-tighter"
                style={{ color: accent, textShadow: `0 0 30px ${accent}, 0 0 60px ${accent}40` }}>
                {statusText}
              </h1>
              <p className="text-white/40 text-sm tracking-[0.5em] mt-4 font-bold uppercase">
                {isCrewWin ? 'Phi hành đoàn chiến thắng' : 'Kẻ phản bội chiến thắng'}
              </p>
            </motion.div>
          ) : (
            <motion.div key="stats"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center w-full">
              
              <div className="flex flex-col items-center gap-2 mb-8">
                <h2 className="text-4xl font-black italic" style={{ color: accent }}>{statusText}</h2>
                <div style={{ height: 2, width: 60, background: accent, borderRadius: 99, opacity: 0.5 }} />
              </div>

              {/* Player list grid */}
              <div className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
                {players.map((p, i) => {
                  const pHex = COLOR_HEX[p.color] || '#888'
                  const isMe = p.uuid === myUUID
                  const isImp = p.isImposter
                  return (
                    <motion.div key={i}
                      initial={{ opacity: 0, x: -15 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="relative overflow-hidden rounded-xl p-3 flex items-center gap-3"
                      style={{ background: isMe ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
                               border: `1px solid ${isMe ? pHex + '40' : 'rgba(255,255,255,0.05)'}` }}>
                      
                      {/* Impostor highlight background */}
                      {isImp && <div className="absolute inset-0 bg-red-500/5 pointer-events-none" />}
                      
                      <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-black/40 p-0.5"
                        style={{ border: `2px solid ${pHex}` }}>
                        <img src={`assets/Images/avatar/${AVATAR_MAP[p.color] || 'nam1.png'}`} alt=""
                          className="w-full h-full object-cover" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-white text-sm font-bold truncate">{p.name}</p>
                          {isMe && <span className="bg-white/10 text-[8px] px-1 rounded uppercase font-black">Bạn</span>}
                        </div>
                        <p className="text-[10px] font-black uppercase tracking-wider mt-0.5"
                          style={{ color: isImp ? '#ef4444' : '#06b6d4' }}>
                          {isImp ? '☠ Impostor' : '👨‍🚀 Crewmate'}
                        </p>
                      </div>
                    </motion.div>
                  )
                })}
              </div>

              {/* Actions */}
              <div className="flex gap-3 w-full max-w-md">
                <motion.button onClick={returnToLobby}
                  whileHover={{ scale: 1.02, y: -2 }} whileTap={{ scale: 0.98 }}
                  className="flex-1 py-4 rounded-xl font-black text-xs uppercase tracking-[0.2em] transition-all"
                  style={{ background: `linear-gradient(135deg, ${accent}, ${accentB})`,
                           color: isVictory ? '#000' : '#fff',
                           boxShadow: `0 8px 30px ${accent}30` }}>
                  Quay lại phòng ({countdown}s)
                </motion.button>
                <motion.button onClick={handleMenu}
                  whileHover={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
                  className="px-6 py-4 rounded-xl font-bold text-xs text-white/40 uppercase tracking-widest border border-white/10 transition-all">
                  Menu
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  )
}
