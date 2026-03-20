import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { COLOR_HEX } from './../views/lobbyShared.jsx'
import './GameChatOverlay.css'

export default function GameChatOverlay({ gameRef, socket, playerName, playerColor, isImposter, socketId }) {
  const [open, setOpen]           = useState(true) // mặc định mở, không dùng nút
  const [inputActive, setInputActive] = useState(false) // true khi đang gõ (focus input)
  const [messages, setMessages]  = useState([])
  const [input, setInput]         = useState('')
  const [channel, setChannel]     = useState('all')
  const [meetingActive, setMeetingActive] = useState(false)
  const inputRef  = useRef(null)
  const bottomRef = useRef(null)
  const panelRef  = useRef(null)

  // Trong cuộc họp vote: ẩn chat ngoài (dùng chat trong MeetingOverlay)
  useEffect(() => {
    let rafId
    const tick = () => {
      const active = gameRef.current?.registry?.get('meetingActive') === true
      setMeetingActive(active)
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [gameRef])

  // Khi chết: tự động chuyển sang kênh Hồn ma
  useEffect(() => {
    let rafId
    let prevAlive = true
    const tick = () => {
      const bridge = gameRef.current?.registry?.get('chatBridge')
      const alive = bridge?.alive !== false
      if (prevAlive && !alive) setChannel('ghost')
      prevAlive = alive
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [gameRef])

  // Register callbacks with Phaser registry
  useEffect(() => {
    const game = gameRef.current
    if (!game) return
    game.registry.set('onChatToggle', () => setOpen(o => !o))
    game.registry.set('onChatMessage', (msg) => {
      // Bỏ qua echo từ server của chính mình — đã hiển thị optimistic khi gửi
      if (msg.senderId === socketId) return
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

  // Enter (khi panel mở, chưa focus input) → focus input để bắt đầu chat
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key !== 'Enter') return
      if (document.activeElement === inputRef.current) return // đang gõ thì Enter = gửi (xử lý trong handleKey)
      e.preventDefault()
      setInputActive(true)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Focus input khi chuyển sang chế độ chat (inputActive = true)
  useEffect(() => {
    if (inputActive) setTimeout(() => inputRef.current?.focus(), 50)
  }, [inputActive])

  // Click ra ngoài panel → thoát input (blur, đóng chế độ chat)
  useEffect(() => {
    if (!inputActive) return
    const onMouseDown = (e) => {
      if (panelRef.current?.contains(e.target)) return
      setInputActive(false)
      inputRef.current?.blur()
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [inputActive])

  // Disable/enable Phaser keyboard capture khi mở panel hoặc đang gõ
  useEffect(() => {
    const game = gameRef.current
    if (!game) return
    try {
      const kb = game.input?.keyboard
      if (open || inputActive) kb?.disableGlobalCapture?.()
      else kb?.enableGlobalCapture?.()
    } catch (_) {}
  }, [open, inputActive])

  const sendMessage = () => {
    const text = input.trim()
    if (!text) return

    const ts = new Date().toTimeString().slice(0,5)

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
    if (e.key === 'Enter') {
      e.preventDefault()
      sendMessage()
    }
    if (e.key === 'Escape') {
      setInputActive(false)
      inputRef.current?.blur()
    }
  }

  const bridge = gameRef.current?.registry.get('chatBridge') || {}
  const isGhost = bridge.alive === false
  const canGhostChat = isGhost || isImposter

  const visible = messages.filter(m =>
    m.channel === 'ghost' ? canGhostChat : true
  )

  return (
    <>
      <AnimatePresence>
        {meetingActive && (
          <motion.div
            className="chat-overlay-panel chat-overlay-meeting-block"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="chat-header-minimal">
              <span className="chat-header-title">Đang trong cuộc họp — dùng chat cuộc họp</span>
            </div>
          </motion.div>
        )}
        {!meetingActive && open && (
          <motion.div
            ref={panelRef}
            className="chat-overlay-panel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {/* Chỉ nội dung tin nhắn — header tối giản */}
            <div className="chat-header-minimal">
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
                  >👻</button>
                )}
              </div>
            </div>

            <div className="chat-messages">
              {visible.length === 0 && (
                <p className="chat-empty">Nhấn Enter để chat</p>
              )}
              {visible.map((m, i) => {
                const isMe = m.senderId === socketId
                const color = COLOR_HEX[m.color] || '#94a3b8'
                const isGhostMsg = m.channel === 'ghost'
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

            {/* Input — chỉ hiện khi đang chat (sau khi bấm Enter) */}
            {inputActive && (
              <div className="chat-input-row">
                <input
                  ref={inputRef}
                  className="chat-input"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  onBlur={() => setInputActive(false)}
                  maxLength={120}
                  placeholder={channel === 'ghost' ? '👻 Hồn ma...' : 'Nhắn tin...'}
                />
                <button
                  className="chat-send-btn"
                  onClick={sendMessage}
                  disabled={!input.trim()}
                >Gửi</button>
              </div>
            )}
            {!inputActive && (
              <p className="chat-hint">Enter để chat · Click ra ngoài để thoát</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
