import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '../store.js'
import './GameHUDOverlay.css'

function useRegistryValue(gameRef, key) {
  const [value, setValue] = useState(null)
  const rafRef = useRef(null)

  useEffect(() => {
    const tick = () => {
      const next = gameRef.current?.registry?.get(key) ?? null
      setValue(next)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [gameRef, key])

  return value
}

export default function GameHUDOverlay({ gameRef }) {
  const { gameAlert, gamePrompt, setGameAlert } = useAppStore()
  const hud = useRegistryValue(gameRef, 'hudData')

  useEffect(() => {
    if (!gameAlert) return
    const t = setTimeout(() => setGameAlert(null), gameAlert.duration || 3000)
    return () => clearTimeout(t)
  }, [gameAlert, setGameAlert])

  const total = hud?.total || 0
  const done = hud?.missionsDone || 0
  const progress = total > 0 ? Math.min(100, (done / total) * 100) : 0

  // Build chuỗi hiển thị từ data (không dùng chuỗi từ Phaser)
  const roleText = !hud?.alive ? '👻 HỒN MA' : (hud?.isImposter ? '☠ IMPOSTOR' : '✓ CREWMATE')
  const roleColor = !hud?.alive ? '#aaaaff' : (hud?.isImposter ? '#ff4444' : '#44ff88')

  const killText =
    hud?.isImposter && typeof hud.killCooldownSeconds === 'number'
      ? hud.killCooldownSeconds > 0
        ? `Giết: ${hud.killCooldownSeconds}s`
        : 'Giết: SẴN SÀNG [Q]'
      : null

  let sabotageText = null
  let sabotageType = 'info'
  if (hud?.sabotageReactorSeconds != null && hud.sabotageReactorSeconds >= 0) {
    sabotageText = `⚠ LÒ PHẢN ỨNG: ${hud.sabotageReactorSeconds}s`
    sabotageType = 'danger'
  } else if (hud?.sabotageLights) {
    sabotageText = '⚠ ĐÈN BỊ TẮT'
    sabotageType = 'warning'
  } else if (hud?.isImposter && typeof hud.sabotageCooldownSeconds === 'number') {
    sabotageText =
      hud.sabotageCooldownSeconds > 0
        ? `Phá hoại: ${hud.sabotageCooldownSeconds}s`
        : 'Phá hoại: SẴN SÀNG [X]'
    sabotageType = 'info'
  }

  const controlsHint = hud?.alive
    ? hud?.isImposter
      ? 'WASD: Di chuyển | Q: Giết | X: Phá hoại | V: Cống | R: Báo xác'
      : 'WASD: Di chuyển | F: Làm nhiệm vụ | E: Họp khẩn | R: Báo xác'
    : null

  return (
    <div className="game-hud-root">
      {/* Alerts - Top Center */}
      <AnimatePresence>
        {gameAlert && (
          <motion.div
            initial={{ y: -100, opacity: 0, x: '-50%' }}
            animate={{ y: 0, opacity: 1, x: '-50%' }}
            exit={{ y: -100, opacity: 0, x: '-50%' }}
            className={`game-hud-alert alert-${gameAlert.type || 'info'}`}
          >
            <span className="game-hud-alert-title">Thông báo</span>
            <p className="game-hud-alert-text">{gameAlert.text}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Task List & Progress - Top Left */}
      {hud && (
        <div className="game-hud-panel-left">
          <div className="game-hud-task-header">
            <span className="game-hud-task-label">Tiến độ chung</span>
            <span className="game-hud-task-value">{done}/{total}</span>
          </div>
          
          <div className="game-hud-progress-track">
            <motion.div 
              className="game-hud-progress-fill" 
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
          </div>

          <div className="game-hud-task-list">
            {hud.tasks?.map((t, i) => (
              <div key={i} className={`game-hud-task-item ${t.done ? 'game-hud-task-done' : ''}`}>
                <span className="game-hud-task-mark">{t.done ? '✓' : '○'}</span>
                <span className="game-hud-task-text">{t.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Role & Actions - Top Right */}
      {hud && (
        <div className="game-hud-panel-right">
          <div className="game-hud-role-row">
            <div className="game-hud-role-dot" style={{ background: roleColor, color: roleColor }} />
            <span className="game-hud-role-name" style={{ color: roleColor }}>{roleText}</span>
          </div>

          {(killText || sabotageText) && (
            <div className="game-hud-imposter-actions">
              {killText && <p className="game-hud-kill-text">{killText}</p>}
              {sabotageText && (
                <p className={`game-hud-sabotage-text ${sabotageType === 'danger' ? 'game-hud-sabotage-danger' : 'game-hud-sabotage-warning'}`}>
                  {sabotageText}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Interaction Prompt - Bottom Middle */}
      <AnimatePresence>
        {gamePrompt && (
          <motion.div
            initial={{ opacity: 0, y: 20, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 20, x: '-50%' }}
            className="game-hud-prompt"
          >
            <span className="game-hud-prompt-text">{gamePrompt.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controls Hint - Bottom Left */}
      {controlsHint && (
        <div className="game-hud-controls">
          <p className="game-hud-controls-text">{controlsHint}</p>
        </div>
      )}
    </div>
  )
}
