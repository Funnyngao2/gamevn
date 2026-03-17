import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useAppStore } from '../store.js'
import { connectSocket, getSocket } from '../socket.js'

const COLOR_HEX = {
  red:'#e74c3c', blue:'#3b82f6', green:'#22c55e', orange:'#f97316',
  yellow:'#eab308', pink:'#ec4899', black:'#6b7280', brown:'#92400e',
  purple:'#a855f7', white:'#e2e8f0',
}

export default function LobbyView() {
  const { playerName, playerColor, setView, setRoom, startGame } = useAppStore()
  const [rooms,       setRooms]       = useState([])
  const [currentRoom, setCurrentRoom] = useState(null)
  const [isHost,      setIsHost]      = useState(false)
  const [myId,        setMyId]        = useState(null)
  const [socketId,    setSocketId]    = useState(null)
  const [error,       setError]       = useState('')

  const socket = useRef(null)

  // Show error briefly
  const showError = useCallback((msg) => {
    setError(msg)
    setTimeout(() => setError(''), 3000)
  }, [])

  useEffect(() => {
    const uuid = localStorage.getItem('playerUUID')
      || (() => { const u = 'u_' + Math.random().toString(36).slice(2); localStorage.setItem('playerUUID', u); return u })()

    const s = connectSocket()
    socket.current = s

    s.emit('setProfile', { name: playerName, color: playerColor, uuid })
    setMyId(uuid)

    s.off('id');        s.on('id',        d => { setSocketId(d.id) })
    s.off('roomList');  s.on('roomList',  d => setRooms(d.rooms))
    s.off('joinedRoom');s.on('joinedRoom',d => { setCurrentRoom(d.room); setIsHost(d.isHost); setRoom(d.roomId) })
    s.off('roomUpdate');s.on('roomUpdate',d => setCurrentRoom(d.room))
    s.off('leftRoom');  s.on('leftRoom',  () => { setCurrentRoom(null); setIsHost(false) })
    s.off('youAreHost');s.on('youAreHost',() => setIsHost(true))
    s.off('error');     s.on('error',     d => showError(d.msg))
    s.off('gameStart'); s.on('gameStart', d => {
      startGame({ isImposter: d.isImposter, roomId: d.roomId, players: d.players })
    })

    return () => {
      s.off('id'); s.off('roomList'); s.off('joinedRoom')
      s.off('roomUpdate'); s.off('leftRoom'); s.off('youAreHost')
      s.off('error'); s.off('gameStart')
    }
  }, [])

  const send = (ev, data = {}) => socket.current?.connected && socket.current.emit(ev, data)

  if (currentRoom) {
    return (
      <WaitingRoom
        room={currentRoom} isHost={isHost} socketId={socketId} myId={myId}
        socket={socket.current}
        onLeave={() => send('leaveRoom')}
        onReady={(r) => send('setReady', { ready: r })}
        onStart={() => send('startGame')}
        onError={showError}
        error={error}
      />
    )
  }

  return (
    <RoomList
      rooms={rooms} playerName={playerName} playerColor={playerColor}
      error={error}
      onJoin={(id) => send('joinRoom', { roomId: id })}
      onCreate={(name, max) => send('createRoom', { roomName: name, maxPlayers: max })}
      onRefresh={() => send('roomList')}
      onBack={() => { socket.current?.disconnect(); setView('menu') }}
    />
  )
}

