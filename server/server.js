require('dotenv').config()
const { createServer } = require('http')
const { Server }       = require('socket.io')
const { nanoid }       = require('nanoid')
const path             = require('path')
const fs               = require('fs')
const mysql            = require('mysql2/promise')

const PORT        = process.env.PORT        
const CORS_ORIGIN = process.env.CORS_ORIGIN 
const REACTOR_CRITICAL_TIME = 20000
const KILL_COOLDOWN = 16000
const SABOTAGE_COOLDOWN = 30000
const MEETING_COOLDOWN = 20000
const INTERACT_RANGE = 80
const KILL_RANGE = 95
const REACTOR_FIX_POINT = { x: 3320, y: 1200 }  // reactor_a only
const LIGHTS_FIX_POINT = { x: 1400, y: 1600 }
const EMERGENCY_BUTTON_POS = { x: 3320, y: 716 }
const TASKS_PER_PLAYER = 6
const MAX_EMERGENCY_MEETINGS_PER_PLAYER = 2
const EMERGENCY_E_COOLDOWN_MS = 10000

// Khi không đọc được Tasks từ map → dùng pool rỗng (không set cứng x,y vì không chính xác với map thật)
const TASK_POOL_FALLBACK = []

/** Đồng bộ với `taskRegistry.js` — kind hợp lệ cho mini-game React */
const TASK_MINIGAME_KINDS_LIST = [
  'fix_wiring', 'upload_data', 'empty_garbage', 'clear_asteroids', 'inspect_sample',
  'fuel_engines', 'align_output', 'calibrate_distributor', 'unlock_manifolds',
  'chart_course', 'stabilize_steering', 'prime_shields', 'picture_puzzle',
]
const TASK_KIND_ALIASES_SRV = {
  fuel_engine: 'fuel_engines',
  reboot_wifi: 'upload_data',
  stabilize_nav: 'stabilize_steering',
  scan_manifest: 'inspect_sample',
  task: 'fix_wiring',
}
function normalizeTaskKind(kind) {
  const raw = String(kind || 'task').trim()
  const v = TASK_KIND_ALIASES_SRV[raw] || raw
  return TASK_MINIGAME_KINDS_LIST.includes(v) ? v : 'fix_wiring'
}

/** Object trong Obstacles có tên này (hoặc spawn player) thì không coi là nhiệm vụ. */
const OBSTACLE_NAMES = new Set(['walls', 'wall', 'tables', 'vent', 'emerg_btn', 'emergency_btn'])
function isObstacleOrSpawn(name) {
  if (!name) return true
  if (OBSTACLE_NAMES.has(String(name).toLowerCase())) return true
  if (/^player\d*$/i.test(String(name))) return true
  return false
}

function isEmergencyOrNonTaskNameInTasksLayer(name) {
  const n = String(name || '').trim().toLowerCase()
  if (!n) return false
  // Nút khẩn cấp đôi khi bị đặt nhầm trong layer "Tasks"
  if (OBSTACLE_NAMES.has(n)) return true
  // Hỗ trợ trường hợp có suffix / index: emerg_btn1, emergency_btn_2,...
  if (/^emerg(?:ency)?(?:_|-)?btn\d*$/i.test(n)) return true
  if (/^player\d*$/i.test(n)) return true
  if (['walls', 'wall', 'tables', 'vent'].includes(n)) return true
  return false
}

/** Đọc danh sách nhiệm vụ từ map: chỉ lấy từ layer "Tasks". */
function loadTasksFromMap() {
  const mapPath = path.join(__dirname, '../public/assets/Maps/map.json')
  try {
    const raw = fs.readFileSync(mapPath, 'utf8')
    const data = JSON.parse(raw)
    const layers = data.layers || []
    let taskLayer = layers.find(l => (l.type === 'objectgroup' || l.type === 'object group') && (l.name === 'Tasks' || l.name === 'tasks'))
    if (!taskLayer || !Array.isArray(taskLayer.objects) || taskLayer.objects.length === 0) {
      // console.warn('[Tasks] Map không có object trong layer "Tasks" — dùng pool rỗng.')
      return TASK_POOL_FALLBACK
    }

    const tasks = taskLayer.objects
      // Lọc sạch các object kiểu "nút khẩn cấp" nếu bị đặt nhầm trong layer Tasks
      .filter(obj => obj.x != null && obj.y != null && !isEmergencyOrNonTaskNameInTasksLayer(obj.name))
      .map((obj, i) => {
        const props = (obj.properties || []).reduce((acc, p) => { acc[p.name] = p.value; return acc }, {})
        const id = props.id || (obj.id != null ? `task_${obj.id}` : null) || obj.name || `task_${i}`
        let kind = props.kind
        if (!kind && obj.name && obj.name.includes('_')) kind = obj.name.split('_').slice(0, -1).join('_')
        if (!kind) kind = 'task'
        const label = props.label || obj.name || id
        const x = Math.round((obj.x || 0) + (obj.width || 0) / 2)
        const y = Math.round((obj.y || 0) + (obj.height || 0) / 2)
        return { id: String(id), kind: String(kind), label: String(label), x, y }
      })
    if (tasks.length === 0) {
      console.warn('[Tasks] Không có object nhiệm vụ nào — dùng pool rỗng.')
      return TASK_POOL_FALLBACK
    }
    const normalized = tasks.map((t) => ({ ...t, kind: normalizeTaskKind(t.kind) }))
    // console.log(`[Tasks] Đã tải ${normalized.length} nhiệm vụ từ map (layer Tasks):`)
    normalized.forEach((t, i) => console.log(`  ${i + 1}. id: ${t.id} | kind: ${t.kind} | label: "${t.label}" | x: ${t.x}, y: ${t.y}`))
    return normalized
  } catch (e) {
    // console.warn('[Tasks] Không đọc được map — dùng pool rỗng:', e.message)
    return TASK_POOL_FALLBACK
  }
}

