import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X, Check, Plus, Mic } from 'lucide-react'
import { getSocket } from '../socket.js'
import { AVATAR_MAP } from './MenuView.jsx'
import { COLOR_HEX, SceneBg, ChatLine, normalizeMsg } from './lobbyShared.jsx'
import './RoomListView.css'

const EMOJIS = ['😂','😍','🔥','👍','💀','🎮','🚀','😎','🤡','👑']

function LobbyChat({ socket, myUUID }) {
  const [lobbyMsgs,  setLobbyMsgs] = useState([])
  const [chatInput,  setChatInput]  = useState('')
  const [showEmoji,  setShowEmoji]  = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordTime, setRecordTime] = useState(0)
  const mediaRecorder = useRef(null)
  const audioChunks = useRef([])
  const recordTimer = useRef(null)
  const chatEndRef = useRef(null)
  const inputRef   = useRef(null)

  useEffect(() => {
    const s = socket.current
    if (!s) return
    const hChat = d => setLobbyMsgs(p => [...p.slice(-99), normalizeMsg(d)])
    const hHist = d => { if (d.channel === 'lobby') setLobbyMsgs(d.messages.map(normalizeMsg)) }
    s.on('lobbyChat', hChat)
    s.on('chatHistory', hHist)
    s.emit('getChatHistory', { channel: 'lobby' })
    return () => { s.off('lobbyChat', hChat); s.off('chatHistory', hHist) }
  }, [socket])

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [lobbyMsgs])

  const sendChat = () => {
    const t = chatInput.trim(); if (!t) return
    socket.current.emit('lobbyChat', { text: t }); setChatInput(''); setShowEmoji(false)
  }
  const addEmoji = (e) => { setChatInput(p => p + e); setShowEmoji(false); setTimeout(() => inputRef.current?.focus(), 10) }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRecorder.current = new MediaRecorder(stream)
      audioChunks.current = []
      mediaRecorder.current.ondataavailable = (e) => audioChunks.current.push(e.data)
      mediaRecorder.current.onstop = async () => {
        const audioBlob = new Blob(audioChunks.current, { type: 'audio/webm' })
        const reader = new FileReader()
        reader.readAsDataURL(audioBlob)
        reader.onloadend = () => {
          socket.current.emit('lobbyChat', { text: '', audioData: reader.result })
        }
        stream.getTracks().forEach(t => t.stop())
      }
      mediaRecorder.current.start(); setIsRecording(true); setRecordTime(0)
      recordTimer.current = setInterval(() => setRecordTime(p => p + 1), 1000)
    } catch (err) { alert("Lỗi ghi âm") }
  }

  const stopRecording = () => {
    if (mediaRecorder.current && isRecording) {
      mediaRecorder.current.stop(); setIsRecording(false); clearInterval(recordTimer.current)
    }
  }

  return (
    <div className="lobby-chat-container">
      <div className="chat-header">
        <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
        <span className="text-cyan-400 text-xs font-extrabold tracking-widest">LOBBY CHAT</span>
        <span className="ml-auto text-white/20 text-xs">{lobbyMsgs.length} tin nhắn</span>
      </div>
      <div className="overflow-y-auto px-4 py-2.5 space-y-1.5" style={{ flex:'1 1 0', minHeight:0 }}>
        {lobbyMsgs.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-white/15">
            <span className="text-2xl">💬</span>
            <p className="text-sm italic">Chưa có tin nhắn nào...</p>
          </div>
        )}
        {lobbyMsgs.map((m, i) => <ChatLine key={i} msg={m} myId={myUUID} />)}
        <div ref={chatEndRef} />
      </div>
      <div className="relative shrink-0 px-3 py-2.5"
        style={{ borderTop:'1px solid rgba(255,255,255,0.07)' }}>
        <AnimatePresence>
          {showEmoji && (
            <motion.div initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:6 }}
              className="emoji-picker-container">
              {EMOJIS.map(e => (
                <button key={e} onClick={() => addEmoji(e)}
                  className="text-lg w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 hover:scale-125 transition-all">
                  {e}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
        <div className="chat-input-wrapper relative">
          <AnimatePresence>
            {isRecording && (
              <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:10 }}
                className="absolute inset-0 z-10 bg-slate-900 rounded-xl flex items-center px-4 gap-3">
                <div className="flex items-center gap-2 flex-1">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-white text-[10px] font-bold">Ghi âm: {recordTime}s</span>
                  <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                    <motion.div className="h-full bg-red-500" initial={{ width:0 }} animate={{ width:'100%' }} transition={{ duration:30, ease:'linear' }} />
                  </div>
                </div>
                <button onClick={stopRecording} className="text-[9px] font-black uppercase text-red-400">Dừng & Gửi</button>
              </motion.div>
            )}
          </AnimatePresence>

          <button onClick={() => setShowEmoji(v => !v)}
            className="text-lg shrink-0 opacity-50 hover:opacity-100 transition-opacity hover:scale-110">😊</button>
          <input ref={inputRef} value={chatInput} onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') sendChat() }}
            placeholder="Nhắn tin với mọi người..."
            className="flex-1 bg-transparent text-white text-sm placeholder-white/25 outline-none" />
          
          <div className="flex items-center gap-1">
            <button onClick={startRecording} className="p-1.5 text-white/30 hover:text-cyan-400">
              <Mic size={16} />
            </button>
            <motion.button onClick={sendChat} whileHover={{ scale:1.1 }} whileTap={{ scale:0.9 }}
              className="chat-send-btn">
              ➤
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function RoomListView({ rooms, users, playerName, playerColor, socketId, error, onJoin, onCreate, onRefresh, onBack }) {
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [roomName,   setRoomName]   = useState(`${playerName}'s Room`)
  const [maxPlayers, setMaxPlayers] = useState(8)
  const [showCreate, setShowCreate] = useState(false)
  const socket = useRef(getSocket())
  const myUUID = localStorage.getItem('playerUUID')
  const hex = COLOR_HEX[playerColor] || '#8b5cf6'

  // Dynamic colors for the profile card
  const playerStyles = {
    '--player-hex': hex,
    '--player-color-fade': `${hex}10`,
    '--player-color-border': `${hex}30`,
    '--player-color-glow': `${hex}60`,
    '--player-color-shadow': `${hex}40`,
  }

  const applyRoomSearch = () => {
    setSearchQuery(searchInput.trim())
    onRefresh?.()
  }

  const filtered = rooms.filter(
    r => !searchQuery || r.name.toLowerCase().includes(searchQuery.toLowerCase())
  )
  const otherUsers = (users || []).filter(u => u.id !== socketId)

  return (
    <motion.div className="lobby-container"
      initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}>
      <SceneBg />

      {/* Create room modal */}
      <AnimatePresence>
        {showCreate && (
          <motion.div className="modal-overlay"
            initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            onClick={e => e.target === e.currentTarget && setShowCreate(false)}>
            <motion.div initial={{ scale:0.9, opacity:0, y:20 }} animate={{ scale:1, opacity:1, y:0 }}
              exit={{ scale:0.9, opacity:0, y:20 }} transition={{ type:'spring', damping:20 }}
              className="modal-content">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white font-black text-lg tracking-wide">Tạo phòng mới</p>
                  <p className="text-white/35 text-xs mt-0.5">Cấu hình phòng của bạn</p>
                </div>
                <button onClick={() => setShowCreate(false)}
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all text-lg">
                  ✕
                </button>
              </div>
              <div className="modal-divider" />
              <div className="flex flex-col gap-2">
                <label className="input-label">Tên phòng</label>
                <input value={roomName} onChange={e => setRoomName(e.target.value)} maxLength={20}
                  className="room-name-input" />
              </div>
              <div className="flex flex-col gap-3">
                <label className="input-label">Số người tối đa</label>
                <div className="grid grid-cols-3 gap-3">
                  {[6,8,10].map(n => (
                    <motion.button key={n} onClick={() => setMaxPlayers(n)}
                      whileHover={{ scale:1.04 }} whileTap={{ scale:0.96 }}
                      className={`max-players-btn ${maxPlayers === n ? 'active' : ''}`}>
                      {n}
                    </motion.button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label className="input-label">Chế độ</label>
                <div className="mode-selector">
                  <span className="text-xl">🎮</span>
                  <span className="text-white/70 text-sm font-semibold">Tiêu chuẩn</span>
                  <span className="mode-badge">Mặc định</span>
                </div>
              </div>
              <motion.button onClick={() => { onCreate(roomName || `${playerName}'s Room`, maxPlayers); setShowCreate(false) }}
                whileHover={{ scale:1.02 }} whileTap={{ scale:0.97 }}
                className="create-btn-primary flex items-center justify-center gap-2">
                <img src="assets/Images/logo/logo.png" alt="" className="w-4 h-4 object-contain brightness-0 invert" />
                Tạo phòng
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <motion.div className="lobby-header"
        initial={{ y:-20, opacity:0 }} animate={{ y:0, opacity:1 }}>
        <div className="flex items-center gap-3">
          <img src="assets/Images/logo/logo.png" alt="logo" className="header-logo-img" />
          <div>
            <p className="text-white font-black tracking-[5px] text-sm leading-none">MOONIVERSE</p>
            <p className="text-cyan-400 text-[9px] tracking-[3px] opacity-60 mt-0.5">AMONG US · MOONGROUP</p>
          </div>
        </div>
      </motion.div>

      {/* Error toast */}
      <AnimatePresence>
        {error && (
          <motion.div initial={{ y:-20, opacity:0 }} animate={{ y:0, opacity:1 }} exit={{ y:-20, opacity:0 }}
            className="error-toast">
            ⚠ {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main layout */}
      <div className="main-layout-content relative z-10 flex gap-4 px-4 py-4 min-h-0" style={{ flex:'1 1 0', overflow:'hidden' }}>

        {/* Left: Profile card & Online List */}
        <motion.div initial={{ x:-30, opacity:0 }} animate={{ x:0, opacity:1 }} transition={{ delay:0.1 }}
          className="profile-sidebar flex flex-col gap-3" style={{ ...playerStyles }}>
          <div className="profile-card">
            <span className="profile-card-border-run" aria-hidden>
              <span className="profile-card-border-beam" />
            </span>
            <div className="profile-card-inner">
              <div style={{ height:2, width:'70%', borderRadius:99, background:`linear-gradient(90deg,transparent,${hex},transparent)` }} />
              <div className="profile-avatar-wrapper">
                <div className="profile-avatar-img-container">
                  <img src={`assets/Images/avatar/${AVATAR_MAP[playerColor] || 'nam1.png'}`} alt=""
                    className="w-full h-full object-cover" />
                </div>
                <div className="profile-avatar-badge">✦</div>
              </div>
              <div className="profile-info-text">
                <p className="text-white font-extrabold text-base leading-tight">{playerName}</p>
                <p className="text-xs capitalize font-semibold mt-0.5" style={{ color:hex }}>{playerColor}</p>
              </div>
              <div className="w-full h-px" style={{ background:'rgba(255,255,255,0.06)' }} />
              <div className="w-full space-y-2">
                {[['🏆','Cấp bậc','Tân binh'],['⚔','Thắng','0'],['💀','Thua','0'],['🎯','Tỉ lệ','—']].map(([icon,k,v]) => (
                  <div key={k} className="flex items-center justify-between">
                    <span className="text-white/35 text-xs">{icon} {k}</span>
                    <span className="text-white/75 text-xs font-bold">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="online-list-container">
            <p className="online-list-header">NGƯỜI CHƠI TRỰC TUYẾN ({users?.length || 0})</p>
            <div className="online-players-scroll">
              {otherUsers.length === 0 ? (
                <div className="player-item-mini" style={{ opacity: 0.5 }}>
                  <div className="player-dot-indicator" style={{ background: '#666', boxShadow: 'none' }} />
                  <span className="text-white/30 text-[10px] italic">Bạn đang ở sảnh một mình</span>
                </div>
              ) : otherUsers.map((u, i) => (
                <div key={i} className="player-item-mini">
                  <div className="player-dot-indicator" style={{ background: COLOR_HEX[u.color] || '#22c55e', boxShadow: `0 0 5px ${COLOR_HEX[u.color]}` }} />
                  <span className="text-white/70 text-[11px] font-bold truncate flex-1">{u.name}</span>
                  {u.roomId && <span className="text-[8px] text-cyan-400/50 uppercase font-black shrink-0">In Room</span>}
                </div>
              ))}
            </div>
          </div>

          <motion.button onClick={onBack} whileHover={{ scale:1.02 }} whileTap={{ scale:0.97 }}
            className="back-btn-sidebar">
              Quay lại
          </motion.button>
        </motion.div>

        {/* Center: Room list + chat */}
        <motion.div initial={{ y:20, opacity:0 }} animate={{ y:0, opacity:1 }} transition={{ delay:0.15 }}
          className="flex-1 flex flex-col gap-3 min-w-0 min-h-0 overflow-hidden">

          {/* Toolbar */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="search-container">
              <Search size={14} className="text-white/30 shrink-0" />
              <input value={searchInput} onChange={e => setSearchInput(e.target.value)}
                placeholder="Tìm phòng..."
                className="flex-1 bg-transparent text-white text-sm placeholder-white/25 outline-none min-w-0"
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    applyRoomSearch()
                  }
                }} />
              {searchInput && (
                <button type="button" onClick={() => { setSearchInput(''); setSearchQuery('') }}
                  className="text-white/30 hover:text-white/60 shrink-0">
                  <X size={12} />
                </button>
              )}
            </div>
            <motion.button type="button" onClick={applyRoomSearch} whileHover={{ scale:1.03 }} whileTap={{ scale:0.97 }}
              className="room-search-confirm-btn"
              title="Tìm phòng và làm mới danh sách">
              <Check size={15} strokeWidth={2.5} className="shrink-0 opacity-90" />
              <span className="room-search-confirm-label">Tìm phòng</span>
            </motion.button>
            <motion.button onClick={() => setShowCreate(true)}
              whileHover={{ scale:1.03 }} whileTap={{ scale:0.97 }}
              className="create-room-btn-toolbar">
              <Plus size={12} /> Tạo phòng
            </motion.button>
          </div>

          {/* Room table */}
          <div className="room-table-container">
            <div className="room-table-header">
              <span>Tên phòng</span>
              <span className="col-host">Chủ phòng</span>
              <span>Người chơi</span>
              <span>Trạng thái</span>
            </div>
            <div className="overflow-y-auto flex-1 min-h-0">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 py-10">
                  <img src="assets/Images/logo/logo.png" alt="" className="w-16 h-16 object-contain opacity-20" />
                  <p className="text-white/20 text-base font-bold">Chưa có phòng nào</p>
                </div>
              ) : filtered.map((room, i) => {
                const isFull = room.players >= room.maxPlayers
                const isStarted = room.started
                const canJoin = !isFull && !isStarted
                const statusColor = isStarted?'#eab308':isFull?'#ef4444':'#22c55e'
                const statusClass = isStarted ? 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30'
                                  : isFull ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                                  : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                
                return (
                  <motion.div key={room.id}
                    initial={{ opacity:0, x:-8 }} animate={{ opacity:1, x:0 }} transition={{ delay: i*0.04 }}
                    onClick={() => canJoin && onJoin(room.id)}
                    className="room-row"
                    style={{ cursor: canJoin ? 'pointer' : 'default', opacity: canJoin ? 1 : 0.4 }}
                    whileHover={canJoin ? { backgroundColor:'rgba(255,255,255,0.05)' } : {}}>
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      <div className="status-dot"
                        style={{ background: statusColor, boxShadow:`0 0 5px ${statusColor}` }} />
                      <span className="text-white/90 font-semibold truncate">{room.name}</span>
                    </div>
                    <span className="text-white/40 text-sm self-center truncate col-host">{room.host}</span>
                    <span className={`text-sm font-bold self-center ${isFull?'text-red-400':'text-emerald-400'}`}>
                      {room.players}/{room.maxPlayers}
                    </span>
                    <div className="flex items-center">
                      <span className={`status-badge ${statusClass}`}>
                        {isStarted?'▶':'●'} <span className="hidden sm:inline">{isStarted?'Đang chơi':isFull?'Đầy':'Chờ'}</span>
                      </span>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>

          {/* Lobby chat */}
          <LobbyChat socket={socket} myUUID={myUUID} />
        </motion.div>
      </div>
    </motion.div>
  )
}
