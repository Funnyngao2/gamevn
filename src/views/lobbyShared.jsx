import { useMemo } from 'react'

export const COLOR_HEX = {
  red:'#e74c3c', blue:'#3b82f6', green:'#22c55e', orange:'#f97316',
  yellow:'#eab308', pink:'#ec4899', black:'#94a3b8', brown:'#b45309',
  purple:'#a855f7', white:'#f1f5f9',
}

export function normalizeMsg(m) {
  return { senderId: m.sender_id, name: m.sender_name, color: m.sender_color,
           text: m.message, system: !!m.is_system, ts: m.ts }
}

export function SceneBg() {
  const orbs = useMemo(() => [
    { cx:'10%', cy:'15%', r:380, c:'#0ea5e9' },
    { cx:'85%', cy:'75%', r:320, c:'#8b5cf6' },
    { cx:'65%', cy:'8%',  r:240, c:'#06b6d4' },
    { cx:'3%',  cy:'85%', r:200, c:'#6366f1' },
    { cx:'50%', cy:'50%', r:260, c:'#a855f7' },
  ], [])
  const stars = useMemo(() => Array.from({ length: 120 }, (_, i) => ({
    id: i, x: Math.random()*100, y: Math.random()*100,
    s: Math.random()*1.8+0.4, dur: Math.random()*3000+1500,
  })), [])
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute inset-0" style={{ background:'linear-gradient(135deg,#020617 0%,#080d1a 40%,#050b18 100%)' }} />
      {orbs.map((o, i) => (
        <div key={i} className="absolute rounded-full"
          style={{ left:o.cx, top:o.cy, width:o.r*2, height:o.r*2,
                   transform:'translate(-50%,-50%)',
                   background:`radial-gradient(circle,${o.c}14 0%,transparent 70%)`,
                   filter:'blur(60px)' }} />
      ))}
      {stars.map(s => (
        <div key={s.id} className="absolute rounded-full bg-white animate-pulse"
          style={{ left:`${s.x}%`, top:`${s.y}%`, width:s.s, height:s.s,
                   animationDuration:`${s.dur}ms`, opacity:0.15+Math.random()*0.35 }} />
      ))}
    </div>
  )
}

export function ChatLine({ msg, myId }) {
  if (msg.system) return (
    <div className="text-[11px] leading-relaxed py-0.5 flex items-center gap-1.5">
      <span className="font-black px-1.5 py-0.5 rounded-md text-[9px] uppercase tracking-tighter"
        style={{ background: 'rgba(234, 179, 8, 0.15)', color: '#eab308', border: '1px solid rgba(234, 179, 8, 0.3)' }}>
        Hệ thống
      </span>
      <span className="text-white/40 italic">{msg.text}</span>
    </div>
  )
  const isSelf = msg.senderId === myId
  const col = COLOR_HEX[msg.color] || '#888'
  return (
    <div className="text-[13px] leading-relaxed py-0.5">
      <span className="font-extrabold mr-1.5" style={{ color: col }}>{isSelf ? 'Bạn' : msg.name}:</span>
      <span className="text-white/85">{msg.text}</span>
    </div>
  )
}