// ── Room List ─────────────────────────────────────────────────────────────────
function RoomList({ rooms, playerName, playerColor, error, onJoin, onCreate, onRefresh, onBack }) {
  const [search,     setSearch]     = useState('')
  const [roomName,   setRoomName]   = useState(`${playerName}'s Room`)
  const [maxPlayers, setMaxPlayers] = useState(8)
  const [lobbyMsgs,  setLobbyMsgs] = useState([])
  const [chatInput,  setChatInput]  = useState('')
  const chatEndRef = useRef(null)
  const socket = useRef(getSocket())

  useEffect(() => {
    const s = socket.current
    s.off('lobbyChat'); s.on('lobbyChat', d => setLobbyMsgs(prev => [...prev.slice(-99), d]))
    s.off('chatHistory'); s.on('chatHistory', d => {
      if (d.channel === 'lobby') setLobbyMsgs(d.messages.map(m => ({
        senderId: m.sender_id, name: m.sender_name, color: m.sender_color,
        text: m.message, system: !!m.is_system, ts: m.ts
      })))
    })
    s.emit('getChatHistory', { channel: 'lobby' })
    return () => { s.off('lobbyChat'); s.off('chatHistory') }
  }, [])

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [lobbyMsgs])

  const sendChat = () => {
    const t = chatInput.trim(); if (!t) return
    socket.current.emit('lobbyChat', { text: t })
    setChatInput('')
  }

  const filtered = rooms.filter(r => !search || r.name.toLowerCase().includes(search.toLowerCase()))
  const myUUID = localStorage.getItem('playerUUID')

  return (
    <div className="w-screen h-screen flex flex-col"
         style={{ background: 'radial-gradient(ellipse at 10% 20%, #0a1535 0%, #020409 70%)' }}>

      {/* Header */}
      <Header />

      {error && <ErrorBanner msg={error} />}

      <div className="flex flex-1 gap-3 p-3 pt-0 overflow-hidden">

        {/* Left: Profile */}
        <div className="w-48 shrink-0 bg-[#0b1120] border border-[#1e3d6b] rounded-xl p-4 flex flex-col">
          <div className="flex flex-col items-center gap-2 mb-4">
            <div className="w-16 h-16 rounded-full border-2 border-white/20"
                 style={{ backgroundColor: COLOR_HEX[playerColor] }} />
            <p className="text-white font-bold text-sm">{playerName}</p>
            <p className="text-xs tracking-widest" style={{ color: COLOR_HEX[playerColor] }}>
              {playerColor.toUpperCase()}
            </p>
          </div>
          <hr className="border-[#1e3d6b] mb-3" />
          <div className="text-xs text-[#94a3b8] space-y-2 flex-1">
            {[['Cấp bậc','Tân binh'],['Thắng','0'],['Thua','0']].map(([k,v]) => (
              <div key={k} className="flex justify-between">
                <span>{k}</span><span className="text-white font-bold">{v}</span>
              </div>
            ))}
          </div>
          <button onClick={onBack}
            className="mt-4 w-full py-2 rounded-lg bg-[#ef4444] hover:bg-[#b91c1c] text-white text-xs font-bold transition-colors">
            ← Quay lại
          </button>
        </div>

        {/* Center: Room table + chat */}
        <div className="flex-1 flex flex-col gap-3 overflow-hidden">

          {/* Search + refresh */}
          <div className="flex gap-2">
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="🔍 Tìm kiếm phòng..."
              className="flex-1 bg-[#0d1829] border border-[#1e3d6b] rounded-lg px-3 py-2 text-white
                         text-sm placeholder-[#475569] outline-none focus:border-[#00e5cc] transition-colors" />
            <button onClick={onRefresh}
              className="px-3 py-2 bg-[#111d30] border border-[#1e3d6b] rounded-lg text-[#cbd5e1]
                         text-sm hover:border-[#00e5cc] transition-colors">
              ↻ Làm mới
            </button>
          </div>

          {/* Table header */}
          <div className="grid grid-cols-4 text-[10px] text-[#64748b] font-bold tracking-wider
                          bg-[#0a1828] rounded-t-lg px-3 py-2 border border-[#1e3d6b]">
            {['Tên phòng','Chủ phòng','Người chơi','Trạng thái'].map(h => (
              <span key={h} className="text-center">{h}</span>
            ))}
          </div>

          {/* Room rows */}
          <div className="flex-1 overflow-y-auto border border-[#1e3d6b] border-t-0 rounded-b-lg min-h-0">
            {filtered.length === 0 ? (
              <div className="flex items-center justify-center h-full text-[#475569] text-sm">
                Chưa có phòng nào — hãy tạo phòng mới!
              </div>
            ) : filtered.map((room, i) => {
              const isFull    = room.players >= room.maxPlayers
              const isStarted = room.started
              const canJoin   = !isFull && !isStarted
              return (
                <div key={room.id}
                  onClick={() => canJoin && onJoin(room.id)}
                  className={`grid grid-cols-4 px-3 py-2 text-sm border-b border-[#1e3d6b]/30 transition-colors
                    ${i % 2 === 0 ? 'bg-[#0b1120]' : 'bg-[#111d30]'}
                    ${canJoin ? 'cursor-pointer hover:bg-[#1a3050] hover:border-l-2 hover:border-l-[#00e5cc]' : 'opacity-60'}`}>
                  <span className="text-center text-white truncate">{room.name}</span>
                  <span className="text-center text-[#94a3b8]">{room.host}</span>
                  <span className={`text-center ${isFull ? 'text-red-400' : 'text-green-400'}`}>
                    {room.players}/{room.maxPlayers}
                  </span>
                  <span className={`text-center ${isStarted ? 'text-yellow-400' : isFull ? 'text-red-400' : 'text-green-400'}`}>
                    {isStarted ? '▶ Đang chơi' : isFull ? '🔴 Đầy' : '🟢 Chờ'}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Lobby chat */}
          <div className="h-44 bg-[#111d30] border border-[#2d5a9e] rounded-xl flex flex-col shrink-0">
            <p className="text-[9px] text-[#00e5cc] font-bold tracking-widest px-3 pt-2">💬 LOBBY CHAT</p>
            <div className="flex-1 overflow-y-auto px-3 py-1 space-y-1 min-h-0">
              {lobbyMsgs.map((m, i) => <ChatBubble key={i} msg={m} myId={myUUID} />)}
              <div ref={chatEndRef} />
            </div>
            <div className="flex gap-2 p-2 border-t border-[#1e3d6b]">
              <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendChat()}
                placeholder="Nhắn tin với mọi người..."
                className="flex-1 bg-[#0d1829] border border-[#1e3d6b] rounded-lg px-3 py-1.5 text-white
                           text-xs placeholder-[#334155] outline-none focus:border-[#00e5cc] transition-colors" />
              <button onClick={sendChat}
                className="px-3 py-1.5 bg-[#00e5cc] hover:bg-[#00b8a3] text-black text-xs font-bold rounded-lg transition-colors">
                ➤
              </button>
            </div>
          </div>
        </div>

        {/* Right: Create room */}
        <div className="w-48 shrink-0 bg-[#111d30] border border-[#2d5a9e] rounded-xl p-4 flex flex-col gap-3">
          <p className="text-[10px] text-[#00e5cc] font-bold tracking-widest text-center">✦ TẠO PHÒNG MỚI</p>
          <hr className="border-[#1e3d6b]" />
          <div>
            <label className="text-[10px] text-[#64748b] mb-1 block">Tên phòng</label>
            <input value={roomName} onChange={e => setRoomName(e.target.value)} maxLength={20}
              className="w-full bg-[#0d1829] border border-[#1e3d6b] rounded-lg px-2 py-1.5 text-white
                         text-xs outline-none focus:border-[#00e5cc] transition-colors" />
          </div>
          <div>
            <label className="text-[10px] text-[#64748b] mb-1 block">Số người tối đa</label>
            <div className="flex gap-1">
              {[6,8,10].map(n => (
                <button key={n} onClick={() => setMaxPlayers(n)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors
                    ${maxPlayers === n ? 'bg-[#00e5cc] text-black' : 'bg-[#0d1829] text-[#cbd5e1] border border-[#1e3d6b] hover:border-[#00e5cc]'}`}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <button onClick={() => onCreate(roomName || `${playerName}'s Room`, maxPlayers)}
            className="mt-auto w-full py-2.5 bg-[#00e5cc] hover:bg-[#00b8a3] text-black font-bold
                       text-sm rounded-lg transition-colors">
            + Tạo phòng
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Waiting Room ──────────────────────────────────────────────────────────────
function WaitingRoom({ room, isHost, socketId, myId, socket, onLeave, onReady, onStart, onError, error }) {
  const [activeTab,  setActiveTab]  = useState('room')
  const [roomMsgs,   setRoomMsgs]   = useState([])
  const [lobbyMsgs,  setLobbyMsgs]  = useState([])
  const [chatInput,  setChatInput]  = useState('')
  const chatEndRef = useRef(null)

  useEffect(() => {
    if (!socket) return
    socket.off('roomChat');  socket.on('roomChat',  d => setRoomMsgs(prev  => [...prev.slice(-99), d]))
    socket.off('lobbyChat'); socket.on('lobbyChat', d => setLobbyMsgs(prev => [...prev.slice(-99), d]))
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
    socket.emit(activeTab === 'room' ? 'roomChat' : 'lobbyChat', { text: t })
    setChatInput('')
  }

  const myPlayer = room.players?.find(p => p.id === socketId)
  const isReady  = myPlayer?.ready || false
  const nonHost  = room.players?.filter(p => p.id !== room.host) || []
  const allReady = nonHost.length > 0 && nonHost.every(p => p.ready)
  const canStart = (room.players?.length || 0) >= 2 && allReady
  const myUUID   = localStorage.getItem('playerUUID')
  const msgs     = activeTab === 'room' ? roomMsgs : lobbyMsgs

  return (
    <div className="w-screen h-screen flex flex-col"
         style={{ background: 'radial-gradient(ellipse at 10% 20%, #0a1535 0%, #020409 70%)' }}>
      <Header />
      {error && <ErrorBanner msg={error} />}

      <div className="flex flex-1 gap-3 p-3 pt-0 overflow-hidden">

        {/* Left: Player grid */}
        <div className="flex-1 bg-[#0b1120] border border-[#1e3d6b] rounded-xl p-4 overflow-hidden flex flex-col">
          <div className="flex items-baseline gap-3 mb-1">
            <h2 className="text-white font-bold text-lg">{room.name}</h2>
            <span className="text-[#00e5cc] text-xs">{room.players?.length}/{room.maxPlayers} người</span>
            <span className="ml-auto text-[#475569] text-xs">ID: {room.id?.slice(-8)}</span>
          </div>
          <hr className="border-[#1e3d6b] mb-3" />

          <div className="grid grid-cols-5 gap-2 overflow-y-auto flex-1">
            {Array.from({ length: room.maxPlayers }).map((_, i) => {
              const p = room.players?.[i]
              return (
                <div key={i}
                  className={`rounded-xl p-2 flex flex-col items-center gap-1 border transition-colors
                    ${p ? (p.ready ? 'bg-[#111d30] border-[#00e5cc]/70' : 'bg-[#111d30] border-[#1e3d6b]/40')
                        : 'bg-[#0b1120]/40 border-[#1e3d6b]/20'}`}>
                  {p ? (
                    <>
                      <div className="w-8 h-8 rounded-full border-2 border-white/20"
                           style={{ backgroundColor: COLOR_HEX[p.color] || '#888' }} />
                      <p className="text-white text-[10px] font-bold text-center truncate w-full">
                        {p.name}{p.id === room.host ? ' 👑' : ''}{p.id === socketId ? ' (bạn)' : ''}
                      </p>
                      <span className={`text-[9px] ${p.ready ? 'text-[#00e5cc]' : 'text-[#475569]'}`}>
                        {p.ready ? '✅ Sẵn sàng' : '⏳ Chờ'}
                      </span>
                    </>
                  ) : (
                    <span className="text-[#1e3d6b] text-xs mt-2">Trống</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Right: Chat */}
        <div className="w-64 shrink-0 bg-[#111d30] border border-[#2d5a9e] rounded-xl flex flex-col">
          {/* Tabs */}
          <div className="flex border-b border-[#1e3d6b]">
            {['room','lobby'].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2 text-xs font-bold transition-colors
                  ${activeTab === tab ? 'text-white border-b-2 border-[#00e5cc]' : 'text-[#475569] hover:text-[#94a3b8]'}`}>
                {tab === 'room' ? '🚀 Phòng' : '💬 Lobby'}
              </button>
            ))}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1 min-h-0">
            {msgs.map((m, i) => <ChatBubble key={i} msg={m} myId={myUUID} />)}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="flex gap-2 p-2 border-t border-[#1e3d6b]">
            <input value={chatInput} onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendChat()}
              placeholder="Nhắn tin..."
              className="flex-1 bg-[#0d1829] border border-[#1e3d6b] rounded-lg px-2 py-1.5 text-white
                         text-xs placeholder-[#334155] outline-none focus:border-[#00e5cc] transition-colors" />
            <button onClick={sendChat}
              className="px-2 py-1.5 bg-[#00e5cc] hover:bg-[#00b8a3] text-black text-xs font-bold rounded-lg transition-colors">
              ➤
            </button>
          </div>
        </div>
      </div>

      {/* Bottom action bar */}
      <div className="flex items-center justify-center gap-4 px-4 py-3 bg-[#030609] border-t border-[#1e3d6b]">
        {!isHost && (
          <button onClick={() => onReady(!isReady)}
            className={`px-14 py-2 rounded-xl font-bold text-sm transition-colors
              ${isReady ? 'bg-[#00e5cc] text-black hover:bg-[#00b8a3]'
                        : 'bg-[#111d30] text-white border border-[#1e3d6b] hover:border-[#00e5cc]'}`}>
            {isReady ? '✅ Đã sẵn sàng' : '✋ Sẵn sàng'}
          </button>
        )}
        {isHost && (
          <div className="flex flex-col items-center gap-1">
            <button onClick={() => canStart ? onStart() : onError(
              (room.players?.length || 0) < 2 ? 'Cần ít nhất 2 người' : 'Chờ tất cả sẵn sàng'
            )}
              className={`px-14 py-2 rounded-xl font-bold text-sm transition-colors
                ${canStart ? 'bg-[#22c55e] hover:bg-[#16a34a] text-white'
                           : 'bg-[#111d30] text-[#475569] border border-[#1e3d6b] cursor-not-allowed'}`}>
              ▶ Bắt đầu trận
            </button>
            <span className={`text-[10px] ${canStart ? 'text-[#00e5cc]' : 'text-[#475569]'}`}>
              {(room.players?.length || 0) < 2 ? 'Cần ít nhất 2 người'
                : !allReady ? `Chờ ${nonHost.filter(p => !p.ready).length} người sẵn sàng...`
                : '✅ Tất cả sẵn sàng!'}
            </span>
          </div>
        )}
        <button onClick={onLeave}
          className="px-6 py-2 bg-[#ef4444] hover:bg-[#b91c1c] text-white font-bold text-sm rounded-xl transition-colors">
          ← Rời phòng
        </button>
      </div>
    </div>
  )
}

// ── Shared components ─────────────────────────────────────────────────────────
function Header() {
  return (
    <div className="flex items-center justify-center h-16 border-b border-[#00e5cc]/30 bg-[#040810] shrink-0">
      <div className="text-center">
        <img src="/assets/Images/logo/logo.png" alt="logo" className="h-8 object-contain mx-auto"
             onError={e => { e.target.style.display='none' }} />
        <p className="text-[#00e5cc] text-[9px] tracking-[4px]">GAME AMONG MOONGROUP</p>
      </div>
    </div>
  )
}

function ErrorBanner({ msg }) {
  return (
    <div className="text-center text-red-400 text-xs py-1 bg-red-900/20 border-b border-red-800/30">
      {msg}
    </div>
  )
}

function ChatBubble({ msg, myId }) {
  if (msg.system) {
    return (
      <div className="text-center text-[10px] text-yellow-500/80 italic py-0.5">
        {msg.text} {msg.ts && <span className="text-yellow-900 ml-1">{msg.ts}</span>}
      </div>
    )
  }
  const isSelf = msg.senderId === myId
  return (
    <div className={`flex gap-1.5 ${isSelf ? 'flex-row-reverse' : 'flex-row'}`}>
      {!isSelf && (
        <div className="w-5 h-5 rounded-full shrink-0 mt-0.5 flex items-center justify-center text-[9px] font-bold text-black"
             style={{ backgroundColor: COLOR_HEX[msg.color] || '#888' }}>
          {(msg.name || '?')[0].toUpperCase()}
        </div>
      )}
      <div className={`max-w-[75%] ${isSelf ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
        {!isSelf && <span className="text-[9px] font-bold" style={{ color: COLOR_HEX[msg.color] || '#94a3b8' }}>{msg.name}</span>}
        <div className={`px-2 py-1 rounded-xl text-[11px] leading-snug
          ${isSelf ? 'bg-[#00e5cc] text-black rounded-tr-sm' : 'bg-[#162035] text-[#e2e8f0] rounded-tl-sm'}`}>
          {msg.text}
        </div>
        {msg.ts && <span className="text-[9px] text-[#475569]">{msg.ts}</span>}
      </div>
    </div>
  )
}

function normalizeMsg(m) {
  return {
    senderId: m.sender_id, name: m.sender_name, color: m.sender_color,
    text: m.message, system: !!m.is_system, ts: m.ts
  }
}
