require('dotenv').config()
const { createServer } = require('http')
const { Server }       = require('socket.io')
const { nanoid }       = require('nanoid')
const mysql            = require('mysql2/promise')

const PORT        = process.env.PORT        || 4321
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*'

// ── MySQL (optional) ──────────────────────────────────────────────────────────
let db = null
async function initDB() {
  try {
    const pool = mysql.createPool({
      host:               process.env.DB_HOST             || '127.0.0.1',
      port:               Number(process.env.DB_PORT)     || 3306,
      user:               process.env.DB_USER             || 'root',
      password:           process.env.DB_PASSWORD         || '',
      database:           process.env.DB_NAME             || 'gameastro',
      waitForConnections: true,
      connectionLimit:    10,
      connectTimeout:     Number(process.env.DB_CONNECT_TIMEOUT) || 3000
    })
    await pool.query('SELECT 1')
    db = pool
    console.log('✅ MySQL connected')
  } catch (e) {
    console.warn('⚠️  MySQL not available - running without DB:', e.message)
    db = null
  }
}

async function dbRun(sql, params = []) {
  if (!db) return null
  try { const [r] = await db.execute(sql, params); return r }
  catch (e) { console.warn('DB error:', e.message); return null }
}

// ── HTTP + Socket.IO ──────────────────────────────────────────────────────────
const httpServer = createServer((req, res) => {
  if (req.url === '/rooms') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
    res.end(JSON.stringify(getRoomList()))
    return
  }
  res.writeHead(404); res.end()
})

const io = new Server(httpServer, {
  cors: { origin: CORS_ORIGIN, methods: ['GET', 'POST'] }
})

// ── In-memory state ───────────────────────────────────────────────────────────
const players = new Map()  // socketId → { socket, roomId, name, color, ready, state }
const rooms   = new Map()  // roomId   → { id, name, host, hostName, maxPlayers, started, players: Set }

// ── Room helpers ──────────────────────────────────────────────────────────────
function getRoomList() {
  return [...rooms.values()].map(r => ({
    id: r.id, name: r.name, host: r.hostName,
    maxPlayers: r.maxPlayers, players: r.players.size, started: r.started
  }))
}

function getRoomPlayers(roomId) {
  const room = rooms.get(roomId)
  if (!room) return []
  return [...room.players].map(sid => {
    const p = players.get(sid)
    return p ? { id: sid, name: p.name, color: p.color, ready: p.ready || false, ...p.state } : null
  }).filter(Boolean)
}

function broadcastRoom(roomId, event, data, excludeId = null) {
  const room = rooms.get(roomId)
  if (!room) return
  room.players.forEach(sid => {
    if (sid === excludeId) return
    players.get(sid)?.socket.emit(event, data)
  })
}

function leaveRoom(socketId) {
  const p = players.get(socketId)
  if (!p?.roomId) return
  const room = rooms.get(p.roomId)
  if (!room) return
  const leaverName = p.name || '?'
  room.players.delete(socketId)
  const oldRoomId = p.roomId
  p.roomId = null
  if (room.players.size === 0) {
    rooms.delete(oldRoomId)
    // CASCADE on game_rooms FK auto-deletes game_room_players, game_room_events, chat_messages (room channel)
    dbRun('DELETE FROM game_rooms WHERE id=?', [oldRoomId])
    console.log(`Room "${room.name}" deleted (empty)`)
  } else {
    if (room.host === socketId) {
      room.host = [...room.players][0]
      room.hostName = players.get(room.host)?.name || '?'
      players.get(room.host)?.socket.emit('youAreHost')
      roomSystemMsg(oldRoomId, `👑 ${players.get(room.host)?.name || '?'} trở thành chủ phòng mới`)
    }
    roomSystemMsg(oldRoomId, `🚪 ${leaverName} đã rời phòng`)
    broadcastRoom(oldRoomId, 'roomUpdate', { room: { ...room, players: getRoomPlayers(oldRoomId) } })
  }
  io.emit('roomList', { rooms: getRoomList() })
  dbRun('UPDATE game_room_players SET status=?,left_at=NOW() WHERE room_id=? AND socket_id=?',
    ['left', oldRoomId, socketId])
}

