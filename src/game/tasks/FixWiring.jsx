import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import './FixWiring.css'

export default function FixWiring({ onDone }) {
  const colors = ['#ef4444', '#3b82f6', '#eab308', '#ec4899']
  const [leftOrder]  = useState(() => [...colors].sort(() => Math.random() - 0.5))
  const [rightOrder] = useState(() => [...colors].sort(() => Math.random() - 0.5))
  const [connections, setConnections] = useState({}) // { leftIdx: rightIdx }
  const [dragging, setDragging] = useState(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const boardRef = useRef(null)

  const checkWin = (newConns) => {
    const wins = Object.entries(newConns).filter(([l, r]) => leftOrder[l] === rightOrder[r]).length
    if (wins === 4) {
      setTimeout(onDone, 600)
    }
  }

  const handleMouseMove = (e) => {
    if (dragging === null || !boardRef.current) return
    const rect = boardRef.current.getBoundingClientRect()
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    })
  }

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [dragging])

  return (
    <div className="fix-wiring-root">
      <div className="fix-wiring-header">
        <h3 className="fix-wiring-title">HỆ THỐNG ĐIỆN</h3>
        <p className="fix-wiring-subtitle">Nối các dây cùng màu để sửa chữa</p>
      </div>

      <div className="fix-wiring-board" ref={boardRef}>
        <svg className="fix-wiring-svg">
          {/* Established connections */}
          {Object.entries(connections).map(([l, r]) => (
            <motion.line 
              key={l} 
              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
              x1="60" y1={40 + l * 72} x2="390" y2={40 + r * 72} 
              stroke={leftOrder[l]} strokeWidth="12" strokeLinecap="round" 
              style={{ filter: `drop-shadow(0 0 12px ${leftOrder[l]}80)` }}
            />
          ))}
          {/* Current dragging line */}
          {dragging !== null && (
            <line 
              x1="60" y1={40 + dragging * 72} 
              x2={mousePos.x} y2={mousePos.y} 
              stroke={leftOrder[dragging]} strokeWidth="12" strokeLinecap="round" 
              style={{ filter: `drop-shadow(0 0 12px ${leftOrder[dragging]}80)` }}
            />
          )}
        </svg>

        {/* Left Side */}
        <div className="fix-wiring-column fix-wiring-column-left">
          {leftOrder.map((c, i) => (
            <div key={i} 
              className={`fix-wiring-node fix-wiring-node-left ${dragging === i ? 'fix-wiring-node-active' : ''}`}
              style={{ background: c }}
              onMouseDown={(e) => {
                const rect = boardRef.current.getBoundingClientRect()
                setDragging(i)
                setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
              }}
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
              style={{ background: c }}
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

      <div className="fix-wiring-footer">
        <div className="fix-wiring-progress-track">
          <motion.div 
            className="fix-wiring-progress-fill" 
            animate={{ width: `${(Object.keys(connections).length / 4) * 100}%` }} 
          />
        </div>
        <p className="fix-wiring-hint">Kéo từ trái sang phải để nối dây</p>
      </div>
    </div>
  )
}
