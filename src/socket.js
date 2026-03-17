import { io } from 'socket.io-client'

// Singleton socket — shared between React UI and Phaser game
let _socket = null

export function getSocket() {
  if (!_socket) {
    _socket = io('/', { transports: ['websocket'], autoConnect: false })
  }
  return _socket
}

export function connectSocket() {
  const s = getSocket()
  if (!s.connected) s.connect()
  return s
}

export function disconnectSocket() {
  _socket?.disconnect()
  _socket = null
}
