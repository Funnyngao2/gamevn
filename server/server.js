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
  if (!db) return null;
  try {
    const [r] = await db.execute(sql, params);
    return r;
  } catch (e) {
    console.error(`❌ MySQL Error [${e.code}]:`, e.message);
    console.error(`Query: ${sql}`);
    return null;
  }
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
  cors: { origin: CORS_ORIGIN, methods: ['GET', 'POST'] },
  maxHttpBufferSize: 1e7 // Tăng buffer size lên 10MB để hỗ trợ gửi audio base64
})

// ── In-memory state ───────────────────────────────────────────────────────────
const players = new Map()
const rooms   = new Map()

// ── Room helpers ──────────────────────────────────────────────────────────────
function getRoomList() {
  return [...rooms.values()].map(r => ({
    id: r.id, name: r.name, host: r.hostName,
    maxPlayers: r.maxPlayers, players: r.players.size, started: r.started
  }))
}

function getOnlineList() {
  return [...players.entries()].map(([sid, p]) => ({
    id: sid, name: p.name || '?', color: p.color || 'red',
    roomId: p.roomId || null, mic: p.mic || false
  })).filter(p => p.name && p.name !== '')
}

function getRoomPlayers(roomId) {
  const room = rooms.get(roomId)
  if (!room) return []
  return [...room.players].map(sid => {
    const p = players.get(sid)
    return p ? { id: sid, name: p.name, color: p.color, ready: p.ready || false, mic: p.mic || false, ...p.state } : null
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
    dbRun('DELETE FROM game_rooms WHERE id=?', [oldRoomId])
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
  io.emit('onlineList', { users: getOnlineList() })
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
function makeMsg({ senderId = 'system', name = 'System', color = 'white', text, system = false, audioData = null } = {}) {
  const now = new Date()
  const ts  = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`
  return { senderId, name, color, text, system, audioData, ts }
}

async function saveChat(channel, roomId, senderId, name, color, text, isSystem = false, audioData = null) {
  try {
    const result = await dbRun(
      `INSERT INTO chat_messages (channel,room_id,sender_id,sender_name,sender_color,message,is_system,audio_data)
       VALUES (?,?,?,?,?,?,?,?)`,
      [channel, roomId || null, senderId, name, color, text, isSystem ? 1 : 0, audioData]
    );
    if (result) console.log(`✅ Chat saved to DB (${channel})`);
    return result;
  } catch (e) {
    console.error(`❌ DB Save Error (${channel}):`, e.message);
    // Dự phòng nếu thiếu cột audio_data
    return await dbRun(
      `INSERT INTO chat_messages (channel,room_id,sender_id,sender_name,sender_color,message,is_system)
       VALUES (?,?,?,?,?,?,?)`,
      [channel, roomId || null, senderId, name, color, text, isSystem ? 1 : 0]
    ).catch(e2 => console.error(`❌ DB Critical Error:`, e2.message));
  }
}

function lobbySystemMsg(text) {
  const msg = makeMsg({ text, system: true })
  io.emit('lobbyChat', msg)
  // Đã bỏ saveChat để không lưu lịch sử vào/ra sảnh
}

function roomSystemMsg(roomId, text) {
  const msg = makeMsg({ text, system: true })
  broadcastRoom(roomId, 'roomChat', msg)
  // Đã bỏ saveChat để không lưu lịch sử hệ thống trong phòng
}

// ── Socket.IO connections ─────────────────────────────────────────────────────
io.on('connection', (socket) => {
  players.set(socket.id, { socket, roomId: null, state: null, name: '', color: 'red', ready: false, mic: false })
  console.log(`+ ${socket.id} connected`)

  socket.emit('id', { id: socket.id })
  socket.emit('roomList', { rooms: getRoomList() })
  io.emit('onlineList', { users: getOnlineList() })

  socket.on('setProfile', ({ name, color, uuid }) => {
    const p = players.get(socket.id); if (!p) return
    const isNew = !p.name
    p.name  = (name  || 'Player').slice(0, 12)
    p.color = color  || 'red'
    p.uuid  = uuid   || socket.id
    io.emit('onlineList', { users: getOnlineList() })
    if (isNew) lobbySystemMsg(`👋 ${p.name} đã tham gia sảnh`)
  })

  socket.on('getChatHistory', async ({ channel, roomId }) => {
    if (channel === 'lobby') {
      const rows = await dbRun(`SELECT * FROM chat_messages WHERE channel='lobby' ORDER BY created_at DESC LIMIT 40`)
      if (rows?.length) socket.emit('chatHistory', { channel: 'lobby', messages: rows.reverse() })
    } else if (channel === 'room' && roomId) {
      const rows = await dbRun(`SELECT * FROM chat_messages WHERE channel='room' AND room_id=? ORDER BY created_at DESC LIMIT 60`, [roomId])
      if (rows?.length) socket.emit('chatHistory', { channel: 'room', roomId, messages: rows.reverse() })
    }
  })

  socket.on('lobbyChat', ({ text, audioData }) => {
    const p = players.get(socket.id); if (!p) return
    const msg = makeMsg({ senderId: p.uuid, name: p.name, color: p.color, text, audioData })
    io.emit('lobbyChat', msg)
    saveChat('lobby', null, p.uuid, p.name, p.color, text, false, audioData)
  })

  socket.on('roomChat', ({ text, audioData }) => {
    const p = players.get(socket.id); if (!p?.roomId) return
    const msg = makeMsg({ senderId: p.uuid, name: p.name, color: p.color, text, audioData })
    broadcastRoom(p.roomId, 'roomChat', msg, socket.id)
    socket.emit('roomChat', msg)
    saveChat('room', p.roomId, p.uuid, p.name, p.color, text, false, audioData)
  })

  socket.on('createRoom', async ({ roomName, maxPlayers }) => {
    const p = players.get(socket.id); if (!p) return
    const maxP = [6, 8, 10].includes(maxPlayers) ? maxPlayers : 8
    const roomId = nanoid(10)
    const room = { id: roomId, name: (roomName || `${p.name}'s Room`).slice(0, 20), host: socket.id, hostName: p.name, maxPlayers: maxP, started: false, players: new Set([socket.id]) }
    rooms.set(roomId, room); p.roomId = roomId; p.ready = false
    socket.emit('joinedRoom', { roomId, isHost: true, room: { ...room, players: getRoomPlayers(roomId) } })
    io.emit('roomList', { rooms: getRoomList() }); io.emit('onlineList', { users: getOnlineList() })
    roomSystemMsg(roomId, `${p.name} đã tạo phòng "${room.name}". Chào mừng!`)
  })

  socket.on('joinRoom', async ({ roomId }) => {
    const p = players.get(socket.id); if (!p) return
    const room = rooms.get(roomId)
    if (!room || room.started || room.players.size >= room.maxPlayers) return
    room.players.add(socket.id); p.roomId = roomId; p.ready = false
    socket.emit('joinedRoom', { roomId, isHost: false, room: { ...room, players: getRoomPlayers(roomId) } })
    broadcastRoom(roomId, 'roomUpdate', { room: { ...room, players: getRoomPlayers(roomId) } }, socket.id)
    io.emit('roomList', { rooms: getRoomList() }); io.emit('onlineList', { users: getOnlineList() })
    roomSystemMsg(roomId, `👤 ${p.name} đã vào phòng`)
  })

  socket.on('leaveRoom', () => { leaveRoom(socket.id); socket.emit('leftRoom') })

  socket.on('setReady', ({ ready }) => {
    const p = players.get(socket.id); if (!p) return
    p.ready = !!ready
    const room = rooms.get(p.roomId); if (room) broadcastRoom(p.roomId, 'roomUpdate', { room: { ...room, players: getRoomPlayers(p.roomId) } })
  })

  socket.on('toggleMic', ({ isMicOn }) => {
    const p = players.get(socket.id); if (!p) return
    p.mic = !!isMicOn
    const room = rooms.get(p.roomId); if (room) broadcastRoom(p.roomId, 'roomUpdate', { room: { ...room, players: getRoomPlayers(p.roomId) } })
    io.emit('onlineList', { users: getOnlineList() })
  })

  socket.on('invitePlayer', ({ targetId, roomName, roomId }) => {
    const p = players.get(socket.id); const target = players.get(targetId)
    if (target) target.socket.emit('receiveInvite', { fromName: p.name, fromColor: p.color, roomName, roomId })
  })

  socket.on('disconnect', () => {
    const p = players.get(socket.id)
    if (p && p.name) lobbySystemMsg(`🚪 ${p.name} đã rời game`)
    leaveRoom(socket.id); players.delete(socket.id)
    io.emit('onlineList', { users: getOnlineList() })
  })

  // Voice WebRTC Signaling
  socket.on('voiceJoin', ({ roomId }) => {
    const room = rooms.get(roomId); if (room) room.players.forEach(sid => { if (sid !== socket.id) players.get(sid)?.socket.emit('voicePeerJoined', { peerId: socket.id }) })
  })
  socket.on('voiceOffer', ({ to, offer }) => { players.get(to)?.socket.emit('voiceOffer', { from: socket.id, offer }) })
  socket.on('voiceAnswer', ({ to, answer }) => { players.get(to)?.socket.emit('voiceAnswer', { from: socket.id, answer }) })
  socket.on('voiceIceCandidate', ({ to, candidate }) => { players.get(to)?.socket.emit('voiceIceCandidate', { from: socket.id, candidate }) })
})

initDB().then(() => { httpServer.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`)) })
