import { useState, useEffect } from 'react'

export default function InspectSample({ onDone }) {
  const [phase, setPhase] = useState('idle')
  const [scan, setScan] = useState(0)
  const [lines, setLines] = useState(['> Hệ thống sẵn sàng.', '> Chờ lệnh quét mẫu.'])

  useEffect(() => {
    if (phase !== 'scan') return
    const t = setInterval(() => {
      setScan((s) => {
        if (s >= 100) {
          clearInterval(t)
          setPhase('done')
          setLines((L) => [...L, '> Phân tích hoàn tất.', '> Mẫu hợp lệ — có thể lấy.'])
          return 100
        }
        return s + 3
      })
    }, 90)
    return () => clearInterval(t)
  }, [phase])

  const start = () => {
    if (phase !== 'idle') return
    setPhase('scan')
    setLines(['> Đang hút mẫu sinh học…', '> PCR đang chạy…'])
  }

  const confirm = () => {
    if (phase !== 'done') return
    onDone()
  }

  return (
    <div className="mini-root">
      <header className="mini-head">
        <p className="mini-kicker">Phòng lab</p>
        <h2 className="mini-title">Kiểm tra mẫu</h2>
        <p className="mini-desc">Chạy quét trước khi lấy mẫu ra ngoài.</p>
      </header>
      <div className="mini-body">
        <div className="is-console">
          {lines.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
        <div className="mini-bar-track">
          <div className={`mini-bar-fill ${phase === 'done' ? 'mini-bar-fill--ok' : ''}`} style={{ width: `${scan}%` }} />
        </div>
        <div className="mini-btn-row">
          <button type="button" className="mini-btn mini-btn--primary" disabled={phase !== 'idle'} onClick={start}>
            Bắt đầu quét
          </button>
          <button type="button" className="mini-btn mini-btn--accent" disabled={phase !== 'done'} onClick={confirm}>
            Lấy mẫu
          </button>
        </div>
      </div>
    </div>
  )
}
