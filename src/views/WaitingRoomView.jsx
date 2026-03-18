import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { 
  CheckCircle2, 
  Hand, 
  Play, 
  LogOut, 
  Crown, 
  Users, 
  Hash, 
  MessageSquare, 
  Rocket, 
  Check,
  Plus
} from 'lucide-react'
import { AVATAR_MAP } from './MenuView.jsx'
import { COLOR_HEX, SceneBg, ChatLine, normalizeMsg } from './lobbyShared.jsx'
import './WaitingRoomView.css'

export default function WaitingRoomView({ room, isHost, socketId, socket, onLeave, onReady, onStart, onError, error }) {
  const [activeTab, setActiveTab] = useState('room')
  const [roomMsgs,  setRoomMsgs]  = useState([])
  const [lobbyMsgs, setLobbyMsgs] = useState([])
  const [chatInput, setChatInput] = useState('')
  const chatEndRef = useRef(null)
  const myUUID = localStorage.getItem('playerUUID')

  useEffect(() => {
    if (!socket) return
    socket.off('roomChat');    socket.on('roomChat',   d => setRoomMsgs(p  => [...p.slice(-99), d]))
    socket.off('lobbyChat');   socket.on('lobbyChat',  d => setLobbyMsgs(p => [...p.slice(-99), d]))
    socket.off('chatHistory'); socket.on('chatHistory', d => {
      if (d.channel === 'room')  setRoomMsgs(d.messages.map(normalizeMsg))
      if (d.channel === 'lobby') setLobbyMsgs(d.messages.map(normalizeMsg))
    })
    socket.emit('getChatHistory', { channel: 'room',  roomId: room.id })
    socket.emit('getChatHistory', { channel: 'lobby' })
    return () => { socket.off('roomChat'); socket.off('lobbyChat'); socket.off('chatHistory') }
  }, [socket, room.id])

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [roomMsgs, lobbyMsgs, activeTab])

  const sendChat = () => {
    const t = chatInput.trim(); if (!t) return
    socket.emit(activeTab === 'room' ? 'roomChat' : 'lobbyChat', { text: t }); setChatInput('')
  }

  const myPlayer = room.players?.find(p => p.id === socketId)
  const isReady  = myPlayer?.ready || false
  const nonHost  = room.players?.filter(p => p.id !== room.host) || []
  const allReady = nonHost.length > 0 && nonHost.every(p => p.ready)
  const canStart = (room.players?.length || 0) >= 2 && allReady
  const msgs     = activeTab === 'room' ? roomMsgs : lobbyMsgs

  return (
    <motion.div className="waiting-room-container"
      initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}>
      <SceneBg />

      {/* Header */}
      <motion.div className="waiting-header"
        initial={{ y:-16, opacity:0 }} animate={{ y:0, opacity:1 }}>
        <div className="flex items-center gap-3">
          <img src="assets/Images/logo/logo.png" alt="logo" className="header-logo-img"
            style={{ height:36 }} />
          <div>
            <p className="text-white text-sm font-black tracking-[5px] leading-none">MOONIVERSE</p>
            <p className="text-cyan-400 text-[8px] tracking-[3px] opacity-70">AMONG US · MOONGROUP</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="room-info-badge flex items-center gap-2">
            <Users size={12} className="opacity-50" />
            <span>{room.name} · {room.players?.length}/{room.maxPlayers}</span>
          </div>
          <div className="flex items-center gap-1 text-white/20 text-[10px] font-mono">
            <Hash size={10} />
            <span>{room.id?.slice(-6).toUpperCase()}</span>
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {error && (
          <motion.div initial={{ y:-20, opacity:0 }} animate={{ y:0, opacity:1 }} exit={{ y:-20, opacity:0 }}
            className="error-toast mx-auto mt-2">
            ⚠ {error}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="waiting-main-layout relative z-10 flex flex-1 gap-4 px-5 py-4 overflow-hidden min-h-0" style={{ paddingBottom:80 }}>

        {/* Player grid */}
        <motion.div initial={{ x:-20, opacity:0 }} animate={{ x:0, opacity:1 }} transition={{ delay:0.1 }}
          className="player-grid-container">
          <div className="player-grid-header">
            <Rocket size={14} className="text-cyan-400" />
            <span className="text-white font-bold">{room.name}</span>
            <span className="text-cyan-400/60 text-xs ml-1">{room.players?.length}/{room.maxPlayers}</span>
            {isHost && (
              <span className="host-badge flex items-center gap-1 ml-auto">
                <Crown size={10} fill="currentColor" /> Chủ phòng
              </span>
            )}
          </div>
          <div className="player-grid">
            {Array.from({ length: room.maxPlayers }).map((_, i) => {
              const p = room.players?.[i]
              const pHex = COLOR_HEX[p?.color] || '#888'
              const playerStyles = p ? {
                background: `linear-gradient(160deg,${pHex}12,rgba(255,255,255,0.04))`,
                border: `1px solid ${p?.ready ? pHex+'60' : pHex+'25'}`,
                boxShadow: p?.ready ? `0 0 20px ${pHex}20` : 'none',
              } : {
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.04)'
              }

              return (
                <motion.div key={i}
                  initial={{ scale:0.85, opacity:0 }} animate={{ scale:1, opacity:1 }}
                  transition={{ delay: i * 0.05 }}
                  className="player-card"
                  style={playerStyles}>
                  {p ? (
                    <>
                      <div className="player-avatar-container"
                        style={{ border:`2px solid ${pHex}50`, boxShadow:`0 0 12px ${pHex}30` }}>
                        <img src={`assets/Images/avatar/${AVATAR_MAP[p.color] || 'nam1.png'}`} alt=""
                          className="w-full h-full object-cover" />
                      </div>
                      <p className="text-white text-[10px] font-bold text-center truncate w-full leading-tight flex items-center justify-center gap-1">
                        {p.name}
                        {p.id === room.host && <Crown size={8} fill="currentColor" className="text-yellow-500" />}
                        {p.id === socketId && <span className="text-cyan-400">✦</span>}
                      </p>
                      <span className={`player-status-badge flex items-center gap-1 ${p.ready ? 'text-cyan-400' : 'text-white/30'}`}
                        style={{
                          background: p.ready ? 'rgba(6,182,212,0.15)' : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${p.ready ? 'rgba(6,182,212,0.35)' : 'rgba(255,255,255,0.06)'}`,
                        }}>
                        {p.ready ? <Check size={8} /> : null}
                        {p.ready ? 'Sẵn sàng' : 'Chờ...'}
                      </span>
                    </>
                  ) : (
                    <div className="empty-slot">
                      <div className="empty-slot-plus">
                        <Plus size={14} className="text-white/10" />
                      </div>
                      <span className="text-white/15 text-[9px]">Trống</span>
                    </div>
                  )}
                </motion.div>
              )
            })}
          </div>
        </motion.div>

        {/* Chat panel */}
        <motion.div initial={{ x:20, opacity:0 }} animate={{ x:0, opacity:1 }} transition={{ delay:0.15 }}
          className="chat-panel">
          <div className="chat-tabs">
            {['room','lobby'].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className="chat-tab-btn flex items-center justify-center gap-1.5"
                style={{
                  color: activeTab === tab ? '#06b6d4' : 'rgba(255,255,255,0.25)',
                  borderBottom: activeTab === tab ? '2px solid #06b6d4' : '2px solid transparent',
                  background: activeTab === tab ? 'rgba(6,182,212,0.05)' : 'transparent',
                }}>
                {tab === 'room' ? <Rocket size={10} /> : <MessageSquare size={10} />}
                {tab === 'room' ? 'PHÒNG' : 'LOBBY'}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5 min-h-0">
            {msgs.length === 0 && (
              <p className="text-white/15 text-xs italic text-center mt-4">Chưa có tin nhắn...</p>
            )}
            {msgs.map((m, i) => <ChatLine key={i} msg={m} myId={myUUID} />)}
            <div ref={chatEndRef} />
          </div>
          <div className="chat-input-section">
            <input value={chatInput} onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendChat()}
              placeholder="Nhắn tin..."
              className="flex-1 bg-transparent text-white text-xs placeholder-white/20 outline-none" />
            <button onClick={sendChat} className="chat-send-btn-small">➤</button>
          </div>
        </motion.div>
      </div>

      {/* Bottom action bar */}
      <div className="action-bar">
        {!isHost && (
          <div className="host-controls"> {/* Dùng chung class để đồng bộ layout */}
            <motion.button whileHover={{ scale:1.02 }} whileTap={{ scale:0.96 }} onClick={() => onReady(!isReady)}
              className="btn-action-primary flex items-center justify-center gap-2"
              style={{
                background: isReady ? 'linear-gradient(135deg,#06b6d4,#8b5cf6)' : 'rgba(255,255,255,0.07)',
                color: isReady ? '#000' : 'rgba(255,255,255,0.7)',
                border: `1px solid ${isReady ? 'transparent' : 'rgba(255,255,255,0.12)'}`,
                boxShadow: isReady ? '0 4px 20px rgba(6,182,212,0.35)' : 'none',
              }}>
              {isReady ? <CheckCircle2 size={18} /> : <Hand size={18} />}
              <span>{isReady ? 'Đã sẵn sàng' : 'Sẵn sàng'}</span>
            </motion.button>
          </div>
        )}
        {isHost && (
          <div className="host-controls">
            <span className="start-status-text" style={{ color: canStart ? '#06b6d4' : 'rgba(255,255,255,0.4)' }}>
              {(room.players?.length || 0) < 2 ? 'Cần ít nhất 2 người'
                : !allReady ? `Chờ ${nonHost.filter(p => !p.ready).length} người sẵn sàng...`
                : '✅ Tất cả sẵn sàng!'}
            </span>
            <motion.button whileHover={{ scale: canStart ? 1.02 : 1 }} whileTap={{ scale:0.96 }}
              onClick={() => canStart ? onStart() : onError(
                (room.players?.length || 0) < 2 ? 'Cần ít nhất 2 người' : 'Chờ tất cả sẵn sàng'
              )}
              className="btn-action-primary flex items-center justify-center gap-2"
              style={{
                background: canStart ? 'linear-gradient(135deg,#22c55e,#16a34a)' : 'rgba(255,255,255,0.05)',
                color: canStart ? '#fff' : 'rgba(255,255,255,0.2)',
                border: `1px solid ${canStart ? 'transparent' : 'rgba(255,255,255,0.07)'}`,
                cursor: canStart ? 'pointer' : 'not-allowed',
                boxShadow: canStart ? '0 4px 20px rgba(34,197,94,0.35)' : 'none',
              }}>
              <Play size={18} fill={canStart ? "currentColor" : "none"} />
              <span>Bắt đầu trận</span>
            </motion.button>
          </div>
        )}
        <div className="host-controls"> {/* Bọc div để đồng bộ baseline */}
          <motion.button whileHover={{ scale:1.02 }} whileTap={{ scale:0.96 }} onClick={onLeave}
            className="btn-leave-room flex items-center justify-center gap-2">
            <LogOut size={18} />
            <span>Rời phòng</span>
          </motion.button>
        </div>
      </div>
    </motion.div>
  )
}
