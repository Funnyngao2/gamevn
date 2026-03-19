import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import './FixWiring.css'

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
    <div className="fix-wiring-root">
      <div className="fix-wiring-header">
        <h3 className="fix-wiring-title">HỆ THỐNG ĐIỆN</h3>
        <p className="fix-wiring-subtitle">Nối các dây cùng màu để sửa chữa</p>
      </div>

      <div className="fix-wiring-board">
        <svg className="fix-wiring-svg">
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
        <div className="fix-wiring-column fix-wiring-column-left">
          {leftOrder.map((c, i) => (
            <div key={i} 
              className={`fix-wiring-node fix-wiring-node-left ${dragging === i ? 'fix-wiring-node-active' : ''}`}
              style={{ background: c, borderLeft: '4px solid rgba(0,0,0,0.3)' }}
              onMouseDown={() => setDragging(i)}
            >
              <div className="fix-wiring-node-core fix-wiring-node-core-pulse" />
            </div>
          ))}
        </div>

        {/* Right Side */}
        <div className="fix-wiring-column fix-wiring-column-right">
          {rightOrder.map((c, i) => (
            <div key={i} 
              className="fix-wiring-node fix-wiring-node-right"
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
              <div className="fix-wiring-node-core" />
            </div>
          ))}
        </div>
      </div>

      <div className="fix-wiring-progress-track">
        <motion.div 
          className="fix-wiring-progress-fill" 
          animate={{ width: `${(Object.keys(connections).length / 4) * 100}%` }} 
        />
      </div>
    </div>
  )
}
