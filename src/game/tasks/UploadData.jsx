import { useState } from 'react'

export default function UploadData({ onDone }) {
  const [sending, setSending] = useState(false)
  const [pct, setPct] = useState(0)

  const start = () => {
    if (sending) return
    setSending(true)
    let p = 0
    const t = setInterval(() => {
      p += 4 + Math.random() * 6
      if (p >= 100) {
        clearInterval(t)
        setPct(100)
        setTimeout(onDone, 450)
      } else setPct(Math.min(99, p))
    }, 120)
  }

  return (
    <div className="mini-root">
      <header className="mini-head">
        <p className="mini-kicker">Trạm dữ liệu</p>
        <h2 className="mini-title">Gửi tệp an toàn</h2>
        <p className="mini-desc">Chọn nội dung cần đồng bộ lên máy chủ trung tâm.</p>
      </header>
      <div className="mini-body">
        <div className="mu-files">
          {[
            { icon: '📋', name: 'NHẬT_KÝ_ĐIỆN.log', size: '24 KB' },
            { icon: '📡', name: 'RADAR_SNAPSHOT.bin', size: '1.2 MB' },
            { icon: '🔐', name: 'KHÓA_phiên.key', size: '512 B' },
          ].map((f) => (
            <label key={f.name} className="mu-file">
              <input type="checkbox" defaultChecked />
              <span className="mu-file-icon">{f.icon}</span>
              <span className="mu-file-meta">
                <span className="mu-file-name">{f.name}</span>
                <span className="mu-file-size">{f.size}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="mini-bar-track">
          <div className="mini-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <p className="mini-hint">{sending ? 'Đang tải lên…' : 'Nhấn để bắt đầu gửi.'}</p>
        <button type="button" className="mini-btn mini-btn--primary" disabled={sending} onClick={start}>
          Gửi dữ liệu
        </button>
      </div>
    </div>
  )
}
