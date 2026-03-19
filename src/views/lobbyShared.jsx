import { useMemo, useEffect, useRef, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'
import { Play, Pause, Mic } from 'lucide-react'
import { PLAYER_COLORS_HEX as COLOR_HEX } from '../config.js'
import './Chat.css'

export { COLOR_HEX }

export function normalizeMsg(m) {
  return { 
    senderId: m.sender_id || m.senderId, 
    name: m.sender_name || m.name, 
    color: m.sender_color || m.color,
    text: m.message || m.text, 
    system: !!(m.is_system || m.system), 
    audio: m.audio_data || m.audioData,
    ts: m.ts 
  }
}

export function SceneBg({ accent }) {
  const orbs = useMemo(() => {
    if (accent) {
      return [
        { cx: '15%', cy: '20%', r: 320, c: accent },
        { cx: '85%', cy: '75%', r: 280, c: accent },
        { cx: '50%', cy: '90%', r: 200, c: accent },
      ]
    }
    return [
      { cx:'10%', cy:'15%', r:380, c:'#0ea5e9' },
      { cx:'85%', cy:'75%', r:320, c:'#8b5cf6' },
      { cx:'65%', cy:'8%',  r:240, c:'#06b6d4' },
      { cx:'3%',  cy:'85%', r:200, c:'#6366f1' },
      { cx:'50%', cy:'50%', r:260, c:'#a855f7' },
    ]
  }, [accent])
  
  const stars = useMemo(() => Array.from({ length: 120 }, (_, i) => ({
    id: i, x: Math.random()*100, y: Math.random()*100,
    s: Math.random()*1.8+0.4, dur: Math.random()*3000+1500,
  })), [])
  
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
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
    <div className="system-message-row">
      <img src="assets/Images/logo/logo.png" alt="logo" className="w-3.5 h-3.5 object-contain" />
      <span className="system-badge">Hệ thống</span>
      <span className="system-text">{msg.text}</span>
    </div>
  )

  const isSelf = msg.senderId === myId
  const col = COLOR_HEX[msg.color] || '#888'

  return (
    <div className={`chat-line-wrapper ${isSelf ? 'self' : 'others'}`}>
      <div className="chat-meta">
        <span className="chat-author-name" style={{ color: col }}>
          {isSelf ? 'Bạn' : msg.name}
        </span>
        <span className="chat-timestamp">{msg.ts || ''}</span>
        {msg.audio && <Mic size={10} className="text-cyan-400/40" />}
      </div>
      
      {msg.audio ? (
        <VoicePlayer audioData={msg.audio} color={col} isSelf={isSelf} />
      ) : (
        <div className={`chat-bubble ${isSelf ? 'self' : 'others'}`}>
          {msg.text}
        </div>
      )}
    </div>
  )
}

function VoicePlayer({ audioData, color, isSelf }) {
  const containerRef = useRef(null)
  const waveRef = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [duration, setDuration] = useState('0:00')

  useEffect(() => {
    if (!containerRef.current) return

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: 'rgba(255,255,255,0.15)',
      progressColor: color,
      cursorColor: 'transparent',
      barWidth: 3,
      barGap: 4,
      barRadius: 4,
      height: 32,
      responsive: true,
      normalize: true,
      partialRender: true,
    })

    ws.load(audioData)
    ws.on('ready', () => {
      setIsReady(true)
      const d = ws.getDuration()
      setDuration(`${Math.floor(d / 60)}:${Math.floor(d % 60).toString().padStart(2, '0')}`)
    })
    ws.on('play', () => setIsPlaying(true))
    ws.on('pause', () => setIsPlaying(false))
    ws.on('finish', () => { setIsPlaying(false); ws.setTime(0) })
    waveRef.current = ws

    return () => ws.destroy()
  }, [audioData, color])

  const togglePlay = () => isReady && waveRef.current?.playPause()

  return (
    <div className={`voice-player-bubble ${isSelf ? 'self' : 'others'}`}>
      <div className="voice-controls">
        <button 
          onClick={togglePlay}
          disabled={!isReady}
          className="btn-play-voice"
          style={{ color: color }}
        >
          {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
        </button>
        <div ref={containerRef} className="voice-waveform-container" />
      </div>
      <div className="voice-info-footer">
        <span className="voice-tag">Voice Message</span>
        <span className="voice-duration">{duration}</span>
      </div>
    </div>
  )
}
