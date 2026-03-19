import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import './SabotageOverlay.css'

export default function SabotageOverlay({ gameRef }) {
  const [open, setOpen] = useState(false)
  const rafRef = useRef(null)

  useEffect(() => {
    const tick = () => {
      setOpen(!!gameRef.current?.registry?.get('sabotageMenuOpen'))
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [gameRef])

  const select = (type) => gameRef.current?.registry?.get('onSabotageSelect')?.(type)
  const close = () => gameRef.current?.registry?.get('onSabotageMenuClose')?.()

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="sabotage-overlay-backdrop"
          onClick={(e) => { if (e.target === e.currentTarget) close() }}>
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            className="sabotage-overlay-panel">
            <div className="sabotage-overlay-header">
              <div>
                <p className="sabotage-overlay-eyebrow">Sabotage</p>
                <h3 className="sabotage-overlay-title">Chọn phá hoại</h3>
              </div>
              <button
                onClick={close}
                className="sabotage-overlay-close">
                ✕
              </button>
            </div>

            <div className="sabotage-overlay-actions">
              <button
                onClick={() => select('reactor')}
                className="sabotage-overlay-action sabotage-overlay-action-reactor">
                <div className="sabotage-overlay-action-title sabotage-overlay-action-title-reactor">🔴 Reactor</div>
                <p className="sabotage-overlay-action-text">Phá lò phản ứng, buộc đội kia đi sửa gấp.</p>
              </button>

              <button
                onClick={() => select('lights')}
                className="sabotage-overlay-action sabotage-overlay-action-lights">
                <div className="sabotage-overlay-action-title sabotage-overlay-action-title-lights">💡 Lights</div>
                <p className="sabotage-overlay-action-text">Tắt đèn để hạn chế tầm nhìn của crewmates.</p>
              </button>
            </div>

            <p className="sabotage-overlay-hint">
              Nhấn X để đóng
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
