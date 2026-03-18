import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

export default function FixWiring({ onDone }) {
  const colors = ['#ef4444', '#3b82f6', '#eab308', '#ec4899']
  const [leftOrder]  = useState(() => [...colors].sort(() => Math.random() - 0.5))
  const [rightOrder] = useState(() => [...colors].sort(() => Math.random() - 0.5))
  const [connections, setConnections] = useState({}) // { leftIdx: rightIdx }
  const [dragging, setDragging] = useState(null)

  const checkWin = (newConns) => {
    const wins = Object.entries(newConns).filter(([l, r]) => leftOrder[l] === rightOrder[r]).length
    if (wins === 4) {
      setTimeout(onDone, 600)
    }
  }

  return (
    <div className="flex flex-col items-center gap-8 p-10 bg-slate-900/95 rounded-[40px] border-4 border-white/5 shadow-2xl backdrop-blur-2xl">
      <div className="text-center">
        <h3 className="text-white font-black text-2xl tracking-[0.3em] uppercase">HỆ THỐNG ĐIỆN</h3>
        <p className="text-cyan-400/50 text-xs font-bold tracking-widest mt-2 uppercase">Nối các dây cùng màu để sửa chữa</p>
      </div>

      <div className="flex justify-between w-[450px] h-[320px] relative px-8 bg-black/40 rounded-3xl border border-white/5 py-6">
        <svg className="absolute inset-0 pointer-events-none w-full h-full">
          {Object.entries(connections).map(([l, r]) => (
            <motion.line 
              key={l} 
              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
              x1="60" y1={55 + l * 70} x2="390" y2={55 + r * 70} 
              stroke={leftOrder[l]} strokeWidth="14" strokeLinecap="round" 
              style={{ filter: `drop-shadow(0 0 10px ${leftOrder[l]}80)` }}
            />
          ))}
        </svg>

        {/* Left Side */}
        <div className="flex flex-col justify-between h-full py-2 z-10">
          {leftOrder.map((c, i) => (
            <div key={i} 
              className={`w-12 h-10 rounded-r-full shadow-lg flex items-center justify-center cursor-pointer transition-all ${dragging === i ? 'scale-125' : 'hover:scale-110'}`}
              style={{ background: c, borderLeft: '4px solid rgba(0,0,0,0.3)' }}
              onMouseDown={() => setDragging(i)}
            >
              <div className="w-3 h-3 bg-black/40 rounded-full animate-pulse" />
            </div>
          ))}
        </div>

        {/* Right Side */}
        <div className="flex flex-col justify-between h-full py-2 z-10">
          {rightOrder.map((c, i) => (
            <div key={i} 
              className="w-12 h-10 rounded-l-full shadow-lg flex items-center justify-center cursor-pointer hover:scale-110 transition-all"
              style={{ background: c, borderRight: '4px solid rgba(0,0,0,0.3)' }}
              onMouseUp={() => {
                if (dragging !== null) {
                  const n = { ...connections, [dragging]: i }
                  setConnections(n)
                  checkWin(n)
                  setDragging(null)
                }
              }}
            >
              <div className="w-3 h-3 bg-black/40 rounded-full" />
            </div>
          ))}
        </div>
      </div>

      <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
        <motion.div 
          className="h-full bg-cyan-500" 
          animate={{ width: `${(Object.keys(connections).length / 4) * 100}%` }} 
        />
      </div>
    </div>
  )
}
