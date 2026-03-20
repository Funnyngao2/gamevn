import { useMemo, useState } from 'react'

export default function PrimeShields({ onDone }) {
  const need = useMemo(() => {
    const set = new Set()
    while (set.size < 4) set.add(Math.floor(Math.random() * 6))
    return set
  }, [])
  const [picked, setPicked] = useState(() => new Set())

  const activate = (i) => {
    if (!need.has(i) || picked.has(i)) return
    const next = new Set(picked)
    next.add(i)
    setPicked(next)
    let ok = true
    need.forEach((j) => {
      if (!next.has(j)) ok = false
    })
    if (ok) setTimeout(onDone, 400)
  }

  return (
    <div className="mini-root">
      <header className="mini-head">
        <p className="mini-kicker">Khiên tàu</p>
        <h2 className="mini-title">Kích hoạt khiên</h2>
        <p className="mini-desc">Bật tất cả tấm lục giác được tô sáng (vàng).</p>
      </header>
      <div className="mini-body">
        <div className="ps-grid">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <button
              key={i}
              type="button"
              className={`ps-hex ${need.has(i) ? 'ps-hex--on ps-hex--need' : ''} ${picked.has(i) ? 'ps-hex--picked' : ''}`}
              onClick={() => activate(i)}
              aria-label={`Khiên ${i + 1}`}
            />
          ))}
        </div>
        <p className="mini-hint">{picked.size}/{need.size} sector đã kích hoạt</p>
      </div>
    </div>
  )
}
