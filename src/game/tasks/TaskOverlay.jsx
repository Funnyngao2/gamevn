import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '../../store.js'
import { TASK_MINIGAME_COMPONENTS } from './taskRegistry.js'
import './TaskOverlay.css'
import './taskMiniShared.css'
import './minigames.css'

export default function TaskOverlay({ task }) {
  const { setActiveTask } = useAppStore()

  const handleDone = () => {
    if (window.phaserGame && task) {
      window.phaserGame.registry.get('onTaskComplete')?.(task.id)
    }
    setActiveTask(null)
  }

  if (!task) return null
  const Minigame = TASK_MINIGAME_COMPONENTS[task.kind]

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="task-overlay-backdrop"
      onClick={(e) => e.target === e.currentTarget && setActiveTask(null)}
    >
      <motion.div
        initial={{ scale: 0.8, y: 50, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.8, y: 50, opacity: 0 }}
        transition={{ type: 'spring', damping: 20 }}
        className="task-overlay-panel"
      >
        <button type="button" onClick={() => setActiveTask(null)} className="task-overlay-close" aria-label="Đóng">
          ✕
        </button>

        <div className="task-overlay-content">
          {Minigame ? (
            <Minigame onDone={handleDone} />
          ) : (
            <div className="task-overlay-fallback">
              <h2 className="task-overlay-fallback-title">{task.name}</h2>
              <div className="task-overlay-fallback-divider" />
              <p className="task-overlay-fallback-text">
                Chưa có mini-game cho <code style={{ color: '#67e8f9' }}>{task.kind}</code>. Các kind có sẵn:{' '}
                {Object.keys(TASK_MINIGAME_COMPONENTS).join(', ')}.
              </p>
              <button type="button" onClick={handleDone} className="task-overlay-fallback-button">
                Hoàn thành nhanh (dev)
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
