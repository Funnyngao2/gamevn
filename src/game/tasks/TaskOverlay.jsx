import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '../../store.js'
import FixWiring from './FixWiring.jsx'
import './TaskOverlay.css'

export default function TaskOverlay() {
  const { activeTask, setActiveTask } = useAppStore()
  
  if (!activeTask) return null

  const handleDone = () => {
    // Gọi ngược lại Phaser để xác nhận hoàn thành
    if (window.phaserGame) {
      window.phaserGame.registry.get('onTaskComplete')?.(activeTask.id)
    }
    setActiveTask(null)
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
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
        {/* Nút đóng */}
        <button 
          onClick={() => setActiveTask(null)}
          className="task-overlay-close"
        >
          ✕
        </button>

        {/* Render Mini-game dựa trên ID */}
        <div className="task-overlay-content">
          {activeTask.kind === 'fix_wiring' && <FixWiring onDone={handleDone} />}
          
          {/* Fallback cho các nhiệm vụ chưa code giao diện riêng */}
          {activeTask.kind !== 'fix_wiring' && (
            <div className="task-overlay-fallback">
              <h2 className="task-overlay-fallback-title">{activeTask.name}</h2>
              <div className="task-overlay-fallback-divider" />
              <p className="task-overlay-fallback-text">Nhiệm vụ này đang được thiết kế bằng React...</p>
              <button 
                onClick={handleDone} 
                className="task-overlay-fallback-button"
              >
                Hoàn thành nhanh
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