let TASK_POOL = loadTasksFromMap()

/** Đọc vị trí spawn từ map (Obstacles: object name player, player1..player12). Trả về mảng { x, y } (center). */
function loadSpawnsFromMap() {
  const mapPath = path.join(__dirname, '../public/assets/Maps/map.json')
  try {
    const raw = fs.readFileSync(mapPath, 'utf8')
    const data = JSON.parse(raw)
    const layers = data.layers || []
    const obstaclesLayer = layers.find(l => (l.type === 'objectgroup' || l.type === 'object group') && (l.name === 'Obstacles' || l.name === 'obstacles'))
    if (!obstaclesLayer || !Array.isArray(obstaclesLayer.objects)) return []
    const spawns = obstaclesLayer.objects
      .filter(obj => obj.x != null && obj.y != null && obj.name && /^player\d*$/i.test(String(obj.name)))
      .map(obj => ({
        x: Math.round((obj.x || 0) + (obj.width || 0) / 2),
        y: Math.round((obj.y || 0) + (obj.height || 0) / 2)
      }))
    return spawns
  } catch (e) {
    return []
  }
}

// ── MySQL (optional) ──────────────────────────────────────────────────────────
let db = null
async function initDB() {
  try {
    const pool = mysql.createPool({
      host:               process.env.DB_HOST           ,
      port:               Number(process.env.DB_PORT)     ,
      user:               process.env.DB_USER             ,
      password:           process.env.DB_PASSWORD        ,
      database:           process.env.DB_NAME        ,
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

function isAliveState(p) {
  // Default alive = true if state not yet set (pre-start)
  return p?.state?.alive !== false
}

function distance(a, b) {
  if (!a || !b) return Infinity
  const dx = (a.x || 0) - (b.x || 0)
  const dy = (a.y || 0) - (b.y || 0)
  return Math.sqrt(dx * dx + dy * dy)
}

function getAliveCounts(roomId) {
  const room = rooms.get(roomId)
  if (!room) return { crew: 0, imp: 0, totalAlive: 0 }
  let crew = 0, imp = 0
  room.players.forEach(sid => {
    const pl = players.get(sid)
    if (!pl) return
    if (!isAliveState(pl)) return
    const isImp = isImpostorPlayer(pl)
    if (isImp) imp++
    else crew++
  })
  return { crew, imp, totalAlive: crew + imp }
}

function ensurePlayerState(socketId) {
  const p = players.get(socketId)
  if (!p) return null
  if (!p.state) p.state = { x: 0, y: 0, alive: true, isGhost: false, imposter: false }
  if (typeof p.state.alive !== 'boolean') p.state.alive = true
  if (typeof p.state.isGhost !== 'boolean') p.state.isGhost = !p.state.alive
  return p
}

function isImpostorPlayer(p) {
  // Prefer explicit role (stable across reconnect); fallback to state
  if (p?.role === 'impostor') return true
  return p?.state?.imposter === true
}

function canUseEmergency(p) {
  return !!p && isAliveState(p)
}

function broadcastMeetingState(roomId) {
  const room = rooms.get(roomId)
  const meeting = room?.meeting
  if (!room || !meeting) return
  broadcastRoom(roomId, 'meetingState', {
    roomId,
    phase: meeting.phase,
    currentSpeakerId: meeting.currentSpeakerId || null,
    phaseEndsAt: meeting.phaseEndsAt || null,
  })
}

const MEETING_DISCUSSION_SEC = 45   // Thời gian thảo luận / hội chiếu (giây)
const MEETING_VOTE_SEC = 20         // Thời gian bỏ phiếu (giây)

function startMeetingVotePhase(roomId) {
  const room = rooms.get(roomId)
  const meeting = room?.meeting
  if (!room || !meeting || meeting.ended) return
  meeting.phase = 'vote'
  meeting.currentSpeakerId = null
  meeting.eligible = new Set([...room.players].filter(sid => {
    const pl = players.get(sid)
    return pl && isAliveState(pl)
  }))
  meeting.phaseEndsAt = Date.now() + MEETING_VOTE_SEC * 1000
  if (meeting.timer) clearTimeout(meeting.timer)
  meeting.timer = setTimeout(() => endMeeting(roomId, 'timeout'), MEETING_VOTE_SEC * 1000)
  broadcastMeetingState(roomId)
}

function startMeeting(roomId, reporterId, victimId) {
  const room = rooms.get(roomId)
  if (!room?.started) return false
  if (room.meeting && !room.meeting.ended) return false

  room.meeting = {
    id: nanoid(8),
    phase: 'discussion',
    reporterId,
    victimId,
    currentSpeakerId: null,
    phaseEndsAt: Date.now() + MEETING_DISCUSSION_SEC * 1000,
    votes: {},
    eligible: new Set(),
    ended: false,
    timer: setTimeout(() => {
      const activeMeeting = rooms.get(roomId)?.meeting
      if (!activeMeeting || activeMeeting.ended) return
      startMeetingVotePhase(roomId)
    }, MEETING_DISCUSSION_SEC * 1000),
  }

  if (room.reactorFailTimer) {
    clearTimeout(room.reactorFailTimer)
    room.reactorFailTimer = null
  }
  const oldSabotage = room.activeSabotage
  room.activeSabotage = null
  if (oldSabotage) {
    broadcastRoom(roomId, 'sabotageFixed', { type: oldSabotage })
  }

  broadcastRoom(roomId, 'meeting', { reporterId, victimId })
  broadcastMeetingState(roomId)
  return true
}

function computeMeetingResult(meeting) {
  const counts = {}
  Object.values(meeting.votes).forEach(v => { counts[v] = (counts[v] || 0) + 1 })
  const totalVotes = Object.values(counts).reduce((a, b) => a + b, 0)
  const skipVotes  = counts.skip || 0

  // Find max non-skip votes
  let maxVotes = 0, ejectedId = null, tied = false
  Object.entries(counts).forEach(([id, c]) => {
    if (id === 'skip') return
    if (c > maxVotes) { maxVotes = c; ejectedId = id; tied = false }
    else if (c === maxVotes && maxVotes > 0) { tied = true }
  })

  // Tie or majority skip → no ejection
  if (tied || skipVotes > totalVotes / 2 || maxVotes === 0) ejectedId = null

  return {
    ejectedId: ejectedId || null,
    tied,
    counts,
    totalVotes,
    skipVotes,
  }
}

function finishGame(roomId, winner) {
  const room = rooms.get(roomId)
  if (!room || !room.started) return
  room.started = false

  if (room.reactorFailTimer) {
    clearTimeout(room.reactorFailTimer)
    room.reactorFailTimer = null
  }
  room.activeSabotage = null
  room.reactorFixed = null
  room.meeting = null

  // Reset ready và xóa state/role cũ của từng người chơi để phòng chờ không còn "dữ liệu game trước"
  room.players.forEach(sid => {
    const player = players.get(sid)
    if (player) {
      player.ready = false
      player.role = undefined
      player.assignedTasks = undefined
      player.state = null
    }
  })

  broadcastRoom(roomId, 'gameover', { winner })
  // Gửi ngay roomUpdate để client nhận phòng mới (started: false), tránh lỗi "còn tồn tại vẫn trước"
  broadcastRoom(roomId, 'roomUpdate', { room: getRoomForEmit(roomId) })
  io.emit('roomList', { rooms: getRoomList() })
}

function evaluateRoomWin(roomId) {
  const room = rooms.get(roomId)
  if (!room?.started) return

  const { crew, imp } = getAliveCounts(roomId)
  const initialCrew = room.initialCrewCount ?? crew
  const crewReduced = crew < initialCrew

  // Crew thắng nếu toàn bộ impostor đã bị loại
  if ((room.initialImpostorCount ?? 0) > 0 && imp === 0) {
    finishGame(roomId, 'crew')
    return
  }

  // Impostor thắng theo parity, nhưng không kết thúc ngay lúc start game
  if (imp > 0 && imp >= crew && crewReduced) {
    finishGame(roomId, 'impostor')
    return
  }

  // Crew thắng nếu hoàn thành hết nhiệm vụ
  const crewSids = [...room.players].filter(sid => {
    const pl = players.get(sid)
    return pl && !isImpostorPlayer(pl)
  })
  const crewCount = crewSids.length
  if (crewCount > 0) {
    let totalDone = 0
    if (room.tasksDone) {
      // Chỉ tính task của những người hiện còn trong phòng (đã chết nhưng vẫn trong phòng vẫn tính)
      crewSids.forEach(sid => {
        const pl = players.get(sid)
        const key = getPlayerProgressKey(pl, sid)
        if (room.tasksDone.has(key)) {
          totalDone += room.tasksDone.get(key).size
        }
      })
    }
    const tasksPerPlayer = Math.min(TASKS_PER_PLAYER, TASK_POOL.length)
    const totalNeeded = crewCount * tasksPerPlayer
    if (totalNeeded > 0 && totalDone >= totalNeeded) {
      finishGame(roomId, 'crew')
    }
  }
}

function endMeeting(roomId, reason = 'timeout') {
  const room = rooms.get(roomId)
  if (!room?.meeting) return
  const meeting = room.meeting
  if (meeting.ended) return
  meeting.ended = true
  if (meeting.timer) clearTimeout(meeting.timer)

  const result = computeMeetingResult(meeting)
  const ejectedSid = result.ejectedId

  if (ejectedSid) {
    const ep = ensurePlayerState(ejectedSid)
    if (ep) {
      ep.state.alive = false
      ep.state.isGhost = true
    }
  }

  // Broadcast result to all in room
  broadcastRoom(roomId, 'meetingResult', {
    roomId,
    reason,
    ...result,
  })

  // Clear meeting state after short delay (clients need time to show overlay)
  setTimeout(() => {
    const r = rooms.get(roomId)
    if (r?.meeting === meeting) r.meeting = null
  }, 6000)

  evaluateRoomWin(roomId)
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
    return p ? {
      id: sid, uuid: p.uuid, name: p.name, color: p.color, ready: p.ready || false, mic: p.mic || false,
      emergencyMeetingsLeft: p.emergencyMeetingsLeft ?? MAX_EMERGENCY_MEETINGS_PER_PLAYER,
      emergencyE_CooldownUntil: p.emergencyE_CooldownUntil ?? 0,
      ...p.state
    } : null
  }).filter(Boolean)
}

/** Trả về object room an toàn để emit (không có Set, Timer, circular ref) */
function getRoomForEmit(roomId) {
  const room = rooms.get(roomId)
  if (!room) return null
  const base = {
    id: room.id,
    name: room.name,
    host: room.host,
    hostName: room.hostName,
    maxPlayers: room.maxPlayers,
    started: room.started,
    players: getRoomPlayers(roomId),
  }
  if (room.meeting && !room.meeting.ended) {
    base.meeting = {
      phase: room.meeting.phase,
      currentSpeakerId: room.meeting.currentSpeakerId || null,
      phaseEndsAt: room.meeting.phaseEndsAt || null,
    }
  }
  return base
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
    broadcastRoom(oldRoomId, 'roomUpdate', { room: getRoomForEmit(oldRoomId) })
    
    // Nếu game đang chạy, kiểm tra xem việc thoát game có làm thay đổi kết quả thắng thua không
    if (room.started) {
      evaluateRoomWin(oldRoomId)
    }
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

function assignRandomTasks(count) {
  return shuffleArray(TASK_POOL).slice(0, Math.min(count, TASK_POOL.length)).map(task => ({ ...task }))
}

function getPlayerProgressKey(player, fallbackId = null) {
  return player?.uuid || fallbackId || null
}

function allocateCrewTasksByRoom(crewSids) {
  const usage = new Map(TASK_POOL.map(task => [task.id, 0]))
  const assignments = new Map()
  const orderedCrew = shuffleArray([...crewSids])

  orderedCrew.forEach((sid) => {
    const shuffledPool = shuffleArray([...TASK_POOL])
    const sortedPool = shuffledPool.sort((a, b) => {
      const diff = (usage.get(a.id) || 0) - (usage.get(b.id) || 0)
      return diff
    })
    const selected = sortedPool.slice(0, Math.min(TASKS_PER_PLAYER, TASK_POOL.length)).map(task => ({ ...task }))
    selected.forEach(task => usage.set(task.id, (usage.get(task.id) || 0) + 1))
    assignments.set(sid, selected)
  })

  return assignments
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
          room: getRoomForEmit(p.roomId)
        })
        if (room.started) {
          socket.emit('gameStart', {
            roomId: p.roomId,
            isImposter: isImpostorPlayer(p),
            players: getRoomPlayers(p.roomId),
            assignedTasks: p.assignedTasks || [],
            spawnX: p.state?.x,
            spawnY: p.state?.y,
          })
        }
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
    socket.emit('joinedRoom', { roomId, isHost: true, room: getRoomForEmit(roomId) })
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
      // Transfer old state/role to new socket to keep roles stable
      const oldP = players.get(existingPlayerSid)
      if (oldP) {
        p.role = oldP.role
        p.state = oldP.state
        p.assignedTasks = oldP.assignedTasks
      }
      room.players.delete(existingPlayerSid)
    }

    room.players.add(socket.id); p.roomId = roomId; p.ready = false
    socket.emit('joinedRoom', { roomId, isHost: room.host === socket.id, room: getRoomForEmit(roomId) })
    if (room.started) {
      let totalDone = 0
      if (room.tasksDone) room.tasksDone.forEach(set => { totalDone += set.size })
      const crewCount = [...room.players].filter(sid => {
        const pl = players.get(sid)
        return pl && !isImpostorPlayer(pl)
      }).length
      const totalNeeded = crewCount * TASKS_PER_PLAYER

      socket.emit('gameStart', {
        roomId,
        isImposter: isImpostorPlayer(p),
        players: getRoomPlayers(roomId),
        assignedTasks: p.assignedTasks || [],
        totalMissionsDone: totalDone,
        totalMissionsNeeded: totalNeeded
      })
    }
    broadcastRoom(roomId, 'roomUpdate', { room: getRoomForEmit(roomId) }, socket.id)
    io.emit('roomList', { rooms: getRoomList() }); io.emit('onlineList', { users: getOnlineList() })
    roomSystemMsg(roomId, `👤 ${p.name} đã ${existingPlayerSid ? 'vào lại' : 'vào'} phòng`)
  })

  // Định kỳ 2 giây gửi cập nhật phòng để đảm bảo đồng bộ cho những người ẩn tab
  const heartbeat = setInterval(() => {
    rooms.forEach((room, roomId) => {
      if (room.players.size > 0) {
        const updateData = { room: getRoomForEmit(roomId) }
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
      const updateData = { room: getRoomForEmit(p.roomId) }
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
    room.tasksDone = new Map()  // reset task tracking
    dbRun('UPDATE game_rooms SET status="started" WHERE id=?', [p.roomId])

    // Phân vai và khởi tạo vị trí mặc định
    const sids = [...room.players]
    const imposterCount = sids.length >= 7 ? 2 : 1
    room.initialCrewCount = sids.length - imposterCount
    room.initialImpostorCount = imposterCount
    const shuffled = shuffleArray(sids)
    const imposters = new Set(shuffled.slice(0, imposterCount))
    const crewSids = sids.filter(sid => !imposters.has(sid))
    const crewTaskAssignments = allocateCrewTasksByRoom(crewSids)

    // Spawn từ map (player1..player12): shuffle và gán mỗi người một vị trí khác nhau
    const spawnPoints = loadSpawnsFromMap()
    const shuffledSpawns = spawnPoints.length > 0 ? shuffleArray([...spawnPoints]) : []
    const getSpawnForIndex = (index) => {
      if (shuffledSpawns.length > 0) {
        const s = shuffledSpawns[index % shuffledSpawns.length]
        return { x: s.x, y: s.y }
      }
      return { x: 1766 + (index * 40), y: 1491 }
    }

    // Bước 1: Reset state cho TẤT CẢ player trước
    sids.forEach((sid, index) => {
      const isImposter = imposters.has(sid)
      const p = players.get(sid)
      const spawn = getSpawnForIndex(index)
      if (p) {
        p.role = isImposter ? 'impostor' : 'crew'
        p.lastKillAt = Date.now()
        p.lastSabotageAt = 0
        p.emergencyMeetingsLeft = MAX_EMERGENCY_MEETINGS_PER_PLAYER
        p.emergencyE_CooldownUntil = 0
        p.assignedTasks = isImposter
          ? assignRandomTasks(TASKS_PER_PLAYER)
          : (crewTaskAssignments.get(sid) || assignRandomTasks(TASKS_PER_PLAYER))
        p.state = { 
          x: spawn.x,
          y: spawn.y, 
          alive: true, 
          isGhost: false,
          imposter: isImposter
        }
        dbRun('UPDATE game_room_players SET role=? WHERE room_id=? AND socket_id=?', 
          [isImposter ? 'impostor' : 'crewmate', p.roomId, sid])
      }
    })

    // Bước 2: Sau khi tất cả đã reset, mới emit gameStart với danh sách player sạch
    const freshPlayerList = getRoomPlayers(p.roomId)
    const totalMissionsNeeded = crewSids.length * TASKS_PER_PLAYER
    
    sids.forEach((sid) => {
      const pl = players.get(sid)
      if (pl) {
        pl.socket.emit('gameStart', {
          roomId: pl.roomId,
          isImposter: isImpostorPlayer(pl),
          players: freshPlayerList,
          assignedTasks: pl.assignedTasks,
          spawnX: pl.state.x,
          spawnY: pl.state.y,
          totalMissionsDone: 0,
          totalMissionsNeeded
        })
      }
    })

    console.log(`🚀 Game started in room ${p.roomId}`)
    io.emit('roomList', { rooms: getRoomList() })
  })

  socket.on('toggleMic', ({ isMicOn }) => {
    const p = players.get(socket.id); if (!p) return
    p.mic = !!isMicOn
    const room = rooms.get(p.roomId); if (room) broadcastRoom(p.roomId, 'roomUpdate', { room: getRoomForEmit(p.roomId) })
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
    if (!p.state) p.state = { x: 0, y: 0, alive: true, isGhost: false, imposter: false }
    
    // Position and direction are from client
    p.state.x = state.x
    p.state.y = state.y
    if (state.dir) p.state.dir = state.dir
    
    // Tasks progress can be from client
    if (typeof state.tasks === 'number') p.state.tasks = state.tasks
    
    // IMPORTANT: alive / isGhost / imposter are SERVER-AUTHORITATIVE.
    // We ignore them from client update to prevent "sticky death" bugs 
    // where old messages from a previous game session arrive late and overwrite the new game state.
    // The server already updates these in 'kill', 'meetingResult', and 'startGame'.
  })

  socket.on('kill', ({ victimId }) => {
    const p = players.get(socket.id); if (!p?.roomId) return
    const room = rooms.get(p.roomId); if (!room?.started) return
    if (!isAliveState(p) || !isImpostorPlayer(p)) return
    if (Date.now() - (p.lastKillAt || 0) < KILL_COOLDOWN) return

    const victim = ensurePlayerState(victimId)
    if (!victim || victim.roomId !== p.roomId) return
    if (!isAliveState(victim)) return
    if (isImpostorPlayer(victim)) return
    if (distance(p.state, victim.state) > KILL_RANGE) return

    victim.state.alive = false
    victim.state.isGhost = true
    // Cập nhật vị trí xác = vị trí killer (để server kiểm tra distance khi ai đó báo xác)
    victim.state.x = p.state.x
    victim.state.y = p.state.y
    p.lastKillAt = Date.now()

    broadcastRoom(p.roomId, 'kill', { killerId: socket.id, victimId })
    socket.emit('kill', { killerId: socket.id, victimId })
    evaluateRoomWin(p.roomId)
  })

  socket.on('report', ({ victimId }) => {
    const p = players.get(socket.id); if (!p?.roomId) return
    const room = rooms.get(p.roomId); if (!room?.started) return
    const vid = victimId != null ? String(victimId) : null
    if (!vid) { socket.emit('reportFailed', { reason: 'no_victim' }); return }
    const victim = ensurePlayerState(vid)
    if (!victim) { socket.emit('reportFailed', { reason: 'victim_not_found' }); return }
    if (victim.roomId !== p.roomId) { socket.emit('reportFailed', { reason: 'victim_other_room' }); return }
    if (isAliveState(p) === false) { socket.emit('reportFailed', { reason: 'reporter_dead' }); return }
    if (isAliveState(victim) === true) { socket.emit('reportFailed', { reason: 'victim_alive' }); return }

    // Client đã kiểm tra đứng gần xác; server chỉ kiểm tra không quá xa (lệch do latency).
    const maxReportDist = 400
    if (distance(p.state, victim.state) > maxReportDist) {
      socket.emit('reportFailed', { reason: 'too_far', dist: distance(p.state, victim.state) })
      return
    }
    const started = startMeeting(p.roomId, socket.id, vid)
    if (!started) socket.emit('reportFailed', { reason: 'meeting_already_active' })
  })

  socket.on('emergency', () => {
    const p = players.get(socket.id); if (!p?.roomId) return
    const room = rooms.get(p.roomId); if (!room?.started) return
    if (!canUseEmergency(p)) return
    if (distance(p.state, EMERGENCY_BUTTON_POS) > 150) return
    const now = Date.now()
    if (now - (room.lastMeetingAt || 0) < MEETING_COOLDOWN) {
      socket.emit('reportFailed', { reason: 'emergency_e_cooldown', msLeft: MEETING_COOLDOWN - (now - (room.lastMeetingAt || 0)) })
      return
    }
    if ((p.emergencyMeetingsLeft ?? MAX_EMERGENCY_MEETINGS_PER_PLAYER) <= 0) {
      socket.emit('reportFailed', { reason: 'no_emergency_left' })
      return
    }
    if (now < (p.emergencyE_CooldownUntil || 0)) {
      socket.emit('reportFailed', { reason: 'emergency_e_cooldown', msLeft: p.emergencyE_CooldownUntil - now })
      return
    }
    p.emergencyMeetingsLeft = (p.emergencyMeetingsLeft ?? MAX_EMERGENCY_MEETINGS_PER_PLAYER) - 1
    p.emergencyE_CooldownUntil = now + EMERGENCY_E_COOLDOWN_MS
    room.lastMeetingAt = now
    // Gửi lại số lần còn lại cho toàn phòng qua players broadcast
    const updatedPlayerList = getRoomPlayers(p.roomId)
    room.players.forEach(sid => {
      const pl = players.get(sid)
      if (!pl) return
      const myRow = updatedPlayerList.find(r => r.id === sid)
      if (myRow) {
        myRow.emergencyMeetingsLeft = pl.emergencyMeetingsLeft ?? MAX_EMERGENCY_MEETINGS_PER_PLAYER
        myRow.emergencyE_CooldownUntil = pl.emergencyE_CooldownUntil ?? 0
      }
      pl.socket.emit('players', { players: updatedPlayerList })
    })
    startMeeting(p.roomId, socket.id, null)
  })

  socket.on('vote', ({ targetId }) => {
    const p = players.get(socket.id); if (!p?.roomId) return
    const room = rooms.get(p.roomId); if (!room?.started) return
    const meeting = room.meeting
    // Still broadcast raw vote so MeetingScene can update live counts
    broadcastRoom(p.roomId, 'vote', { voterId: socket.id, targetId })
    socket.emit('vote', { voterId: socket.id, targetId })

    // Only tally votes during meeting vote phase
    if (!meeting || meeting.ended || meeting.phase !== 'vote') return
    if (!meeting.eligible?.has(socket.id)) return
    if (meeting.votes[socket.id] !== undefined) return // no double vote

    // Validate targetId: allow 'skip' or a current room player id
    const normalizedTargetId = String(targetId)
    if (targetId !== 'skip' && !room.players.has(normalizedTargetId) && !room.players.has(targetId)) {
      // tolerate different types, but ignore invalid target
      return
    }
    if (targetId !== 'skip') {
      const targetPlayer = players.get(normalizedTargetId) || players.get(targetId)
      if (!targetPlayer || !isAliveState(targetPlayer)) return
    }
    meeting.votes[socket.id] = targetId

    // End early if all eligible voted
    if (Object.keys(meeting.votes).length >= meeting.eligible.size) {
      endMeeting(p.roomId, 'all_voted')
    }
  })

  socket.on('meetingChat', ({ text }) => {
    const p = players.get(socket.id); if (!p?.roomId) return
    if (!isAliveState(p)) return // Hồn ma không được bình luận trong cuộc họp
    const data = { senderId: socket.id, text }
    broadcastRoom(p.roomId, 'meetingChat', data, socket.id)
    socket.emit('meetingChat', data)
  })

  socket.on('chat', ({ text, channel, x, y }) => {
    const p = players.get(socket.id); if (!p?.roomId) return
    const isAlive = isAliveState(p)
    const isImp = isImpostorPlayer(p)

    // Kiểm tra quyền gửi: 
    // - Người sống chỉ được gửi vào 'crew' hoặc 'impostor'
    // - Người chết (hồn ma) chỉ được gửi vào 'ghost'
    let finalChannel = channel
    if (isAlive) {
      if (channel === 'ghost') finalChannel = 'crew' // Chặn người sống gửi vào kênh hồn ma
    } else {
      finalChannel = 'ghost' // Hồn ma luôn phải gửi vào kênh hồn ma
    }

    // Nếu người sống cố gửi vào kênh impostor nhưng không phải là impostor
    if (finalChannel === 'impostor' && !isImp) finalChannel = 'crew'

    const msg = { senderId: socket.id, name: p.name, color: p.color, text, channel: finalChannel, x, y }

    if (finalChannel === 'impostor') {
      // Chỉ gửi cho impostor trong phòng
      const room = rooms.get(p.roomId); if (!room) return
      room.players.forEach(sid => {
        const pl = players.get(sid)
        if (pl && isImpostorPlayer(pl)) pl.socket.emit('chat', msg)
      })
    } else if (finalChannel === 'ghost') {
      // Chỉ gửi cho người đã chết
      const room = rooms.get(p.roomId); if (!room) return
      room.players.forEach(sid => {
        const pl = players.get(sid)
        if (pl && !isAliveState(pl)) pl.socket.emit('chat', msg)
      })
    } else {
      // crew channel: gửi cho tất cả còn sống
      const room = rooms.get(p.roomId); if (!room) return
      room.players.forEach(sid => {
        const pl = players.get(sid)
        if (pl && isAliveState(pl)) pl.socket.emit('chat', msg)
      })
    }
  })

  socket.on('taskDone', ({ taskId }) => {
    const p = players.get(socket.id); if (!p?.roomId) return
    const room = rooms.get(p.roomId); if (!room) return
    if (isImpostorPlayer(p)) return
    const playerTaskKey = getPlayerProgressKey(p, socket.id)
    if (!playerTaskKey) return

    const assignedTaskIds = new Set((p.assignedTasks || []).map(t => t.id))
    if (!assignedTaskIds.has(taskId)) return

    // Track tasks done per player
    if (!room.tasksDone) room.tasksDone = new Map()
    if (!room.tasksDone.has(playerTaskKey)) room.tasksDone.set(playerTaskKey, new Set())
    room.tasksDone.get(playerTaskKey).add(taskId)

    // Tổng task done toàn phòng (unique per player per task)
    let totalDone = 0
    room.tasksDone.forEach(set => { totalDone += set.size })

    // Tổng số task thật của toàn bộ crewmate trong room
    const crewCount = [...room.players].filter(sid => {
      const pl = players.get(sid)
      if (!pl) return false
      return !isImpostorPlayer(pl)
    }).length
    const tasksAssignedPerPlayer = Math.min(TASKS_PER_PLAYER, TASK_POOL.length)
    const totalNeeded = crewCount * tasksAssignedPerPlayer

    broadcastRoom(p.roomId, 'taskDone', { playerId: socket.id, taskId, totalDone, totalNeeded })

    // Server tự quyết crew win khi đủ task
    if (totalNeeded > 0 && totalDone >= totalNeeded) {
      finishGame(p.roomId, 'crew')
    }
  })

  socket.on('sabotage', ({ type }) => {
    const p = players.get(socket.id); if (!p?.roomId) return
    const room = rooms.get(p.roomId); if (!room?.started) return
    if (!isAliveState(p) || !isImpostorPlayer(p)) return
    if (room.meeting && !room.meeting.ended) return
    if (Date.now() - (p.lastSabotageAt || 0) < SABOTAGE_COOLDOWN) return
    if (room.activeSabotage) return

    p.lastSabotageAt = Date.now()
    room.activeSabotage = type

    if (type === 'reactor') {
      room.reactorProgress = 0
      room.reactorFixers = new Set()
      room.reactorFixerProgress = {}
      if (room.reactorFailTimer) clearTimeout(room.reactorFailTimer)
      room.reactorFailTimer = setTimeout(() => {
        const activeRoom = rooms.get(p.roomId)
        if (activeRoom?.started) finishGame(p.roomId, 'impostor')
      }, REACTOR_CRITICAL_TIME)
    }

    broadcastRoom(p.roomId, 'sabotage', { type })
    socket.emit('sabotage', { type })
  })

  // Client gửi ~200ms khi đứng gần reactor_a hoặc reactor_b (client lấy tọa độ từ map)
  socket.on('reactorStand', () => {
    const p = players.get(socket.id); if (!p?.roomId) return
    const room = rooms.get(p.roomId)
    if (!room?.started || room.activeSabotage !== 'reactor') return
    if (!isAliveState(p)) return

    if (!room.reactorFixers) room.reactorFixers = new Set()
    if (!room.reactorFixerProgress) room.reactorFixerProgress = {}

    const now = Date.now()
    const prev = room.reactorFixerProgress[socket.id]
    const last = prev?.lastTick || (now - 200)  // assume 200ms if first tick
    const delta = Math.min(now - last, 500)

    room.reactorFixerProgress[socket.id] = {
      lastTick: now,
      accumulated: (room.reactorFixerProgress[socket.id]?.accumulated || 0) + delta,
    }
    room.reactorFixers.add(socket.id)

    // Each person needs 2000ms = 50% contribution
    // Progress = sum of min(accumulated/2000, 0.5) per fixer * 100
    let total = 0
    for (const [sid, data] of Object.entries(room.reactorFixerProgress)) {
      total += Math.min(data.accumulated / 2000, 0.5)
    }
    const progress = Math.min(Math.round(total * 100), 100)

    room.reactorProgress = progress
    broadcastRoom(p.roomId, 'reactorProgress', { progress, fixers: room.reactorFixers.size })

    if (progress >= 100) {
      if (room.reactorFailTimer) { clearTimeout(room.reactorFailTimer); room.reactorFailTimer = null }
      room.activeSabotage = null
      room.reactorProgress = 0
      room.reactorFixers = new Set()
      room.reactorFixerProgress = {}
      broadcastRoom(p.roomId, 'sabotageFixed', { type: 'reactor' })
      room.players.forEach(sid => players.get(sid)?.socket.emit('sabotageFixed', { type: 'reactor' }))
    }
  })

  // Client sends this when leaving the reactor zone
  socket.on('reactorLeave', () => {
    const p = players.get(socket.id); if (!p?.roomId) return
    const room = rooms.get(p.roomId); if (!room) return
    if (room.reactorFixers) room.reactorFixers.delete(socket.id)
    if (room.reactorFixerProgress) delete room.reactorFixerProgress[socket.id]
  })

  socket.on('sabotageFixed', ({ type }) => {
    const p = players.get(socket.id); if (!p?.roomId) return
    const room = rooms.get(p.roomId)
    if (!room?.started || !isAliveState(p)) return

    if (type === 'lights') {
      if (room.activeSabotage !== 'lights') return
      // Position check skipped — client already validates proximity to lights_fix
      room.activeSabotage = null
      broadcastRoom(p.roomId, 'sabotageFixed', { type })
      socket.emit('sabotageFixed', { type })
    }
  })

  socket.on('gameover', ({ winner }) => {
    // Client-authored gameover is intentionally ignored.
    return
  })

  // Client gọi sau khi quay lại lobby để lấy state phòng mới nhất
  socket.on('getRoomState', () => {
    const p = players.get(socket.id); if (!p?.roomId) return
    const room = rooms.get(p.roomId); if (!room) return
    socket.emit('roomUpdate', { room: getRoomForEmit(p.roomId) })
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
