import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import './MinimapOverlay.css'

const MAP_W_DEFAULT = 6720
const MAP_H_DEFAULT = 3840

function worldToMap(wx, wy, w, h, mapW, mapH) {
  const W = Number(mapW ?? MAP_W_DEFAULT)
  const H = Number(mapH ?? MAP_H_DEFAULT)
  const X = Number(wx)
  const Y = Number(wy)

  if (!isFinite(W) || !isFinite(H) || !isFinite(X) || !isFinite(Y)) {
    return { x: w / 2, y: h / 2 }
  }

  const nx = (X / W) * w
  const ny = (Y / H) * h

  // Clamp để tránh trường hợp điểm bị lệch ra ngoài viewBox (do scale/coord mismatch)
  return {
    x: Math.max(0, Math.min(w, nx)),
    y: Math.max(0, Math.min(h, ny)),
  }
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

  const { localPlayer, tasks, mapW, mapH, sabotage } = mapData
  const worldW = mapW ?? MAP_W_DEFAULT
  const worldH = mapH ?? MAP_H_DEFAULT

  // Kích thước minimap (tỉ lệ theo map thật)
  const miniW = 220, miniH = 130
  const fullW = Math.min(window.innerWidth * 0.55, 700)
  const fullH = fullW * (worldH / worldW)

  const W = expanded ? fullW : miniW
  const H = expanded ? fullH : miniH

  return (
    <div className="minimap-root">
      <motion.div
        animate={{ width: W, height: H }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="minimap-panel"
        style={{ borderRadius: expanded ? 16 : 10 }}
        onClick={() => setExpanded(v => !v)}
      >
        {/* Map image */}
        <img
          src="assets/Maps/mini_map3.png"
          alt="map"
          className="minimap-image"
          draggable={false}
        />

        {/* SVG overlay — dots & tasks */}
        <svg
          className="minimap-svg"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
        >
          {/* Sabotage Markers (Reactor / Lights) */}
          {sabotage?.reactor && sabotage.reactorFixPoint && (() => {
            const p = worldToMap(sabotage.reactorFixPoint.x, sabotage.reactorFixPoint.y, W, H, worldW, worldH)
            return (
              <motion.g key="sab-reac"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}>
                <circle cx={p.x} cy={p.y} r={expanded ? 12 : 8} fill="#ef4444" opacity={0.2} />
                <circle cx={p.x} cy={p.y} r={expanded ? 8 : 5} fill="#ef4444" stroke="white" strokeWidth={1} />
                <text x={p.x} y={p.y + (expanded ? 18 : 12)} textAnchor="middle" fontSize={expanded ? 10 : 7} fill="#ef4444" fontWeight="bold">⚠ REACTOR</text>
              </motion.g>
            )
          })()}

          {sabotage?.lights && sabotage.lightsFixPoint && (() => {
            const p = worldToMap(sabotage.lightsFixPoint.x, sabotage.lightsFixPoint.y, W, H, worldW, worldH)
            return (
              <motion.g key="sab-lights"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}>
                <circle cx={p.x} cy={p.y} r={expanded ? 10 : 7} fill="#f59e0b" opacity={0.2} />
                <circle cx={p.x} cy={p.y} r={expanded ? 7 : 4} fill="#f59e0b" stroke="white" strokeWidth={1} />
                <text x={p.x} y={p.y + (expanded ? 18 : 12)} textAnchor="middle" fontSize={expanded ? 10 : 7} fill="#f59e0b" fontWeight="bold">⚠ LIGHTS</text>
              </motion.g>
            )
          })()}

          {/* Task hotspots — crew thật; impostor chỉ thấy nhiệm vụ giả (taskList cục bộ) */}
          {tasks?.map((t, i) => {
            const p = worldToMap(t.x, t.y, W, H, worldW, worldH)
            const size = expanded ? 6 : 5
            const isDone = t.done
            return (
              <g key={i} className={isDone ? 'minimap-task-done' : 'minimap-task-pending'}>
                {/* Outer glow */}
                <circle cx={p.x} cy={p.y} r={size + 4}
                  fill={isDone ? '#22c55e' : '#facc15'}
                  opacity={isDone ? 0.2 : 0.35}
                />
                <circle cx={p.x} cy={p.y} r={size + 2}
                  fill={isDone ? '#22c55e' : '#facc15'}
                  opacity={isDone ? 0.4 : 0.5}
                />
                {/* Pin body */}
                <circle cx={p.x} cy={p.y} r={size}
                  fill={isDone ? '#16a34a' : '#eab308'}
                  stroke={isDone ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.6)'}
                  strokeWidth={1}
                />
                {/* Inner dot */}
                <circle cx={p.x} cy={p.y} r={size * 0.4}
                  fill="rgba(255,255,255,0.9)"
                />
                {!isDone && expanded && (
                  <text x={p.x} y={p.y - size - 5} textAnchor="middle"
                    fontSize={9} fill="#fef08a" fontFamily="Arial" fontWeight="600"
                    stroke="rgba(0,0,0,0.6)" strokeWidth={2} paintOrder="stroke">
                    {t.label}
                  </text>
                )}
              </g>
            )
          })}

          {/* Chỉ hiển thị bản thân — không vẽ người chơi khác */}
          {/* Local player — luôn trắng với ring */}
          {localPlayer && (() => {
            const p = worldToMap(localPlayer.x, localPlayer.y, W, H, worldW, worldH)
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
        <div className="minimap-label">
          {expanded ? 'BẢN ĐỒ  [M]' : '[M]'}
        </div>

        {/* Expand icon */}
        <div className="minimap-expand-icon">
          {expanded ? '✕' : '⛶'}
        </div>
      </motion.div>
    </div>
  )
}
