import React, { useEffect, useState } from 'react'
import { useAppStore } from '../store.js'
import { getSocket } from '../socket.js'

export default function GameOverView() {
  const { gameResult, playerName, playerColor, returnToLobby, setView } = useAppStore()
  const [countdown, setCountdown] = useState(15)
  const winner = gameResult?.winner

  const isCrew = winner === 'crew'
  const isLeft = winner === null

  const accentColor = isCrew ? '#44ff88' : isLeft ? '#888888' : '#ff4444'
  const bgGradient  = isCrew
    ? 'radial-gradient(ellipse at center, #0a1a2e 0%, #000 70%)'
    : isLeft
    ? 'radial-gradient(ellipse at center, #111 0%, #000 70%)'
    : 'radial-gradient(ellipse at center, #1a0a0a 0%, #000 70%)'

  useEffect(() => {
    const t = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(t)
          handleLobby()
          return 0
        }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [])

  const handleLobby = () => {
    returnToLobby()
  }

  const handleMenu = () => {
    getSocket()?.disconnect()
    setView('menu')
  }

  return (
    <div className="w-screen h-screen flex flex-col items-center justify-center gap-6 relative overflow-hidden"
         style={{ background: bgGradient }}>

      {/* Stars */}
      <div className="absolute inset-0 pointer-events-none">
        {Array.from({ length: 60 }).map((_, i) => (
          <div key={i} className="absolute rounded-full bg-white animate-pulse"
               style={{
                 left: `${Math.random()*100}%`, top: `${Math.random()*100}%`,
                 width: Math.random()*4+1, height: Math.random()*4+1,
                 animationDuration: `${Math.random()*2000+800}ms`,
                 opacity: Math.random()*0.6+0.2,
               }} />
        ))}
      </div>

      {/* Icon */}
      <div className="relative z-10 w-28 h-28 rounded-full flex items-center justify-center text-6xl animate-pulse"
           style={{ backgroundColor: accentColor }}>
        {isLeft ? '🚪' : isCrew ? '✓' : '☠'}
      </div>

      {/* Result */}
      <div className="relative z-10 text-center">
        <h1 className="text-5xl font-black mb-3" style={{ color: accentColor, textShadow: '0 0 30px currentColor' }}>
          {isLeft ? 'Bạn đã rời trận' : isCrew ? 'CREWMATES THẮNG!' : 'IMPOSTOR THẮNG!'}
        </h1>
        {!isLeft && (
          <p className="text-[#cccccc] text-xl">
            {isCrew ? 'Tất cả nhiệm vụ hoàn thành!' : 'Kẻ phản bội đã chiến thắng!'}
          </p>
        )}
      </div>

      {/* Buttons */}
      <div className="relative z-10 flex gap-4">
        <button onClick={handleLobby}
          className="px-8 py-3 rounded-xl font-bold text-black text-lg transition-all hover:scale-105"
          style={{ backgroundColor: accentColor }}>
          ↩ Quay lại phòng
        </button>
        <button onClick={handleMenu}
          className="px-8 py-3 rounded-xl font-bold text-white text-lg bg-[#333] hover:bg-[#555] transition-all hover:scale-105">
          MENU CHÍNH
        </button>
      </div>

      {/* Countdown */}
      <p className="relative z-10 text-[#888] text-sm">
        Tự động quay lại phòng: {countdown}s
      </p>
    </div>
  )
}
