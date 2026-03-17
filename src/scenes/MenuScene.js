// MenuScene.js - space theme, single page
import { safePlay } from '../utils/safePlay.js'
import { createDomInput } from '../utils/domInput.js'
import { PLAYER_COLORS as COLOR_INT } from '../config.js'

const FONT = 'Roboto, Arial, sans-serif'

export class MenuScene extends Phaser.Scene {
  constructor() { super('Menu') }

  init(data) {
    this.playerColor = data?.playerColor || 'red'
    this.playerName  = data?.playerName  || ''
  }

  create() {
    const { width: W, height: H } = this.scale

    const musicKey = this.cache.audio.has('main_menu_music') ? 'main_menu_music' : 'bg_music'
    if (this.cache.audio.has(musicKey)) {
      this.music = this.sound.add(musicKey, { loop: true, volume: 0.4 })
      this.input.once('pointerdown', () => { if (!this.music.isPlaying) this.music.play() })
    }

    this._build(W, H)
  }

  _build(W, H) {
    // ── Space background ────────────────────────────────────────────────────
    this.add.rectangle(W/2, H/2, W, H, 0x000008)
    const nebula = this.add.graphics()
    nebula.fillStyle(0x0a0a2e, 0.6)
    nebula.fillEllipse(W * 0.2, H * 0.3, W * 0.8, H * 0.6)
    nebula.fillStyle(0x0d0a1e, 0.4)
    nebula.fillEllipse(W * 0.8, H * 0.7, W * 0.7, H * 0.5)

    for (let i = 0; i < 200; i++) {
      const x = Phaser.Math.Between(0, W)
      const y = Phaser.Math.Between(0, H)
      const r = Phaser.Math.FloatBetween(0.4, 2.2)
      const a = Phaser.Math.FloatBetween(0.2, 0.9)
      const star = this.add.circle(x, y, r, 0xffffff, a)
      this.tweens.add({
        targets: star, alpha: 0.05,
        duration: Phaser.Math.Between(1000, 3000),
        yoyo: true, repeat: -1,
        delay: Phaser.Math.Between(0, 2500)
      })
    }

    // ── Center panel ────────────────────────────────────────────────────────
    const panelW = 440, panelH = 540
    const panelX = W/2 - panelW/2, panelY = H/2 - panelH/2

    const glow = this.add.graphics()
    glow.fillStyle(0x4ecdc4, 0.04)
    glow.fillRoundedRect(panelX - 8, panelY - 8, panelW + 16, panelH + 16, 20)

    const panel = this.add.graphics()
    panel.fillStyle(0x080c1a, 0.95)
    panel.fillRoundedRect(panelX, panelY, panelW, panelH, 16)
    panel.lineStyle(1, 0x1e3a5f, 1)
    panel.strokeRoundedRect(panelX, panelY, panelW, panelH, 16)

    const accentLine = this.add.graphics()
    accentLine.lineStyle(2, 0x4ecdc4, 0.8)
    accentLine.lineBetween(panelX + 40, panelY, panelX + panelW - 40, panelY)

    // ── Logo ────────────────────────────────────────────────────────────────
    if (this.textures.exists('logo')) {
      const logo = this.add.image(W/2, panelY + 52, 'logo')
      const scale = Math.min(160 / logo.width, 60 / logo.height)
      logo.setScale(scale)
    } else {
      this.add.text(W/2, panelY + 44, 'AMONG US', {
        fontSize: '40px', color: '#ffffff', fontFamily: FONT, fontStyle: 'bold'
      }).setOrigin(0.5)
    }

    this.add.text(W/2, panelY + 84, 'Web Edition', {
      fontSize: '12px', color: '#4ecdc4', fontFamily: FONT, letterSpacing: 3
    }).setOrigin(0.5)

    const div = this.add.graphics()
    div.lineStyle(1, 0x1e3a5f, 1)
    div.lineBetween(panelX + 20, panelY + 100, panelX + panelW - 20, panelY + 100)

    // ── Color label ─────────────────────────────────────────────────────────
    this.add.text(W/2, panelY + 118, 'CHỌN MÀU NHÂN VẬT', {
      fontSize: '12px', color: '#94a3b8', fontFamily: FONT, fontStyle: 'bold', letterSpacing: 2
    }).setOrigin(0.5)

    // ── Color grid ──────────────────────────────────────────────────────────
    const colors = ['red','blue','green','orange','yellow','pink','black','brown','purple','white']
    const cols = 5, cR = 24, cGap = 18
    const gridW = cols * (cR * 2 + cGap) - cGap
    const gStartX = W/2 - gridW/2 + cR
    const gStartY = panelY + 152

    this._colorCircles = {}
    colors.forEach((c, i) => {
      const col = i % cols, row = Math.floor(i / cols)
      const cx = gStartX + col * (cR * 2 + cGap)
      const cy = gStartY + row * (cR * 2 + cGap + 12)

      const g = this.add.graphics()
      this._colorCircles[c] = { g, cx, cy }
      this._drawColorCircle(c, cx, cy, cR)

      this.add.text(cx, cy + cR + 11, c, {
        fontSize: '9px', color: '#64748b', fontFamily: FONT
      }).setOrigin(0.5)

      g.setInteractive(new Phaser.Geom.Circle(cx, cy, cR + 6), Phaser.Geom.Circle.Contains)
      g.on('pointerdown', () => {
        safePlay(this, 'select')
        this.playerColor = c
        this._refreshColors(cR)
      })
    })

    // ── Name input ──────────────────────────────────────────────────────────
    const inputW = 320, inputH = 46, inputX = W/2 - inputW/2, inputY = panelY + 368

    const inputBg = this.add.graphics()
    const drawInput = (focused) => {
      inputBg.clear()
      inputBg.fillStyle(0x0d1b2a, 1)
      inputBg.fillRoundedRect(inputX, inputY, inputW, inputH, 8)
      inputBg.lineStyle(focused ? 2 : 1, focused ? 0x4ecdc4 : 0x1e3a5f, 1)
      inputBg.strokeRoundedRect(inputX, inputY, inputW, inputH, 8)
    }
    drawInput(false)

    this._nameText = this.add.text(W/2, inputY + inputH/2, '', {
      fontSize: '17px', color: '#f1f5f9', fontFamily: FONT
    }).setOrigin(0.5)

    this._placeholder = this.add.text(W/2, inputY + inputH/2, 'nhập tên nhân vật...', {
      fontSize: '14px', color: '#334155', fontFamily: FONT
    }).setOrigin(0.5)

    // DOM input — handles Vietnamese IME (Unikey, etc.) correctly
    this._domInput = createDomInput(this, { maxLength: 12, initialValue: this.playerName })
    let cursorOn = true
    this._cursorTimer = this.time.addEvent({ delay: 500, loop: true, callback: () => {
      cursorOn = !cursorOn
      this._refreshNameDisplay(cursorOn)
    }})
    this._domInput.onValue(v => {
      this.playerName = v
      this._refreshNameDisplay(cursorOn)
    })
    this._domInput.onEnter(() => this._confirm())

    inputBg.setInteractive(new Phaser.Geom.Rectangle(inputX, inputY, inputW, inputH), Phaser.Geom.Rectangle.Contains)
    inputBg.on('pointerdown', () => { drawInput(true); this._domInput.focus() })
    this.input.on('pointerdown', (_p, objs) => {
      if (!objs.includes(inputBg)) { drawInput(false); this._domInput.blur() }
    })
    // Auto-focus
    this.time.delayedCall(100, () => { drawInput(true); this._domInput.focus() })

    // ── Confirm button ───────────────────────────────────────────────────────
    const btnW = 320, btnH = 48, btnX = W/2 - btnW/2, btnY = panelY + panelH - 62

    const btnGlow = this.add.graphics()
    const btnBg = this.add.graphics()
    const drawBtn = (hover) => {
      btnGlow.clear()
      btnGlow.fillStyle(0x4ecdc4, hover ? 0.2 : 0.08)
      btnGlow.fillRoundedRect(btnX - 4, btnY - 4, btnW + 8, btnH + 8, 14)
      btnBg.clear()
      btnBg.fillStyle(hover ? 0x2dd4bf : 0x0d9488, 1)
      btnBg.fillRoundedRect(btnX, btnY, btnW, btnH, 10)
    }
    drawBtn(false)
    btnBg.setInteractive(new Phaser.Geom.Rectangle(btnX, btnY, btnW, btnH), Phaser.Geom.Rectangle.Contains)
    btnBg.on('pointerover', () => drawBtn(true))
    btnBg.on('pointerout',  () => drawBtn(false))
    btnBg.on('pointerdown', () => this._confirm())

    this.add.text(W/2, btnY + btnH/2, 'Xác nhận  →', {
      fontSize: '17px', color: '#ffffff', fontFamily: FONT, fontStyle: 'bold'
    }).setOrigin(0.5)
  }

