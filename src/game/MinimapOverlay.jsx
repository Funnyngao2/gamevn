import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'

// Map world size (từ Phaser tilemap)
const MAP_W = 6720
const MAP_H = 3840

const COLOR_HEX = {
  red:'#e74c3c', blue:'#3b82f6', green:'#22c55e', orange:'#f97316',
  yellow:'#eab308', pink:'#ec4899', black:'#94a3b8', brown:'#b45309',
  purple:'#a855f7', white:'#f1f5f9',
}

function worldToMap(wx, wy, w, h) {
  return { x: (wx / MAP_W) * w, y: (wy / MAP_H) * h }
}

export default function MinimapOverlay({ gameRef }) {
  const [expanded, setExpanded]   = useState(false)
  const [mapData,  setMapData]    = useState(null)
  const rafRef = useRef(null)

  // Poll game registry mỗi frame
  const poll = useCallback(() => {
    const reg = gameRef?.current?.registry
    if (reg) {
      const d = reg.get('minimapData')
      if (d) setMapData(d)
    }
    rafRef.current = requestAnimationFrame(poll)
  }, [gameRef])

  useEffect(() => {
    rafRef.current = requestAnimationFrame(poll)
    return () => cancelAnimationFrame(rafRef.current)
  }, [poll])

  // Phím M toggle
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'm' || e.key === 'M') setExpanded(v => !v) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!mapData) return null

  const { localPlayer, remotePlayers, tasks, isImposter } = mapData

  // Kích thước minimap
  const miniW = 220, miniH = 130
  const fullW = Math.min(window.innerWidth * 0.55, 700)
  const fullH = fullW * (MAP_H / MAP_W)

  const W = expanded ? fullW : miniW
  const H = expanded ? fullH : miniH

  return (
    <div style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 30, userSelect: 'none' }}>
      <motion.div
        animate={{ width: W, height: H }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        style={{
          borderRadius: expanded ? 16 : 10,
          overflow: 'hidden',
          border: '1.5px solid rgba(255,255,255,0.15)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          background: '#0a0f1a',
          position: 'relative',
          cursor: 'pointer',
        }}
        onClick={() => setExpanded(v => !v)}
      >
        {/* Map image */}
        <img
          src="assets/Maps/mini_map3.png"
          alt="map"
          style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block', opacity: 0.85 }}
          draggable={false}
        />

        {/* SVG overlay — dots & tasks */}
        <svg
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}
          viewBox={`0 0 ${W} ${H}`}
        >
          {/* Task dots (crewmate only) */}
          {!isImposter && tasks?.map((t, i) => {
            const p = worldToMap(t.x, t.y, W, H)
            return (
              <g key={i}>
                <rect
                  x={p.x - 4} y={p.y - 4} width={8} height={8}
                  fill={t.done ? '#22c55e' : '#facc15'}
                  opacity={t.done ? 0.6 : 0.95}
                  rx={1}
                />
                {!t.done && expanded && (
                  <text x={p.x} y={p.y - 7} textAnchor="middle"
                    fontSize={9} fill="#facc15" fontFamily="Arial" opacity={0.8}>
                    {t.label}
                  </text>
                )}
              </g>
            )
          })}

          {/* Remote players */}
          {remotePlayers?.map((rp, i) => {
            const p = worldToMap(rp.x, rp.y, W, H)
            const hex = COLOR_HEX[rp.color] || '#fff'
            const r = expanded ? 5 : 3.5
            return (
              <g key={rp.id || i}>
                <circle cx={p.x} cy={p.y} r={r + 2} fill={hex} opacity={0.2} />
                <circle cx={p.x} cy={p.y} r={r} fill={rp.alive ? hex : '#4466ff'} opacity={rp.alive ? 0.9 : 0.5} />
                {expanded && (
                  <text x={p.x} y={p.y - r - 3} textAnchor="middle"
                    fontSize={9} fill={hex} fontFamily="Arial" fontWeight="bold">
                    {rp.name}
                  </text>
                )}
              </g>
            )
          })}

          {/* Local player — luôn trắng với ring */}
          {localPlayer && (() => {
            const p = worldToMap(localPlayer.x, localPlayer.y, W, H)
            const r = expanded ? 6 : 4
            return (
              <g>
                <circle cx={p.x} cy={p.y} r={r + 4} fill="white" opacity={0.15} />
                <circle cx={p.x} cy={p.y} r={r + 2} fill="none" stroke="white" strokeWidth={1.5} opacity={0.6} />
                <circle cx={p.x} cy={p.y} r={r} fill="white" opacity={1} />
                {expanded && (
                  <text x={p.x} y={p.y - r - 4} textAnchor="middle"
                    fontSize={10} fill="white" fontFamily="Arial" fontWeight="bold">
                    Bạn
                  </text>
                )}
              </g>
            )
          })()}
        </svg>

        {/* Label */}
        <div style={{
          position: 'absolute', top: 5, left: 8,
          color: 'rgba(255,255,255,0.5)', fontSize: 9,
          fontFamily: 'Arial', fontWeight: 700, letterSpacing: '0.1em',
          textTransform: 'uppercase', pointerEvents: 'none',
        }}>
          {expanded ? 'BẢN ĐỒ  [M]' : '[M]'}
        </div>

        {/* Expand icon */}
        <div style={{
          position: 'absolute', top: 4, right: 6,
          color: 'rgba(255,255,255,0.35)', fontSize: 11, pointerEvents: 'none',
        }}>
          {expanded ? '✕' : '⛶'}
        </div>
      </motion.div>
    </div>
  )
}
