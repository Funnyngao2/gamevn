import { useState } from 'react'

const POS = [
  { n: 1, l: '8%', t: '62%' },
  { n: 2, l: '28%', t: '22%' },
  { n: 3, l: '52%', t: '48%' },
  { n: 4, l: '72%', t: '18%' },
  { n: 5, l: '88%', t: '58%' },
]

export default function ChartCourse({ onDone }) {
  const [step, setStep] = useState(1)

  const hit = (n) => {
    if (n !== step) return
    if (n === 5) setTimeout(onDone, 400)
    else setStep(n + 1)
  }

  return (
    <div className="mini-root">
      <header className="mini-head">
        <p className="mini-kicker">Điều hướng</p>
        <h2 className="mini-title">Vẽ lộ trình</h2>
        <p className="mini-desc">Nhấn các mốc theo thứ tự 1 → 5 để nối đường bay.</p>
      </header>
      <div className="mini-body">
        <div className="cc-map">
          {POS.map((p) => (
            <button
              key={p.n}
              type="button"
              className={`cc-point ${p.n < step ? 'cc-point--done' : ''} ${p.n === step ? 'cc-point--next' : ''}`}
              style={{ left: p.l, top: p.t }}
              onClick={() => hit(p.n)}
            >
              {p.n}
            </button>
          ))}
        </div>
        <p className="mini-hint">Mốc hiện tại: {step}</p>
      </div>
    </div>
  )
}
