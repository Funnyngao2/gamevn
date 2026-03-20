import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * LightsDarkOverlay — React overlay thay thế Phaser Graphics cho hiệu ứng tắt đèn.
 * Đọc tọa độ screen của player từ registry (lightsDarkData) và vẽ bằng CSS radial-gradient.
 */
export default function LightsDarkOverlay({ gameRef }) {
  const [data, setData] = useState(null)
  const rafRef = useRef(null)

  const poll = useCallback(() => {
    const reg = gameRef?.current?.registry
    if (reg) setData(reg.get('lightsDarkData') ?? null)
    rafRef.current = requestAnimationFrame(poll)
  }, [gameRef])

  useEffect(() => {
    rafRef.current = requestAnimationFrame(poll)
    return () => cancelAnimationFrame(rafRef.current)
  }, [poll])

  if (!data?.active) return null

  const { sx, sy } = data
  // radial-gradient: vùng sáng nhỏ quanh player, mờ dần ra ngoài rồi tối hoàn toàn
  const gradient = `radial-gradient(circle at ${sx}px ${sy}px,
    transparent 0px,
    transparent 80px,
    rgba(0,0,0,0.55) 130px,
    rgba(0,0,0,0.82) 180px,
    rgba(0,0,0,0.93) 240px,
    rgba(0,0,0,0.96) 320px
  )`

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 15,
        background: gradient,
        pointerEvents: 'none',
      }}
    />
  )
}
