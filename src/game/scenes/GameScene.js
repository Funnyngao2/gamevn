// GameScene.js - main gameplay scene
import Phaser from 'phaser'
import { Player } from '../../entities/Player.js'
import { safePlay } from '../../utils/safePlay.js'
import { NO_OF_MISSIONS, KILL_COOLDOWN, MEETING_COOLDOWN, REACTOR_CRITICAL_TIME, VENT_COOLDOWN, SABOTAGE_COOLDOWN } from '../../config.js'
import { resolveTaskKind } from '../tasks/taskKindResolve.js'

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
    this._lastNearTaskId = null
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
    // Support both `Obstacles` and `obstacles` layer names from Tiled
    const obstaclesLayer = this.map.getObjectLayer('Obstacles') || this.map.getObjectLayer('obstacles')
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

    // --- TASKS FROM MAP: chỉ lấy từ layer "Tasks" ---
    this.tasksFromMap = []
    const isEmergencyOrNonTaskNameInTasksLayer = (name) => {
      const n = String(name || '').trim().toLowerCase()
      if (!n) return false
      // Nút khẩn cấp đôi khi bị đặt nhầm trong layer "Tasks"
      if (['walls', 'wall', 'tables', 'vent', 'emerg_btn', 'emergency_btn'].includes(n)) return true
      // Hỗ trợ trường hợp có suffix / index: emerg_btn1, emergency_btn_2,...
      if (/^emerg(?:ency)?(?:_|-)?btn\d*$/i.test(n)) return true
      if (/^player\d*$/i.test(n)) return true
      return false
    }
    let taskObjects = []
    const tasksOnlyLayer = this.map.getObjectLayer('Tasks') || this.map.getObjectLayer('tasks')
    if (tasksOnlyLayer && tasksOnlyLayer.objects && tasksOnlyLayer.objects.length) {
      taskObjects = tasksOnlyLayer.objects.filter(obj => obj.x != null && obj.y != null && !isEmergencyOrNonTaskNameInTasksLayer(obj.name))
    }
    taskObjects.forEach((obj, i) => {
      const props = (obj.properties || []).reduce((acc, p) => { acc[p.name] = p.value; return acc }, {})
      const id = props.id || (obj.id != null ? `task_${obj.id}` : null) || obj.name || `task_${i}`
      let kind = props.kind
      if (!kind && obj.name && obj.name.includes('_')) kind = obj.name.split('_').slice(0, -1).join('_')
      if (!kind) kind = 'task'
      const label = props.label || obj.name || id
      const x = Math.round((obj.x || 0) + (obj.width || 0) / 2)
      const y = Math.round((obj.y || 0) + (obj.height || 0) / 2)
      this.tasksFromMap.push({ id: String(id), kind: resolveTaskKind(String(kind)), label: String(label), x, y })
    })

    // --- DYNAMIC SABOTAGE FIX POINTS FROM MAP ---
    // Always read sabotage fix points directly from the object layer, not from `tasksFromMap`.
    // This prevents cases where `tasksFromMap` is built from layer `Tasks` only.
    const normalize = (v) => String(v).trim().toLowerCase().replace(/[^a-z0-9_]/g, '')
    const findPointFromObstacles = (key) => {
      const objs = obstaclesLayer?.objects || []
      const normKey = normalize(key)

      for (const obj of objs) {
        const props = (obj.properties || []).reduce((acc, p) => { acc[p.name] = p.value; return acc }, {})
        const candidates = [props.id, obj.name, obj.id].filter(v => v != null)
        if (!candidates.some(v => normalize(v) === normKey)) continue

        return {
          x: Math.round((obj.x || 0) + (obj.width || 0) / 2),
          y: Math.round((obj.y || 0) + (obj.height || 0) / 2),
        }
      }
      return null
    }

    // Chỉ dùng reactor_a — 1 điểm duy nhất
    const reactorA = findPointFromObstacles('reactor_a')
    if (reactorA) {
      this._reactorFixPoints = [reactorA]
    } else {
      const a2 = this.tasksFromMap.find(t => normalize(t.id) === normalize('reactor_a'))
      if (a2) this._reactorFixPoints = [{ x: a2.x, y: a2.y }]
    }

    const lightsFix = findPointFromObstacles('lights_fix')
    if (lightsFix) this._lightsFixPoint = { x: lightsFix.x, y: lightsFix.y }
    else {
      const lf = this.tasksFromMap.find(t => normalize(t.id) === normalize('lights_fix'))
      if (lf) this._lightsFixPoint = { x: lf.x, y: lf.y }
    }

    if (this.tasksFromMap.length) {
      // console.log('[Tasks] Danh sách nhiệm vụ từ map (vị trí x,y):', this.tasksFromMap.map(t => ({ id: t.id, kind: t.kind, label: t.label, x: t.x, y: t.y })))
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
    // Fix points already parsed from map above — do NOT reset here
    if (!this._reactorFixPoints) this._reactorFixPoints = []
    if (!this._lightsFixPoint) this._lightsFixPoint = { x: 1400, y: 1600 } // Fallback default
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
      sabotage: {
        reactor: this.sabotageReactor,
        reactorFixPoint: this._reactorFixPoints?.[0] || null,
        lights: this.sabotageLights,
        lightsFixPoint: this._lightsFixPoint
      },
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
      return {
        id: task.id,
        kind: resolveTaskKind(base.kind),
        label: base.label,
        x: base.x,
        y: base.y,
        done: false,
      }
    })
  }

  _completeTask(taskId) {
    if (!this.taskList) return
    const task = this.taskList.find(t => t.id === taskId && !t.done)
    if (!task) return
    task.done = true
    this.missionsDone++
    this._lastNearTaskId = null // Reset khi xong
    safePlay(this, 'task_complete')
    if (this.ws) this.ws.emit('taskDone', { taskId })
    this._refreshTaskMarkers()
    this._checkWinConditions()
    this._updateInteractionPrompt()
    this._updateHUD()
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
          this._lastNearTaskId = nearTask.id
          return
        } else if (this._lastNearTaskId) {
          this.game.registry.get('onOpenTask')?.(null)
          this._lastNearTaskId = null
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

    // Báo xác ưu tiên cao hơn kill (cả impostor lẫn crewmate)
    if (!prompt) {
      const nearBody = this.corpses.getChildren().find(body =>
        Phaser.Math.Distance.Between(px, py, body.x, body.y) < INTERACT_RANGE)
      if (nearBody) prompt = '[R] Báo xác'
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

    if (!prompt) {
      if (this.sabotageReactor && this._reactorFixPoints?.length >= 1) {
        if (this._nearestReactorFixDist(px, py) < INTERACT_RANGE) {
          prompt = '⚛ Đứng yên để sửa lò phản ứng (cần 2 người)'
        }
      } else if (this.sabotageLights && this._lightsFixPoint) {
        const d = Phaser.Math.Distance.Between(px, py, this._lightsFixPoint.x, this._lightsFixPoint.y)
        if (d < INTERACT_RANGE) prompt = '[F] Bật lại đèn'
      }
    }

    if (!this.player.isImposter && !prompt && !this.sabotageReactor && !this.sabotageLights) {
      const nearTask = this.taskList
        ? this.taskList.find(t => !t.done && Phaser.Math.Distance.Between(px, py, t.x, t.y) < INTERACT_RANGE)
        : null
      
      if (nearTask) {
        prompt = `[F] ${nearTask.label}`
        this._lastNearTaskId = nearTask.id
      } else {
        // Nếu vừa rời khỏi vùng của task đang mở, tự động đóng lại
        if (this._lastNearTaskId) {
          this.game.registry.get('onOpenTask')?.(null)
          this._lastNearTaskId = null
        }
      }
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
      this._reactorProgress = 0
      this._reactorFixers = 0
      this._showSabotageAlert('⚠ LÒ PHẢN ỨNG BỊ PHÁ!\nĐến một trong hai điểm reactor — cần 2 người!', '#ff4444')
      if (this.ws) this.ws.emit('sabotage', { type: 'reactor' })
    } else if (type === 'lights') {
      this.sabotageLights = true
      this._applyLightsEffect(true)
      this._showSabotageAlert('⚠ ĐÈN BỊ TẮT!\nSửa tại phòng điện!', '#ffaa00')
      if (this.ws) this.ws.emit('sabotage', { type: 'lights' })
    }
  }

  _applyLightsEffect(on) {
    // Hiệu ứng tắt đèn được xử lý hoàn toàn bởi React overlay (LightsDarkOverlay)
    // Impostor không bị ảnh hưởng
    if (this.player?.isImposter) return
    if (!on) {
      this.game.registry.set('lightsDarkData', { active: false })
    }
    // Khi on=true, _updateLightsOverlay() sẽ tự bridge tọa độ mỗi frame
  }

  _updateLightsFixOverlay() {
    if (!this.game?.registry) return
    // Impostor không fix lights, và không hiện popup sau khi đã toggle xong
    if (!this.sabotageLights || !this._lightsFixPoint || this.player.isImposter || this._lightsToggled) {
      if (this._lightsHoldStart) this._lightsHoldStart = null
      this.game.registry.set('lightsFixData', { visible: false })
      return
    }

    const px = this.player.x, py = this.player.y
    const d = Phaser.Math.Distance.Between(px, py, this._lightsFixPoint.x, this._lightsFixPoint.y)
    const nearLights = d < INTERACT_RANGE && this.player.alive

    // Debug: log mỗi 2s để kiểm tra vị trí
    if (!this._lightsDebugTick || this.time.now - this._lightsDebugTick > 2000) {
      this._lightsDebugTick = this.time.now
      console.log(`[Lights] player(${Math.round(px)},${Math.round(py)}) fixPoint(${this._lightsFixPoint.x},${this._lightsFixPoint.y}) dist=${Math.round(d)} near=${nearLights}`)
    }

    const HOLD = 1500
    let progress = 0
    if (nearLights && this._lightsHoldStart) {
      progress = Math.min(1, (this.time.now - this._lightsHoldStart) / HOLD)
    }

    this.game.registry.set('lightsFixData', {
      visible: nearLights,
      nearLights,
      toggled: this._lightsToggled || false,
      progress,
    })
  }

  _updateLightsOverlay() {
    if (!this.game?.registry) return
    // Tắt overlay nếu không có sabotage, là impostor, hoặc đã toggle xong (chờ server confirm)
    if (!this.sabotageLights || this.player?.isImposter || this._lightsToggled) {
      this.game.registry.set('lightsDarkData', { active: false })
      return
    }
    const cam = this.cameras.main
    // cam.midPoint là tâm camera thực tế (chính xác hơn scrollX/Y khi có lerp)
    const scrollX = cam.midPoint.x - cam.width  / 2 / cam.zoom
    const scrollY = cam.midPoint.y - cam.height / 2 / cam.zoom
    const cx = (this.player.x - scrollX) * cam.zoom
    const cy = (this.player.y - scrollY) * cam.zoom

    // Tính offset canvas so với viewport (Scale.FIT có thể tạo letterbox)
    const canvas = this.game.canvas
    const rect = canvas?.getBoundingClientRect()
    const offsetX = rect ? rect.left : 0
    const offsetY = rect ? rect.top  : 0
    const scaleX  = rect ? rect.width  / (canvas.width  || 1) : 1
    const scaleY  = rect ? rect.height / (canvas.height || 1) : 1

    this.game.registry.set('lightsDarkData', {
      active: true,
      sx: offsetX + cx * scaleX,
      sy: offsetY + cy * scaleY,
    })
  }

  _showSabotageAlert(msg, color) {
    const c = String(color || '').toLowerCase()
    let type = 'info'
    if (c === '#ff4444' || c === '#ff0000') type = 'danger'
    else if (c === '#ffaa00' || c === '#f59e0b') type = 'warning'
    else if (c === '#44ff88' || c === '#22c55e') type = 'success'
    this.game.registry.get('onAlert')?.(msg, type, 4000)
  }

  /** Khoảng cách tới điểm sửa reactor gần nhất (map có reactor_a + reactor_b). */
  _nearestReactorFixDist(px, py) {
    if (!this._reactorFixPoints?.length) return Infinity
    return Math.min(
      ...this._reactorFixPoints.map((pt) => Phaser.Math.Distance.Between(px, py, pt.x, pt.y))
    )
  }

  _tryFixSabotage() {
    if (!this.player.alive) return false
    const px = this.player.x, py = this.player.y

    if (this.sabotageReactor && this._reactorFixPoints?.length >= 1) {
      if (this._nearestReactorFixDist(px, py) < INTERACT_RANGE) return true // reactorStand trong update loop
    }

    if (this.sabotageLights) {
      if (this.player.isImposter) return false  // impostor không fix lights
      const d = Phaser.Math.Distance.Between(px, py, this._lightsFixPoint.x, this._lightsFixPoint.y)
      if (d < INTERACT_RANGE) {
        const HOLD = 1500
        if (!this._lightsHoldStart) this._lightsHoldStart = this.time.now
        if (this.time.now - this._lightsHoldStart >= HOLD) {
          this._lightsToggled = true
          this._lightsHoldStart = null
          this._applyLightsEffect(false)  // tắt overlay ngay, không chờ server
          if (this.ws) this.ws.emit('sabotageFixed', { type: 'lights' })
        }
        return true
      } else {
        this._lightsHoldStart = null
      }
    }

    return false
  }

  _updateReactorFixOverlay() {
    if (!this.game?.registry) return
    if (!this.sabotageReactor || !this._reactorFixPoints?.length) {
      if (this._reactorStandInterval) {
        clearInterval(this._reactorStandInterval)
        this._reactorStandInterval = null
        if (this.ws) this.ws.emit('reactorLeave')
      }
      this.game.registry.set('reactorFixData', { visible: false })
      return
    }

    const px = this.player.x, py = this.player.y
    const d = this._nearestReactorFixDist(px, py)
    const nearReactor = d < INTERACT_RANGE && this.player.alive
    const secondsLeft = Math.max(0, Math.ceil((REACTOR_CRITICAL_TIME - (this.time.now - this.reactorStartTime)) / 1000))

    if (nearReactor) {
      if (!this._reactorStandInterval) {
        // Emit ngay lập tức lần đầu
        if (this.ws) this.ws.emit('reactorStand')
        this._reactorStandInterval = setInterval(() => {
          if (this.ws && this.sabotageReactor) this.ws.emit('reactorStand')
        }, 200)
      }
    } else {
      if (this._reactorStandInterval) {
        clearInterval(this._reactorStandInterval)
        this._reactorStandInterval = null
        if (this.ws) this.ws.emit('reactorLeave')
      }
    }

    this.game.registry.set('reactorFixData', {
      visible: nearReactor,
      nearReactor,
      progress: this._reactorProgress || 0,
      fixers: this._reactorFixers || 0,
      secondsLeft,
    })
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
    if (this.player.isImposter) return
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

    // Clear local sabotage effects when meeting starts
    this.sabotageReactor = false
    this.sabotageLights = false
    this._applyLightsEffect(false)
    this.game.registry.set('reactorFixData', { visible: false })
    this.game.registry.set('lightsFixData', { visible: false })
    this._updateHUD()

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
    
    // Đóng tất cả overlay đang mở khi chết
    this.game.registry.get('onOpenTask')?.(null)
    this.game.registry.set('reactorFixData', { visible: false })
    this.game.registry.set('lightsFixData', { visible: false })
    this._lastNearTaskId = null

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
      'sabotage', 'sabotageFixed', 'reactorProgress'
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
    this.ws.on('reactorProgress', ({ progress, fixers }) => {
      this._reactorProgress = progress
      this._reactorFixers = fixers
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
      this._reactorProgress = 0
      this._reactorFixers = 0
      this._showSabotageAlert('⚠ LÒ PHẢN ỨNG BỊ PHÁ!\nĐến một trong hai điểm reactor — cần 2 người!', '#ff4444')
    } else if (type === 'lights') {
      this.sabotageLights = true
      this._lightsToggled = false
      this._lightsHoldStart = null
      this._applyLightsEffect(true)
      this._showSabotageAlert('⚠ ĐÈN BỊ TẮT!\nSửa tại phòng điện!', '#ffaa00')
    }
    this._updateHUD()
  }

  _receiveSabotageFixed({ type }) {
    if (type === 'reactor') {
      this.sabotageReactor = false
      this._reactorProgress = 0
      this._reactorFixers = 0
      if (this._reactorStandInterval) {
        clearInterval(this._reactorStandInterval)
        this._reactorStandInterval = null
      }
      this.game.registry.set('reactorFixData', { visible: false })
      this._showSabotageAlert('✓ Lò phản ứng đã được sửa!', '#44ff88')
    } else if (type === 'lights') {
      this.sabotageLights = false
      this._lightsToggled = false
      this._lightsHoldStart = null
      this._applyLightsEffect(false)
      this._showSabotageAlert('✓ Đèn đã được bật lại!', '#44ff88')
      this.game.registry.set('lightsFixData', { visible: false })
    }
    this._updateHUD()
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
      this._updateReactorFixOverlay()
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
    this._updateReactorFixOverlay()
    this._updateLightsFixOverlay()
    if (this._gameFullyStarted) this._checkWinConditions()

    if (this.player.isImposter && Phaser.Input.Keyboard.JustDown(this.killKey)) this._tryKill()
    if (this.player.isImposter && Phaser.Input.Keyboard.JustDown(this.ventKey)) this._tryVent()
    if (this.player.isImposter && Phaser.Input.Keyboard.JustDown(this.sabotageKey)) {
      if (this._sabotageMenuOpen) this._closeSabotageMenu()
      else this._trySabotage()
    }
    if (Phaser.Input.Keyboard.JustDown(this.reportKey))    this._tryReport()
    if (Phaser.Input.Keyboard.JustDown(this.emergencyKey)) this._tryEmergency()

    // Hold F để fix sabotage (cả imposter lẫn crewmate)
    if (this.taskKey.isDown && (this.sabotageReactor || this.sabotageLights)) {
      this._tryFixSabotage()
    } else if (!this.player.isImposter) {
      if (Phaser.Input.Keyboard.JustDown(this.taskKey) && !this.sabotageReactor && !this.sabotageLights) {
        this._tryInteractTask()
      }
    }
    if (!this.taskKey.isDown && this.sabotageLights) {
      this._lightsHoldStart = null
    }
    if (Phaser.Input.Keyboard.JustDown(this.chatKey)) {
      this.game.registry.get('onChatToggle')?.()
    }
  }
}