  _drawColorCircle(color, cx, cy, r) {
    const g = this._colorCircles[color].g
    g.clear()
    const isSelected = color === this.playerColor
    if (isSelected) {
      g.fillStyle(COLOR_INT[color], 0.2)
      g.fillCircle(cx, cy, r + 9)
      g.lineStyle(2, 0xffffff, 0.9)
      g.strokeCircle(cx, cy, r + 5)
    }
    g.fillStyle(COLOR_INT[color], 1)
    g.fillCircle(cx, cy, r)
    g.fillStyle(0xffffff, 0.18)
    g.fillCircle(cx - r * 0.28, cy - r * 0.28, r * 0.35)
  }

  _refreshColors(r) {
    Object.keys(this._colorCircles).forEach(c => {
      const { cx, cy } = this._colorCircles[c]
      this._drawColorCircle(c, cx, cy, r)
    })
  }

  _refreshNameDisplay(cursorOn) {
    const display = this.playerName + (cursorOn ? '|' : ' ')
    this._nameText.setText(display)
    this._placeholder.setVisible(this.playerName.length === 0 && !cursorOn)
  }

  _confirm() {
    if (this.playerName.trim().length === 0) return
    this._cursorTimer?.destroy()
    this._domInput?.destroy()
    this.music?.stop()
    this.scene.start('Lobby', {
      playerColor: this.playerColor,
      playerName:  this.playerName.trim()
    })
  }
}
