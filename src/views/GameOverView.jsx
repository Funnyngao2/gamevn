import { useEffect, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '../store.js'
import { getSocket } from '../socket.js'
import { AVATAR_MAP } from './MenuView.jsx'
import { SceneBg, COLOR_HEX } from './lobbyShared.jsx'
import { Trophy, Skull, LogOut, Home } from 'lucide-react'
import './GameOverView.css'

export default function GameOverView() {
  const { gameResult, gameData, returnToLobby, setView } = useAppStore()
  const [countdown, setCountdown] = useState(15)
  const [phase, setPhase] = useState('reveal')

  const rawWinner = gameResult?.winner
  const winner = rawWinner === 'imposter' ? 'impostor' : rawWinner
  const players = gameResult?.players || gameData?.players || []

  const myUUID = localStorage.getItem('playerUUID')
  const me = players.find(p => p.uuid === myUUID || String(p.id) === String(gameResult?.localPlayerId))
  const myRole = typeof gameData?.isImposter === 'boolean'
    ? (gameData.isImposter ? 'impostor' : 'crew')
    : (me?.isImposter ? 'impostor' : 'crew')

  const isVictory = winner === myRole
  const isCrewWin = winner === 'crew'
  const isLeft = winner === null

  const accent = isLeft ? '#94a3b8' : isVictory ? '#22c55e' : '#ef4444'
  const statusText = isLeft ? 'RỜI TRẬN' : isVictory ? 'CHIẾN THẮNG' : 'THẤT BẠI'
  const subText = isLeft ? 'Bạn đã rời khỏi trận đấu' : isCrewWin ? 'Phi hành đoàn đã chiến thắng!' : 'Kẻ phản bội đã chiến thắng!'
  const StatusIcon = isLeft ? LogOut : isVictory ? Trophy : Skull
  const resultTopText = winner === 'impostor'
    ? 'Impostors Win'
    : winner === 'crew'
      ? 'Crewmates Win'
      : statusText

  const impostorPlayers = useMemo(() => players.filter(p => p.isImposter), [players])
  const crewPlayers = useMemo(() => players.filter(p => !p.isImposter), [players])

  useEffect(() => {
    const t = setTimeout(() => setPhase('stats'), 2500)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const t = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(t)
          returnToLobby()
          return 0
        }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [returnToLobby])

  const handleMenu = () => {
    getSocket()?.disconnect()
    setView('menu')
  }

  const floatParticles = useMemo(() => Array.from({ length: 20 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    delay: Math.random() * 1.5,
    dur: Math.random() * 2 + 2.5,
    size: Math.random() * 8 + 4,
    color: accent,
  })), [accent])

  return (
    <div className="gameover-root">
      <SceneBg accent={accent} />

      <div
        className="gameover-ambient"
        style={{ background: `radial-gradient(ellipse 80% 60% at 50% 40%, ${accent}08 0%, transparent 60%)` }}
      />

      <div className="gameover-particles">
        {floatParticles.map(p => (
          <motion.div
            key={p.id}
            className="gameover-particle"
            style={{ left: `${p.x}%`, bottom: -20, width: p.size, height: p.size, background: p.color }}
            animate={{ y: [-20, -window.innerHeight - 50], opacity: [0.15, 0] }}
            transition={{ delay: p.delay, duration: p.dur, repeat: Infinity, ease: 'linear' }}
          />
        ))}
      </div>

      <div className="gameover-content">
        <AnimatePresence mode="wait">
          {phase === 'reveal' ? (
            <motion.div
              key="reveal"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -30 }}
              className="gameover-reveal-wrap">
              <motion.div
                initial={{ scale: 0.5, opacity: 0, rotateY: -90 }}
                animate={{ scale: 1, opacity: 1, rotateY: 0 }}
                transition={{ type: 'spring', damping: 15, stiffness: 120 }}
                className="gameover-reveal-inner">
                <motion.div
                  animate={isVictory ? { scale: [1, 1.05, 1], y: [0, -4, 0] } : {}}
                  transition={{ duration: 1.2, repeat: Infinity }}
                  className="gameover-icon-shell"
                  style={{
                    background: `linear-gradient(145deg, ${accent}30, ${accent}08)`,
                    borderColor: `${accent}60`,
                    boxShadow: `0 0 60px ${accent}40, inset 0 0 30px ${accent}15`,
                  }}>
                  <StatusIcon size={56} strokeWidth={2} style={{ color: accent }} />
                </motion.div>

                <motion.h1
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="gameover-status-title"
                  style={{ color: accent, textShadow: `0 0 30px ${accent}80, 0 0 60px ${accent}40` }}>
                  {statusText}
                </motion.h1>

                <motion.p
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="gameover-status-subtitle">
                  {subText}
                </motion.p>
              </motion.div>
            </motion.div>
          ) : (
            <motion.div
              key="stats"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="gameover-stats-wrap">
              <div className="gameover-header">
                <img src="assets/Images/logo/logo.png" alt="" className="gameover-logo" />
                <h2 className="gameover-result-top" style={{ color: accent }}>
                  <StatusIcon size={28} strokeWidth={2.5} />
                  <span>{resultTopText}</span>
                </h2>
                <div
                  className="gameover-header-line"
                  style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
                />
              </div>

              <div className="gameover-groups">
                {[{
                  title: 'Impostors',
                  players: impostorPlayers,
                  titleColor: '#f87171',
                  badge: '☠',
                }, {
                  title: 'Crewmates',
                  players: crewPlayers,
                  titleColor: '#22d3ee',
                  badge: '👨‍🚀',
                }].map((group, gIdx) => (
                  <motion.div
                    key={group.title}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: gIdx * 0.08 }}
                    className="gameover-group-card">
                    <div className="gameover-group-header">
                      <span className="gameover-group-badge">{group.badge}</span>
                      <h3 className="gameover-group-title" style={{ color: group.titleColor }}>
                        {group.title} ({group.players.length})
                      </h3>
                    </div>

                    <div className="gameover-group-list">
                      {group.players.length === 0 && (
                        <p className="gameover-empty-text">No players</p>
                      )}

                      {group.players.map((p, i) => {
                        const pHex = COLOR_HEX[p.color] || '#888'
                        const isMe = p.uuid === myUUID
                        const isImp = p.isImposter

                        return (
                          <motion.div
                            key={`${group.title}-${p.uuid || p.id || i}`}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.05 * i }}
                            className="gameover-player-row"
                            style={{
                              background: isMe ? 'rgba(255,255,255,0.11)' : 'rgba(255,255,255,0.04)',
                              borderColor: isMe ? `${pHex}55` : 'rgba(255,255,255,0.08)',
                            }}>
                            <div
                              className="gameover-player-avatar-wrap"
                              style={{ borderColor: pHex, boxShadow: `0 0 10px ${pHex}40` }}>
                              <img
                                src={`assets/Images/avatar/${AVATAR_MAP[p.color] || 'nam1.png'}`}
                                alt=""
                                className="gameover-player-avatar"
                              />
                            </div>

                            <div className="gameover-player-meta">
                              <div className="gameover-player-name-row">
                                <p className="gameover-player-name">{p.name}</p>
                                {isMe && <span className="gameover-you-badge">You</span>}
                              </div>
                              <p
                                className="gameover-player-role"
                                style={{ color: isImp ? '#f87171' : '#22d3ee' }}>
                                {isImp ? 'Impostor' : 'Crewmate'}
                              </p>
                            </div>
                          </motion.div>
                        )
                      })}
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="gameover-actions">
                <motion.div
                  className="gameover-primary-button gameover-primary-button--noninteractive"
                  style={{
                    background: `linear-gradient(135deg, ${accent}, ${accent}dd)`,
                    color: isVictory ? '#000' : '#fff',
                    boxShadow: `0 8px 32px ${accent}35`,
                  }}
                  role="status"
                  aria-live="polite"
                  aria-label={`Tự động quay lại phòng sau ${countdown} giây`}>
                  <Home size={18} aria-hidden />
                  <span>Quay lại phòng ({countdown}s)</span>
                </motion.div>

                <motion.button
                  onClick={handleMenu}
                  whileHover={{ scale: 1.02, backgroundColor: 'rgba(255,255,255,0.12)' }}
                  whileTap={{ scale: 0.98 }}
                  className="gameover-secondary-button">
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
