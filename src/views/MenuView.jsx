import React, { useState, useEffect } from 'react'
import { useAppStore } from '../store.js'

const COLORS = ['red','blue','green','orange','yellow','pink','black','brown','purple','white']

const COLOR_HEX = {
  red:'#e74c3c', blue:'#3b82f6', green:'#22c55e', orange:'#f97316',
  yellow:'#eab308', pink:'#ec4899', black:'#6b7280', brown:'#92400e',
  purple:'#a855f7', white:'#e2e8f0',
}

export default function MenuView() {
  const { playerName, playerColor, setProfile, setView } = useAppStore()
  const [name,  setName]  = useState(playerName)
  const [color, setColor] = useState(playerColor)

  const confirm = () => {
    if (!name.trim()) return
    setProfile(name.trim(), color)
    setView('lobby')
  }

  return (
    <div className="w-screen h-screen flex items-center justify-center relative overflow-hidden"
         style={{ background: 'radial-gradient(ellipse at 20% 30%, #0a1535 0%, #000008 60%)' }}>

      {/* Stars */}
      <Stars />

      {/* Panel */}
      <div className="relative z-10 w-[440px] rounded-2xl border border-[#1e3a5f] bg-[#080c1a]/95 p-8 shadow-2xl">
        {/* Accent top line */}
        <div className="absolute top-0 left-10 right-10 h-[2px] rounded-full bg-[#4ecdc4]/80" />

        {/* Logo */}
        <div className="text-center mb-6">
          <img src="/assets/Images/logo/logo.png" alt="logo"
               className="mx-auto h-14 object-contain"
               onError={e => { e.target.style.display='none' }} />
          <p className="text-[#4ecdc4] text-xs tracking-[4px] mt-1">Web Edition</p>
        </div>

        <hr className="border-[#1e3a5f] mb-5" />

        {/* Color picker */}
        <p className="text-center text-[#94a3b8] text-xs font-bold tracking-[3px] mb-3">
          CHỌN MÀU NHÂN VẬT
        </p>
        <div className="grid grid-cols-5 gap-3 mb-6">
          {COLORS.map(c => (
            <button key={c} onClick={() => setColor(c)}
              className="flex flex-col items-center gap-1 group">
              <div className="relative w-10 h-10 rounded-full transition-transform group-hover:scale-110"
                   style={{ backgroundColor: COLOR_HEX[c],
                            boxShadow: color === c ? `0 0 0 3px white, 0 0 0 5px ${COLOR_HEX[c]}` : 'none' }}>
                {color === c && (
                  <span className="absolute inset-0 flex items-center justify-center text-black font-bold text-sm">✓</span>
                )}
              </div>
              <span className="text-[10px] text-[#64748b] capitalize">{c}</span>
            </button>
          ))}
        </div>

        {/* Name input */}
        <div className="relative mb-5">
          <input
            type="text"
            maxLength={12}
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && confirm()}
            placeholder="Nhập tên nhân vật..."
            className="w-full bg-[#0d1b2a] border border-[#1e3a5f] rounded-lg px-4 py-3 text-white
                       placeholder-[#334155] text-base outline-none focus:border-[#4ecdc4] focus:ring-1
                       focus:ring-[#4ecdc4] transition-colors"
            autoFocus
          />
        </div>

        {/* Confirm button */}
        <button onClick={confirm}
          disabled={!name.trim()}
          className="w-full py-3 rounded-xl font-bold text-white text-lg tracking-wide transition-all
                     bg-[#0d9488] hover:bg-[#2dd4bf] hover:text-black disabled:opacity-40 disabled:cursor-not-allowed">
          Xác nhận →
        </button>
      </div>
    </div>
  )
}

function Stars() {
  const stars = Array.from({ length: 150 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    r: Math.random() * 1.5 + 0.5,
    dur: Math.random() * 2000 + 1000,
  }))
  return (
    <div className="absolute inset-0 pointer-events-none">
      {stars.map(s => (
        <div key={s.id}
          className="absolute rounded-full bg-white animate-pulse"
          style={{
            left: `${s.x}%`, top: `${s.y}%`,
            width: s.r * 2, height: s.r * 2,
            animationDuration: `${s.dur}ms`,
            opacity: Math.random() * 0.7 + 0.2,
          }} />
      ))}
    </div>
  )
}
