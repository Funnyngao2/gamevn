import { useMemo, useState } from 'react'

export default function UnlockManifolds({ onDone }) {
  const order = useMemo(() => {
    const a = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }, [])
  const [next, setNext] = useState(1)
  const [bad, setBad] = useState(null)

  const press = (n) => {
    if (n === next) {
      if (next === 10) {
        setTimeout(onDone, 350)
      } else setNext(next + 1)
    } else {
      setBad(n)
      setTimeout(() => setBad(null), 400)
    }
  }

  return (
    <div className="mini-root">
      <header className="mini-head">
        <p className="mini-kicker">Van an toàn</p>
        <h2 className="mini-title">Mở khóa ống dẫn</h2>
        <p className="mini-desc">Nhấn các số theo thứ tự từ 1 đến 10.</p>
      </header>
      <div className="mini-body">
        <div className="um-grid">
          {order.map((n) => (
            <button
              key={n}
              type="button"
              className={`um-cell ${n < next ? 'um-cell--ok' : ''} ${bad === n ? 'um-cell--bad' : ''}`}
              onClick={() => press(n)}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="mini-hint">Tiếp theo: {next}</p>
      </div>
    </div>
  )
}
