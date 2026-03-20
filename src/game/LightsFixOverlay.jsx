import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import './LightsFixOverlay.css'

export default function LightsFixOverlay({ gameRef }) {
  const [data, setData] = useState(null)
  const rafRef = useRef(null)

  const poll = useCallback(() => {
    const reg = gameRef?.current?.registry
    if (reg) setData(reg.get('lightsFixData') ?? null)
    rafRef.current = requestAnimationFrame(poll)
  }, [gameRef])

  useEffect(() => {
    rafRef.current = requestAnimationFrame(poll)
    return () => cancelAnimationFrame(rafRef.current)
  }, [poll])

  const visible = !!data?.visible
  const { nearLights, toggled, progress } = data || {}
  const pct = Math.round((progress || 0) * 100)

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="lights-fix"
          className="lights-fix-root"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        >
          <div className="lights-fix-header">
            <span className="lights-fix-icon">💡</span>
            <span className="lights-fix-title">ĐÈN BỊ TẮT</span>
            <span className="lights-fix-icon">💡</span>
          </div>

          <p className="lights-fix-subtitle">
            {nearLights
              ? toggled
                ? '✓ Đang bật lại...'
                : 'Giữ [F] để bật cần gạt'
              : 'Đến phòng điện để sửa'}
          </p>

          <div className="lights-fix-switch-wrap">
            <div className={`lights-fix-switch ${toggled ? 'on' : 'off'}`}>
              <motion.div
                className="lights-fix-switch-knob"
                animate={{ x: toggled ? 28 : 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              />
            </div>
            <span className="lights-fix-switch-label">{toggled ? 'BẬT' : 'TẮT'}</span>
          </div>

          {nearLights && !toggled && (
            <div className="lights-fix-bar-wrap">
              <div className="lights-fix-bar-bg">
                <motion.div
                  className="lights-fix-bar-fill"
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.05 }}
                />
              </div>
              <span className="lights-fix-bar-pct">Giữ F: {pct}%</span>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
