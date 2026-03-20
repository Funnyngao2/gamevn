import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, useMotionValue, useSpring } from 'framer-motion'
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

  // Drift and follow logic
  useEffect(() => {
    if (isWon) return

    let raf
    const tick = (t) => {
      const dt = (t - lastUpdate.current) / 1000
      lastUpdate.current = t

      setActualPos(prev => {
        // Drift away from center
        const driftX = Math.sin(t / 800) * 40
        const driftY = Math.cos(t / 1100) * 40
        
        // Move towards where the user is "holding" the stick
        // In Among Us, the actual pos follows the target pos but with lag/drift
        const dx = targetPos.x - prev.x
        const dy = targetPos.y - prev.y
        
        const speed = 4.5
        const nextX = prev.x + dx * speed * dt + (Math.random() - 0.5) * 5 * dt
        const nextY = prev.y + dy * speed * dt + (Math.random() - 0.5) * 5 * dt

        // Keep within radar bounds
        const bound = (v) => Math.max(20, Math.min(RADAR_SIZE - 20, v))
        return { x: bound(nextX), y: bound(nextY) }
      })

      // Check if actual pos is in the center ring
      const distToCenter = Math.sqrt(Math.pow(actualPos.x - CENTER, 2) + Math.pow(actualPos.y - CENTER, 2))
      if (distToCenter < TARGET_RADIUS) {
        if (!holdStart.current) holdStart.current = t
        const elapsed = t - holdStart.current
        const p = Math.min(100, (elapsed / HOLD_TIME) * 100)
        setProgress(p)
        
        if (p >= 100) {
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
  }, [targetPos, actualPos, isWon, onDone])

  const handlePointerMove = (e) => {
    if (isWon || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setTargetPos({ 
      x: Math.max(0, Math.min(RADAR_SIZE, x)), 
      y: Math.max(0, Math.min(RADAR_SIZE, y)) 
    })
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
          onPointerMove={handlePointerMove}
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
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
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

      <div className="mini-hint">Dùng chuột di chuyển tâm ngắm để điều khiển điểm xanh vào giữa</div>
    </div>
  )
}
