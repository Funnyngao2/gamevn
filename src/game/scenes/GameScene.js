// GameScene.js - main gameplay scene
import Phaser from 'phaser'
import { Player } from '../../entities/Player.js'
import { safePlay } from '../../utils/safePlay.js'
import { NO_OF_MISSIONS, KILL_COOLDOWN, MEETING_COOLDOWN, REACTOR_CRITICAL_TIME, VENT_COOLDOWN, SABOTAGE_COOLDOWN } from '../../config.js'

const INTERACT_RANGE = 80

export class GameScene extends Phaser.Scene {
  constructor() { super('Game') }

  init(data) {
    // Support both old data-passing and new registry-based approach (from React/PhaserGame.jsx)
    const reg = this.game?.registry
    this.playerColor     = data.playerColor   || reg?.get('playerColor') || 'red'
    this.playerName      = data.playerName    || reg?.get('playerName')  || 'Player'
    this.gameMode        = data.gameMode      || 'multiplayer'
    this.isImposter      = data.isImposter === true || reg?.get('isImposter') === true
    this.roomId          = data.roomId        || reg?.get('roomId')      || null
    this._existingSocket = data.socket        || reg?.get('socket')      || null
    this._onGameEnd      = data.onGameEnd     || reg?.get('onGameEnd')   || null
  }

  create() {
    // --- MAP ---
    this.map = this.make.tilemap({ key: 'map' })
    const tileset = this.map.addTilesetImage('map2', 'map2')
    this.map.createLayer('Ground', tileset, 0, 0)
    this.map.createLayer('Props',  tileset, 0, 0)
    this.map.createLayer('Walls',  tileset, 0, 0)

    const mapW = this.map.widthInPixels
    const mapH = this.map.heightInPixels
    this.physics.world.setBounds(0, 0, mapW, mapH)

    // --- PARSE OBJECT LAYER ---
    this.ventZones = []
    this.wallGroup = this.physics.add.staticGroup()
    const obstaclesLayer = this.map.getObjectLayer('Obstacles')
    this.emergencyBtnPos = { x: 3320, y: 716 }  // from map emerg_btn object center
    if (obstaclesLayer) {
      obstaclesLayer.objects.forEach(obj => {
        if (obj.name === 'walls' || obj.name === 'wall' || obj.name === 'tables') {
          const rect = this.add.rectangle(obj.x + obj.width/2, obj.y + obj.height/2, obj.width, obj.height)
          this.physics.add.existing(rect, true)
          this.wallGroup.add(rect)
        } else if (obj.name === 'vent') {
          this.ventZones.push({ x: obj.x + obj.width/2, y: obj.y + obj.height/2, id: obj.id })
        } else if (obj.name === 'emerg_btn') {
          this.emergencyBtnPos = { x: obj.x + obj.width/2, y: obj.y + obj.height/2 }
        }
      })
    }

    // --- TASKS FROM MAP: ưu tiên layer "Tasks", không có thì lấy từ "Obstacles" (object không phải wall/vent/spawn) ---
    this.tasksFromMap = []
    const isObstacleOrSpawn = (name) => {
      if (!name) return true
      if (['walls', 'wall', 'tables', 'vent', 'emerg_btn', 'emergency_btn'].includes(String(name).toLowerCase())) return true
      if (/^player\d*$/i.test(String(name))) return true
      return false
    }
    let taskObjects = []
    const tasksOnlyLayer = this.map.getObjectLayer('Tasks') || this.map.getObjectLayer('tasks')
    if (tasksOnlyLayer && tasksOnlyLayer.objects && tasksOnlyLayer.objects.length) {
      taskObjects = tasksOnlyLayer.objects
    } else if (obstaclesLayer && obstaclesLayer.objects) {
      taskObjects = obstaclesLayer.objects.filter(obj => obj.x != null && obj.y != null && !isObstacleOrSpawn(obj.name))
    }
    taskObjects.forEach((obj, i) => {
      const props = (obj.properties || []).reduce((acc, p) => { acc[p.name] = p.value; return acc }, {})
      const id = props.id || obj.name || `task_${obj.id ?? i}`
      let kind = props.kind
      if (!kind && obj.name && obj.name.includes('_')) kind = obj.name.split('_').slice(0, -1).join('_')
      if (!kind) kind = 'task'
      const label = props.label || obj.name || id
      const x = Math.round((obj.x || 0) + (obj.width || 0) / 2)
      const y = Math.round((obj.y || 0) + (obj.height || 0) / 2)
      this.tasksFromMap.push({ id: String(id), kind: String(kind), label: String(label), x, y })
    })
    if (this.tasksFromMap.length) {
      console.log('[Tasks] Danh sách nhiệm vụ từ map (vị trí x,y):', this.tasksFromMap.map(t => ({ id: t.id, kind: t.kind, label: t.label, x: t.x, y: t.y })))
    }

    // --- PLAYER ---
    const spawn = this._getSpawn()
    this.player = new Player(this, spawn.x, spawn.y, this.playerColor, true)
    this.player.setName(this.playerName)
    this.player.isImposter = this.isImposter
    this.player.inVent = false
    this.physics.add.collider(this.player, this.wallGroup)

    // --- BOTS removed - multiplayer only ---
    this.bots = []

    // --- CAMERA ---
    this.cameras.main.setBounds(0, 0, mapW, mapH)
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08) // Làm mượt hơn (lerp 0.08)
    
    // THIẾT LẬP ZOOM CHUẨN: 
    // Giúp tầm nhìn của mọi người chơi là tương đương nhau (khoảng 1.1x đến 1.3x)
    // Bạn có thể chỉnh con số 1.25 này tùy theo độ rộng bạn muốn
    this.cameras.main.setZoom(1.25) 
    
