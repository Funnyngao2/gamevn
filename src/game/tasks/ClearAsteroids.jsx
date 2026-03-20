import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import './taskMiniShared.css'
import './ClearAsteroids.css'

const NEED = 15
const SPAWN_RATE = 800 // ms

export default function ClearAsteroids({ onDone }) {
  const [asteroids, setAsteroids] = useState([])
  const [destroyedCount, setDestroyedCount] = useState(0)
  const [isWon, setIsWon] = useState(false)
  const fieldRef = useRef(null)
  const nextId = useRef(0)

  useEffect(() => {
    if (isWon) return

    const timer = setInterval(() => {
      const id = nextId.current++
      const startSide = Math.floor(Math.random() * 4) // 0: top, 1: right, 2: bottom, 3: left
      let x, y, tx, ty

      // Random path across the screen
      if (startSide === 0) { x = Math.random() * 100; y = -10; tx = Math.random() * 100; ty = 110 }
      else if (startSide === 1) { x = 110; y = Math.random() * 100; tx = -10; ty = Math.random() * 100 }
      else if (startSide === 2) { x = Math.random() * 100; y = 110; tx = Math.random() * 100; ty = -10 }
      else { x = -10; y = Math.random() * 100; tx = 110; ty = Math.random() * 100 }

      const size = 30 + Math.random() * 40
      const duration = 3 + Math.random() * 4

      setAsteroids(prev => [...prev, { id, x, y, tx, ty, size, duration }])

      // Cleanup asteroid after duration
      setTimeout(() => {
        setAsteroids(prev => prev.filter(a => a.id !== id))
      }, duration * 1000 + 500)

    }, SPAWN_RATE)

    return () => clearInterval(timer)
  }, [isWon])

  const handleHit = (id) => {
    if (isWon) return
    setAsteroids(prev => prev.filter(a => a.id !== id))
    const nextCount = destroyedCount + 1
    setDestroyedCount(nextCount)

    if (nextCount >= NEED) {
      setIsWon(true)
      setTimeout(onDone, 1000)
    }
  }

  return (
    <div className="mini-root asteroids-root">
      <div className="mini-head">
        <p className="mini-kicker">HỆ THỐNG PHÒNG THỦ</p>
        <h3 className="mini-title">QUÉT THIÊN THẠCH</h3>
        <p className="mini-desc">Tiêu diệt {NEED} thiên thạch để bảo vệ tàu</p>
      </div>

      <div className="mini-body asteroids-body" ref={fieldRef}>
        <div className="asteroids-field">
          <AnimatePresence>
            {asteroids.map(a => (
              <motion.div
                key={a.id}
                initial={{ left: `${a.x}%`, top: `${a.y}%`, scale: 0 }}
                animate={{ left: `${a.tx}%`, top: `${a.ty}%`, scale: 1, rotate: 360 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ duration: a.duration, ease: "linear" }}
                className="asteroid"
                style={{ width: a.size, height: a.size }}
                onClick={() => handleHit(a.id)}
              >
                <div className="asteroid-core" />
              </motion.div>
            ))}
          </AnimatePresence>
          
          <div className="crosshair" />
        </div>

        <div className="mini-bar-track">
          <motion.div 
            className={`mini-bar-fill ${isWon ? 'mini-bar-fill--ok' : ''}`}
            animate={{ width: `${(destroyedCount / NEED) * 100}%` }}
          />
        </div>
        
        <div className="asteroids-stats">
          <span>MỤC TIÊU: {destroyedCount} / {NEED}</span>
          {isWon && <span className="status-ok">HỆ THỐNG AN TOÀN</span>}
        </div>
      </div>
    </div>
  )
}
