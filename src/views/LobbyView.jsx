import { useEffect, useState, useRef, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAppStore } from '../store.js'
import { connectSocket } from '../socket.js'
import { AVATAR_MAP } from './MenuView.jsx'
import { COLOR_HEX } from './lobbyShared.jsx'
import RoomListView from './RoomListView.jsx'
import WaitingRoomView from './WaitingRoomView.jsx'
import './LobbyView.css'

export default function LobbyView() {
  const { 
    playerName, playerColor, setView, setRoom, startGame,
    currentRoom, setCurrentRoom, isHost, setIsHost, view
  } = useAppStore()
  
  const [rooms, setRooms] = useState([])
  const [users, setUsers] = useState([])
  const [socketId, setSocketId] = useState(null)
  const [error, setError] = useState('')
  const [invitation, setInvitation] = useState(null)
  const socket = useRef(null)
  const prevView = useRef(null)

  const showError = useCallback((msg) => {
    setError(msg); setTimeout(() => setError(''), 3000)
  }, [])

  useEffect(() => {
    const uuid = localStorage.getItem('playerUUID')
      || (() => { const u = 'u_' + Math.random().toString(36).slice(2); localStorage.setItem('playerUUID', u); return u })()
    
    const s = connectSocket()
    socket.current = s
    
    s.emit('setProfile', { name: playerName, color: playerColor, uuid })
    
    s.off('id'); s.on('id', d => setSocketId(d.id))
    s.off('roomList'); s.on('roomList', d => setRooms(d.rooms))
    s.off('onlineList'); s.on('onlineList', d => setUsers(d.users))
    
    s.off('joinedRoom'); s.on('joinedRoom', d => { 
      setCurrentRoom(d.room)
      setIsHost(d.isHost)
      setRoom(d.roomId) 
    })
    
    s.off('roomUpdate'); s.on('roomUpdate', d => {
      setCurrentRoom(d.room)
    })
    
    s.off('leftRoom'); s.on('leftRoom', () => { 
      setCurrentRoom(null)
      setIsHost(false)
      setRoom(null)
    })
    
    s.off('kicked'); s.on('kicked', d => {
      setCurrentRoom(null)
      setIsHost(false)
      setRoom(null)
      showError(d.reason || 'Bạn đã bị đuổi khỏi phòng.')
    })
    
    s.off('youAreHost'); s.on('youAreHost', () => setIsHost(true))
    s.off('error'); s.on('error', d => showError(d.msg))
    s.off('gameStart'); s.on('gameStart', d => startGame({
      isImposter: d.isImposter,
      roomId: d.roomId,
      players: d.players,
      assignedTasks: d.assignedTasks || [],
      spawnX: d.spawnX,
      spawnY: d.spawnY,
    }))

    // Nếu đang có phòng (vừa quay lại từ game), xin lại state mới nhất để reset ready
    if (useAppStore.getState().currentRoom) {
      s.emit('getRoomState')
    }
    
    s.off('receiveInvite');
    s.on('receiveInvite', d => {
      setInvitation(d)
      setTimeout(() => setInvitation(null), 10000)
    })

    return () => {
      s.off('id'); s.off('roomList'); s.off('onlineList'); s.off('joinedRoom'); s.off('roomUpdate')
      s.off('leftRoom'); s.off('youAreHost'); s.off('error'); s.off('gameStart'); s.off('receiveInvite')
    }
  }, [])

  const send = (ev, data = {}) => socket.current?.connected && socket.current.emit(ev, data)

  // Khi quay lại lobby từ gameover, xin lại state phòng để reset ready
  useEffect(() => {
    if (view === 'lobby' && prevView.current === 'gameover' && socket.current?.connected) {
      socket.current.emit('getRoomState')
    }
    prevView.current = view
  }, [view])

  return (
    <AnimatePresence mode="wait">
      {invitation && !currentRoom && (
        <motion.div className="invite-notification"
          initial={{ x: 300, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 300, opacity: 0 }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full border-2" style={{ borderColor: COLOR_HEX[invitation.fromColor] }}>
              <img src={`assets/Images/avatar/${AVATAR_MAP[invitation.fromColor]}`} className="w-full h-full object-cover rounded-full" alt="" />
            </div>
            <div className="flex-1">
              <p className="text-[10px] text-white/40 font-bold uppercase tracking-wider">Lời mời mới</p>
              <p className="text-white text-xs font-black">
                <span style={{ color: COLOR_HEX[invitation.fromColor] }}>{invitation.fromName}</span> mời bạn vào phòng <span className="text-cyan-400">"{invitation.roomName}"</span>
              </p>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button className="flex-1 py-1.5 rounded-lg bg-emerald-500 text-black text-[10px] font-black uppercase"
              onClick={() => { send('joinRoom', { roomId: invitation.roomId }); setInvitation(null) }}>
              Chấp nhận
            </button>
            <button className="px-3 py-1.5 rounded-lg bg-white/5 text-white/40 text-[10px] font-bold"
              onClick={() => setInvitation(null)}>
              Từ chối
            </button>
          </div>
        </motion.div>
      )}

      {currentRoom ? (
        <WaitingRoomView key="waiting"
          room={currentRoom} users={users} isHost={isHost} socketId={socketId}
          socket={socket.current} error={error}
          onLeave={() => send('leaveRoom')}
          onReady={r => send('setReady', { ready: r })}
          onStart={() => send('startGame')}
          onError={showError} />
      ) : (
        <RoomListView key="roomlist"
          rooms={rooms} users={users} playerName={playerName} playerColor={playerColor}
          socketId={socketId}
          error={error}
          onJoin={id => send('joinRoom', { roomId: id })}
          onCreate={(name, max) => send('createRoom', { roomName: name, maxPlayers: max })}
          onRefresh={() => send('roomList')}
          onBack={() => { socket.current?.disconnect(); setView('menu') }} />
      )}
    </AnimatePresence>
  )
}
