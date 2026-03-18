import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import './GameChatOverlay.css'

const COLOR_HEX = {
  red:'#e74c3c', blue:'#3b82f6', green:'#22c55e', orange:'#f97316',
  yellow:'#eab308', pink:'#ec4899', black:'#94a3b8', brown:'#b45309',
  purple:'#a855f7', white:'#f1f5f9',
}

export default function GameChatOverlay({ gameRef, socket, playerName, playerColor, isImposter, socketId }) {
  const [open, setOpen]         = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput]       = useState('')
  const [channel, setChannel]   = useState('all')
  const inputRef  = useRef(null)
  const bottomRef = useRef(null)
  // Track sent message IDs to avoid echo duplication
  const sentIds   = useRef(new Set())

  // Register callbacks with Phaser registry
  useEffect(() => {
    const game = gameRef.current
    if (!game) return
    game.registry.set('onChatToggle', () => setOpen(o => !o))
    game.registry.set('onChatMessage', (msg) => {
      // Bỏ qua echo của chính mình (đã optimistic)
      if (msg.senderId === socketId && sentIds.current.has(msg.text + msg.ts)) return
      setMessages(prev => [...prev.slice(-99), msg])
    })
    return () => {
      game.registry.remove?.('onChatToggle')
      game.registry.remove?.('onChatMessage')
    }
  }, [gameRef.current, socketId])

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus input khi mở
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  // Disable/enable Phaser keyboard capture
  useEffect(() => {
    const game = gameRef.current
    if (!game) return
    try {
      const kb = game.input?.keyboard
      if (open) kb?.disableGlobalCapture?.()
      else      kb?.enableGlobalCapture?.()
    } catch (_) {}
  }, [open])

  const sendMessage = () => {
    const text = input.trim()
    if (!text) return

    const ts = new Date().toTimeString().slice(0,5)
    // Track để tránh echo
    sentIds.current.add(text + ts)
    setTimeout(() => sentIds.current.delete(text + ts), 5000)

    // Gửi qua Phaser registry (GameScene._sendChat)
    const sendChat = gameRef.current?.registry.get('sendChat')
    if (sendChat) {
      sendChat(text, channel)
    } else if (socket?.connected) {
      socket.emit('chat', { text, channel })
    }

    // Optimistic local echo
    const bridge = gameRef.current?.registry.get('chatBridge') || {}
    setMessages(prev => [...prev.slice(-99), {
      senderId: socketId,
      name: playerName || 'Bạn',
      color: playerColor,
      text,
      channel,
      ts,
      isGhost: bridge.alive === false,
    }])
    setInput('')
  }

  const handleKey = (e) => {
    e.stopPropagation()
    if (e.key === 'Enter') sendMessage()
    if (e.key === 'Escape') setOpen(false)
  }

  const bridge = gameRef.current?.registry.get('chatBridge') || {}
  const isGhost = bridge.alive === false
  const canGhostChat = isGhost || isImposter

  const visible = messages.filter(m =>
    m.channel === 'ghost' ? canGhostChat : true
  )

  return (
    <>
      <button className="chat-overlay-btn" onClick={() => setOpen(o => !o)} title="Chat [T]">
        💬
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="chat-overlay-panel"
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ duration: 0.15 }}
          >
            {/* Header */}
            <div className="chat-header">
              <span className="chat-header-title">Chat</span>
              <div className="chat-channels">
                <button
                  className={`chat-channel-btn ${channel === 'all' ? 'active-all' : ''}`}
                  onClick={() => setChannel('all')}
                >Tất cả</button>
                {canGhostChat && (
                  <button
                    className={`chat-channel-btn ${channel === 'ghost' ? 'active-ghost' : ''}`}
                    onClick={() => setChannel('ghost')}
                  >👻 Hồn ma</button>
                )}
              </div>
              <button className="chat-close-btn" onClick={() => setOpen(false)}>✕</button>
            </div>

            {/* Messages */}
            <div className="chat-messages">
              {visible.length === 0 && (
                <p className="chat-empty">Chưa có tin nhắn...</p>
              )}
              {visible.map((m, i) => {
                const isMe = m.senderId === socketId
                const color = COLOR_HEX[m.color] || '#94a3b8'
                const isGhostMsg = m.channel === 'ghost'
                // server dùng m.name, fallback m.senderName
                const displayName = isMe ? (playerName || 'Bạn') : (m.name || m.senderName || 'Unknown')
                return (
                  <div key={i} className={`chat-msg ${isMe ? 'me' : 'other'}`}>
                    <span className="chat-msg-name" style={{ color: isGhostMsg ? '#a78bfa' : color }}>
                      {isGhostMsg ? '👻 ' : ''}{displayName}
                    </span>
                    <div className={`chat-msg-bubble ${isGhostMsg ? 'ghost-msg' : ''}`}>
                      {m.text}
                    </div>
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="chat-input-row">
              <input
                ref={inputRef}
                className="chat-input"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                maxLength={120}
                placeholder={channel === 'ghost' ? '👻 Nhắn hồn ma...' : 'Nhắn tin...'}
              />
              <button
                className="chat-send-btn"
                onClick={sendMessage}
                disabled={!input.trim()}
              >Gửi</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
