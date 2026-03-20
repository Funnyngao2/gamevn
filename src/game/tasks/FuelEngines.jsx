import { useRef, useState, useEffect } from 'react'

export default function FuelEngines({ onDone }) {
  const [level, setLevel] = useState(0)
  const [locked, setLocked] = useState(false)
  const holding = useRef(false)
  const finished = useRef(false)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  useEffect(() => {
    let raf
    const tick = () => {
      setLevel((lv) => {
        if (finished.current) return lv
        if (holding.current) {
          const n = Math.min(100, lv + 2.2)
          if (n >= 100) {
            finished.current = true
            holding.current = false
            setLocked(true)
            setTimeout(() => onDoneRef.current?.(), 400)
            return 100
          }
          return n
        }
        return Math.max(0, lv - 0.35)
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="mini-root">
      <header className="mini-head">
        <p className="mini-kicker">Động cơ</p>
        <h2 className="mini-title">Nạp nhiên liệu</h2>
        <p className="mini-desc">Giữ nút để bơm đầy bình. Thả tay sẽ làm mức giảm dần.</p>
      </header>
      <div className="mini-body">
        <div className="fe-tank">
          <div className="fe-tank-fill" style={{ height: `${level}%` }} />
        </div>
        <button
          type="button"
          className="mini-btn fe-hold"
          style={{
            background: 'linear-gradient(180deg,#c2410c,#ea580c)',
            color: '#fff',
            boxShadow: '0 8px 24px rgba(234,88,12,0.35)',
          }}
          disabled={locked}
          onMouseDown={() => {
            if (!finished.current) holding.current = true
          }}
          onMouseUp={() => {
            holding.current = false
          }}
          onMouseLeave={() => {
            holding.current = false
          }}
          onTouchStart={(e) => {
            e.preventDefault()
            if (!finished.current) holding.current = true
          }}
          onTouchEnd={() => {
            holding.current = false
          }}
        >
          Giữ để nạp
        </button>
        <p className="mini-hint">{Math.round(level)}% — cần đạt 100%</p>
      </div>
    </div>
  )
}
