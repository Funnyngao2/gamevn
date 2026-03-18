import { useEffect, useState, useRef, useCallback } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useAppStore } from '../store.js'
import { connectSocket } from '../socket.js'
import RoomListView from './RoomListView.jsx'
import WaitingRoomView from './WaitingRoomView.jsx'
import './LobbyView.css'

export default function LobbyView() {
  const { playerName, playerColor, setView, setRoom, startGame } = useAppStore()
  const [rooms,       setRooms]       = useState([])
  const [users,       setUsers]       = useState([]) // Danh sách người chơi online
  const [currentRoom, setCurrentRoom] = useState(null)
  const [isHost,      setIsHost]      = useState(false)
  const [socketId,    setSocketId]    = useState(null)
  const [error,       setError]       = useState('')
  const socket = useRef(null)

  const showError = useCallback((msg) => {
    setError(msg); setTimeout(() => setError(''), 3000)
  }, [])

  useEffect(() => {
    const uuid = localStorage.getItem('playerUUID')
      || (() => { const u = 'u_' + Math.random().toString(36).slice(2); localStorage.setItem('playerUUID', u); return u })()
    const s = connectSocket()
    socket.current = s
    s.emit('setProfile', { name: playerName, color: playerColor, uuid })
    s.off('id');        s.on('id',        d => setSocketId(d.id))
    s.off('roomList');  s.on('roomList',  d => setRooms(d.rooms))
    s.off('onlineList');s.on('onlineList',d => setUsers(d.users)) // Lắng nghe danh sách online
    s.off('joinedRoom');s.on('joinedRoom',d => { setCurrentRoom(d.room); setIsHost(d.isHost); setRoom(d.roomId) })
    s.off('roomUpdate');s.on('roomUpdate',d => setCurrentRoom(d.room))
    s.off('leftRoom');  s.on('leftRoom',  () => { setCurrentRoom(null); setIsHost(false) })
    s.off('youAreHost');s.on('youAreHost',() => setIsHost(true))
    s.off('error');     s.on('error',     d => showError(d.msg))
    s.off('gameStart'); s.on('gameStart', d => startGame({ isImposter: d.isImposter, roomId: d.roomId, players: d.players }))
    return () => {
      s.off('id'); s.off('roomList'); s.off('onlineList'); s.off('joinedRoom'); s.off('roomUpdate')
      s.off('leftRoom'); s.off('youAreHost'); s.off('error'); s.off('gameStart')
    }
  }, [])

  const send = (ev, data = {}) => socket.current?.connected && socket.current.emit(ev, data)

  return (
    <AnimatePresence mode="wait">
      {currentRoom ? (
        <WaitingRoomView key="waiting"
          room={currentRoom} isHost={isHost} socketId={socketId}
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