function shuffleArray(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ── Chat helpers ──────────────────────────────────────────────────────────────
// Returns a normalised message object that the client expects
function makeMsg({ senderId = 'system', name = 'System', color = 'white', text, system = false } = {}) {
  const now = new Date()
  const ts  = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`
  return { senderId, name, color, text, system, ts }
}

// Save to DB and return the saved row's timestamp (or now)
async function saveChat(channel, roomId, senderId, name, color, text, isSystem = false) {
  const result = await dbRun(
    `INSERT INTO chat_messages (channel,room_id,sender_id,sender_name,sender_color,message,is_system)
     VALUES (?,?,?,?,?,?,?)`,
    [channel, roomId || null, senderId, name, color, text, isSystem ? 1 : 0]
  )
  return result
}

// Lobby system message → broadcast to ALL sockets
function lobbySystemMsg(text) {
  const msg = makeMsg({ text, system: true })
  io.emit('lobbyChat', msg)
  saveChat('lobby', null, 'system', 'System', 'white', text, true)
}

// Room system message → broadcast to all players in room
function roomSystemMsg(roomId, text) {
  const msg = makeMsg({ text, system: true })
  broadcastRoom(roomId, 'roomChat', msg)
  saveChat('room', roomId, 'system', 'System', 'white', text, true)
}

// ── Socket.IO connections ─────────────────────────────────────────────────────
io.on('connection', (socket) => {
  players.set(socket.id, { socket, roomId: null, state: null, name: '', color: 'red', ready: false })
  console.log(`+ ${socket.id} connected (total: ${players.size})`)

  socket.emit('id', { id: socket.id })
  socket.emit('roomList', { rooms: getRoomList() })

  socket.on('setProfile', ({ name, color, uuid }) => {
    const p = players.get(socket.id); if (!p) return
    p.name  = (name  || 'Player').slice(0, 12)
    p.color = color  || 'red'
    p.uuid  = uuid   || socket.id  // persistent UUID from client localStorage
  })

  // ── Chat history (client requests after UI is ready — no race condition) ──
  socket.on('getChatHistory', async ({ channel, roomId }) => {
    if (channel === 'lobby') {
      const rows = await dbRun(
        `SELECT sender_id,sender_name,sender_color,message,is_system,
                DATE_FORMAT(created_at,'%H:%i') AS ts
         FROM chat_messages WHERE channel='lobby'
         ORDER BY created_at DESC LIMIT 40`)
      if (rows?.length)
        socket.emit('chatHistory', { channel: 'lobby', messages: rows.reverse() })
    } else if (channel === 'room' && roomId) {
      const rows = await dbRun(
        `SELECT sender_id,sender_name,sender_color,message,is_system,
                DATE_FORMAT(created_at,'%H:%i') AS ts
         FROM chat_messages WHERE channel='room' AND room_id=?
         ORDER BY created_at DESC LIMIT 60`,
        [roomId])
      if (rows?.length)
        socket.emit('chatHistory', { channel: 'room', roomId, messages: rows.reverse() })
    }
  })

  // ── Lobby chat ────────────────────────────────────────────────────────────
  // Rule: server broadcasts to ALL (including sender). Client uses senderId===myId for bubble style.
  socket.on('lobbyChat', ({ text }) => {
    const p = players.get(socket.id); if (!p) return
    const clean = (text || '').trim().slice(0, 120)
    if (!clean) return
    const msg = makeMsg({ senderId: p.uuid, name: p.name, color: p.color, text: clean })
    io.emit('lobbyChat', msg)   // everyone, including sender
    saveChat('lobby', null, p.uuid, p.name, p.color, clean)
  })

  // ── Room chat ─────────────────────────────────────────────────────────────
  // Rule: broadcast to others, echo back to sender. Client uses senderId===myId for bubble style.
  socket.on('roomChat', ({ text }) => {
    const p = players.get(socket.id); if (!p?.roomId) return
    const clean = (text || '').trim().slice(0, 120)
    if (!clean) return
    const msg = makeMsg({ senderId: p.uuid, name: p.name, color: p.color, text: clean })
    broadcastRoom(p.roomId, 'roomChat', msg, socket.id)  // others only
    socket.emit('roomChat', msg)                          // echo to sender once
    saveChat('room', p.roomId, p.uuid, p.name, p.color, clean)
  })

  // ── Room management ───────────────────────────────────────────────────────
  socket.on('createRoom', async ({ roomName, maxPlayers }) => {
    const p = players.get(socket.id); if (!p) return
    const maxP = [6, 8, 10].includes(maxPlayers) ? maxPlayers : 8
    const roomId = nanoid(10)
    const room = {
      id: roomId,
      name: (roomName || `${p.name}'s Room`).slice(0, 20),
      host: socket.id, hostName: p.name,
      maxPlayers: maxP, started: false,
      players: new Set([socket.id])
    }
    rooms.set(roomId, room)
    p.roomId = roomId; p.ready = false
    socket.emit('joinedRoom', { roomId, isHost: true, room: { ...room, players: getRoomPlayers(roomId) } })
    io.emit('roomList', { rooms: getRoomList() })
    lobbySystemMsg(`🚀 ${p.name} vừa tạo phòng "${room.name}"`)
    roomSystemMsg(roomId, `👑 ${p.name} đã tạo phòng. Chào mừng!`)
    await dbRun('INSERT INTO game_rooms (id,name,host_id,host_name,max_players,player_count) VALUES (?,?,?,?,?,1)',
      [roomId, room.name, socket.id, p.name, maxP])
    await dbRun('INSERT INTO game_room_players (room_id,socket_id,player_name,color,is_host) VALUES (?,?,?,?,1)',
      [roomId, socket.id, p.name, p.color])
  })

  socket.on('joinRoom', async ({ roomId }) => {
    const p = players.get(socket.id); if (!p) return
    const room = rooms.get(roomId)
    if (!room)                                { socket.emit('error', { msg: 'Phòng không tồn tại' }); return }
    if (room.started)                         { socket.emit('error', { msg: 'Trận đấu đã bắt đầu' }); return }
    if (room.players.size >= room.maxPlayers) { socket.emit('error', { msg: 'Phòng đã đầy' }); return }
    if (p.roomId) leaveRoom(socket.id)
    room.players.add(socket.id); p.roomId = roomId; p.ready = false
    socket.emit('joinedRoom', { roomId, isHost: false, room: { ...room, players: getRoomPlayers(roomId) } })
    broadcastRoom(roomId, 'roomUpdate', { room: { ...room, players: getRoomPlayers(roomId) } }, socket.id)
    io.emit('roomList', { rooms: getRoomList() })
    roomSystemMsg(roomId, `👤 ${p.name} đã vào phòng`)
    await dbRun('INSERT INTO game_room_players (room_id,socket_id,player_name,color) VALUES (?,?,?,?)',
      [roomId, socket.id, p.name, p.color])
    await dbRun('UPDATE game_rooms SET player_count=player_count+1 WHERE id=?', [roomId])
  })

  socket.on('leaveRoom', () => { leaveRoom(socket.id); socket.emit('leftRoom') })

  socket.on('setReady', ({ ready }) => {
    const p = players.get(socket.id); if (!p) return
    p.ready = !!ready
    const room = rooms.get(p.roomId); if (!room) return
    broadcastRoom(p.roomId, 'roomUpdate', { room: { ...room, players: getRoomPlayers(p.roomId) } })
  })

  socket.on('startGame', async () => {
    const p = players.get(socket.id); if (!p) return
    const room = rooms.get(p.roomId)
    if (!room || room.host !== socket.id) return
    if (room.players.size < 2) { socket.emit('error', { msg: 'Cần ít nhất 2 người chơi' }); return }
    const notReady = [...room.players].filter(sid => sid !== room.host && !players.get(sid)?.ready)
    if (notReady.length > 0) { socket.emit('error', { msg: `Còn ${notReady.length} người chưa sẵn sàng` }); return }
    room.started = true
    const playerIds = [...room.players]
    const impostorCount = playerIds.length >= 7 ? 2 : 1
    const impostors = shuffleArray(playerIds).slice(0, Math.min(impostorCount, playerIds.length))
    playerIds.forEach(sid => {
      const isImposter = impostors.includes(sid)
      players.get(sid)?.socket.emit('gameStart', { isImposter, roomId: room.id, players: getRoomPlayers(room.id) })
      dbRun('UPDATE game_room_players SET role=? WHERE room_id=? AND socket_id=?',
        [isImposter ? 'impostor' : 'crewmate', room.id, sid])
    })
    io.emit('roomList', { rooms: getRoomList() })
    await dbRun('UPDATE game_rooms SET status=? WHERE id=?', ['started', room.id])
  })

  // ── In-game events ────────────────────────────────────────────────────────
  socket.on('update', (data) => {
    const p = players.get(socket.id); if (!p) return
    p.state = { id: socket.id, ...data }
    const room = rooms.get(p.roomId)
    if (room) broadcastRoom(p.roomId, 'players', { players: getRoomPlayers(p.roomId) }, socket.id)
  })

  socket.on('kill', ({ victimId }) => {
    const p = players.get(socket.id); if (!p?.roomId) return
    broadcastRoom(p.roomId, 'kill', { killerId: socket.id, victimId })
    dbRun('INSERT INTO game_room_events (room_id,event_type,actor_id,target_id) VALUES (?,?,?,?)',
      [p.roomId, 'kill', socket.id, victimId])
    dbRun('UPDATE game_room_players SET status=? WHERE room_id=? AND socket_id=?', ['ghost', p.roomId, victimId])
  })

  socket.on('report', ({ victimId }) => {
    const p = players.get(socket.id); if (!p?.roomId) return
    broadcastRoom(p.roomId, 'meeting', { reporterId: socket.id, victimId })
    dbRun('INSERT INTO game_room_events (room_id,event_type,actor_id,target_id) VALUES (?,?,?,?)',
      [p.roomId, 'meeting', socket.id, victimId])
  })

  socket.on('emergency', () => {
    const p = players.get(socket.id); if (!p?.roomId) return
    broadcastRoom(p.roomId, 'meeting', { reporterId: socket.id, victimId: null })
    dbRun('INSERT INTO game_room_events (room_id,event_type,actor_id) VALUES (?,?,?)', [p.roomId, 'meeting', socket.id])
  })

  socket.on('vote', ({ targetId }) => {
    const p = players.get(socket.id); if (!p?.roomId) return
    broadcastRoom(p.roomId, 'vote', { voterId: socket.id, targetId })
    dbRun('INSERT INTO game_room_events (room_id,event_type,actor_id,target_id) VALUES (?,?,?,?)',
      [p.roomId, 'vote', socket.id, String(targetId)])
  })

  socket.on('meetingChat', ({ text }) => {
    const p = players.get(socket.id); if (!p?.roomId) return
    broadcastRoom(p.roomId, 'meetingChat', { senderId: socket.id, text: (text || '').slice(0, 80) }, socket.id)
  })

  socket.on('chat', ({ text, channel, x, y }) => {
    const p = players.get(socket.id); if (!p?.roomId) return
    const room = rooms.get(p.roomId); if (!room) return
    const senderAlive = p.state?.alive !== false
    const ch = channel || (senderAlive ? 'living' : 'ghost')
    const PROXIMITY = 600
    room.players.forEach(sid => {
      if (sid === socket.id) return
      const t = players.get(sid); if (!t) return
      const tAlive = t.state?.alive !== false
      if (ch === 'ghost') {
        if (!tAlive) t.socket.emit('chat', { channel: 'ghost', senderId: socket.id, name: p.name, color: p.color, text })
      } else {
        if (!tAlive) return
        const dx = (t.state?.x || 0) - (x || 0), dy = (t.state?.y || 0) - (y || 0)
        if (Math.sqrt(dx*dx + dy*dy) <= PROXIMITY)
          t.socket.emit('chat', { channel: 'living', senderId: socket.id, name: p.name, color: p.color, text })
      }
    })
  })

  socket.on('sabotage', ({ type }) => {
    const p = players.get(socket.id); if (!p?.roomId) return
    broadcastRoom(p.roomId, 'sabotage', { type }, socket.id)
    dbRun('INSERT INTO game_room_events (room_id,event_type,actor_id,payload) VALUES (?,?,?,?)',
      [p.roomId, 'sabotage', socket.id, JSON.stringify({ type })])
  })

  socket.on('sabotageFixed', ({ type }) => {
    const p = players.get(socket.id); if (!p?.roomId) return
    broadcastRoom(p.roomId, 'sabotageFixed', { type }, socket.id)
  })

  socket.on('sabotageFixProgress', ({ type, point }) => {
    const p = players.get(socket.id); if (!p?.roomId) return
    broadcastRoom(p.roomId, 'sabotageFixProgress', { type, point }, socket.id)
  })

  socket.on('taskDone', ({ taskId }) => {
    const p = players.get(socket.id); if (!p?.roomId) return
    if (!p.state) p.state = {}
    p.state.tasks = (p.state.tasks || 0) + 1
    const room = rooms.get(p.roomId); if (!room) return
    broadcastRoom(p.roomId, 'players', { players: getRoomPlayers(p.roomId) }, socket.id)
    const ids = [...room.players]
    const total = ids.reduce((s, sid) => s + (!players.get(sid)?.state?.imposter ? 5 : 0), 0)
    const done  = ids.reduce((s, sid) => s + (!players.get(sid)?.state?.imposter ? (players.get(sid)?.state?.tasks || 0) : 0), 0)
    if (done >= total && total > 0) broadcastRoom(p.roomId, 'gameover', { winner: 'crew' })
    dbRun('INSERT INTO game_room_events (room_id,event_type,actor_id,payload) VALUES (?,?,?,?)',
      [p.roomId, 'task_done', socket.id, JSON.stringify({ taskId })])
    dbRun('UPDATE game_room_players SET tasks_done=tasks_done+1 WHERE room_id=? AND socket_id=?', [p.roomId, socket.id])
  })

  socket.on('gameover', ({ winner }) => {
    const p = players.get(socket.id); if (!p?.roomId) return
    const roomId = p.roomId
    broadcastRoom(roomId, 'gameover', { winner })
    dbRun('INSERT INTO game_room_events (room_id,event_type,payload) VALUES (?,?,?)',
      [roomId, 'gameover', JSON.stringify({ winner })])
    dbRun('UPDATE game_rooms SET status=?,ended_at=NOW() WHERE id=?', ['ended', roomId])
    const room = rooms.get(roomId)
    if (room) {
      room.started = false
      room.players.forEach(sid => {
        const pl = players.get(sid)
        if (pl) { pl.state = null; pl.ready = false }
      })
      broadcastRoom(roomId, 'returnToLobby', { roomId, room: { ...room, players: getRoomPlayers(roomId) } })
    }
    io.emit('roomList', { rooms: getRoomList() })
  })

  socket.on('disconnect', () => {
    leaveRoom(socket.id)
    players.delete(socket.id)
    console.log(`- ${socket.id} disconnected (total: ${players.size})`)
  })

  // Voice Chat Signaling
  socket.on('voiceJoin', ({ roomId }) => {
    const p = players.get(socket.id)
    if (!p) return
    const room = rooms.get(roomId)
    if (!room) return
    room.players.forEach(sid => {
      if (sid !== socket.id) {
        players.get(sid)?.socket.emit('voicePeerJoined', { peerId: socket.id })
      }
    })
    console.log(`${socket.id} joined voice in room ${roomId}`)
  })

  socket.on('voiceLeave', ({ roomId }) => {
    const room = rooms.get(roomId)
    if (!room) return
    room.players.forEach(sid => {
      if (sid !== socket.id) {
        players.get(sid)?.socket.emit('voicePeerLeft', { peerId: socket.id })
      }
    })
    console.log(`${socket.id} left voice in room ${roomId}`)
  })

  socket.on('voiceOffer', ({ roomId, to, offer }) => {
    const targetSocket = players.get(to)?.socket
    if (targetSocket) {
      targetSocket.emit('voiceOffer', { from: socket.id, offer })
    }
  })

  socket.on('voiceAnswer', ({ roomId, to, answer }) => {
    const targetSocket = players.get(to)?.socket
    if (targetSocket) {
      targetSocket.emit('voiceAnswer', { from: socket.id, answer })
    }
  })

  socket.on('voiceIceCandidate', ({ roomId, to, candidate }) => {
    const targetSocket = players.get(to)?.socket
    if (targetSocket) {
      targetSocket.emit('voiceIceCandidate', { from: socket.id, candidate })
    }
  })
})

initDB().then(() => {
  httpServer.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`))
})
