import { useMemo, useState } from 'react'

export default function AlignOutput({ onDone }) {
  const target = useMemo(() => 35 + Math.floor(Math.random() * 30), [])
  const zoneW = 18
  const [val, setVal] = useState(50)

  const inZone = val >= target && val <= target + zoneW

  const submit = () => {
    if (inZone) onDone()
  }

  return (
    <div className="mini-root">
      <header className="mini-head">
        <p className="mini-kicker">Động cơ</p>
        <h2 className="mini-title">Căn chỉnh đầu ra</h2>
        <p className="mini-desc">Kéo thanh trượt sao cho vạch đỏ nằm trong vùng xanh.</p>
      </header>
      <div className="mini-body">
        <div className="al-track">
          <div className="al-zone" style={{ left: `${target}%`, width: `${zoneW}%` }} />
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={val}
          className="al-slider"
          onChange={(e) => setVal(Number(e.target.value))}
        />
        <p className="mini-hint">{inZone ? '✓ Đã khớp — có thể khóa.' : '…Đang lệch pha'}</p>
        <button type="button" className="mini-btn mini-btn--accent" disabled={!inZone} onClick={submit}>
          Khóa căn chỉnh
        </button>
      </div>
    </div>
  )
}
