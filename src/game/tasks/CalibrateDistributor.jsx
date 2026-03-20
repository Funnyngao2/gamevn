import { useState, useEffect, useRef } from 'react'

const NEED = 3
const ZONE = { lo: 38, hi: 62 }

export default function CalibrateDistributor({ onDone }) {
  const [pos, setPos] = useState(0)
  const [hits, setHits] = useState(0)
  const start = useRef(performance.now())

  useEffect(() => {
    let raf
    const loop = () => {
      const t = (performance.now() - start.current) / 2600
      const x = (Math.sin(t * Math.PI * 2) * 0.5 + 0.5) * 100
      setPos(x)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  const click = () => {
    if (hits >= NEED) return
    if (pos >= ZONE.lo && pos <= ZONE.hi) {
      const n = hits + 1
      setHits(n)
      if (n >= NEED) setTimeout(onDone, 400)
    }
  }

  return (
    <div className="mini-root">
      <header className="mini-head">
        <p className="mini-kicker">Điện</p>
        <h2 className="mini-title">Hiệu chỉnh bộ phân phối</h2>
        <p className="mini-desc">Bấm khi điểm đỏ nằm trong vùng xanh. Cần {NEED} lần chính xác.</p>
      </header>
      <div className="mini-body">
        <div className="cd-scan">
          <div className="cd-scan-zone" />
          <div className="cd-scan-dot" style={{ left: `${pos}%` }} />
        </div>
        <button type="button" className="mini-btn mini-btn--primary cd-hit" onClick={click}>
          Chụp ({hits}/{NEED})
        </button>
        <p className="mini-hint">Điểm dao động — canh thời điểm.</p>
      </div>
    </div>
  )
}
