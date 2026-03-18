import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '../../store.js'
import FixWiring from './FixWiring.jsx'

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
      className="absolute inset-0 z-[100] bg-black/80 flex items-center justify-center backdrop-blur-md"
      onClick={(e) => e.target === e.currentTarget && setActiveTask(null)}
    >
      <motion.div 
        initial={{ scale: 0.8, y: 50, opacity: 0 }} 
        animate={{ scale: 1, y: 0, opacity: 1 }} 
        exit={{ scale: 0.8, y: 50, opacity: 0 }}
        transition={{ type: 'spring', damping: 20 }}
        className="relative"
      >
        {/* Nút đóng */}
        <button 
          onClick={() => setActiveTask(null)}
          className="absolute -top-6 -right-6 w-12 h-12 bg-red-500 text-white rounded-full font-black shadow-xl z-10 hover:scale-110 hover:rotate-90 transition-all flex items-center justify-center border-4 border-slate-900"
        >
          ✕
        </button>

        {/* Render Mini-game dựa trên ID */}
        <div className="task-content-wrapper shadow-[0_0_100px_rgba(0,0,0,0.5)] rounded-[40px]">
          {activeTask.id === 'fix_wiring' && <FixWiring onDone={handleDone} />}
          
          {/* Fallback cho các nhiệm vụ chưa code giao diện riêng */}
          {activeTask.id !== 'fix_wiring' && (
            <div className="p-16 bg-slate-800 rounded-[40px] text-center border-4 border-white/5">
              <h2 className="text-white font-black text-3xl mb-4 uppercase tracking-tighter">{activeTask.name}</h2>
              <div className="w-20 h-1 bg-cyan-500 mx-auto mb-8 opacity-50" />
              <p className="text-white/40 mb-10 italic max-w-xs">Nhiệm vụ này đang được thiết kế bằng React...</p>
              <button 
                onClick={handleDone} 
                className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-white font-black rounded-2xl shadow-lg transition-all active:scale-95 uppercase tracking-widest text-xs"
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
