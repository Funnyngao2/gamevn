// GameScene.js - main gameplay scene
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
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1)

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
    this.playerId = 'local'

    // --- INTERACTION PROMPT ---
    this.promptText = this.add.text(0, 0, '', {
      fontSize: '16px', color: '#ffff00',
      stroke: '#000', strokeThickness: 3,
      backgroundColor: '#00000088', padding: { x: 8, y: 4 }
    }).setDepth(20).setVisible(false)

    // --- HUD ---
    this._createHUD()

    // --- CHAT UI ---
    this._createChatUI()

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

    // Role reveal overlay
    this._showRoleReveal()
  }

  _showRoleReveal() {
    const isImp = this.player.isImposter
    const { width, height } = this.scale

    const overlay = this.add.rectangle(width / 2, height / 2, width, height,
      isImp ? 0x1a0000 : 0x001a0a, 0.92).setScrollFactor(0).setDepth(50)

    const roleIcon = this.add.text(width / 2, height / 2 - 60,
      isImp ? '☠' : '✓', { fontSize: '80px' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(51)

    const roleLabel = this.add.text(width / 2, height / 2 + 20,
      isImp ? 'BẠN LÀ KẺ PHẢN BỘI' : 'BẠN LÀ PHI HÀNH GIA', {
        fontSize: '32px', fontStyle: 'bold', fontFamily: 'Arial',
        color: isImp ? '#ff4444' : '#44ff88',
        stroke: '#000', strokeThickness: 4
      }).setOrigin(0.5).setScrollFactor(0).setDepth(51)

    const subLabel = this.add.text(width / 2, height / 2 + 70,
      isImp ? 'Giết tất cả phi hành gia!' : 'Hoàn thành nhiệm vụ và tìm ra kẻ phản bội!', {
        fontSize: '16px', fontFamily: 'Arial', color: '#cccccc'
      }).setOrigin(0.5).setScrollFactor(0).setDepth(51)

    const countdown = this.add.text(width / 2, height / 2 + 120, '', {
      fontSize: '14px', color: '#888888', fontFamily: 'Arial'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(51)

    let secs = 3
    const tick = this.time.addEvent({
      delay: 1000, repeat: 2,
      callback: () => {
        secs--
        countdown.setText(secs > 0 ? `Bắt đầu sau ${secs}s...` : 'Bắt đầu!')
        if (secs <= 0) {
          this.tweens.add({
            targets: [overlay, roleIcon, roleLabel, subLabel, countdown],
            alpha: 0, duration: 400,
            onComplete: () => {
              overlay.destroy(); roleIcon.destroy()
              roleLabel.destroy(); subLabel.destroy(); countdown.destroy()
            }
          })
        }
      }
    })
    countdown.setText(`Bắt đầu sau ${secs}s...`)
  }

  _getSpawn() {
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
    const isImp = this.player.isImposter

    // Task bar (crewmate only - impostor sees fake bar)
    this.add.rectangle(10, 10, 200, 16, 0x333333).setOrigin(0).setScrollFactor(0).setDepth(10)
    this.taskBar = this.add.rectangle(10, 10, 0, 16, 0x4caf50).setOrigin(0).setScrollFactor(0).setDepth(11)
    this.taskText = this.add.text(218, 10, '', {
      fontSize: '13px', color: '#fff', stroke: '#000', strokeThickness: 2
    }).setScrollFactor(0).setDepth(11)

    // Role badge
    this.roleText = this.add.text(10, 34, isImp ? '☠ IMPOSTOR' : '✓ CREWMATE', {
      fontSize: '16px', color: isImp ? '#ff4444' : '#44ff88',
      stroke: '#000', strokeThickness: 3
    }).setScrollFactor(0).setDepth(11)

    // Kill cooldown (impostor only)
    this.killCooldownText = this.add.text(10, 56, '', {
      fontSize: '14px', color: '#ff8888', stroke: '#000', strokeThickness: 2
    }).setScrollFactor(0).setDepth(11)
    if (!isImp) this.killCooldownText.setVisible(false)

    this.sabotageText = this.add.text(10, 74, '', {
      fontSize: '14px', color: '#ffaa00', stroke: '#000', strokeThickness: 2
    }).setScrollFactor(0).setDepth(11)

    // Controls hint - role-specific
    const hint = isImp
      ? 'WASD: Di chuyển | Q: Giết | X: Phá hoại | V: Cống | R: Báo xác'
      : 'WASD: Di chuyển | F: Làm nhiệm vụ | E: Họp khẩn | R: Báo xác'
    this.add.text(1270, 630, hint, {
      fontSize: '11px', color: '#aaa'
    }).setOrigin(1, 1).setScrollFactor(0).setDepth(11)

    // Crewmate task list panel
    if (!isImp) this._createTaskList()

    // Draw task zone markers on map (crewmate only)
    if (!isImp) this._drawTaskMarkers()

    // Minimap (all players)
    this._createMinimap()
  }

  _createMinimap() {
    const { width, height } = this.scale
    // Minimap dimensions and position (bottom-right corner)
    const MM_W = 200, MM_H = 120, MM_X = width - MM_W - 10, MM_Y = height - MM_H - 10
    this._mm = { x: MM_X, y: MM_Y, w: MM_W, h: MM_H }

    // Background border
    this.add.rectangle(MM_X - 2, MM_Y - 2, MM_W + 4, MM_H + 4, 0x000000, 0.8)
      .setOrigin(0).setScrollFactor(0).setDepth(19)

    // Minimap image — scale to fit
    if (this.textures.exists('minimap')) {
      const img = this.add.image(MM_X, MM_Y, 'minimap')
        .setOrigin(0).setScrollFactor(0).setDepth(20)
      img.setDisplaySize(MM_W, MM_H)
    } else {
      // Fallback: dark rectangle
      this.add.rectangle(MM_X, MM_Y, MM_W, MM_H, 0x0a1a0a, 0.9)
        .setOrigin(0).setScrollFactor(0).setDepth(20)
    }

    // Overlay graphics for dots (redrawn each frame)
    this._mmGraphics = this.add.graphics().setScrollFactor(0).setDepth(22)

    // Player dot (local) — always white
    this._mmPlayerDot = this.add.circle(0, 0, 4, 0xffffff)
      .setScrollFactor(0).setDepth(23)

    // Direction arrow toward nearest undone task (crewmate only)
    this._mmArrow = this.add.graphics().setScrollFactor(0).setDepth(24)

    // [M] toggle hint
    this.add.text(MM_X + MM_W - 4, MM_Y - 14, '[M] Bản đồ', {
      fontSize: '10px', color: '#888888', fontFamily: 'Arial'
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(22)

    // Toggle key
    this._minimapVisible = true
    this._mapKey = this.input.keyboard.addKey('M')
  }

  _worldToMinimap(wx, wy) {
    const mapW = this.map.widthInPixels
    const mapH = this.map.heightInPixels
    const { x, y, w, h } = this._mm
    return {
      x: x + (wx / mapW) * w,
      y: y + (wy / mapH) * h
    }
  }

  _updateMinimap() {
    if (!this._mmGraphics) return

    // Toggle visibility
    if (Phaser.Input.Keyboard.JustDown(this._mapKey)) {
      this._minimapVisible = !this._minimapVisible
      this._mmGraphics.setVisible(this._minimapVisible)
      this._mmPlayerDot.setVisible(this._minimapVisible)
      this._mmArrow.setVisible(this._minimapVisible)
    }
    if (!this._minimapVisible) return

    this._mmGraphics.clear()
    this._mmArrow.clear()

    // Draw remote player dots
    Object.values(this.remotePlayers).forEach(rp => {
      if (!rp.visible) return
      const pos = this._worldToMinimap(rp.x, rp.y)
      const col = rp.alive ? 0xffffff : 0x4444ff
      this._mmGraphics.fillStyle(col, 0.85)
      this._mmGraphics.fillCircle(pos.x, pos.y, 3)
    })

    // Draw task dots (crewmate only)
    if (!this.player.isImposter && this.taskList) {
      this.taskList.forEach(t => {
        const pos = this._worldToMinimap(t.x, t.y)
        this._mmGraphics.fillStyle(t.done ? 0x44ff88 : 0xffff44, 0.9)
        this._mmGraphics.fillRect(pos.x - 3, pos.y - 3, 6, 6)
      })
    }

    // Local player dot
    const pp = this._worldToMinimap(this.player.x, this.player.y)
    this._mmPlayerDot.setPosition(pp.x, pp.y)

    // Direction arrow to nearest undone task (crewmate only, alive)
    if (!this.player.isImposter && this.player.alive && this.taskList) {
      const undone = this.taskList.filter(t => !t.done)
      if (undone.length > 0) {
        // Find nearest
        let nearest = undone[0], minD = Infinity
        undone.forEach(t => {
          const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, t.x, t.y)
          if (d < minD) { minD = d; nearest = t }
        })

        // Only show arrow if task is off-screen
        const cam = this.cameras.main
        const onScreen = (
          nearest.x > cam.scrollX && nearest.x < cam.scrollX + cam.width &&
          nearest.y > cam.scrollY && nearest.y < cam.scrollY + cam.height
        )

        if (!onScreen) {
          // Draw arrow on minimap pointing from player dot to task dot
          const tp = this._worldToMinimap(nearest.x, nearest.y)
          const angle = Phaser.Math.Angle.Between(pp.x, pp.y, tp.x, tp.y)
          const len = 10
          const ax = pp.x + Math.cos(angle) * len
          const ay = pp.y + Math.sin(angle) * len

          this._mmArrow.lineStyle(2, 0xffff00, 1)
          this._mmArrow.beginPath()
          this._mmArrow.moveTo(pp.x, pp.y)
          this._mmArrow.lineTo(ax, ay)
          this._mmArrow.strokePath()

          // Arrowhead
          const headLen = 5
          const a1 = angle + Math.PI * 0.8
          const a2 = angle - Math.PI * 0.8
          this._mmArrow.fillStyle(0xffff00, 1)
          this._mmArrow.fillTriangle(
            ax, ay,
            ax + Math.cos(a1) * headLen, ay + Math.sin(a1) * headLen,
            ax + Math.cos(a2) * headLen, ay + Math.sin(a2) * headLen
          )

          // Also show distance text near arrow
          const dist = Math.round(minD / 32)  // convert pixels to tiles
          this._mmArrow.fillStyle(0x000000, 0.6)
          // (text drawn separately below)
        }
      }
    }
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
    // Tasks with map positions (from gamefunctions.py coordinates)
    const tasks = [
      { id: 'fix_wiring',    label: 'Sửa dây điện',       done: false, x: 3166, y: 1846 },
      { id: 'fuel_engine',   label: 'Đổ nhiên liệu',      done: false, x: 1226, y: 2300 },
      { id: 'reboot_wifi',   label: 'Khởi động lại Wifi', done: false, x: 3700, y: 1554 },
      { id: 'empty_garbage', label: 'Đổ rác',             done: false, x: 3940, y: 321  },
      { id: 'stabilize_nav', label: 'Ổn định điều hướng', done: false, x: 5610, y: 1290 },
    ]
    this.taskList = tasks

    const panelX = 1270 - 180, panelY = 50
    this.add.rectangle(panelX - 8, panelY - 8, 196, tasks.length * 22 + 32, 0x000000, 0.6)
      .setOrigin(0).setScrollFactor(0).setDepth(10)
    this.add.text(panelX, panelY, 'NHIỆM VỤ', {
      fontSize: '12px', color: '#aaaaaa', fontFamily: 'Arial', fontStyle: 'bold'
    }).setScrollFactor(0).setDepth(11)

    this.taskLabels = tasks.map((t, i) => {
      return this.add.text(panelX, panelY + 18 + i * 22, `○ ${t.label}`, {
        fontSize: '13px', color: '#cccccc', fontFamily: 'Arial'
      }).setScrollFactor(0).setDepth(11)
    })
  }

  _completeTask(taskId) {
    if (!this.taskList) return
    const task = this.taskList.find(t => t.id === taskId && !t.done)
    if (!task) return
    task.done = true
    this.missionsDone++
    const idx = this.taskList.indexOf(task)
    this.taskLabels[idx].setText(`✓ ${task.label}`).setColor('#44ff88')
    safePlay(this, 'task_complete')
    if (this.ws) this.ws.emit('taskDone', { taskId })
    this._refreshTaskMarkers()
  }

  _updateHUD() {
    const total = this.taskList ? this.taskList.length : NO_OF_MISSIONS
    this.taskBar.setSize((this.missionsDone / total) * 200, 16)
    this.taskText.setText(`${this.missionsDone}/${total}`)

    if (this.player.isImposter) {
      const killElapsed = this.killCooldownStart === 0 ? 0 : this.time.now - this.killCooldownStart
      const killLeft = Math.max(0, Math.ceil((KILL_COOLDOWN - killElapsed) / 1000))
      this.killCooldownText.setText(killLeft > 0 ? `Giết: ${killLeft}s` : 'Giết: SẴN SÀNG [Q]')
    }

    if (this.sabotageReactor) {
      const left = Math.max(0, Math.ceil((REACTOR_CRITICAL_TIME - (this.time.now - this.reactorStartTime)) / 1000))
      this.sabotageText.setText(`⚠ LÒ PHẢN ỨNG: ${left}s`).setColor('#ff0000')
    } else if (this.sabotageLights) {
      this.sabotageText.setText('⚠ ĐÈN BỊ TẮT').setColor('#ffaa00')
    } else if (this.player.isImposter) {
      const sabLeft = Math.max(0, Math.ceil((SABOTAGE_COOLDOWN - (this.time.now - this.sabotageCooldownStart)) / 1000))
      this.sabotageText.setText(sabLeft > 0 ? `Phá hoại: ${sabLeft}s` : 'Phá hoại: SẴN SÀNG [X]').setColor('#ffaa00')
    } else {
      this.sabotageText.setText('')
    }

    this._updateMinimap()
  }

  _updateInteractionPrompt() {
    if (!this.player.alive) {
      // Ghost crewmate: show task prompt if near task
      if (!this.player.isImposter && this.taskList) {
        const px = this.player.x, py = this.player.y
        const nearTask = this.taskList.find(t =>
          !t.done && Phaser.Math.Distance.Between(px, py, t.x, t.y) < INTERACT_RANGE)
        if (nearTask) {
          this.promptText.setText(`[F] ${nearTask.label}`)
            .setPosition(px - this.promptText.width / 2, py - 70).setVisible(true)
          return
        }
      }
      this.promptText.setVisible(false)
      return
    }

    // While in vent, show vent controls
    if (this.player.inVent) {
      this.promptText
        .setText(`[V] Cống tiếp theo | [E] Thoát cống`)
        .setPosition(this.player.x - this.promptText.width / 2, this.player.y - 70)
        .setVisible(true)
      return
    }

    const px = this.player.x, py = this.player.y
    let prompt = null

    // Check vent proximity (impostor only)
    if (this.player.isImposter) {
      const nearVent = this.ventZones.find(v =>
        Phaser.Math.Distance.Between(px, py, v.x, v.y) < INTERACT_RANGE)
      if (nearVent) prompt = '[V] Nhảy vào cống'
    }

    // Check kill target (impostor only)
    if (this.player.isImposter && !prompt) {
      const targets = Object.values(this.remotePlayers).filter(p => !p.isImposter)
      const nearTarget = targets.find(p => p.alive &&
        Phaser.Math.Distance.Between(px, py, p.x, p.y) < INTERACT_RANGE)
      if (nearTarget) {
        const killElapsed = this.killCooldownStart === 0 ? 0 : this.time.now - this.killCooldownStart
        prompt = killElapsed >= KILL_COOLDOWN ? `[Q] Giết ${nearTarget.playerName}` : `Giết: chờ cooldown`
      }
    }

    // Check task interaction (crewmate only)
    if (!this.player.isImposter && !prompt) {
      // Sabotage fix takes priority over tasks
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

    // Check task interaction (crewmate only, no active sabotage)
    if (!this.player.isImposter && !prompt && !this.sabotageReactor && !this.sabotageLights) {
      const nearTask = this.taskList
        ? this.taskList.find(t => !t.done && Phaser.Math.Distance.Between(px, py, t.x, t.y) < INTERACT_RANGE)
        : null
      if (nearTask) prompt = `[F] ${nearTask.label}`
    }

    // Check dead body report
    if (!prompt) {
      const targets = Object.values(this.remotePlayers)
      const corpse = targets.find(p => !p.alive &&
        Phaser.Math.Distance.Between(px, py, p.x, p.y) < INTERACT_RANGE)
      if (corpse) prompt = '[R] Báo xác'
    }

    // Check emergency button (crewmate only)
    if (!prompt && !this.player.isImposter) {
      const dist = Phaser.Math.Distance.Between(px, py, this.emergencyBtnPos.x, this.emergencyBtnPos.y)
      if (dist < INTERACT_RANGE) {
        const meetElapsed = this.time.now - this.meetingCooldownStart
        prompt = meetElapsed >= MEETING_COOLDOWN ? '[E] Họp khẩn cấp' : 'Họp: chờ cooldown'
      }
    }

    if (prompt) {
      this.promptText
        .setText(prompt)
        .setPosition(px - this.promptText.width / 2, py - 70)
        .setVisible(true)
    } else {
      this.promptText.setVisible(false)
    }
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
    // Prompt shown in _updateInteractionPrompt while inVent
    // Movement handled in update() via ventKey / emergencyKey
    this.promptText
      .setText(`[V] Di chuyển sang cống tiếp | [E] Thoát cống`)
      .setPosition(this.player.x - 120, this.player.y - 70)
      .setVisible(true)
  }

  _exitVent() {
    this.player.inVent = false
    this.player.currentVent = null
    this.player.setAlpha(1)
    this.player.body.enable = true
    this.ventCooldownStart = this.time.now
    safePlay(this, 'vent')
    this.promptText.setVisible(false)
  }

  // --- SABOTAGE SYSTEM ---
  _trySabotage() {
    if (!this.player.isImposter || !this.player.alive) return
    if (this.sabotageReactor || this.sabotageLights) return  // already active
    if (this.time.now - this.sabotageCooldownStart < SABOTAGE_COOLDOWN) return
    this._showSabotageMenu()
  }

  _showSabotageMenu() {
    if (this._sabotageMenu) return
    const { width, height } = this.scale
    const menuW = 280, menuH = 160
    const mx = width / 2 - menuW / 2, my = height / 2 - menuH / 2

    const bg = this.add.rectangle(mx, my, menuW, menuH, 0x1a0000, 0.95)
      .setOrigin(0).setScrollFactor(0).setDepth(40)
    const title = this.add.text(width / 2, my + 18, '☠ CHỌN PHÁ HOẠI', {
      fontSize: '16px', color: '#ff4444', fontStyle: 'bold', fontFamily: 'Arial'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(41)

    // Reactor button
    const btn1bg = this.add.rectangle(mx + 20, my + 45, menuW - 40, 36, 0x440000)
      .setOrigin(0).setScrollFactor(0).setDepth(41)
      .setInteractive({ useHandCursor: true })
    const btn1txt = this.add.text(width / 2, my + 63, '🔴 Phá lò phản ứng (20s)', {
      fontSize: '14px', color: '#ffaaaa', fontFamily: 'Arial'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(42)
    btn1bg.on('pointerover', () => btn1bg.setFillStyle(0x880000))
    btn1bg.on('pointerout',  () => btn1bg.setFillStyle(0x440000))
    btn1bg.on('pointerdown', () => { this._closeSabotageMenu(); this._activateSabotage('reactor') })

    // Lights button
    const btn2bg = this.add.rectangle(mx + 20, my + 90, menuW - 40, 36, 0x442200)
      .setOrigin(0).setScrollFactor(0).setDepth(41)
      .setInteractive({ useHandCursor: true })
    const btn2txt = this.add.text(width / 2, my + 108, '💡 Tắt đèn', {
      fontSize: '14px', color: '#ffddaa', fontFamily: 'Arial'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(42)
    btn2bg.on('pointerover', () => btn2bg.setFillStyle(0x884400))
    btn2bg.on('pointerout',  () => btn2bg.setFillStyle(0x442200))
    btn2bg.on('pointerdown', () => { this._closeSabotageMenu(); this._activateSabotage('lights') })

    const closeHint = this.add.text(width / 2, my + menuH - 10, '[X hoặc ESC] Đóng', {
      fontSize: '11px', color: '#888888', fontFamily: 'Arial'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(42)

    this._sabotageMenu = { bg, title, btn1bg, btn1txt, btn2bg, btn2txt, closeHint }
  }

  _closeSabotageMenu() {
    if (!this._sabotageMenu) return
    Object.values(this._sabotageMenu).forEach(o => o.destroy())
    this._sabotageMenu = null
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
      if (this.ws) this.ws.emit('sabotageFixed', { type: 'reactor' })
    } else if (type === 'lights') {
      this.sabotageLights = false
      this._applyLightsEffect(false)
      this._showSabotageAlert('✓ Đèn đã được bật lại!', '#44ff88')
      if (this.ws) this.ws.emit('sabotageFixed', { type: 'lights' })
    }
  }

  _showSabotageAlert(msg, color) {
    const { width } = this.scale
    const alert = this.add.text(width / 2, 80, msg, {
      fontSize: '18px', color, fontFamily: 'Arial', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 4, align: 'center',
      backgroundColor: '#00000099', padding: { x: 16, y: 8 }
    }).setOrigin(0.5).setScrollFactor(0).setDepth(35)
    this.tweens.add({ targets: alert, alpha: 0, delay: 3000, duration: 500, onComplete: () => alert.destroy() })
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
      // Both fixed?
      if (this._reactorFixed.A && this._reactorFixed.B) {
        this._fixSabotage('reactor')
      }
      // Return true if player was near a fix point
      return dA < INTERACT_RANGE || dB < INTERACT_RANGE
    }

    if (this.sabotageLights) {
      const d = Phaser.Math.Distance.Between(px, py, this._lightsFixPoint.x, this._lightsFixPoint.y)
      if (d < INTERACT_RANGE) { this._fixSabotage('lights'); return true }
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
      nearest.die()
      nearest.becomeGhost()
      this.killCooldownStart = this.time.now
      safePlay(this, 'imposter_kill')
      if (this.ws) this.ws.emit('kill', { victimId: nearest.playerId })
      this._checkImpostorWin()
    }
  }

  _checkImpostorWin() {
    // Count alive crewmates vs alive impostors across all players
    const remote = Object.values(this.remotePlayers)
    const aliveCrewRemote = remote.filter(p => p.alive && !p.isImposter).length
    const aliveImpRemote  = remote.filter(p => p.alive && p.isImposter).length
    const selfCrew = !this.player.isImposter && this.player.alive ? 1 : 0
    const selfImp  =  this.player.isImposter && this.player.alive ? 1 : 0
    const totalCrew = aliveCrewRemote + selfCrew
    const totalImp  = aliveImpRemote  + selfImp
    if (totalCrew <= totalImp) {
      // Let server be the authority — just emit, server will broadcast gameover back
      if (this.ws) this.ws.emit('gameover', { winner: 'impostor' })
      // Don't call _endGame locally; wait for server's gameover broadcast
    }
  }

  _checkWinConditions() {
    if (!this.playing) return
    const total = this.taskList ? this.taskList.length : NO_OF_MISSIONS
    if (this.missionsDone >= total) {
      // Let server be the authority — just emit, server will broadcast gameover back
      if (this.ws) this.ws.emit('gameover', { winner: 'crew' })
      return
    }
    if (this.sabotageReactor && this.time.now - this.reactorStartTime > REACTOR_CRITICAL_TIME) {
      if (this.ws) this.ws.emit('gameover', { winner: 'impostor' })
    }
  }

  _tryReport() {
    if (!this.player.alive || this.player.inVent) return
    const targets = Object.values(this.remotePlayers)
    const corpse = targets.find(p => !p.alive &&
      Phaser.Math.Distance.Between(this.player.x, this.player.y, p.x, p.y) < INTERACT_RANGE)
    if (corpse) {
      safePlay(this, 'report_Bodyfound')
      this._startMeeting(this.playerId, corpse.playerId)
      if (this.ws) this.ws.emit('report', { victimId: corpse.playerId })
    }
  }

  _tryEmergency() {
    if (!this.player.alive || this.player.inVent) return
    if (this.player.isImposter) return  // impostor không được dùng nút khẩn cấp
    if (this.time.now - this.meetingCooldownStart < MEETING_COOLDOWN) return
    const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.emergencyBtnPos.x, this.emergencyBtnPos.y)
    if (dist < INTERACT_RANGE) {
      safePlay(this, 'alarm_emergencymeeting')
      this._startMeeting(this.playerId, null)
      this.meetingCooldownStart = this.time.now
      if (this.ws) this.ws.emit('emergency')
    }
  }

  _startMeeting(reporterId, victimId) {
    this.bgMusic?.stop()
    this.scene.pause('Game')
    this.scene.launch('Meeting', {
      players: this._getAllPlayers(),
      localPlayerId: this.playerId,
      reporterId, victimId,
      gameMode: this.gameMode
    })
    this.scene.get('Meeting').events.once('meetingEnd', (ejectedId) => {
      this.scene.resume('Game')
      this.bgMusic?.play()
      if (ejectedId) this._handleEject(ejectedId)
    })
  }

  _handleEject(playerId) {
    if (playerId === this.playerId) {
      this._becomeGhost()
    } else if (this.remotePlayers[playerId]) {
      this.remotePlayers[playerId].becomeGhost()
    }
    // Check if all impostors ejected → crew wins
    this._checkAllImpostorsGone()
  }

  _checkAllImpostorsGone() {
    const remote = Object.values(this.remotePlayers)
    const aliveImpRemote = remote.filter(p => p.alive && p.isImposter).length
    const selfImp = this.player.isImposter && this.player.alive ? 1 : 0
    if (aliveImpRemote + selfImp === 0) {
      // Let server be the authority — just emit, server will broadcast gameover back
      if (this.ws) this.ws.emit('gameover', { winner: 'crew' })
    }
  }

  _getAllPlayers() {
    const all = [{ id: this.playerId, name: this.playerName, color: this.playerColor,
      alive: this.player.alive, isImposter: this.player.isImposter, isLocal: true }]
    Object.entries(this.remotePlayers).forEach(([id, p]) => {
      all.push({ id: Number(id), name: p.playerName, color: p.color,
        alive: p.alive, isImposter: p.isImposter, isLocal: false })
    })
    return all
  }

  _tryInteractTask() {
    if (!this.taskList) return
    // Ghost crewmates can still do tasks
    const px = this.player.x, py = this.player.y
    const task = this.taskList.find(t =>
      !t.done && Phaser.Math.Distance.Between(px, py, t.x, t.y) < INTERACT_RANGE
    )
    if (!task) return
    this.scene.pause('Game')
    this.scene.launch('Task', { taskId: task.id, taskName: task.label })
    const taskScene = this.scene.get('Task')
    taskScene.events.once('taskComplete', (taskId) => {
      this.scene.resume('Game')
      this._completeTask(taskId)
    })
    this.scene.get('Task').events.once('shutdown', () => {
      if (this.scene.isPaused('Game')) this.scene.resume('Game')
    })
  }

  // --- GHOST SYSTEM ---
  _becomeGhost() {
    if (!this.player.alive) return  // already ghost
    this.player.die()
    this.player.setAlpha(0.45)
    this.player.setTint(0x8888ff)
    this.player.body.enable = false  // pass through walls
    if (this.roleText) this.roleText.setText('👻 HỒN MA').setColor('#aaaaff')
    // Ghost crewmate can still do tasks - show task markers
    if (!this.player.isImposter && this._taskMarkers) {
      this._taskMarkers.forEach(({ task, marker }) => marker.setVisible(!task.done))
    }
    // Update hint text
    const hintText = this.player.isImposter
      ? 'WASD: Di chuyển | T: Chat hồn ma'
      : 'WASD: Di chuyển | F: Làm nhiệm vụ | T: Chat hồn ma'
    // Show ghost notice with leave option
    this._ghostNotice = this.add.text(640, 300,
      '👻 Bạn đã chết\nChỉ hồn ma mới thấy bạn\n[T] Chat hồn ma  |  [L] Rời trận', {
      fontSize: '20px', color: '#aaaaff', stroke: '#000', strokeThickness: 4,
      align: 'center', backgroundColor: '#00000099', padding: { x: 16, y: 12 }
    }).setOrigin(0.5).setScrollFactor(0).setDepth(30)
    this.time.delayedCall(4000, () => this._ghostNotice?.destroy())
    // L key to leave game
    this.leaveKey = this.input.keyboard.addKey('L')
  }

  // --- CHAT SYSTEM ---
  _createChatUI() {
    const { width, height } = this.scale
    this._chatMessages = []
    this._chatInputOpen = false

    this._chatInputBg = this.add.rectangle(width / 2, height - 30, 500, 36, 0x000000, 0.85)
      .setScrollFactor(0).setDepth(26).setVisible(false)
    this._chatInputText = this.add.text(width / 2 - 240, height - 30, '', {
      fontSize: '15px', color: '#ffffff'
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(27).setVisible(false)
    this._chatChannelLabel = this.add.text(width / 2 - 248, height - 30, '', {
      fontSize: '13px', color: '#ffff88', fontStyle: 'bold'
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(27).setVisible(false)
    this._chatInputBuffer = ''

    this.add.text(10, height - 20, '[T] Chat', {
      fontSize: '12px', color: '#888888'
    }).setScrollFactor(0).setDepth(25)
  }

  _openChat() {
    if (this._chatInputOpen) return
    this._chatInputOpen = true
    this._chatInputBuffer = ''
    const channel = this.player.alive ? 'living' : 'ghost'
    const label = channel === 'ghost' ? '👻 Hồn ma: ' : '💬 Chat: '
    this._chatChannelLabel.setText(label).setVisible(true)
    this._chatInputText.setText('').setVisible(true)
    this._chatInputBg.setVisible(true)
    this._chatInputBg.setFillStyle(channel === 'ghost' ? 0x110022 : 0x001122, 0.9)

    this._chatCapture = (e) => {
      if (!this._chatInputOpen) return
      if (e.key === 'Escape') { this._closeChat(); return }
      if (e.key === 'Enter') {
        if (this._chatInputBuffer.trim()) this._sendChat(this._chatInputBuffer.trim(), channel)
        this._closeChat()
        return
      }
      if (e.key === 'Backspace') {
        this._chatInputBuffer = this._chatInputBuffer.slice(0, -1)
      } else if (e.key.length === 1 && this._chatInputBuffer.length < 60) {
        this._chatInputBuffer += e.key
      }
      this._chatInputText.setText(this._chatInputBuffer)
    }
    this.input.keyboard.on('keydown', this._chatCapture)
  }

  _closeChat() {
    this._chatInputOpen = false
    this._chatInputBg.setVisible(false)
    this._chatInputText.setVisible(false)
    this._chatChannelLabel.setVisible(false)
    if (this._chatCapture) this.input.keyboard.off('keydown', this._chatCapture)
  }

  _sendChat(text, channel) {
    if (!this.ws?.connected) {
      this._addChatMessage({ name: this.playerName, color: this.playerColor, text, channel })
      return
    }
    this.ws.emit('chat', { text, channel, x: this.player.x, y: this.player.y })
    this._addChatMessage({ name: this.playerName, color: this.playerColor, text, channel, self: true })
  }

  _receiveChatMessage(msg) {
    if (msg.channel === 'ghost' && this.player.alive) return
    this._addChatMessage(msg)
  }

  _addChatMessage({ name, color, text, channel }) {
    const { height } = this.scale
    const isGhost = channel === 'ghost'
    const textColor = isGhost ? '#ccccff' : '#ffffff'
    const prefix = isGhost ? '👻 ' : '💬 '

    this._chatMessages.forEach(m => { m.y -= 22 })
    while (this._chatMessages.length >= 6) {
      const old = this._chatMessages.shift()
      old.destroy()
    }

    const msgText = this.add.text(12, height - 60, `${prefix}${name}: ${text}`, {
      fontSize: '14px', color: textColor,
      stroke: '#000', strokeThickness: 3,
      backgroundColor: isGhost ? '#11002299' : '#00000099',
      padding: { x: 6, y: 2 }
    }).setScrollFactor(0).setDepth(25)

    this._chatMessages.push(msgText)
    this.time.delayedCall(6000, () => {
      const idx = this._chatMessages.indexOf(msgText)
      if (idx !== -1) this._chatMessages.splice(idx, 1)
      this.tweens.add({ targets: msgText, alpha: 0, duration: 500, onComplete: () => msgText.destroy() })
    })
  }

  _endGame(winner) {
    if (!this.playing) return
    this.playing = false
    this.bgMusic?.stop()
    if (this.scene.isActive('Meeting')) this.scene.stop('Meeting')
    safePlay(this, winner === 'crew' ? 'victory_crew' : 'victory_impostor')
    if (this.ws) {
      this.ws.off('id'); this.ws.off('players'); this.ws.off('kill')
      this.ws.off('meeting'); this.ws.off('gameover'); this.ws.off('chat')
      this.ws.off('vote'); this.ws.off('meetingChat')
    }
    this.time.delayedCall(1500, () => {
      // Notify React app if callback provided (new React architecture)
      if (this._onGameEnd) {
        this._onGameEnd(winner)
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
    this.time.addEvent({ delay: 50, loop: true, callback: this._sendPlayerState, callbackScope: this })
  }

  _setupSocketListeners() {
    this.ws.on('id',            (d) => { this.playerId = d.id })
    this.ws.on('players',       (d) => this._handlePlayers(d.players))
    this.ws.on('kill',          (d) => this._handleKillMsg(d))
    this.ws.on('meeting',       (d) => this._startMeeting(d.reporterId, d.victimId))
    this.ws.on('gameover',      (d) => this._endGame(d.winner))
    this.ws.on('returnToLobby', (d) => this._handleReturnToLobby(d))
    this.ws.on('chat',          (d) => this._receiveChatMessage(d))
    this.ws.on('vote',          (d) => { const ms = this.scene.get('Meeting'); if (ms?.scene.isActive()) ms.receiveVote(d.voterId, d.targetId) })
    this.ws.on('meetingChat',   (d) => { const ms = this.scene.get('Meeting'); if (ms?.scene.isActive()) ms.receiveMeetingChat(d.senderId, d.text) })
    this.ws.on('sabotage',      (d) => this._receiveSabotage(d))
    this.ws.on('sabotageFixed', (d) => this._receiveSabotageFixed(d))
    this.ws.on('sabotageFixProgress', (d) => {
      if (d.type === 'reactor') this._reactorFixed[d.point] = true
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
      this._becomeGhost()
    } else if (this.remotePlayers[victimId]) {
      this.remotePlayers[victimId].die()
      this.remotePlayers[victimId].becomeGhost()
    }
  }

  _handlePlayers(playerList) {
    playerList.forEach(p => {
      if (p.id === this.playerId) return
      if (!this.remotePlayers[p.id]) {
        this.remotePlayers[p.id] = new Player(this, p.x, p.y, p.color, false)
        this.remotePlayers[p.id].setName(p.name)
        this.physics.add.collider(this.remotePlayers[p.id], this.wallGroup)
      }
      const rp = this.remotePlayers[p.id]
      rp.syncRemote(p)
      if (p.isGhost || !p.alive) {
        if (!rp._isGhost) {
          rp.die()          // set dead texture before ghost visuals
          rp.becomeGhost()  // only called once thanks to _isGhost guard
        }
        if (this.player.alive) { rp.setVisible(false); rp.nameLabel?.setVisible(false) }
      } else {
        rp.setVisible(true); rp.nameLabel?.setVisible(true)
      }
    })
    const ids = playerList.map(p => p.id)
    Object.keys(this.remotePlayers).forEach(id => {
      if (!ids.includes(id)) { this.remotePlayers[id].destroy(); delete this.remotePlayers[id] }
    })
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
      Object.values(this.remotePlayers).forEach(rp => rp.updateRemote())
      if (Phaser.Input.Keyboard.JustDown(this.chatKey)) this._openChat()
      // Ghost crewmate can still do tasks
      if (!this.player.isImposter && Phaser.Input.Keyboard.JustDown(this.taskKey)) this._tryInteractTask()
      // L = leave game
      if (this.leaveKey && Phaser.Input.Keyboard.JustDown(this.leaveKey)) {
        this._endGame(null)
      }
      this._updateInteractionPrompt()
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
    Object.values(this.remotePlayers).forEach(rp => rp.updateRemote())
    this._updateHUD()
    this._updateInteractionPrompt()
    this._updateLightsOverlay()
    this._checkWinConditions()

    if (this.player.isImposter && Phaser.Input.Keyboard.JustDown(this.killKey)) this._tryKill()
    if (this.player.isImposter && Phaser.Input.Keyboard.JustDown(this.ventKey)) this._tryVent()
    if (this.player.isImposter && Phaser.Input.Keyboard.JustDown(this.sabotageKey)) {
      if (this._sabotageMenu) this._closeSabotageMenu()
      else this._trySabotage()
    }
    if (Phaser.Input.Keyboard.JustDown(this.reportKey))    this._tryReport()
    if (Phaser.Input.Keyboard.JustDown(this.emergencyKey)) this._tryEmergency()
    if (!this.player.isImposter && Phaser.Input.Keyboard.JustDown(this.taskKey)) {
      // Sabotage fix takes priority — only open task if no sabotage was fixed
      const fixedSabotage = this._tryFixSabotage()
      if (!fixedSabotage) this._tryInteractTask()
    }
    if (Phaser.Input.Keyboard.JustDown(this.chatKey)) this._openChat()
  }
}
