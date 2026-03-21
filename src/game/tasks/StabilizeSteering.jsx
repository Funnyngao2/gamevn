import { useState, useEffect, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import './taskMiniShared.css'
import './StabilizeSteering.css'

const RADAR_SIZE = 280
const CENTER = RADAR_SIZE / 2
const TARGET_RADIUS = 25
const HOLD_TIME = 1500 // 1.5s to win

export default function StabilizeSteering({ onDone }) {
  // Local crosshair position (dragged by user)
  const [targetPos, setTargetPos] = useState({ x: CENTER, y: CENTER })
  // Current "actual" steering position (with drift)
  const [actualPos, setActualPos] = useState({ x: CENTER + 80, y: CENTER - 60 })
  const [progress, setProgress] = useState(0)
  const [isWon, setIsWon] = useState(false)
  
  const containerRef = useRef(null)
  const lastUpdate = useRef(performance.now())
  const holdStart = useRef(null)
  const wonRef = useRef(false)
  const targetPosRef = useRef(targetPos)
  const actualPosRef = useRef(actualPos)

  useEffect(() => {
    targetPosRef.current = targetPos
  }, [targetPos])

  useEffect(() => {
    actualPosRef.current = actualPos
  }, [actualPos])

  // Single RAF loop; refs keep target/actual in sync without restarting every frame
  useEffect(() => {
    if (isWon) return

    let raf
    const tick = (t) => {
      const dt = (t - lastUpdate.current) / 1000
      lastUpdate.current = t

      const tp = targetPosRef.current
      const prev = actualPosRef.current

      const dx = tp.x - prev.x
      const dy = tp.y - prev.y

      const speed = 4.5
      const nextX = prev.x + dx * speed * dt + (Math.random() - 0.5) * 5 * dt
      const nextY = prev.y + dy * speed * dt + (Math.random() - 0.5) * 5 * dt

      const bound = (v) => Math.max(20, Math.min(RADAR_SIZE - 20, v))
      const next = { x: bound(nextX), y: bound(nextY) }
      actualPosRef.current = next
      setActualPos(next)

      const distToCenter = Math.hypot(next.x - CENTER, next.y - CENTER)
      if (distToCenter < TARGET_RADIUS) {
        if (!holdStart.current) holdStart.current = t
        const elapsed = t - holdStart.current
        const p = Math.min(100, (elapsed / HOLD_TIME) * 100)
        setProgress(p)

        if (p >= 100 && !wonRef.current) {
          wonRef.current = true
          setIsWon(true)
          setTimeout(onDone, 800)
        }
      } else {
        holdStart.current = null
        setProgress(0)
      }

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [isWon, onDone])

  const updateTargetFromEvent = useCallback(
    (e) => {
      if (isWon || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const sx = rect.width / RADAR_SIZE
      const sy = rect.height / RADAR_SIZE
      if (sx <= 0 || sy <= 0) return
      const x = (e.clientX - rect.left) / sx
      const y = (e.clientY - rect.top) / sy
      const next = {
        x: Math.max(0, Math.min(RADAR_SIZE, x)),
        y: Math.max(0, Math.min(RADAR_SIZE, y)),
      }
      targetPosRef.current = next
      setTargetPos(next)
    },
    [isWon]
  )

  const handlePointerDown = (e) => {
    if (isWon || e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    updateTargetFromEvent(e)
  }

  const handlePointerMove = (e) => {
    if (isWon) return
    updateTargetFromEvent(e)
  }

  const handlePointerUp = (e) => {
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  return (
    <div className="mini-root steering-root">
      <div className="mini-head">
        <p className="mini-kicker">HỆ THỐNG ĐIỀU HƯỚNG</p>
        <h3 className="mini-title">ỔN ĐỊNH BUỒNG LÁI</h3>
        <p className="mini-desc">Di chuyển tâm ngắm vào giữa vòng tròn và giữ nguyên</p>
      </div>

      <div className="mini-body steering-body">
        <div 
          className="radar-container" 
          ref={containerRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{ width: RADAR_SIZE, height: RADAR_SIZE }}
        >
          {/* Radar background grid */}
          <div className="radar-grid">
            <div className="radar-line-h" />
            <div className="radar-line-v" />
            <div className="radar-circle radar-circle-1" />
            <div className="radar-circle radar-circle-2" />
          </div>

          {/* Target zone (Center) */}
          <div 
            className={`radar-target ${progress > 0 ? 'radar-target--active' : ''}`}
            style={{ 
              width: TARGET_RADIUS * 2, 
              height: TARGET_RADIUS * 2,
              left: CENTER,
              top: CENTER
            }}
          />

          {/* User's crosshair (Target selector) */}
          <motion.div 
            className="radar-crosshair"
            animate={{ x: targetPos.x - 15, y: targetPos.y - 15 }}
            transition={{ type: 'tween', duration: 0.06, ease: 'linear' }}
          >
            <div className="crosshair-line-h" />
            <div className="crosshair-line-v" />
          </motion.div>

          {/* Actual steering indicator (The one that needs to be centered) */}
          <motion.div 
            className="radar-indicator"
            animate={{ x: actualPos.x - 10, y: actualPos.y - 10 }}
            transition={{ duration: 0.05 }}
          >
            <div className="indicator-dot" />
            <div className="indicator-ring" />
          </motion.div>

          {/* Progress ring around center */}
          {progress > 0 && (
            <svg className="radar-progress-svg" style={{ width: RADAR_SIZE, height: RADAR_SIZE }}>
              <circle
                cx={CENTER} cy={CENTER} r={TARGET_RADIUS + 5}
                stroke="#4ade80" strokeWidth="3" fill="none"
                strokeDasharray={`${progress * 2}, 1000`}
                transform={`rotate(-90 ${CENTER} ${CENTER})`}
              />
            </svg>
          )}
        </div>

        <div className="mini-bar-track">
          <motion.div 
            className={`mini-bar-fill ${isWon ? 'mini-bar-fill--ok' : ''}`}
            animate={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="mini-hint">Nhấn giữ và kéo trên radar (hoặc di chuột) để đưa điểm xanh vào giữa</div>
    </div>
  )
}