    // Đảm bảo camera không bao giờ trượt ra ngoài bản đồ khi nhân vật ở sát mép
    this.cameras.main.setRoundPixels(true) 
    this.cameras.main.setDeadzone(0, 0) // Camera bám sát ngay lập tức khi di chuyển

    // --- INPUT ---
    this.cursors = this.input.keyboard.createCursorKeys()
    this.cursors.w = this.input.keyboard.addKey('W')
    this.cursors.a = this.input.keyboard.addKey('A')
    this.cursors.s = this.input.keyboard.addKey('S')
    this.cursors.d = this.input.keyboard.addKey('D')
    this.killKey      = this.input.keyboard.addKey('Q')
    this.reportKey    = this.input.keyboard.addKey('R')
    this.emergencyKey = this.input.keyboard.addKey('E')
    this.ventKey      = this.input.keyboard.addKey('V')
    this.taskKey      = this.input.keyboard.addKey('F')
    this.chatKey      = this.input.keyboard.addKey('T')
    this.sabotageKey  = this.input.keyboard.addKey('X')

    // --- GAME STATE ---
    this.missionsDone = 0
    this.playing = true
    this.paused = false
    this.sabotageReactor = false
    this.reactorStartTime = 0
    this.sabotageLights = false
    this.sabotageCooldownStart = 0
    // Fix points for crew: reactor fix at center of map, lights fix at electrical room
    this._reactorFixPoints = [
      { x: 3320, y: 1200 },  // reactor fix point A
      { x: 3600, y: 1200 },  // reactor fix point B
    ]
    this._lightsFixPoint = { x: 1400, y: 1600 }
    this._reactorFixed = { A: false, B: false }
    // Impostor must wait full cooldown before first kill
    this.killCooldownStart = 0  // will be set properly in _startKillCooldown
    this._killReady = false
    this.ventCooldownStart = 0
    this.meetingCooldownStart = this.time.now
    this.remotePlayers = {}
    this.corpses = this.add.group() // Group chứa các sprite xác chết
    this.spawnedCorpseIds = new Set() // Lưu ID đã để lại xác để tránh tạo trùng
    this.playerId = 'local'
    this.startTime = Date.now() // Dùng Date.now() để đồng bộ tuyệt đối
    this._gameFullyStarted = false // Cờ chặn kiểm tra thắng thua
// Sau 3 giây mới cho phép kiểm tra thắng thua
this.time.delayedCall(3000, () => {
  this._gameFullyStarted = true
  console.log("🚀 Game logic fully active")
  // In ra vị trí nhiệm vụ từ map (và nhiệm vụ được gán) để dễ kiểm tra
  if (this.tasksFromMap && this.tasksFromMap.length) {
    console.log('[Tasks] Vị trí nhiệm vụ từ map (x, y):', this.tasksFromMap.map(t => ({ id: t.id, kind: t.kind, x: t.x, y: t.y })))
  } else {
    console.log('[Tasks] Không có nhiệm vụ từ map (kiểm tra layer "Tasks" trong Tiled)')
  }
  if (this.taskList && this.taskList.length) {
    console.log('[Tasks] Nhiệm vụ được gán cho bạn:', this.taskList.map(t => ({ id: t.id, label: t.label, x: t.x, y: t.y })))
  }
})

// --- HUD ---
this._createHUD()

    this._chatBridge = { alive: true, isImposter: this.isImposter }
    this.game.registry.set('chatBridge', this._chatBridge)
    // sendChat function exposed to React
    this.game.registry.set('sendChat', (text, channel) => this._sendChat(text, channel))
    this.game.registry.set('handleMeetingClosed', (ejectedId) => {
      if (this.sabotageReactor && this._meetingStartTime != null) {
        this.reactorStartTime += (this.time.now - this._meetingStartTime)
      }
      this._meetingStartTime = null
      this.game.registry.set('meetingActive', false)
      this.paused = false
      if (this.bgMusic && this.bgMusic.scene && !this.bgMusic.isPlaying) {
        try { this.bgMusic.play() } catch (e) { console.warn("Âm thanh bị lỗi khi mở lại nhạc nền:", e) }
      }
      if (ejectedId) this._handleEject(ejectedId)
    })
    this.game.registry.set('handleMeetingAbort', () => {
      if (this.sabotageReactor && this._meetingStartTime != null) {
        this.reactorStartTime += (this.time.now - this._meetingStartTime)
      }
      this._meetingStartTime = null
      this.game.registry.set('meetingActive', false)
      this.paused = false
      if (this.bgMusic && this.bgMusic.scene && !this.bgMusic.isPlaying) {
        try { this.bgMusic.play() } catch (e) { console.warn("Âm thanh bị lỗi khi hủy họp:", e) }
      }
    })
    this.game.registry.set('onSabotageSelect', (type) => {
      this._closeSabotageMenu()
      this._activateSabotage(type)
    })
    this.game.registry.set('onSabotageMenuClose', () => this._closeSabotageMenu())

    // --- MUSIC ---
    if (this.cache.audio.has('bg_music')) {
      this.bgMusic = this.sound.add('bg_music', { loop: true, volume: 0.7 })
      this.bgMusic.play()
    }

    if (this.gameMode === 'multiplayer') this._initMultiplayer()

    // Start kill cooldown timer after scene is running
    this.time.delayedCall(100, () => {
      this.killCooldownStart = this.time.now
    })

    // Role reveal — handled by React overlay via registry
    this.game.registry.get('onRoleReveal')?.(this.isImposter, this.playerColor)

