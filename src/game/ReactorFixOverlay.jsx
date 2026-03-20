import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import './ReactorFixOverlay.css'

export default function ReactorFixOverlay({ gameRef }) {
  const [data, setData] = useState(null)
  const rafRef = useRef(null)

  const poll = useCallback(() => {
    const reg = gameRef?.current?.registry
    if (reg) setData(reg.get('reactorFixData') ?? null)
    rafRef.current = requestAnimationFrame(poll)
  }, [gameRef])

  useEffect(() => {
    rafRef.current = requestAnimationFrame(poll)
    return () => cancelAnimationFrame(rafRef.current)
  }, [poll])

  if (!data?.visible) return null

  const { progress = 0, fixers = 0, nearReactor, secondsLeft } = data
  const critical = secondsLeft <= 10

  return (
    <AnimatePresence>
      <motion.div
        className="reactor-fix-root"
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      >
        {/* Header */}
        <div className="reactor-fix-header">
          <motion.span
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            style={{ display: 'inline-block', fontSize: 18 }}
          >⚛</motion.span>
          <span className="reactor-fix-title">LÒ PHẢN ỨNG BỊ PHÁ</span>
          <motion.span
            animate={{ rotate: -360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            style={{ display: 'inline-block', fontSize: 18 }}
          >⚛</motion.span>
        </div>

        {/* Status */}
        <p className="reactor-fix-subtitle">
          {nearReactor
            ? fixers >= 2
              ? '⚡ Đang sửa...'
              : '⏳ Chờ người thứ 2...'
            : 'Đến một trong hai điểm reactor trên map — cần 2 người'}
        </p>

        {/* Progress bar */}
        <div className="reactor-fix-bar-wrap">
          <div className="reactor-fix-bar-bg">
            <motion.div
              className="reactor-fix-bar-fill"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.15 }}
              style={{
                background: progress >= 100
                  ? 'linear-gradient(90deg, #22c55e, #4ade80)'
                  : fixers >= 2
                  ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                  : 'linear-gradient(90deg, #3b82f6, #60a5fa)',
              }}
            />
          </div>
          <div className="reactor-fix-bar-labels">
            <span className="reactor-fix-bar-pct">{progress}%</span>
            <span className="reactor-fix-fixers">
              {fixers >= 2 ? '👥 2 người' : fixers === 1 ? '🧑 1/2 người' : '○ 0/2 người'}
            </span>
          </div>
        </div>

        {/* Milestones */}
        <div className="reactor-fix-milestones">
          <span className={`reactor-fix-milestone ${progress >= 50 ? 'done' : ''}`}>
            {progress >= 50 ? '✓' : '○'} Người 1 (50%)
          </span>
          <span className={`reactor-fix-milestone ${progress >= 100 ? 'done' : ''}`}>
            {progress >= 100 ? '✓' : '○'} Người 2 (100%)
          </span>
        </div>

        {/* Timer */}
        <div className="reactor-fix-timer">
          <span className="reactor-fix-timer-label">Thời gian còn lại</span>
          <motion.span
            className="reactor-fix-timer-value"
            animate={critical ? { scale: [1, 1.15, 1] } : {}}
            transition={{ duration: 0.5, repeat: Infinity }}
            style={{ color: critical ? '#ef4444' : '#facc15' }}
          >
            {secondsLeft}s
          </motion.span>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
