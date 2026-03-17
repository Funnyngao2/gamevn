// TaskScene.js - mini-game overlay for crewmate tasks
// Launched on top of GameScene, emits 'taskComplete' or 'taskClose' event
import Phaser from 'phaser'

export class TaskScene extends Phaser.Scene {
  constructor() { super('Task') }

  init(data) {
    this.taskId   = data.taskId
    this.taskName = data.taskName
  }

  create() {
    const { width, height } = this.scale
    // Dim overlay
    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.75).setDepth(0)

    switch (this.taskId) {
      case 'fix_wiring':    this._createFixWiring();      break
      case 'reboot_wifi':   this._createRebootWifi();     break
      case 'empty_garbage': this._createEmptyGarbage();   break
      case 'stabilize_nav': this._createStabilizeNav();   break
      case 'fuel_engine':   this._createFuelEngine();     break
      default: this._complete()
    }
  }

  // ── Shared helpers ────────────────────────────────────────────────────────

  _panel(w, h, title) {
    const { width, height } = this.scale
    const cx = width / 2, cy = height / 2
    this.add.rectangle(cx, cy, w + 20, h + 60, 0x111122, 0.97).setDepth(1)
    this.add.rectangle(cx, cy - h / 2 - 10, w + 20, 40, 0x223366).setDepth(1)
    this.add.text(cx, cy - h / 2 - 10, title, {
      fontSize: '18px', color: '#ffffff', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(2)
    // Close button
    const closeBtn = this.add.text(cx + w / 2 + 5, cy - h / 2 - 10, '✕', {
      fontSize: '20px', color: '#ff6666'
    }).setOrigin(0.5).setDepth(2).setInteractive({ useHandCursor: true })
    closeBtn.on('pointerdown', () => this._close())
    return { cx, cy }
  }

  _complete() {
    this.events.emit('taskComplete', this.taskId)
    this.scene.stop()
    this.scene.get('Game').events.emit('taskComplete', this.taskId)
  }

  _close() {
    this.scene.stop()
    this.scene.resume('Game')
  }

  _successFlash(cb) {
    const { width, height } = this.scale
    const flash = this.add.rectangle(width / 2, height / 2, width, height, 0x44ff88, 0).setDepth(10)
    this.tweens.add({
      targets: flash, alpha: 0.5, duration: 200, yoyo: true,
      onComplete: () => { flash.destroy(); cb() }
    })
  }

  // ── Task 1: Fix Wiring ────────────────────────────────────────────────────
  // Connect 4 colored wires left→right by clicking left wire then right wire

  _createFixWiring() {
    const { cx, cy } = this._panel(520, 380, 'Sửa dây điện')
    const colors = [
      { name: 'red',    hex: 0xff4444, label: 'Đỏ'   },
      { name: 'blue',   hex: 0x4488ff, label: 'Xanh' },
      { name: 'yellow', hex: 0xffee44, label: 'Vàng' },
      { name: 'pink',   hex: 0xff88cc, label: 'Hồng' },
    ]
    // Shuffle right side order
    const rightOrder = Phaser.Utils.Array.Shuffle([...colors])
    this._wireSelected = null
    this._wiresDone = 0
    const leftX = cx - 180, rightX = cx + 180
    const startY = cy - 120, gap = 80

    this._wireNodes = { left: [], right: [] }

    colors.forEach((c, i) => {
      const y = startY + i * gap
      // Left node
      const ln = this.add.circle(leftX, y, 16, c.hex).setDepth(2).setInteractive({ useHandCursor: true })
      this.add.text(leftX + 26, y, c.label, { fontSize: '14px', color: '#fff' }).setOrigin(0, 0.5).setDepth(2)
      ln.colorData = c; ln.side = 'left'; ln.idx = i; ln.connected = false
      ln.on('pointerdown', () => this._onWireClick(ln))
      this._wireNodes.left.push(ln)
    })

    rightOrder.forEach((c, i) => {
      const y = startY + i * gap
      const rn = this.add.circle(rightX, y, 16, c.hex).setDepth(2).setInteractive({ useHandCursor: true })
      this.add.text(rightX - 26, y, c.label, { fontSize: '14px', color: '#fff' }).setOrigin(1, 0.5).setDepth(2)
      rn.colorData = c; rn.side = 'right'; rn.idx = i; rn.connected = false
      rn.on('pointerdown', () => this._onWireClick(rn))
      this._wireNodes.right.push(rn)
    })

    this._wireGraphics = this.add.graphics().setDepth(1)
    this.add.text(cx, cy + 210, 'Nhấp vào dây trái rồi dây phải cùng màu', {
      fontSize: '13px', color: '#aaaaaa'
    }).setOrigin(0.5).setDepth(2)
  }

  _onWireClick(node) {
    if (node.connected) return
    if (!this._wireSelected) {
      if (node.side !== 'left') return
      this._wireSelected = node
      node.setStrokeStyle(3, 0xffffff)
    } else {
      if (node.side !== 'right') { this._wireSelected.setStrokeStyle(0); this._wireSelected = null; return }
      if (node.colorData.name === this._wireSelected.colorData.name) {
        // Correct match - draw wire
        this._wireGraphics.lineStyle(4, this._wireSelected.colorData.hex, 1)
        this._wireGraphics.beginPath()
        this._wireGraphics.moveTo(this._wireSelected.x, this._wireSelected.y)
        this._wireGraphics.lineTo(node.x, node.y)
        this._wireGraphics.strokePath()
        this._wireSelected.connected = true; node.connected = true
        this._wireSelected.setStrokeStyle(0)
        this._wireSelected = null
        this._wiresDone++
        if (this._wiresDone >= 4) this._successFlash(() => this._complete())
      } else {
        // Wrong - flash red
        node.setFillStyle(0xff0000)
        this.time.delayedCall(300, () => node.setFillStyle(node.colorData.hex))
        this._wireSelected.setStrokeStyle(0)
        this._wireSelected = null
      }
    }
  }

  // ── Task 2: Reboot Wifi ───────────────────────────────────────────────────
  // Pull lever down then back up

  _createRebootWifi() {
    const { cx, cy } = this._panel(300, 320, 'Khởi động lại Wifi')
    this._wifiStep = 0  // 0=pull down, 1=push up

    this.add.text(cx, cy - 120, 'WIFI PANEL', { fontSize: '22px', color: '#4488ff', fontStyle: 'bold' }).setOrigin(0.5).setDepth(2)

    // Lever track
    this.add.rectangle(cx, cy, 20, 200, 0x444444).setDepth(2)
    this._leverY = cy - 80
    this._lever = this.add.rectangle(cx, this._leverY, 50, 30, 0xaaaaaa).setDepth(3).setInteractive({ useHandCursor: true, draggable: true })
    this.add.text(cx - 60, cy - 80, '▲ OFF', { fontSize: '13px', color: '#ff6666' }).setOrigin(0, 0.5).setDepth(2)
    this.add.text(cx - 60, cy + 80, '▼ ON',  { fontSize: '13px', color: '#44ff88' }).setOrigin(0, 0.5).setDepth(2)

    this._wifiStatus = this.add.text(cx, cy + 140, 'Kéo cần gạt XUỐNG', {
      fontSize: '15px', color: '#ffff88'
    }).setOrigin(0.5).setDepth(2)

    this.input.setDraggable(this._lever)
    this.input.on('drag', (ptr, obj, x, y) => {
      obj.y = Phaser.Math.Clamp(y, cy - 80, cy + 80)
    })
    this.input.on('dragend', (ptr, obj) => {
      if (this._wifiStep === 0 && obj.y >= cy + 60) {
        this._wifiStep = 1
        obj.setFillStyle(0x44ff88)
        this._wifiStatus.setText('Đẩy cần gạt LÊN để hoàn tất')
      } else if (this._wifiStep === 1 && obj.y <= cy - 60) {
        this._successFlash(() => this._complete())
      }
    })
  }

  // ── Task 3: Empty Garbage ─────────────────────────────────────────────────
  // Pull lever down to open hatch, then push up to close

  _createEmptyGarbage() {
    const { cx, cy } = this._panel(340, 340, 'Đổ rác')
    this._garbageStep = 0

    // Garbage bin visual
    this.add.rectangle(cx, cy - 40, 120, 140, 0x556655).setDepth(2)
    this.add.rectangle(cx, cy - 110, 130, 20, 0x445544).setDepth(2)
    this._garbageContents = this.add.rectangle(cx, cy - 40, 100, 120, 0x88aa66).setDepth(3)
    this._hatch = this.add.rectangle(cx, cy + 30, 120, 16, 0x334433).setDepth(4)

    // Lever
    this.add.rectangle(cx + 100, cy, 16, 160, 0x444444).setDepth(2)
    this._gLeverY = cy - 60
    this._gLever = this.add.rectangle(cx + 100, this._gLeverY, 40, 24, 0xaaaaaa)
      .setDepth(3).setInteractive({ useHandCursor: true, draggable: true })
    this.input.setDraggable(this._gLever)

    this._gStatus = this.add.text(cx, cy + 140, 'Kéo cần gạt XUỐNG để mở nắp', {
      fontSize: '14px', color: '#ffff88'
    }).setOrigin(0.5).setDepth(2)

    this.input.on('drag', (ptr, obj, x, y) => {
      if (obj === this._gLever) obj.y = Phaser.Math.Clamp(y, cy - 60, cy + 60)
    })
    this.input.on('dragend', (ptr, obj) => {
      if (obj !== this._gLever) return
      if (this._garbageStep === 0 && obj.y >= cy + 40) {
        this._garbageStep = 1
        // Animate hatch opening and garbage falling
        this.tweens.add({ targets: this._hatch, y: this._hatch.y + 30, duration: 300 })
        this.tweens.add({ targets: this._garbageContents, y: cy + 80, alpha: 0, duration: 500 })
        obj.setFillStyle(0x44ff88)
        this._gStatus.setText('Đẩy cần gạt LÊN để đóng nắp')
      } else if (this._garbageStep === 1 && obj.y <= cy - 40) {
        this._successFlash(() => this._complete())
      }
    })
  }

  // ── Task 4: Stabilize Navigation ─────────────────────────────────────────
  // Click the moving target when it's inside the center circle

  _createStabilizeNav() {
    const { cx, cy } = this._panel(380, 340, 'Ổn định điều hướng')

    this.add.text(cx, cy - 140, 'Nhấp khi mục tiêu vào vùng trung tâm', {
      fontSize: '13px', color: '#aaaaaa'
    }).setOrigin(0.5).setDepth(2)

    // Center target zone
    this.add.circle(cx, cy, 40, 0x224422, 0.8).setDepth(2)
    this.add.circle(cx, cy, 40).setStrokeStyle(3, 0x44ff88).setDepth(2)
    this.add.text(cx, cy, '+', { fontSize: '24px', color: '#44ff88' }).setOrigin(0.5).setDepth(2)

    // Moving target
    this._navTarget = this.add.circle(cx - 120, cy, 20, 0xff8800).setDepth(3)
    this._navAngle = 0
    this._navRadius = 120
    this._navSpeed = 1.8  // degrees per frame

    this._navBtn = this.add.text(cx, cy + 160, '[ NHẤP ĐỂ KHÓA ]', {
      fontSize: '18px', color: '#ffffff', stroke: '#000', strokeThickness: 3,
      backgroundColor: '#334455', padding: { x: 16, y: 8 }
    }).setOrigin(0.5).setDepth(2).setInteractive({ useHandCursor: true })

    this._navAttempts = 3
    this._navAttemptsText = this.add.text(cx, cy + 130, `Lần thử: ${this._navAttempts}`, {
      fontSize: '14px', color: '#ffaa44'
    }).setOrigin(0.5).setDepth(2)

    this._navBtn.on('pointerdown', () => {
      const dist = Phaser.Math.Distance.Between(this._navTarget.x, this._navTarget.y, cx, cy)
      if (dist <= 44) {
        this._successFlash(() => this._complete())
      } else {
        this._navAttempts--
        this._navAttemptsText.setText(`Lần thử: ${this._navAttempts}`)
        this._navTarget.setFillStyle(0xff0000)
        this.time.delayedCall(300, () => this._navTarget.setFillStyle(0xff8800))
        if (this._navAttempts <= 0) {
          // Reset attempts
          this._navAttempts = 3
          this._navAttemptsText.setText(`Lần thử: ${this._navAttempts}`)
        }
      }
    })
  }

  // ── Task 5: Fuel Engine ───────────────────────────────────────────────────
  // Click the fuel button repeatedly to fill the gauge

  _createFuelEngine() {
    const { cx, cy } = this._panel(320, 360, 'Đổ nhiên liệu')
    this._fuelLevel = 0
    const gaugeH = 200

    this.add.text(cx, cy - 150, 'Nhấp nút để đổ nhiên liệu', {
      fontSize: '13px', color: '#aaaaaa'
    }).setOrigin(0.5).setDepth(2)

    // Gauge background
    const gaugeX = cx - 60
    this.add.rectangle(gaugeX, cy, 40, gaugeH, 0x222222).setDepth(2)
    this._fuelBar = this.add.rectangle(gaugeX, cy + gaugeH / 2, 36, 0, 0x44aaff).setOrigin(0.5, 1).setDepth(3)
    this.add.rectangle(gaugeX, cy, 40, gaugeH).setStrokeStyle(2, 0x888888).setDepth(4)

    // Danger line at 80%
    this.add.rectangle(gaugeX, cy - gaugeH * 0.3, 44, 2, 0xff4444).setDepth(4)
    this.add.text(gaugeX + 28, cy - gaugeH * 0.3, '80%', { fontSize: '11px', color: '#ff4444' }).setOrigin(0, 0.5).setDepth(4)

    this._fuelPct = this.add.text(gaugeX, cy + gaugeH / 2 + 16, '0%', {
      fontSize: '14px', color: '#44aaff'
    }).setOrigin(0.5, 0).setDepth(2)

    // Fuel button
    const btn = this.add.rectangle(cx + 60, cy + 40, 100, 50, 0x225588)
      .setDepth(2).setInteractive({ useHandCursor: true })
    this.add.text(cx + 60, cy + 40, '⛽ ĐỔXĂNG', { fontSize: '14px', color: '#fff' })
      .setOrigin(0.5).setDepth(3)

    btn.on('pointerdown', () => {
      this._fuelLevel = Math.min(100, this._fuelLevel + 12)
      const fillH = (this._fuelLevel / 100) * gaugeH
      this._fuelBar.setSize(36, fillH)
      this._fuelPct.setText(`${this._fuelLevel}%`)
      btn.setFillStyle(0x3377aa)
      this.time.delayedCall(100, () => btn.setFillStyle(0x225588))
      if (this._fuelLevel >= 100) this._successFlash(() => this._complete())
    })
  }

  // ── Update loop ───────────────────────────────────────────────────────────

  update() {
    // Stabilize nav - move target in circle
    if (this._navTarget) {
      this._navAngle += this._navSpeed
      this._navTarget.x = this.scale.width / 2 + Math.cos(Phaser.Math.DegToRad(this._navAngle)) * this._navRadius
      this._navTarget.y = this.scale.height / 2 + Math.sin(Phaser.Math.DegToRad(this._navAngle)) * this._navRadius * 0.5
    }
  }
}
