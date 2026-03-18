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
  maxHttpBufferSize: 1e7
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
    return p ? { id: sid, uuid: p.uuid, name: p.name, color: p.color, ready: p.ready || false, mic: p.mic || false, ...p.state } : null
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
}

function roomSystemMsg(roomId, text) {
  const msg = makeMsg({ text, system: true })
  broadcastRoom(roomId, 'roomChat', msg)
}

// ── In-game state broadcast tick (30ms batch) ────────────────────────────────
setInterval(() => {
  rooms.forEach((room, roomId) => {
    if (!room.started) return
    const playerList = getRoomPlayers(roomId).map(pl => ({
      ...pl,
      ...(players.get(pl.id)?.state || {}),
      id: pl.id
    }))
    room.players.forEach(sid => {
      players.get(sid)?.socket.emit('players', { players: playerList })
    })
  })
}, 30)

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

    // Nếu người chơi đã ở trong một phòng, gửi lại thông tin phòng đó
    if (p.roomId) {
      const room = rooms.get(p.roomId)
      if (room) {
        socket.emit('joinedRoom', {
          roomId: p.roomId,
          isHost: room.host === socket.id,
          room: { ...room, players: getRoomPlayers(p.roomId) }
        })
      }
    }
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
    if (!room) return
    
    // Kiểm tra xem người này có phải đang re-join (vào lại) không dựa trên UUID
    const existingPlayerSid = [...room.players].find(sid => players.get(sid)?.uuid === p.uuid)
    
    if (room.started && !existingPlayerSid) {
      return socket.emit('error', { msg: 'Trận đấu đã bắt đầu' })
    }

    if (!room.started && room.players.size >= room.maxPlayers) {
      return socket.emit('error', { msg: 'Phòng đã đầy' })
    }

    // Nếu là re-join, xóa session cũ
    if (existingPlayerSid && existingPlayerSid !== socket.id) {
      room.players.delete(existingPlayerSid)
    }

    room.players.add(socket.id); p.roomId = roomId; p.ready = false
    socket.emit('joinedRoom', { roomId, isHost: room.host === socket.id, room: { ...room, players: getRoomPlayers(roomId) } })
    broadcastRoom(roomId, 'roomUpdate', { room: { ...room, players: getRoomPlayers(roomId) } }, socket.id)
    io.emit('roomList', { rooms: getRoomList() }); io.emit('onlineList', { users: getOnlineList() })
    roomSystemMsg(roomId, `👤 ${p.name} đã ${existingPlayerSid ? 'vào lại' : 'vào'} phòng`)
  })

  // Định kỳ 2 giây gửi cập nhật phòng để đảm bảo đồng bộ cho những người ẩn tab
  const heartbeat = setInterval(() => {
    rooms.forEach((room, roomId) => {
      if (room.players.size > 0) {
        const updateData = { room: { ...room, players: getRoomPlayers(roomId) } }
        broadcastRoom(roomId, 'roomUpdate', updateData)
      }
    })
  }, 2000)

  socket.on('leaveRoom', () => { leaveRoom(socket.id); socket.emit('leftRoom') })

  socket.on('setReady', ({ ready }) => {
    const p = players.get(socket.id); if (!p) return
    p.ready = !!ready
    const room = rooms.get(p.roomId); 
    if (room) {
      const updateData = { room: { ...room, players: getRoomPlayers(p.roomId) } }
      broadcastRoom(p.roomId, 'roomUpdate', updateData)
      socket.emit('roomUpdate', updateData) // Đảm bảo người gửi cũng nhận được update
    }
  })

  socket.on('startGame', async () => {
    const p = players.get(socket.id); if (!p?.roomId) return
    const room = rooms.get(p.roomId); if (!room || room.started) return
    if (room.host !== socket.id) return socket.emit('error', { msg: 'Chỉ chủ phòng mới được bắt đầu' })

    const playerList = getRoomPlayers(p.roomId)
    const nonHost = playerList.filter(pl => pl.id !== room.host)
    const allReady = nonHost.length > 0 && nonHost.every(pl => pl.ready)

    if (playerList.length < 2) return socket.emit('error', { msg: 'Cần ít nhất 2 người' })
    if (!allReady) return socket.emit('error', { msg: 'Chờ tất cả sẵn sàng' })

    room.started = true
    dbRun('UPDATE game_rooms SET status="started" WHERE id=?', [p.roomId])

    // Phân vai và khởi tạo vị trí mặc định
    const sids = [...room.players]
    const imposterCount = sids.length >= 7 ? 2 : 1
    const shuffled = shuffleArray(sids)
    const imposters = new Set(shuffled.slice(0, imposterCount))

    sids.forEach((sid, index) => {
      const isImposter = imposters.has(sid)
      const p = players.get(sid)
      if (p) {
        // Khởi tạo trạng thái ban đầu để tránh việc tab ẩn không hiện nhân vật
        p.state = { 
          x: 1766 + (index * 40), // Phân tán vị trí spawn một chút
          y: 1491, 
          alive: true, 
          isGhost: false,
          imposter: isImposter
        }
        p.socket.emit('gameStart', {
          roomId: p.roomId, isImposter, players: playerList
        })
      }
      dbRun('UPDATE game_room_players SET role=? WHERE room_id=? AND socket_id=?', 
        [isImposter ? 'impostor' : 'crewmate', p.roomId, sid])
    })

    console.log(`🚀 Game started in room ${p.roomId}`)
    io.emit('roomList', { rooms: getRoomList() })
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

  socket.on('kickPlayer', ({ targetId }) => {
    const p = players.get(socket.id); if (!p?.roomId) return
    const room = rooms.get(p.roomId); if (!room) return
    if (room.host !== socket.id) return // Chỉ chủ phòng mới được kick

    const target = players.get(targetId)
    if (target && target.roomId === p.roomId) {
      const targetName = target.name || '?'
      roomSystemMsg(p.roomId, `🚫 ${targetName} đã bị chủ phòng đuổi khỏi phòng.`)
      
      // Thông báo cho người bị kick
      target.socket.emit('kicked', { reason: 'Bạn đã bị chủ phòng đuổi.' })
      
      // Thực hiện rời phòng
      leaveRoom(targetId)
    }
  })

  socket.on('disconnect', () => {
    const p = players.get(socket.id)
    if (p && p.name) lobbySystemMsg(`🚪 ${p.name} đã rời game`)
    leaveRoom(socket.id); players.delete(socket.id)
    io.emit('onlineList', { users: getOnlineList() })
  })

  // ── In-game events ───────────────────────────────────────────────────────────
  socket.on('update', (state) => {
    const p = players.get(socket.id); if (!p?.roomId) return
    p.state = state
    // Broadcast được xử lý bởi batch tick 30ms ở trên
  })

  socket.on('kill', ({ victimId }) => {
    const p = players.get(socket.id); if (!p?.roomId) return
    broadcastRoom(p.roomId, 'kill', { killerId: socket.id, victimId })
  })

  socket.on('report', ({ victimId }) => {
    const p = players.get(socket.id); if (!p?.roomId) return
    broadcastRoom(p.roomId, 'meeting', { reporterId: socket.id, victimId })
    socket.emit('meeting', { reporterId: socket.id, victimId })
  })

  socket.on('emergency', () => {
    const p = players.get(socket.id); if (!p?.roomId) return
    broadcastRoom(p.roomId, 'meeting', { reporterId: socket.id, victimId: null })
    socket.emit('meeting', { reporterId: socket.id, victimId: null })
  })

  socket.on('vote', ({ targetId }) => {
    const p = players.get(socket.id); if (!p?.roomId) return
    broadcastRoom(p.roomId, 'vote', { voterId: socket.id, targetId })
    socket.emit('vote', { voterId: socket.id, targetId })
  })

  socket.on('meetingChat', ({ text }) => {
    const p = players.get(socket.id); if (!p?.roomId) return
    broadcastRoom(p.roomId, 'meetingChat', { senderId: socket.id, text })
    socket.emit('meetingChat', { senderId: socket.id, text })
  })

  socket.on('chat', ({ text, channel, x, y }) => {
    const p = players.get(socket.id); if (!p?.roomId) return
    const msg = { senderId: socket.id, name: p.name, color: p.color, text, channel, x, y }

    if (channel === 'impostor') {
      // Chỉ gửi cho impostor trong phòng
      const room = rooms.get(p.roomId); if (!room) return
      room.players.forEach(sid => {
        const pl = players.get(sid)
        if (pl?.state?.imposter) pl.socket.emit('chat', msg)
      })
    } else if (channel === 'ghost') {
      // Chỉ gửi cho người đã chết
      const room = rooms.get(p.roomId); if (!room) return
      room.players.forEach(sid => {
        const pl = players.get(sid)
        if (pl?.state && !pl.state.alive) pl.socket.emit('chat', msg)
      })
    } else {
      // crew channel: gửi cho tất cả còn sống
      const room = rooms.get(p.roomId); if (!room) return
      room.players.forEach(sid => {
        const pl = players.get(sid)
        if (pl?.state?.alive) pl.socket.emit('chat', msg)
      })
    }
  })

  socket.on('taskDone', ({ taskId }) => {
    const p = players.get(socket.id); if (!p?.roomId) return
    broadcastRoom(p.roomId, 'taskDone', { playerId: socket.id, taskId })
  })

  socket.on('sabotage', ({ type }) => {
    const p = players.get(socket.id); if (!p?.roomId) return
    broadcastRoom(p.roomId, 'sabotage', { type })
    socket.emit('sabotage', { type })
  })

  socket.on('sabotageFixed', ({ type }) => {
    const p = players.get(socket.id); if (!p?.roomId) return
    broadcastRoom(p.roomId, 'sabotageFixed', { type })
    socket.emit('sabotageFixed', { type })
  })

  socket.on('sabotageFixProgress', ({ type, point }) => {
    const p = players.get(socket.id); if (!p?.roomId) return
    broadcastRoom(p.roomId, 'sabotageFixProgress', { type, point })
  })

  socket.on('gameover', ({ winner }) => {
    const p = players.get(socket.id); if (!p?.roomId) return
    const room = rooms.get(p.roomId); if (!room) return

    room.started = false

    // Reset ready cho tất cả players
    room.players.forEach(sid => {
      const player = players.get(sid)
      if (player) player.ready = false
    })

    broadcastRoom(p.roomId, 'gameover', { winner })
    socket.emit('gameover', { winner })

    // Reset roomUpdate cho tất cả kể cả người gửi
    const roomUpdate = { room: { ...room, players: getRoomPlayers(p.roomId) } }
    broadcastRoom(p.roomId, 'roomUpdate', roomUpdate)
    socket.emit('roomUpdate', roomUpdate)

    io.emit('roomList', { rooms: getRoomList() })
  })

  // Client gọi sau khi quay lại lobby để lấy state phòng mới nhất
  socket.on('getRoomState', () => {
    const p = players.get(socket.id); if (!p?.roomId) return
    const room = rooms.get(p.roomId); if (!room) return
    socket.emit('roomUpdate', { room: { ...room, players: getRoomPlayers(p.roomId) } })
  })

  // Voice WebRTC Signaling
  socket.on('voiceJoin', ({ roomId }) => {
    const room = rooms.get(roomId); if (room) room.players.forEach(sid => { if (sid !== socket.id) players.get(sid)?.socket.emit('voicePeerJoined', { peerId: socket.id }) })
  })
  socket.on('voiceJoinChannel', ({ channel, roomId }) => {
    // In-game voice: notify others in same channel
    const p = players.get(socket.id); if (!p?.roomId) return
    const room = rooms.get(p.roomId); if (!room) return
    room.players.forEach(sid => {
      if (sid === socket.id) return
      const pl = players.get(sid)
      if (!pl) return
      // crew channel: alive players; impostor: impostors only; ghost: dead players
      const state = pl.state || {}
      const canHear =
        channel === 'crew'     ? state.alive :
        channel === 'impostor' ? state.imposter :
        channel === 'ghost'    ? !state.alive : false
      if (canHear) pl.socket.emit('voicePeerJoined', { peerId: socket.id })
    })
  })
  socket.on('voiceOffer', ({ to, offer }) => { players.get(to)?.socket.emit('voiceOffer', { from: socket.id, offer }) })
  socket.on('voiceAnswer', ({ to, answer }) => { players.get(to)?.socket.emit('voiceAnswer', { from: socket.id, answer }) })
  socket.on('voiceIceCandidate', ({ to, candidate }) => { players.get(to)?.socket.emit('voiceIceCandidate', { from: socket.id, candidate }) })
})

initDB().then(() => { httpServer.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`)) })