    // Chờ role reveal xong (4s) mới cho phép check win conditions
    this._gameFullyStarted = false
    this.time.delayedCall(5000, () => { this._gameFullyStarted = true })
  }

  _getSpawn() {
    // Ưu tiên vị trí do server gán (random trong player1..player12, mỗi người một chỗ)
    const serverSpawn = this.game.registry.get('spawn')
    if (serverSpawn && typeof serverSpawn.x === 'number' && typeof serverSpawn.y === 'number') {
      return { x: serverSpawn.x, y: serverSpawn.y }
    }
    const obstaclesLayer = this.map.getObjectLayer('Obstacles')
    const spawns = []
    if (obstaclesLayer) {
      obstaclesLayer.objects.forEach(obj => {
        if (obj.name && obj.name.startsWith('player')) {
          spawns.push({ x: obj.x + obj.width/2, y: obj.y + obj.height/2 })
        }
      })
    }
    return spawns.length > 0 ? Phaser.Utils.Array.GetRandom(spawns) : { x: 1766, y: 1491 }
  }

  _createHUD() {
    // Chuỗi hiển thị (Q giết, Phá hoại, gợi ý phím) do React build từ hudData
    const isImp = this.player.isImposter
    if (!isImp) this._createTaskList()

    // Draw task zone markers on map (crewmate only)
    if (!isImp) this._drawTaskMarkers()

    // HUD/minimap/meeting handled by React overlays
    this._updateHUD()
  }

  _updateMinimap() {
    // Bridge minimap data to React overlay (dùng kích thước map thật để tránh lệch vị trí)
    if (!this.game?.registry || !this.map) return
    const mapW = this.map.widthInPixels
    const mapH = this.map.heightInPixels
    this.game.registry.set('minimapData', {
      mapW,
      mapH,
      localPlayer: { x: this.player.x, y: this.player.y, color: this.playerColor, alive: this.player.alive },
      remotePlayers: Object.values(this.remotePlayers).map(rp => ({
        id: rp.playerId, x: rp.x, y: rp.y, color: rp.color,
        name: rp.playerName, alive: rp.alive,
      })),
      tasks: this.taskList?.map(t => ({ x: t.x, y: t.y, label: t.label, done: t.done })) || [],
      isImposter: this.player.isImposter,
    })
  }

  _drawTaskMarkers() {
    if (!this.taskList) return
    this._taskMarkers = this.taskList.map(t => {
      const marker = this.add.text(t.x, t.y - 30, '⚙', {
        fontSize: '22px', color: '#ffff44', stroke: '#000', strokeThickness: 3
      }).setOrigin(0.5).setDepth(5)
      this.tweens.add({ targets: marker, y: marker.y - 6, yoyo: true, repeat: -1, duration: 700 })
      return { task: t, marker }
    })
  }

  _refreshTaskMarkers() {
    if (!this._taskMarkers) return
    this._taskMarkers.forEach(({ task, marker }) => {
      marker.setVisible(!task.done)
    })
  }

  _createTaskList() {
    const assigned = this.game.registry.get('assignedTasks') || []
    const fromMap = (this.tasksFromMap && this.tasksFromMap.length) ? this.tasksFromMap : null
    this.taskList = assigned.map(task => {
      const base = fromMap ? (fromMap.find(t => t.id === task.id) || task) : task
      return { id: task.id, kind: base.kind, label: base.label, x: base.x, y: base.y, done: false }
    })
  }

  _completeTask(taskId) {
    if (!this.taskList) return
    const task = this.taskList.find(t => t.id === taskId && !t.done)
    if (!task) return
    task.done = true
    this.missionsDone++
    safePlay(this, 'task_complete')
    if (this.ws) this.ws.emit('taskDone', { taskId })
    this._refreshTaskMarkers()
    this._checkWinConditions()
  }

  _updateHUD() {
    // Thanh tiến độ ở trên đầu là Shared Progress (Tiến độ chung của toàn phòng)
    let done = this.missionsDone
    let total = this.taskList ? this.taskList.length : NO_OF_MISSIONS

    // Nếu đã nhận được dữ liệu tổng từ server, ưu tiên hiển thị dữ liệu đó
    if (typeof this._totalMissionsNeeded === 'number' && this._totalMissionsNeeded > 0) {
      done = this._totalMissionsDone || 0
      total = this._totalMissionsNeeded
    }

    const isImp = this.player.isImposter
    let killCooldownSeconds = undefined
    let sabotageReactorSeconds = null
    let sabotageLights = false
    let sabotageCooldownSeconds = undefined

    if (isImp) {
      const killElapsed = this.killCooldownStart === 0 ? 0 : this.time.now - this.killCooldownStart
      killCooldownSeconds = Math.max(0, Math.ceil((KILL_COOLDOWN - killElapsed) / 1000))
    }

    if (this.sabotageReactor) {
      sabotageReactorSeconds = Math.max(0, Math.ceil((REACTOR_CRITICAL_TIME - (this.time.now - this.reactorStartTime)) / 1000))
    } else if (this.sabotageLights) {
      sabotageLights = true
    } else if (isImp) {
      const sabElapsed = this.time.now - this.sabotageCooldownStart
      sabotageCooldownSeconds = Math.max(0, Math.ceil((SABOTAGE_COOLDOWN - sabElapsed) / 1000))
    }

    this.game.registry.set('hudData', {
      missionsDone: done,
      total,
      isImposter: this.player.isImposter,
      alive: this.player.alive,
      killCooldownSeconds,
      sabotageReactorSeconds,
      sabotageLights,
      sabotageCooldownSeconds,
      tasks: this.taskList || [],
    })
    this._updateMinimap()
  }

  _updateInteractionPrompt() {
    if (!this.player.alive) {
      if (!this.player.isImposter && this.taskList) {
        const px = this.player.x, py = this.player.y
        const nearTask = this.taskList.find(t =>
          !t.done && Phaser.Math.Distance.Between(px, py, t.x, t.y) < INTERACT_RANGE)
        if (nearTask) {
          this.game.registry.get('onPrompt')?.(`[F] ${nearTask.label}`)
          return
        }
      }
      this.game.registry.get('onPrompt')?.(null)
      return
    }

    if (this.player.inVent) {
      this.game.registry.get('onPrompt')?.(`[V] Cống tiếp theo | [E] Thoát cống`)
      return
    }

    const px = this.player.x, py = this.player.y
    let prompt = null

    if (this.player.isImposter) {
      const nearVent = this.ventZones.find(v =>
        Phaser.Math.Distance.Between(px, py, v.x, v.y) < INTERACT_RANGE)
      if (nearVent) prompt = '[V] Nhảy vào cống'
    }

    if (this.player.isImposter && !prompt) {
      const targets = Object.values(this.remotePlayers).filter(p => !p.isImposter)
      const nearTarget = targets.find(p => p.alive &&
        Phaser.Math.Distance.Between(px, py, p.x, p.y) < INTERACT_RANGE)
      if (nearTarget) {
        const killElapsed = this.killCooldownStart === 0 ? 0 : this.time.now - this.killCooldownStart
        prompt = killElapsed >= KILL_COOLDOWN ? `[Q] Giết ${nearTarget.playerName}` : `Giết: chờ cooldown`
      }
    }

    if (!this.player.isImposter && !prompt) {
      if (this.sabotageReactor) {
        const dA = Phaser.Math.Distance.Between(px, py, this._reactorFixPoints[0].x, this._reactorFixPoints[0].y)
        const dB = Phaser.Math.Distance.Between(px, py, this._reactorFixPoints[1].x, this._reactorFixPoints[1].y)
        if (dA < INTERACT_RANGE && !this._reactorFixed.A) prompt = '[F] Sửa lò phản ứng (Điểm A)'
        else if (dB < INTERACT_RANGE && !this._reactorFixed.B) prompt = '[F] Sửa lò phản ứng (Điểm B)'
      } else if (this.sabotageLights) {
        const d = Phaser.Math.Distance.Between(px, py, this._lightsFixPoint.x, this._lightsFixPoint.y)
        if (d < INTERACT_RANGE) prompt = '[F] Bật lại đèn'
      }
    }

    if (!this.player.isImposter && !prompt && !this.sabotageReactor && !this.sabotageLights) {
      const nearTask = this.taskList
        ? this.taskList.find(t => !t.done && Phaser.Math.Distance.Between(px, py, t.x, t.y) < INTERACT_RANGE)
        : null
      if (nearTask) prompt = `[F] ${nearTask.label}`
    }

    if (!prompt) {
      // Ưu tiên báo xác chết dựa trên sprite cái xác tĩnh dưới đất
      const nearBody = this.corpses.getChildren().find(body => 
        Phaser.Math.Distance.Between(px, py, body.x, body.y) < INTERACT_RANGE)
      if (nearBody) prompt = '[R] Báo xác'
    }

    if (!prompt && !this.player.isImposter) {
      const dist = Phaser.Math.Distance.Between(px, py, this.emergencyBtnPos.x, this.emergencyBtnPos.y)
      if (dist < INTERACT_RANGE) {
        const meetElapsed = this.time.now - this.meetingCooldownStart
        prompt = meetElapsed >= MEETING_COOLDOWN ? '[E] Họp khẩn cấp' : 'Họp: chờ cooldown'
      }
    }

    this.game.registry.get('onPrompt')?.(prompt)
  }

  // --- VENT SYSTEM ---
  _tryVent() {
    if (!this.player.isImposter || !this.player.alive) return
    const ventCooldownOk = this.time.now - this.ventCooldownStart > VENT_COOLDOWN

    if (!this.player.inVent) {
      // Enter vent
      const nearVent = this.ventZones.find(v =>
        Phaser.Math.Distance.Between(this.player.x, this.player.y, v.x, v.y) < INTERACT_RANGE)
      if (!nearVent || !ventCooldownOk) return

      this.player.inVent = true
      this.player.currentVent = nearVent
      this.player.setAlpha(0.3)
      this.player.setVelocity(0, 0)
      this.player.body.enable = false
      safePlay(this, 'vent')

      // Show vent selection UI
      this._showVentMenu(nearVent)
    } else {
      // Exit vent
      this._exitVent()
    }
  }

  _showVentMenu(currentVent) {
    // Vent prompt is handled by React gamePrompt via _updateInteractionPrompt
  }

  _exitVent() {
    this.player.inVent = false
    this.player.currentVent = null
    this.player.setAlpha(1)
    this.player.body.enable = true
    this.ventCooldownStart = this.time.now
    safePlay(this, 'vent')
  }

  // --- SABOTAGE SYSTEM ---
  _trySabotage() {
    if (!this.player.isImposter || !this.player.alive) return
    if (this.sabotageReactor || this.sabotageLights) return  // already active
    if (this.time.now - this.sabotageCooldownStart < SABOTAGE_COOLDOWN) return
    this._showSabotageMenu()
  }

  _showSabotageMenu() {
    if (this._sabotageMenuOpen) return
    this._sabotageMenuOpen = true
    this.game.registry.set('sabotageMenuOpen', true)
  }

  _closeSabotageMenu() {
    if (!this._sabotageMenuOpen) return
    this._sabotageMenuOpen = false
    this.game.registry.set('sabotageMenuOpen', false)
  }

  _activateSabotage(type) {
    this.sabotageCooldownStart = this.time.now
    if (type === 'reactor') {
      this.sabotageReactor = true
      this.reactorStartTime = this.time.now
      this._reactorFixed = { A: false, B: false }
      this._showSabotageAlert('⚠ LÒ PHẢN ỨNG BỊ PHÁ!\nSửa tại 2 điểm trước khi hết giờ!', '#ff4444')
      if (this.ws) this.ws.emit('sabotage', { type: 'reactor' })
    } else if (type === 'lights') {
      this.sabotageLights = true
      this._applyLightsEffect(true)
      this._showSabotageAlert('⚠ ĐÈN BỊ TẮT!\nSửa tại phòng điện!', '#ffaa00')
      if (this.ws) this.ws.emit('sabotage', { type: 'lights' })
      // Lights auto-fix after 30s if crew doesn't fix
      this.time.delayedCall(30000, () => {
        if (this.sabotageLights) this._fixSabotage('lights')
      })
    }
  }

  _applyLightsEffect(on) {
    if (on) {
      // Dark overlay with small vision circle around player
      if (!this._lightsOverlay) {
        this._lightsOverlay = this.add.graphics().setScrollFactor(0).setDepth(15)
      }
    } else {
      this._lightsOverlay?.destroy()
      this._lightsOverlay = null
    }
  }

  _updateLightsOverlay() {
    if (!this.sabotageLights || !this._lightsOverlay) return
    const { width, height } = this.scale
    this._lightsOverlay.clear()

    // Player position in screen coords
    const cam = this.cameras.main
    const sx = this.player.x - cam.scrollX
    const sy = this.player.y - cam.scrollY
    const r = 120

    // Draw full dark screen first
    this._lightsOverlay.fillStyle(0x000000, 0.92)
    this._lightsOverlay.fillRect(0, 0, width, height)

    // Punch a "vision hole" by drawing concentric circles from outside in,
    // getting progressively more transparent toward the center
    const steps = 10
    for (let i = 0; i < steps; i++) {
      const ratio = i / steps                    // 0 = outermost, 1 = innermost
      const alpha = 0.92 * (1 - ratio)           // dark at edge, transparent at center
      const circleR = r * (1 - ratio / steps)    // shrinking radius
      this._lightsOverlay.fillStyle(0x000000, alpha)
      this._lightsOverlay.fillCircle(sx, sy, circleR)
    }
    // Clear the very center so player can see directly around them
    this._lightsOverlay.fillStyle(0x000000, 0)
    this._lightsOverlay.fillCircle(sx, sy, r * 0.35)
  }

  _fixSabotage(type) {
    if (type === 'reactor') {
      this.sabotageReactor = false
      this._showSabotageAlert('✓ Lò phản ứng đã được sửa!', '#44ff88')
    } else if (type === 'lights') {
      this.sabotageLights = false
      this._applyLightsEffect(false)
      this._showSabotageAlert('✓ Đèn đã được bật lại!', '#44ff88')
      if (this.ws) this.ws.emit('sabotageFixed', { type: 'lights' })
    }
  }

  _showSabotageAlert(msg, color) {
    // Chuyển đổi màu hex của Phaser sang kiểu mà React HUD hiểu (danger/info)
    const type = (color === '#ff4444' || color === '#ff0000') ? 'danger' : 'info'
    
    // Gửi thông báo sang React HUD
    this.game.registry.get('onAlert')?.(msg, type, 4000)
  }

  _tryFixSabotage() {
    if (!this.player.alive) return false
    const px = this.player.x, py = this.player.y

    if (this.sabotageReactor) {
      // Check fix point A
      const dA = Phaser.Math.Distance.Between(px, py, this._reactorFixPoints[0].x, this._reactorFixPoints[0].y)
      if (dA < INTERACT_RANGE && !this._reactorFixed.A) {
        this._reactorFixed.A = true
        this._showSabotageAlert('✓ Điểm A đã sửa! Sửa điểm B!', '#ffff44')
        if (this.ws) this.ws.emit('sabotageFixProgress', { type: 'reactor', point: 'A' })
      }
      // Check fix point B
      const dB = Phaser.Math.Distance.Between(px, py, this._reactorFixPoints[1].x, this._reactorFixPoints[1].y)
      if (dB < INTERACT_RANGE && !this._reactorFixed.B) {
        this._reactorFixed.B = true
        this._showSabotageAlert('✓ Điểm B đã sửa! Sửa điểm A!', '#ffff44')
        if (this.ws) this.ws.emit('sabotageFixProgress', { type: 'reactor', point: 'B' })
      }
      // Return true if player was near a fix point
      return dA < INTERACT_RANGE || dB < INTERACT_RANGE
    }

    if (this.sabotageLights) {
      const d = Phaser.Math.Distance.Between(px, py, this._lightsFixPoint.x, this._lightsFixPoint.y)
      if (d < INTERACT_RANGE) {
        if (this.ws) this.ws.emit('sabotageFixed', { type: 'lights' })
        return true
      }
    }

    return false
  }

  _tryKill() {
    if (!this.player.isImposter || !this.player.alive || this.player.inVent) return
    if (this.killCooldownStart === 0) return  // timer not started yet
    if (this.time.now - this.killCooldownStart < KILL_COOLDOWN) return

    // Only target crewmates, not other impostors
    const targets = Object.values(this.remotePlayers).filter(p => !p.isImposter)
    let nearest = null, minDist = INTERACT_RANGE
    targets.forEach(p => {
      if (!p.alive) return
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, p.x, p.y)
      if (dist < minDist) { minDist = dist; nearest = p }
    })

    if (nearest) {
      this.killCooldownStart = this.time.now
      safePlay(this, 'imposter_kill')
      if (this.ws) this.ws.emit('kill', { victimId: nearest.playerId })
    }
  }

  _checkImpostorWin() {
    // Win conditions are server-authoritative.
  }

  _checkWinConditions() {
    // Win conditions are server-authoritative.
  }

  _spawnCorpse(x, y, color, id) {
    if (this.spawnedCorpseIds.has(id)) return
    // Sử dụng sprite xác chết (có xương)
    const body = this.add.sprite(x, y, `${color}_dead`).setDepth(1)
    body.playerId = id
    this.corpses.add(body)
    this.spawnedCorpseIds.add(id)
    console.log(`💀 Đã tạo xác của ${id} tại ${x}, ${y}`)
  }

  _tryReport() {
    if (!this.player.alive || this.player.inVent) return
    
    // CHỈ tìm trong group corpses (các cái xác tĩnh dưới đất)
    let nearestCorpse = null
    let minDist = 100 // Tăng nhẹ từ INTERACT_RANGE (80) lên 100 để báo xác nhạy hơn
    
    this.corpses.getChildren().forEach(body => {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, body.x, body.y)
      if (d < minDist) {
        minDist = d
        nearestCorpse = body
      }
    })

    if (nearestCorpse) {
      console.log(`📣 Đang báo xác của: ${nearestCorpse.playerId}`)
      if (this.ws) this.ws.emit('report', { victimId: nearestCorpse.playerId })
    }
  }

  _tryEmergency() {
    if (!this.player.alive || this.player.inVent) return
    if (this.player.isImposter) return  // impostor không được dùng nút khẩn cấp
    if (this.time.now - this.meetingCooldownStart < MEETING_COOLDOWN) return
    const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.emergencyBtnPos.x, this.emergencyBtnPos.y)
    if (dist < INTERACT_RANGE) {
      if (this.ws) this.ws.emit('emergency')
    }
  }

  _startMeeting(reporterId, victimId) {
    safePlay(this, victimId ? 'report_Bodyfound' : 'alarm_emergencymeeting')
    this.bgMusic?.stop()
    this.paused = true
    this.meetingCooldownStart = this.time.now
    this._meetingStartTime = this.time.now
    this.game.registry.set('meetingActive', true)
    this.game.registry.get('onPrompt')?.(null)

    // Xóa tất cả xác chết trên bản đồ khi cuộc họp bắt đầu
    if (this.corpses) this.corpses.clear(true, true)

    // Gọi ngay để client có meeting state trước khi nhận meetingState (timer đếm đúng)
    this.game.registry.get('onMeetingStart')?.({
      players: this._getAllPlayers(),
      localPlayerId: this.playerId,
      reporterId, victimId,
      gameMode: this.gameMode
    })
  }

  _handleEject(playerId) {
    if (playerId === this.playerId) {
      this._spawnCorpse(this.player.x, this.player.y, this.playerColor, this.playerId)
      this._becomeGhost()
    } else if (this.remotePlayers[playerId]) {
      const rp = this.remotePlayers[playerId]
      this._spawnCorpse(rp.x, rp.y, rp.color, playerId)
      rp.die()
      rp.becomeGhost()
    }
  }

  _checkAllImpostorsGone() {
    // Win conditions are server-authoritative.
  }

  _getAllPlayers() {
    const all = [{ id: this.playerId, name: this.playerName, color: this.playerColor,
      alive: this.player.alive, isImposter: this.player.isImposter, isLocal: true }]
    Object.entries(this.remotePlayers).forEach(([id, p]) => {
      all.push({ id, name: p.playerName, color: p.color,
        alive: p.alive, isImposter: p.isImposter, isLocal: false })
    })
    return all
  }

  _tryInteractTask() {
    if (!this.taskList) return
    const px = this.player.x, py = this.player.y
    const task = this.taskList.find(t =>
      !t.done && Phaser.Math.Distance.Between(px, py, t.x, t.y) < INTERACT_RANGE
    )
    if (!task) return
    
    // Gọi React để mở Mini-game
    this.game.registry.get('onOpenTask')?.(task.id, task.label, task.kind)
    
    // Lắng nghe sự kiện hoàn thành từ React (chỉ đăng ký 1 lần)
    if (!this._taskListenerRegistered) {
      this.game.registry.set('onTaskComplete', (taskId) => {
        this._completeTask(taskId)
      })
      this._taskListenerRegistered = true
    }
  }

  // --- GHOST SYSTEM ---
  _becomeGhost() {
    if (!this.player.alive) return  // already ghost
    this.player.die()
    this.player.setAlpha(0.45)
    this.player.setTint(0x8888ff)
    this.player.body.enable = false  // pass through walls
    // Ghost crewmate can still do tasks - show task markers
    if (!this.player.isImposter && this._taskMarkers) {
      this._taskMarkers.forEach(({ task, marker }) => marker.setVisible(!task.done))
    }
    // Update chat bridge state
    if (this._chatBridge) this._chatBridge.alive = false
    this.game.registry.set('chatBridge', { ...this._chatBridge, alive: false })
    this.game.registry.get('onAlert')?.('👻 Bạn đã chết\n[T] Chat hồn ma  |  [L] Rời trận', 'info', 4000)
    this._updateHUD()
    // L key to leave game
    this.leaveKey = this.input.keyboard.addKey('L')
  }

  // --- CHAT SYSTEM (bridged to React overlay) ---
  _sendChat(text, channel) {
    if (!this.ws?.connected) return
    this.ws.emit('chat', { text, channel, x: this.player.x, y: this.player.y })
  }

  _receiveChatMessage(msg) {
    // Forward to React overlay via registry callback
    this.game.registry.get('onChatMessage')?.(msg)
  }

  _cleanupSocketListeners() {
    if (!this.ws) return
    const events = [
      'id', 'players', 'kill', 'meeting', 'reportFailed', 'meetingState', 'meetingResult',
      'gameover', 'returnToLobby', 'chat', 'vote', 'meetingChat',
      'sabotage', 'sabotageFixed', 'sabotageFixProgress'
    ]
    events.forEach(evt => this.ws.off(evt))
  }

  _endGame(winner) {
    if (!this.playing) return
    this.playing = false
    // Cleanup visibility listener và native interval
    if (this._onVisibilityChange) {
      document.removeEventListener('visibilitychange', this._onVisibilityChange)
      this._onVisibilityChange = null
    }
    if (this._nativeStateInterval) {
      clearInterval(this._nativeStateInterval)
      this._nativeStateInterval = null
    }
    this.bgMusic?.stop()
    this.game.registry.get('handleMeetingAbort')?.()
    this.game.registry.remove?.('hudData')
    safePlay(this, winner === 'crew' ? 'victory_crew' : 'victory_impostor')
    
    this._cleanupSocketListeners()

    this.time.delayedCall(1500, () => {
      // Notify React app if callback provided (new React architecture)
      if (this._onGameEnd) {
        this._onGameEnd({
          winner,
          roomId: this.roomId,
          players: this._getAllPlayers(),
          localPlayerId: this.playerId,
        })
        return
      }
      // Fallback: old Phaser scene transition
      this.scene.start('GameOver', {
        winner,
        playerColor: this.playerColor,
        playerName:  this.playerName,
        socket:      this.ws,
        roomId:      this.roomId
      })
    })
  }

  // --- MULTIPLAYER ---
  _initMultiplayer() {
    // Socket always comes from React singleton (via registry)
    this.ws = this._existingSocket
    if (!this.ws) { console.error('GameScene: no socket provided'); return }
    this.playerId = this.ws.id
    this._setupSocketListeners()
    this._sendPlayerState()
    // Phaser timer cho tab active (30ms)
    this.time.addEvent({ delay: 30, loop: true, callback: this._sendPlayerState, callbackScope: this })

    // Khi tab bị ẩn, Phaser timer bị throttle → dùng native interval thay thế
    this._nativeStateInterval = null
    this._onVisibilityChange = () => {
      if (document.hidden) {
        // Tab ẩn: dùng native interval 200ms để giữ kết nối
        if (!this._nativeStateInterval) {
          this._nativeStateInterval = setInterval(() => this._sendPlayerState(), 200)
        }
      } else {
        // Tab active lại: dừng native interval, Phaser timer tiếp quản
        if (this._nativeStateInterval) {
          clearInterval(this._nativeStateInterval)
          this._nativeStateInterval = null
        }
      }
    }
    document.addEventListener('visibilitychange', this._onVisibilityChange)
  }

  _setupSocketListeners() {
    this._totalMissionsDone = 0
    this._totalMissionsNeeded = 0

    this.ws.on('gameStart', (d) => {
      this._totalMissionsDone = d.totalMissionsDone || 0
      this._totalMissionsNeeded = d.totalMissionsNeeded || 0
      this._updateHUD()
    })

    this.ws.on('id',            (d) => { this.playerId = d.id })
    this.ws.on('players',       (d) => this._handlePlayers(d.players))
    this.ws.on('kill',          (d) => this._handleKillMsg(d))
    this.ws.on('meeting',       (d) => this._startMeeting(d.reporterId, d.victimId))
    this.ws.on('reportFailed',  (d) => {
      console.warn('📛 Báo xác thất bại:', d.reason, d.dist != null ? `(khoảng cách: ${d.dist})` : '')
      this.game.registry.get('onAlert')?.(`Không thể báo xác: ${d.reason}`, 'info', 3000)
    })
    this.ws.on('meetingState',  (d) => this.game.registry.get('onMeetingState')?.(d))
    this.ws.on('meetingResult', (d) => this.game.registry.get('onMeetingResult')?.(d))
    this.ws.on('gameover',      (d) => this._endGame(d.winner))
    this.ws.on('returnToLobby', (d) => this._handleReturnToLobby(d))
    this.ws.on('chat',          (d) => this._receiveChatMessage(d))
    this.ws.on('vote',          (d) => this.game.registry.get('onMeetingVote')?.(d))
    this.ws.on('meetingChat',   (d) => this.game.registry.get('onMeetingChat')?.(d))
    this.ws.on('sabotage',      (d) => this._receiveSabotage(d))
    this.ws.on('sabotageFixed', (d) => this._receiveSabotageFixed(d))
    this.ws.on('sabotageFixProgress', (d) => {
      if (d.type === 'reactor') this._reactorFixed[d.point] = true
    })
    this.ws.on('taskDone', (d) => {
      this._totalMissionsDone = d.totalDone
      this._totalMissionsNeeded = d.totalNeeded
      this._updateHUD()
    })
  }

  _handleReturnToLobby(data) {
    // Server confirmed room is reset - store for GameOver to use
    this._returnLobbyData = data
  }

  _receiveSabotage({ type }) {
    if (type === 'reactor') {
      this.sabotageReactor = true
      this.reactorStartTime = this.time.now
      this._reactorFixed = { A: false, B: false }
      this._showSabotageAlert('⚠ LÒ PHẢN ỨNG BỊ PHÁ!\nSửa tại 2 điểm trước khi hết giờ!', '#ff4444')
    } else if (type === 'lights') {
      this.sabotageLights = true
      this._applyLightsEffect(true)
      this._showSabotageAlert('⚠ ĐÈN BỊ TẮT!\nSửa tại phòng điện!', '#ffaa00')
    }
  }

  _receiveSabotageFixed({ type }) {
    if (type === 'reactor') {
      this.sabotageReactor = false
      this._showSabotageAlert('✓ Lò phản ứng đã được sửa!', '#44ff88')
    } else if (type === 'lights') {
      this.sabotageLights = false
      this._applyLightsEffect(false)
      this._showSabotageAlert('✓ Đèn đã được bật lại!', '#44ff88')
    }
  }

  _handleKillMsg({ killerId, victimId }) {
    if (victimId === this.playerId) {
      // Khi mình bị giết, spawn xác tại vị trí mình đang đứng
      this._spawnCorpse(this.player.x, this.player.y, this.playerColor, this.playerId)
      this._becomeGhost()
    } else if (this.remotePlayers[victimId]) {
      const rp = this.remotePlayers[victimId]
      // Spawn xác tại vị trí của người chơi bị giết
      this._spawnCorpse(rp.x, rp.y, rp.color, victimId)
      rp.die()
      rp.becomeGhost()
    }
  }

  _handlePlayers(playerList) {
    playerList.forEach(p => {
      if (p.id === this.playerId) return
      if (!this.remotePlayers[p.id]) {
        this.remotePlayers[p.id] = new Player(this, p.x, p.y, p.color, false)
        this.remotePlayers[p.id].playerId = p.id
        this.remotePlayers[p.id].setName(p.name)
        this.physics.add.collider(this.remotePlayers[p.id], this.wallGroup)
      }
      const rp = this.remotePlayers[p.id]
      rp.playerId = p.id
      if (rp.playerName !== p.name) rp.setName(p.name)
      rp.syncRemote(p)
      
      const remoteIsGhost = p.isGhost || !p.alive
      const localIsGhost = !this.player.alive

      if (remoteIsGhost) {
        // Nếu server báo là hồn ma mà client chưa có xác chết tương ứng -> spawn xác
        if (!this.spawnedCorpseIds.has(p.id)) {
          this._spawnCorpse(p.x, p.y, p.color, p.id)
        }

        if (!rp._isGhost) {
          rp.die()          // Đặt texture xác chết trước khi thành hồn ma
          rp.becomeGhost()  
        }
        
        // LOGIC QUAN TRỌNG:
        // Nếu người chơi khác là hồn ma, chỉ hiển thị nếu bản thân mình cũng là hồn ma
        if (localIsGhost) {
          rp.setVisible(true)
          rp.setAlpha(0.4) // Hồn ma hiện mờ đối với hồn ma khác
          rp.nameLabel?.setVisible(true)
          rp.nameLabel?.setAlpha(0.5)
        } else {
          // Bạn còn sống nên không được thấy hồn ma
          rp.setVisible(false)
          rp.nameLabel?.setVisible(false)
        }
      } else {
        // Người chơi khác còn sống: Luôn hiển thị
        rp.setVisible(true)
        rp.setAlpha(1)
        rp.nameLabel?.setVisible(true)
        rp.nameLabel?.setAlpha(1)
      }
    })
    const ids = playerList.map(p => p.id)
    Object.keys(this.remotePlayers).forEach(id => {
      if (!ids.includes(id)) { 
        this.remotePlayers[id].destroy()
        delete this.remotePlayers[id] 
      }
    })

    // Kiểm tra điều kiện thắng/thua chỉ khi đã có đủ players (tránh false positive lúc đầu game)
    if (this.playing && this._gameFullyStarted) {
      this._checkAllImpostorsGone()
      this._checkImpostorWin()
    }
  }

  _sendPlayerState() {
    if (!this.ws?.connected) return
    this.ws.emit('update', {
      x: this.player.x, y: this.player.y,
      alive: this.player.alive, color: this.playerColor, name: this.playerName,
      imposter: this.player.isImposter, tasks: this.missionsDone,
      isGhost: !this.player.alive
    })
  }

  update(time) {
    if (!this.playing || this.paused) return

    // Ghost can still move, do tasks (crewmate), and chat
    if (!this.player.alive) {
      this.player.update(this.cursors, time)
      Object.values(this.remotePlayers).forEach(rp => rp.updateRemote(time.delta))
      this._updateHUD()
      if (Phaser.Input.Keyboard.JustDown(this.chatKey)) this._openChat()
      // Ghost crewmate can still do tasks
      if (!this.player.isImposter && Phaser.Input.Keyboard.JustDown(this.taskKey)) this._tryInteractTask()
      // L = leave game
      if (this.leaveKey && Phaser.Input.Keyboard.JustDown(this.leaveKey)) {
        this._endGame(null)
      }
      this._updateInteractionPrompt()
      if (Phaser.Input.Keyboard.JustDown(this.chatKey)) {
        this.game.registry.get('onChatToggle')?.()
      }
      return
    }

    // Handle vent movement
    if (this.player.inVent) {
      if (Phaser.Input.Keyboard.JustDown(this.ventKey)) {
        const idx = this.ventZones.findIndex(v => v.id === this.player.currentVent.id)
        const next = this.ventZones[(idx + 1) % this.ventZones.length]
        this.player.setPosition(next.x, next.y)
        this.player.currentVent = next
        safePlay(this, 'vent')
      }
      if (Phaser.Input.Keyboard.JustDown(this.emergencyKey)) this._exitVent()
      this._updateHUD()
      return
    }

    this.player.update(this.cursors, time)
    // Interpolate all remote players every frame
    Object.values(this.remotePlayers).forEach(rp => rp.updateRemote(time.delta))
    this._updateHUD()
    this._updateInteractionPrompt()
    this._updateLightsOverlay()
    if (this._gameFullyStarted) this._checkWinConditions()

    if (this.player.isImposter && Phaser.Input.Keyboard.JustDown(this.killKey)) this._tryKill()
    if (this.player.isImposter && Phaser.Input.Keyboard.JustDown(this.ventKey)) this._tryVent()
    if (this.player.isImposter && Phaser.Input.Keyboard.JustDown(this.sabotageKey)) {
      if (this._sabotageMenuOpen) this._closeSabotageMenu()
      else this._trySabotage()
    }
    if (Phaser.Input.Keyboard.JustDown(this.reportKey))    this._tryReport()
    if (Phaser.Input.Keyboard.JustDown(this.emergencyKey)) this._tryEmergency()
    if (!this.player.isImposter && Phaser.Input.Keyboard.JustDown(this.taskKey)) {
      // Sabotage fix takes priority — only open task if no sabotage was fixed
      const fixedSabotage = this._tryFixSabotage()
      if (!fixedSabotage) this._tryInteractTask()
    }
    if (Phaser.Input.Keyboard.JustDown(this.chatKey)) {
      this.game.registry.get('onChatToggle')?.()
    }
  }
}
