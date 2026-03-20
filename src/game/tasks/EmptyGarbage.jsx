import { useState } from 'react'

const ITEMS = ['🍌', '📦', '🥤', '🗞️', '🧴']

export default function EmptyGarbage({ onDone }) {
  const [gone, setGone] = useState(() => new Set())

  const dump = (i) => {
    if (gone.has(i)) return
    const next = new Set(gone)
    next.add(i)
    setGone(next)
    if (next.size >= ITEMS.length) setTimeout(onDone, 350)
  }

  return (
    <div className="mini-root">
      <header className="mini-head">
        <p className="mini-kicker">Kho phe lieu</p>
        <h2 className="mini-title">Don rac</h2>
        <p className="mini-desc">Nhan tung mon de day xuong ong xa.</p>
      </header>
      <div className="mini-body">
        <div className="mg-chute">
          <span className="mg-chute-label">Ong xa - O2 / Storage</span>
          <div className="mg-items">
            {ITEMS.map((emoji, i) => (
              <button
                key={i}
                type="button"
                className={`mg-item ${gone.has(i) ? 'mg-item--gone' : ''}`}
                onClick={() => dump(i)}
                aria-label={`Do rac ${i + 1}`}
              >
                {gone.has(i) ? '' : emoji}
              </button>
            ))}
          </div>
        </div>
        <p className="mini-hint">
          {gone.size}/{ITEMS.length} da xu ly
        </p>
      </div>
    </div>
  )
}
