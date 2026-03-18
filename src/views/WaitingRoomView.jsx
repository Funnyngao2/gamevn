import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import Peer from 'simple-peer'
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
  Plus,
  X,
  Send,
  Mic,
  MicOff,
  UserX,
  Info,
  Trophy,
  Swords,
  Skull,
  Target,
  Volume2,
  Circle
} from 'lucide-react'
import { AVATAR_MAP } from './MenuView.jsx'
import { COLOR_HEX, SceneBg, ChatLine, normalizeMsg } from './lobbyShared.jsx'
import './WaitingRoomView.css'

export default function WaitingRoomView({ room, users, isHost, socketId, socket, onLeave, onReady, onStart, onError, error }) {
  const [activeTab, setActiveTab] = useState('room')
  const [roomMsgs,  setRoomMsgs]  = useState([])
  const [lobbyMsgs, setLobbyMsgs] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [showInvite, setShowInvite] = useState(false)
  
  // Voice Chat (Realtime)
  const [isMicOn, setIsMicOn] = useState(false)
  const [remoteStreams, setRemoteStreams] = useState({})
  const [speakingPlayers, setSpeakingPlayers] = useState({})
  
  // Voice Message (Recording)
  const [isRecording, setIsRecording] = useState(false)
  const [recordTime, setRecordTime] = useState(0)
  const mediaRecorder = useRef(null)
  const audioChunks = useRef([])
  const recordTimer = useRef(null)

  const [invitedIds, setInvitedIds] = useState({})
  const [contextMenu, setContextMenu] = useState(null)
  const [selectedPlayer, setSelectedPlayer] = useState(null)
  
  const chatEndRef = useRef(null)
  const localStream = useRef(null)
  const peersRef = useRef({})
  const myUUID = localStorage.getItem('playerUUID')

  // ── VOICE CHAT (REALTIME) ──────────────────────────────────────────────────
  useEffect(() => {
    socket.emit('toggleMic', { isMicOn })
    if (isMicOn) {
      navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        localStream.current = stream
        Object.values(peersRef.current).forEach(peer => peer.addStream(stream))
      }).catch(err => { setIsMicOn(false); onError("Không thể truy cập Mic.") })
    } else {
      if (localStream.current) { localStream.current.getTracks().forEach(t => t.stop()); localStream.current = null }
    }
  }, [isMicOn])

  useEffect(() => {
    if (!socket) return
    socket.on('voicePeerJoined', ({ peerId }) => { peersRef.current[peerId] = createPeer(peerId, socket.id, localStream.current) })
    socket.on('voiceOffer', ({ from, offer }) => { peersRef.current[from] = addPeer(offer, from, localStream.current) })
    socket.on('voiceAnswer', ({ from, answer }) => { peersRef.current[from]?.signal(answer) })
    socket.on('voiceIceCandidate', ({ from, candidate }) => { peersRef.current[from]?.signal(candidate) })
    socket.on('voicePeerLeft', ({ peerId }) => {
      if (peersRef.current[peerId]) { peersRef.current[peerId].destroy(); delete peersRef.current[peerId]
        setRemoteStreams(prev => { const n = {...prev}; delete n[peerId]; return n })
      }
    })
    socket.emit('voiceJoin', { roomId: room.id })
    return () => { socket.emit('voiceLeave', { roomId: room.id }); Object.values(peersRef.current).forEach(p => p.destroy()); peersRef.current = {} }
  }, [socket, room.id])

  function createPeer(tId, cId, stream) {
    const opts = { initiator: true, trickle: false }
    if (stream) opts.stream = stream
    const p = new Peer(opts)
    p.on('signal', sig => socket.emit('voiceOffer', { roomId: room.id, to: tId, offer: sig }))
    p.on('stream', st => setRemoteStreams(prev => ({ ...prev, [tId]: st })))
    p.on('error', err => console.warn('createPeer error', err))
    return p
  }
  function addPeer(incoming, cId, stream) {
    const opts = { initiator: false, trickle: false }
    if (stream) opts.stream = stream
    const p = new Peer(opts)
    p.on('signal', sig => socket.emit('voiceAnswer', { roomId: room.id, to: cId, answer: sig }))
    p.on('stream', st => setRemoteStreams(prev => ({ ...prev, [cId]: st })))
    p.on('error', err => console.warn('addPeer error', err))
    p.signal(incoming); return p
  }

  // ── VOICE MESSAGE (RECORDING) ──────────────────────────────────────────────
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
          socket.emit(activeTab === 'room' ? 'roomChat' : 'lobbyChat', { text: '', audioData: reader.result })
        }
        stream.getTracks().forEach(t => t.stop())
      }
      mediaRecorder.current.start(); setIsRecording(true); setRecordTime(0)
      recordTimer.current = setInterval(() => setRecordTime(p => p + 1), 1000)
    } catch (err) { onError("Lỗi khởi động ghi âm.") }
  }

  const stopRecording = () => {
    if (mediaRecorder.current && isRecording) {
      mediaRecorder.current.stop(); setIsRecording(false); clearInterval(recordTimer.current)
    }
  }

  // ── OTHER LOGIC ────────────────────────────────────────────────────────────
  useEffect(() => {
    const iv = setInterval(() => {
      const now = Date.now()
      setInvitedIds(prev => {
        const next = { ...prev }
        let changed = false
        Object.keys(next).forEach(id => {
          if (now - next[id] > 5000) { delete next[id]; changed = true }
        })
        return changed ? next : prev
      })
    }, 1000)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    if (!socket) return
    socket.off('roomChat');    socket.on('roomChat',   d => setRoomMsgs(p  => [...p.slice(-99), normalizeMsg(d)]))
    socket.off('lobbyChat');   socket.on('lobbyChat',  d => setLobbyMsgs(p => [...p.slice(-99), normalizeMsg(d)]))
    socket.off('chatHistory'); socket.on('chatHistory', d => {
      if (d.channel === 'room')  setRoomMsgs(d.messages.map(normalizeMsg))
      if (d.channel === 'lobby') setLobbyMsgs(d.messages.map(normalizeMsg))
    })
    socket.emit('getChatHistory', { channel: 'room',  roomId: room.id }); socket.emit('getChatHistory', { channel: 'lobby' })
    return () => { socket.off('roomChat'); socket.off('lobbyChat'); socket.off('chatHistory') }
  }, [socket, room.id])

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [roomMsgs, lobbyMsgs, activeTab])

  const sendChat = () => {
    const t = chatInput.trim(); if (!t) return
    socket.emit(activeTab === 'room' ? 'roomChat' : 'lobbyChat', { text: t }); setChatInput('')
  }

  const handleAvatarClick = (e, player) => { if (player.id !== socketId) { e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, player }) } }
  
  // Logic tính toán trạng thái bắt đầu
  const myPlayer = room.players?.find(p => p.id === socketId)
  const isReady  = myPlayer?.ready || false
  const nonHost  = room.players?.filter(p => p.id !== room.host) || []
  const allReady = nonHost.length > 0 && nonHost.every(p => p.ready)
  const canStart = (room.players?.length || 0) >= 2 && allReady
  
  const msgs = activeTab === 'room' ? roomMsgs : lobbyMsgs
  const idleUsers = (users || []).filter(u => !u.roomId && u.id !== socketId)

  return (
    <motion.div className="waiting-room-container" initial={{ opacity:0 }} animate={{ opacity:1 }} onClick={() => setContextMenu(null)}>
      <SceneBg />
      <div style={{ display:'none' }}>
        {Object.entries(remoteStreams).map(([sid, st]) => (
          <AudioElement key={sid} stream={st} onSpeaking={isS => setSpeakingPlayers(p => ({...p, [sid]: isS}))} />
        ))}
      </div>

      <AnimatePresence>{contextMenu && <motion.div className="player-context-menu" initial={{ opacity:0, scale:0.95 }} animate={{ opacity:1, scale:1 }} style={{ top: contextMenu.y, left: contextMenu.x }}>
        <button className="context-menu-item" onClick={() => { setSelectedPlayer(contextMenu.player); setContextMenu(null) }}><Info size={14} /> Xem thông tin</button>
        {isHost && <button className="context-menu-item danger" onClick={() => socket.emit('roomChat', { text: `⚠️ Chủ phòng mời ${contextMenu.player.name} rời phòng.` })}><UserX size={14} /> Đuổi</button>}
      </motion.div>}</AnimatePresence>

      <AnimatePresence>{selectedPlayer && <div className="invite-modal-overlay" onClick={() => setSelectedPlayer(null)}><motion.div className="player-info-modal" initial={{ scale:0.9 }} animate={{ scale:1 }} onClick={e => e.stopPropagation()}>
        <div className="flex justify-center mb-4"><div className="w-20 h-20 rounded-full border-4" style={{ borderColor: COLOR_HEX[selectedPlayer.color] }}><img src={`assets/Images/avatar/${AVATAR_MAP[selectedPlayer.color]}`} className="w-full h-full object-cover rounded-full" /></div></div>
        <h3 className="text-white font-black text-xl">{selectedPlayer.name}</h3>
        <div className="space-y-1 mt-4">{[{ icon: <Trophy size={12} />, label: 'Cấp bậc', value: 'Tân binh', color: '#fff' },{ icon: <Swords size={12} />, label: 'Thắng', value: '12', color: '#22c55e' },{ icon: <Skull size={12} />, label: 'Thua', value: '8', color: '#ef4444' }].map((s, i) => (<div key={i} className="stat-row"><div className="flex items-center gap-2 text-white/30 text-[11px] font-bold">{s.icon} {s.label}</div><span className="text-xs font-black" style={{ color: s.color }}>{s.value}</span></div>))}</div>
        <button className="w-full mt-6 py-2 rounded-xl bg-white/5 text-white/50 font-bold text-xs" onClick={() => setSelectedPlayer(null)}>Đóng</button>
      </motion.div></div>}</AnimatePresence>

      <AnimatePresence>{showInvite && <div className="invite-modal-overlay" onClick={() => setShowInvite(false)}><motion.div className="invite-modal-content" initial={{ scale:0.9 }} animate={{ scale:1 }} onClick={e => e.stopPropagation()}>
        <div className="invite-modal-header"><span className="text-white font-black text-sm">MỜI NGƯỜI CHƠI</span><button onClick={() => setShowInvite(false)}><X size={18} /></button></div>
        <div className="invite-list">{idleUsers.length === 0 ? <div className="py-10 opacity-20 text-center text-xs">Không có ai rảnh...</div> : idleUsers.map(u => {
          const cd = invitedIds[u.id] ? Math.max(0, Math.ceil((5000 - (Date.now() - invitedIds[u.id])) / 1000)) : 0
          return (<div key={u.id} className="invite-item"><img src={`assets/Images/avatar/${AVATAR_MAP[u.color]}`} className="w-8 h-8 rounded-full" /><span className="text-white/80 text-xs font-bold">{u.name}</span><button className="btn-send-invite" disabled={cd > 0} onClick={() => { socket.emit('invitePlayer', { targetId: u.id, roomName: room.name, roomId: room.id }); setInvitedIds(p => ({...p, [u.id]: Date.now()})) }}>{cd > 0 ? `${cd}s` : 'Mời'}</button></div>)
        })}</div>
      </motion.div></div>}</AnimatePresence>

      <motion.div className="waiting-header" initial={{ y:-16, opacity:0 }} animate={{ y:0, opacity:1 }}>
        <div className="flex items-center gap-3"><img src="assets/Images/logo/logo.png" className="h-9" /><div><p className="text-white text-sm font-black tracking-[5px]">MOONIVERSE</p><p className="text-cyan-400 text-[8px] tracking-[3px]">AMONG US · MOONGROUP</p></div></div>
        <div className="room-info-badge flex items-center gap-2"><Users size={12} /><span>{room.name} · {room.players?.length}/{room.maxPlayers}</span></div>
      </motion.div>

      <div className="waiting-main-layout relative z-10 flex flex-1 gap-4 px-5 py-4 overflow-hidden min-h-0" style={{ paddingBottom:80 }}>
        <motion.div className="player-grid-container"><div className="player-grid-header"><Rocket size={14} className="text-cyan-400" /><span className="text-white font-bold">{room.name}</span>{isHost && <span className="host-badge ml-auto"><Crown size={10} fill="currentColor" /> Chủ phòng</span>}</div>
          <div className="player-grid">{Array.from({ length: room.maxPlayers }).map((_, i) => {
            const p = room.players?.[i]; const isS = p && speakingPlayers[p.id]; const isM = p && p.mic; const col = COLOR_HEX[p?.color] || '#888'
            return (<motion.div key={i} className="player-card" style={p?{background:`linear-gradient(160deg,${col}12,rgba(255,255,255,0.04))`, border:`1px solid ${p.ready?col+'60':col+'25'}`, boxShadow:isS?`0 0 30px ${col}60`:p.ready?`0 0 20px ${col}20`:'none'}:{background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.04)'}}>
              {p ? (<><div className="player-avatar-container cursor-pointer relative" onClick={(e)=>handleAvatarClick(e, p)} style={{border:`2px solid ${col}${isS?'99':'50'}`}}><img src={`assets/Images/avatar/${AVATAR_MAP[p.color]}`} className="w-full h-full object-cover" />{isM && <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center"><Mic size={10} className="text-cyan-400" /></div>}{isS && <div className="absolute inset-0 flex items-center justify-center bg-cyan-400/20"><Volume2 size={24} className="text-white animate-pulse" /></div>}</div><p className="text-white text-[10px] font-bold">{p.name}</p><span className={`player-status-badge ${p.ready?'text-cyan-400':'text-white/30'}`}>{p.ready?<Check size={8}/>:null} {p.ready?'Sẵn sàng':'Chờ...'}</span></>) : (<div className="empty-slot cursor-pointer" onClick={()=>setShowInvite(true)}><div className="empty-slot-plus"><Plus size={18} /></div><span className="text-white/15 text-[9px]">Mời</span></div>)}
            </motion.div>)
          })}</div>
        </motion.div>

        <motion.div className="chat-panel">
          <div className="chat-tabs">{['room','lobby'].map(tab => (<button key={tab} onClick={()=>setActiveTab(tab)} className="chat-tab-btn" style={{color:activeTab===tab?'#06b6d4':'rgba(255,255,255,0.25)', borderBottom:activeTab===tab?'2px solid #06b6d4':'none'}}>{tab==='room'?<Rocket size={14}/>:<MessageSquare size={14}/>} {tab.toUpperCase()}</button>))}</div>
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">{msgs.map((m, i) => <ChatLine key={i} msg={m} myId={myUUID} />)}<div ref={chatEndRef} /></div>
          <div className="chat-input-section relative">
            <AnimatePresence>{isRecording && <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:10 }} className="absolute inset-0 z-10 bg-slate-900 flex items-center px-4 gap-3"><div className="flex items-center gap-2 flex-1"><Circle size={10} fill="#ef4444" className="animate-pulse" /><span className="text-white text-xs font-bold">Ghi âm: {recordTime}s</span><div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden"><motion.div className="h-full bg-red-500" initial={{ width:0 }} animate={{ width:'100%' }} transition={{ duration:30, ease:'linear' }} /></div></div><button onClick={stopRecording} className="text-[10px] font-black uppercase text-red-400">Dừng & Gửi</button></motion.div>}</AnimatePresence>
            {activeTab === 'room' && <button onClick={() => setIsMicOn(!isMicOn)} className="p-1.5 rounded-lg" style={{ color: isMicOn ? '#22d3ee' : 'rgba(255,255,255,0.2)' }}>{isMicOn ? <Mic size={16} /> : <MicOff size={16} />}</button>}
            <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendChat()} placeholder="Nhắn tin..." className="flex-1 bg-transparent text-white text-xs outline-none" />
            <div className="flex items-center gap-1"><button onClick={startRecording} className="p-1.5 text-white/30 hover:text-cyan-400"><Mic size={16} /></button><button onClick={sendChat} className="chat-send-btn-small">➤</button></div>
          </div>
        </motion.div>
      </div>

      <div className="action-bar">
        {!isHost && <div className="host-controls"><motion.button onClick={() => socket.emit('setReady', { ready: !isReady })} className="btn-action-primary" style={{background:isReady?'linear-gradient(135deg,#06b6d4,#8b5cf6)':'rgba(255,255,255,0.07)', color:isReady?'#000':'rgba(255,255,255,0.7)'}}>{isReady ? <CheckCircle2 size={18} /> : <Hand size={18} />} <span>{isReady?'Đã sẵn sàng':'Sẵn sàng'}</span></motion.button></div>}
        {isHost && (
          <div className="host-controls">
            <span className="start-status-text" style={{ color: canStart ? '#06b6d4' : 'rgba(255,255,255,0.4)' }}>
              {(room.players?.length || 0) < 2 ? 'Cần ít nhất 2 người'
                : !allReady ? `Chờ ${nonHost.filter(p => !p.ready).length} người sẵn sàng...`
                : '✅ Tất cả sẵn sàng!'}
            </span>
            <motion.button whileHover={{ scale: canStart ? 1.02 : 1 }} whileTap={{ scale:0.96 }}
              onClick={onStart}
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
        <div className="host-controls"><motion.button onClick={onLeave} className="btn-leave-room"><LogOut size={18} /> <span>Rời phòng</span></motion.button></div>
      </div>
    </motion.div>
  )
}

function AudioElement({ stream, onSpeaking }) {
  const audioRef = useRef(null)
  useEffect(() => {
    if (audioRef.current && stream) {
      audioRef.current.srcObject = stream
      const aCtx = new (window.AudioContext || window.webkitAudioContext)()
      const ana = aCtx.createAnalyser(); const src = aCtx.createMediaStreamSource(stream); src.connect(ana)
      const data = new Uint8Array(ana.frequencyBinCount)
      const check = () => { ana.getByteFrequencyData(data); const avg = data.reduce((a,b)=>a+b)/data.length; onSpeaking(avg>15); requestAnimationFrame(check) }
      check(); return () => aCtx.close()
    }
  }, [stream])
  return <audio ref={audioRef} autoPlay playsInline />
}
