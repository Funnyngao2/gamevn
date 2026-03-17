// LobbyScene.js — space theme, clean chat logic
import { io }             from 'socket.io-client'
import { safePlay }       from '../utils/safePlay.js'
import { createDomInput } from '../utils/domInput.js'
import { createVoiceChatButton } from '../components/VoiceChatUI.js'
import { PLAYER_COLORS as COLOR_INT, PLAYER_COLORS_HEX as COLOR_HEX } from '../config.js'

const FONT = 'Roboto, Arial, sans-serif'

// -- Palette ------------------------------------------------------------------
const BG_DEEP   = 0x020409
const BG_PANEL  = 0x0b1120
const BG_CARD   = 0x111d30
const BG_INPUT  = 0x0d1829
const BORDER    = 0x1e3d6b
const BORDER_LT = 0x2d5a9e
const TEAL      = 0x00e5cc
const TEAL_DIM  = 0x00b8a3
const GREEN     = 0x22c55e
const GREEN_D   = 0x16a34a
const RED       = 0xef4444
const RED_D     = 0xb91c1c

// -- Chat renderer ------------------------------------------------------------
function createChatBox(scene, { x, y, w, h, page, systemInLobby = true }) {
  const PAD      = 6
  const BUBBLE_R = 6
  const MSG_GAP  = 5
  const SB_W     = 6
  const clipW    = w - SB_W - 3

  const msgs  = []
  let totalH  = 0
  let scrollY = 0   // 0 = bottom (newest), positive = scrolled up toward older msgs

  const outer = scene.add.container(x, y)
  if (page) page.add(outer)

  // Geometry mask — clips children of outer to the chat area
  // Must use WORLD coords for the mask rect, not local
  const maskGfx = scene.add.graphics()
  maskGfx.fillStyle(0xffffff, 1)
  maskGfx.fillRect(x, y, clipW, h)
  maskGfx.setAlpha(0.001)
  maskGfx.setDepth(-100)
  if (page) page.add(maskGfx)
  outer.setMask(maskGfx.createGeometryMask())

  // -- Scrollbar ---------------------------------------------------------------
  const sbX     = x + w - SB_W
  const sbTrack = scene.add.graphics()
  const sbThumb = scene.add.graphics()
  if (page) { page.add(sbTrack); page.add(sbThumb) }
  sbTrack.fillStyle(0x060e1c, 1)
  sbTrack.fillRoundedRect(sbX, y, SB_W, h, 3)

  function drawScrollbar() {
    sbThumb.clear()
    const max = Math.max(0, totalH - h)
    if (max <= 0) return
    const ratio  = h / totalH
    const thumbH = Math.max(20, h * ratio)
    // scrollY=0 → thumb at bottom; scrollY=max → thumb at top
    const thumbY = y + (1 - scrollY / max) * (h - thumbH)
    sbThumb.fillStyle(TEAL, 0.55)
    sbThumb.fillRoundedRect(sbX, thumbY, SB_W, thumbH, 3)
  }

  const maxScroll = () => Math.max(0, totalH - h)

  // Layout messages bottom-up in LOCAL coords of outer container,
  // then show/hide each based on whether it falls within [0, h]
  function reposition() {
    // curY starts at (h - scrollY): the bottom anchor in local space
    let curY = h - scrollY
    for (let i = msgs.length - 1; i >= 0; i--) {
      const msgH = msgs[i].height
      curY -= msgH + MSG_GAP
      msgs[i].mc.y = curY

      // Visibility culling: hide messages fully outside the clip area
      const top    = curY
      const bottom = curY + msgH
      msgs[i].mc.setVisible(bottom > 0 && top < h)
    }
    drawScrollbar()
  }

  // -- Add one message ---------------------------------------------------------
  function addMsg(data) {
    const { name, color, text, system, isSelf, ts } = data
    if (system && !systemInLobby) return

    const mc   = scene.add.container(0, 0)
    outer.add(mc)

    const msgW  = clipW - PAD * 2
    const LEFT  = PAD
    const RIGHT = clipW - PAD
    let   msgH  = 0

    if (system) {
      const txt = scene.add.text(clipW / 2, 5, text, {
        fontSize: '10px', color: '#f59e0b', fontFamily: FONT, fontStyle: 'italic',
        wordWrap: { width: msgW - 20 }, align: 'center'
      }).setOrigin(0.5, 0)
      const pillW = Math.min(txt.width + 24, msgW)
      const pillH = txt.height + 10
      const pill  = scene.add.graphics()
      pill.fillStyle(0x1a1200, 0.9)
      pill.lineStyle(1, 0xf59e0b, 0.4)
      pill.fillRoundedRect(clipW / 2 - pillW / 2, 0, pillW, pillH, 10)
      pill.strokeRoundedRect(clipW / 2 - pillW / 2, 0, pillW, pillH, 10)
      mc.add([pill, txt])
      msgH = pillH + 2
      if (ts) {
        const tsT = scene.add.text(clipW / 2, pillH + 2, ts, {
          fontSize: '9px', color: '#6b4f00', fontFamily: FONT
        }).setOrigin(0.5, 0)
        mc.add(tsT); msgH += 12
      }

    } else if (isSelf) {
      const maxTxtW = msgW - 28
      const txt = scene.add.text(RIGHT - maxTxtW, 5, text, {
        fontSize: '11px', color: '#001a18', fontFamily: FONT,
        wordWrap: { width: maxTxtW }
      }).setOrigin(0, 0)
      const bW = Math.min(txt.width + 20, msgW - 4)
      const bH = txt.height + 10
      txt.setX(RIGHT - bW + 10)
      const bubble = scene.add.graphics()
      bubble.fillStyle(TEAL, 1)
      bubble.fillRoundedRect(RIGHT - bW, 0, bW, bH, BUBBLE_R)
      const tail = scene.add.graphics()
      tail.fillStyle(TEAL, 1)
      tail.fillTriangle(RIGHT - 1, bH - 10, RIGHT + 6, bH - 3, RIGHT - 1, bH - 3)
      mc.add([bubble, tail, txt])
      msgH = bH + 4
      if (ts) {
        const tsT = scene.add.text(RIGHT, bH + 2, ts, {
          fontSize: '9px', color: '#475569', fontFamily: FONT
        }).setOrigin(1, 0)
        mc.add(tsT); msgH += 12
      }

    } else {
      const colorHex = COLOR_HEX[color] || '#94a3b8'
      const cInt     = COLOR_INT[color]  || 0x94a3b8
      const AVR      = 9
      const avX      = LEFT + AVR + 2
      const txtX     = avX + AVR + 8
      const avGlow = scene.add.graphics()
      avGlow.fillStyle(cInt, 0.18); avGlow.fillCircle(avX, AVR + 2, AVR + 3)
      const avCircle = scene.add.graphics()
      avCircle.fillStyle(cInt, 1); avCircle.fillCircle(avX, AVR + 2, AVR)
      const avLetter = scene.add.text(avX, AVR + 2, (name || '?')[0].toUpperCase(), {
        fontSize: '9px', color: '#000', fontFamily: FONT, fontStyle: 'bold'
      }).setOrigin(0.5)
      const nameT = scene.add.text(txtX, 0, name || '?', {
        fontSize: '10px', color: colorHex, fontFamily: FONT, fontStyle: 'bold'
      })
      const maxTxtW = msgW - AVR * 2 - 20
      const msgT = scene.add.text(txtX + 4, 15, text, {
        fontSize: '11px', color: '#e2e8f0', fontFamily: FONT,
        wordWrap: { width: maxTxtW }
      })
      const bW = Math.min(Math.max(msgT.width + 16, nameT.width + 8), maxTxtW + 16)
      const bH = msgT.height + 10
      const bubble = scene.add.graphics()
      bubble.fillStyle(0x162035, 1)
      bubble.lineStyle(1, BORDER_LT, 0.4)
      bubble.fillRoundedRect(txtX - 2, 13, bW, bH, BUBBLE_R)
      bubble.strokeRoundedRect(txtX - 2, 13, bW, bH, BUBBLE_R)
      const tail = scene.add.graphics()
      tail.fillStyle(0x162035, 1)
      tail.fillTriangle(txtX - 2, 17, txtX - 9, 22, txtX - 2, 27)
      mc.add([avGlow, avCircle, avLetter, nameT, bubble, tail, msgT])
      msgH = 13 + bH + 4
      if (ts) {
        const tsT = scene.add.text(txtX, 13 + bH + 2, ts, {
          fontSize: '9px', color: '#475569', fontFamily: FONT
        })
        mc.add(tsT); msgH += 12
      }
    }

    msgs.push({ mc, height: msgH })
    totalH += msgH + MSG_GAP
    // Auto-scroll to bottom only when already at bottom
    if (scrollY <= 8) scrollY = 0
    reposition()
  }

  function loadHistory(messages, myId) {
    messages.forEach(m => addMsg({
      name:   m.sender_name,
      color:  m.sender_color,
      text:   m.message,
      system: !!m.is_system,
      isSelf: !m.is_system && m.sender_id === myId,
      ts:     m.ts || null
    }))
  }

  // Wheel scroll:
  //   Phaser wheel dy: lăn xuống = dy < 0, lăn lên = dy > 0 (Phaser đảo dấu so với browser)
  //   Lăn xuống → xem tin cũ hơn → scrollY tăng → dùng -dy
  const wheelHandler = (pointer, _go, _dx, dy) => {
    if (pointer.x >= x && pointer.x <= x + w && pointer.y >= y && pointer.y <= y + h) {
      scrollY = Phaser.Math.Clamp(scrollY - dy * 0.8, 0, maxScroll())
      reposition()
    }
  }
  scene.input.on('wheel', wheelHandler)

  function destroy() {
    scene.input.off('wheel', wheelHandler)
    sbTrack.destroy(); sbThumb.destroy()
    maskGfx.destroy()
    if (outer.scene) outer.destroy(true)
  }

  return { addMsg, loadHistory, container: outer, destroy }
}

// -- LobbyScene ----------------------------------------------------------------
export class LobbyScene extends Phaser.Scene {
  constructor() { super('Lobby') }

  init(data) {
    this.playerColor     = data.playerColor || 'red'
    this.playerName      = data.playerName  || 'Player'
    this._incomingSocket = data.socket      || null
    this._returnRoomId   = data.roomId      || null
  }

  create() {
    const { width, height } = this.scale
    this.W = width; this.H = height
    this._page        = null
    this._socket      = null
    this._myId        = null
    this._socketId    = null
    this._currentRoom = null
    this._isHost      = false
    this._roomList    = []
    this._searchQuery = ''
    this._domInputs   = []
    this._chatBoxes   = []
    this._connectSocket()
  }

  // -- Socket ------------------------------------------------------------------
  _connectSocket() {
    if (!localStorage.getItem('playerUUID')) {
      localStorage.setItem('playerUUID', 'u_' + Math.random().toString(36).slice(2) + Date.now().toString(36))
    }
    this._playerUUID = localStorage.getItem('playerUUID')

    if (this._incomingSocket?.connected) {
      this._socket   = this._incomingSocket
      this._socketId = this._socket.id
      this._myId     = this._playerUUID
      this._attachSocketEvents()
      this._socket.emit('setProfile', { name: this.playerName, color: this.playerColor, uuid: this._playerUUID })
      if (this._returnRoomId) {
        this._showLoading()
        this._socket.emit('joinRoom', { roomId: this._returnRoomId })
      } else {
        this._showRoomList(this._roomList)
      }
      return
    }
    this._socket = io('/', { transports: ['websocket'] })
    this._socket.on('connect', () => {
      this._socket.emit('setProfile', { name: this.playerName, color: this.playerColor, uuid: this._playerUUID })
    })
    this._attachSocketEvents()
  }

  _attachSocketEvents() {
    const s = this._socket
    s.off('id'); s.off('roomList'); s.off('joinedRoom')
    s.off('roomUpdate'); s.off('leftRoom'); s.off('youAreHost')
    s.off('gameStart'); s.off('error'); s.off('connect_error')
    s.on('id', d => {
      this._socketId = d.id
      this._myId     = this._playerUUID || d.id
      this._showRoomList(this._roomList)
    })
    s.on('roomList', d => {
      this._roomList = d.rooms
      if (!this._currentRoom) {
        if (this._page) this._refreshRoomRows(d.rooms)
        else            this._showRoomList(d.rooms)
      }
    })
    s.on('joinedRoom', d  => { this._currentRoom = d.room; this._isHost = d.isHost; this._showWaitingRoom(d.room) })
    s.on('roomUpdate', d  => { this._currentRoom = d.room; this._updateWaitingRoom(d.room) })
    s.on('leftRoom',   () => { this._currentRoom = null; this._isHost = false; this._showRoomList(this._roomList) })
    s.on('youAreHost', () => { this._isHost = true; if (this._currentRoom) this._updateWaitingRoom(this._currentRoom) })
    s.on('gameStart',  d  => { this._startGame(d) })
    s.on('error',      d  => { this._showError(d.msg); if (!this._currentRoom) this._showRoomList(this._roomList) })
    s.on('connect_error', () => this._showRoomList([]))
  }

  _send(ev, data = {}) { if (this._socket?.connected) this._socket.emit(ev, data) }

  // -- Page management ---------------------------------------------------------
  _clearPage() {
    if (this._socket) {
      this._socket.off('lobbyChat')
      this._socket.off('roomChat')
      this._socket.off('chatHistory')
    }
    // Cleanup voice chat
    if (this._voiceBtn) {
      this._voiceBtn.destroy()
      this._voiceBtn = null
    }
    this._chatBoxes.forEach(cb => cb.destroy())
    this._chatBoxes = []
    this._domInputs.forEach(d => d.destroy())
    this._domInputs = []
    this._rowContainer    = null
    this._rowLayout       = null
    this._rowScrollOffset = 0
    if (this._rowWheelHandler) {
      this.input.off('wheel', this._rowWheelHandler)
      this._rowWheelHandler = null
    }
    if (this._page) { this._page.destroy(true); this._page = null }
    this.input.keyboard.removeAllListeners('keydown')
    this.input.removeAllListeners('pointerdown')
    // NOTE: wheel listeners are managed individually by chatbox.destroy() and room row handler
    // Do NOT call removeAllListeners('wheel') here — it would kill handlers registered after this point
  }

  _add(obj) {
    if (!this._page) this._page = this.add.container(0, 0)
    this._page.add(obj); return obj
  }

  _trackDom(d) { this._domInputs.push(d); return d }

  _showError(msg) {
    if (this._errTxt) this._errTxt.destroy()
    this._errTxt = this.add.text(this.W / 2, this.H - 18, msg, {
      fontSize: '13px', color: '#f87171', fontFamily: FONT
    }).setOrigin(0.5).setDepth(50)
    this.time.delayedCall(3000, () => this._errTxt?.destroy())
  }

  // -- Drawing helpers ---------------------------------------------------------
  _drawSpaceBg() {
    const { W, H } = this
    this._add(this.add.rectangle(W / 2, H / 2, W, H, BG_DEEP).setOrigin(0.5))
    const neb = this.add.graphics()
    neb.fillStyle(0x0a1535, 0.55); neb.fillEllipse(W * 0.12, H * 0.22, W * 0.55, H * 0.45)
    neb.fillStyle(0x0c0d28, 0.4);  neb.fillEllipse(W * 0.88, H * 0.78, W * 0.5,  H * 0.4)
    this._add(neb)
    for (let i = 0; i < 180; i++) {
      const sx = Phaser.Math.Between(0, W), sy = Phaser.Math.Between(0, H)
      const r  = Phaser.Math.FloatBetween(0.3, 1.8), a = Phaser.Math.FloatBetween(0.2, 0.9)
      this._add(this.add.circle(sx, sy, r, 0xffffff, a))
    }
  }

  _drawHeader() {
    const { W } = this
    const H_BAR = 68
    const bar = this.add.graphics()
    bar.fillStyle(0x040810, 1); bar.fillRect(0, 0, W, H_BAR)
    bar.lineStyle(1, TEAL, 0.35); bar.lineBetween(0, H_BAR, W, H_BAR)
    this._add(bar)
    const topLine = this.add.graphics()
    topLine.lineStyle(2, TEAL, 0.8); topLine.lineBetween(0, 0, W, 0)
    this._add(topLine)
    if (this.textures.exists('logo')) {
      const logo = this.add.image(W / 2, H_BAR / 2, 'logo')
      logo.setScale(Math.min(200 / logo.width, 44 / logo.height))
      this._add(logo)
    } else {
      this._add(this.add.text(W / 2, H_BAR / 2, 'MOONIVERSE', {
        fontSize: '22px', color: '#ffffff', fontFamily: FONT, fontStyle: 'bold', letterSpacing: 5
      }).setOrigin(0.5))
    }
    this._add(this.add.text(W / 2, H_BAR + 13, 'GAME AMONG MOONGROUP', {
      fontSize: '10px', color: '#00e5cc', fontFamily: FONT, letterSpacing: 3
    }).setOrigin(0.5))
    return H_BAR + 26
  }

  _panel(x, y, w, h, { fill = BG_PANEL, border = BORDER, radius = 10, accentTop = false } = {}) {
    const g = this.add.graphics()
    g.fillStyle(fill, 1); g.fillRoundedRect(x, y, w, h, radius)
    g.lineStyle(1, border, 1); g.strokeRoundedRect(x, y, w, h, radius)
    if (accentTop) { g.lineStyle(2, TEAL, 0.7); g.lineBetween(x + radius, y, x + w - radius, y) }
    return this._add(g)
  }

  _btn(x, y, w, h, label, { fill = TEAL, fillH = TEAL_DIM, textColor = '#000000',
    fontSize = '13px', radius = 8, bold = true } = {}) {
    const bg = this.add.graphics()
    const draw = (hover) => {
      bg.clear()
      bg.fillStyle(hover ? fillH : fill, 1)
      bg.fillRoundedRect(x, y, w, h, radius)
    }
    draw(false)
    bg.setInteractive(new Phaser.Geom.Rectangle(x, y, w, h), Phaser.Geom.Rectangle.Contains)
    bg.on('pointerover', () => draw(true))
    bg.on('pointerout',  () => draw(false))
    this._add(bg)
    this._add(this.add.text(x + w / 2, y + h / 2, label, {
      fontSize, color: textColor, fontFamily: FONT, fontStyle: bold ? 'bold' : 'normal'
    }).setOrigin(0.5))
    return { bg, onClick: (cb) => bg.on('pointerdown', cb) }
  }

  // -- Chat input bar ----------------------------------------------------------
  _makeChatInput(x, y, w, h, placeholder, onSend) {
    const iconW = 24  // Width for emoji icon button
    const cinW = w - 44 - iconW - 4  // Subtract send button + emoji button + gaps
    const cinBg = this.add.graphics()
    const drawCin = (focused) => {
      cinBg.clear()
      cinBg.fillStyle(BG_INPUT, 1); cinBg.fillRoundedRect(x + iconW + 4, y, cinW, h, 5)
      cinBg.lineStyle(1, focused ? TEAL : BORDER, 1); cinBg.strokeRoundedRect(x + iconW + 4, y, cinW, h, 5)
    }
    drawCin(false); this._add(cinBg)

    const cinTxt = this._add(this.add.text(x + iconW + 12, y + h / 2, '', {
      fontSize: '11px', color: '#f8fafc', fontFamily: FONT
    }).setOrigin(0, 0.5))
    const cinPh = this._add(this.add.text(x + iconW + 12, y + h / 2, placeholder, {
      fontSize: '11px', color: '#334155', fontFamily: FONT
    }).setOrigin(0, 0.5))

    // Emoji picker popup
    let emojiPickerVisible = false
    const emojiList = [
      '😊', '😂', '🤣', '😍', '😘', '😎', '🥰', '😭',
      '😡', '🤔', '😱', '🤗', '🙄', '😴', '🤩', '😇',
      '👍', '👎', '👏', '🙏', '💪', '✌️', '🤝', '👋',
      '❤️', '💔', '💯', '🔥', '⭐', '✨', '🎉', '🎮',
      '🚀', '⚡', '💀', '👻', '🎯', '🏆', '🎨', '🎵'
    ]

    const pickerW = 200
    const pickerH = 140
    const pickerX = x
    const pickerY = y - pickerH - 4

    const emojiPicker = this.add.container(pickerX, pickerY)
    emojiPicker.setDepth(1000)
    emojiPicker.setVisible(false)
    if (this._page) this._page.add(emojiPicker)

    // Picker background
    const pickerBg = this.add.graphics()
    pickerBg.fillStyle(BG_CARD, 0.98)
    pickerBg.fillRoundedRect(0, 0, pickerW, pickerH, 8)
    pickerBg.lineStyle(2, TEAL, 0.6)
    pickerBg.strokeRoundedRect(0, 0, pickerW, pickerH, 8)
    // Shadow effect
    const shadow = this.add.graphics()
    shadow.fillStyle(0x000000, 0.3)
    shadow.fillRoundedRect(2, 2, pickerW, pickerH, 8)
    emojiPicker.add([shadow, pickerBg])

    // Title
    const pickerTitle = this.add.text(pickerW / 2, 8, '😊 Chọn Emoji', {
      fontSize: '10px', color: TEAL, fontFamily: FONT, fontStyle: 'bold'
    }).setOrigin(0.5, 0)
    emojiPicker.add(pickerTitle)

    // Emoji grid
    const cols = 8
    const emojiSize = 22
    const startX = 8
    const startY = 26
    const gapX = 2
    const gapY = 2

    emojiList.forEach((emoji, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const ex = startX + col * (emojiSize + gapX)
      const ey = startY + row * (emojiSize + gapY)

      const emojiBg = this.add.graphics()
      const emojiTxt = this.add.text(ex + emojiSize / 2, ey + emojiSize / 2, emoji, {
        fontSize: '16px', fontFamily: FONT
      }).setOrigin(0.5)

      const drawEmojiBg = (hover) => {
        emojiBg.clear()
        if (hover) {
          emojiBg.fillStyle(TEAL, 0.3)
          emojiBg.fillRoundedRect(ex, ey, emojiSize, emojiSize, 4)
        }
      }

      emojiBg.setInteractive(new Phaser.Geom.Rectangle(ex, ey, emojiSize, emojiSize), Phaser.Geom.Rectangle.Contains)
      emojiBg.on('pointerover', () => { drawEmojiBg(true); emojiTxt.setScale(1.2) })
      emojiBg.on('pointerout', () => { drawEmojiBg(false); emojiTxt.setScale(1) })
      emojiBg.on('pointerdown', () => {
        const current = dom.getValue()
        const newVal = current + emoji
        dom.setValue(newVal)
        cinTxt.setText(newVal)
        cinPh.setVisible(false)
        emojiPicker.setVisible(false)
        emojiPickerVisible = false
        safePlay(this, 'select')
      })

      emojiPicker.add([emojiBg, emojiTxt])
    })

    // Emoji button (left side)
    const emojiBg = this.add.graphics()
    const emojiIcon = this.add.text(x + iconW / 2, y + h / 2, '😊', {
      fontSize: '14px', fontFamily: FONT
    }).setOrigin(0.5)
    
    const drawEmoji = (hover) => {
      emojiBg.clear()
      emojiBg.fillStyle(hover || emojiPickerVisible ? BORDER_LT : BG_INPUT, 1)
      emojiBg.fillRoundedRect(x, y, iconW, h, 5)
      emojiBg.lineStyle(1, emojiPickerVisible ? TEAL : BORDER, emojiPickerVisible ? 1 : 0.6)
      emojiBg.strokeRoundedRect(x, y, iconW, h, 5)
    }
    drawEmoji(false)
    this._add(emojiBg)
    this._add(emojiIcon)

    emojiBg.setInteractive(new Phaser.Geom.Rectangle(x, y, iconW, h), Phaser.Geom.Rectangle.Contains)
    emojiBg.on('pointerover', () => drawEmoji(true))
    emojiBg.on('pointerout', () => drawEmoji(false))
    emojiBg.on('pointerdown', () => {
      emojiPickerVisible = !emojiPickerVisible
      emojiPicker.setVisible(emojiPickerVisible)
      drawEmoji(false)
      safePlay(this, 'select')
    })

    // Close picker when clicking outside
    this.input.on('pointerdown', (pointer, objs) => {
      if (emojiPickerVisible && !objs.some(o => emojiPicker.list.includes(o) || o === emojiBg)) {
        emojiPicker.setVisible(false)
        emojiPickerVisible = false
        drawEmoji(false)
      }
    })

    const dom = this._trackDom(createDomInput(this, { maxLength: 120 }))
    dom.onValue(v => { cinTxt.setText(v); cinPh.setVisible(v.length === 0) })
    dom.onEnter(() => {
      const t = dom.getValue().trim()
      if (t) { onSend(t); dom.setValue(''); cinTxt.setText(''); cinPh.setVisible(true) }
    })

    cinBg.setInteractive(new Phaser.Geom.Rectangle(x + iconW + 4, y, cinW, h), Phaser.Geom.Rectangle.Contains)
    cinBg.on('pointerdown', () => { drawCin(true); dom.focus() })
    this.input.on('pointerdown', (_p, objs) => { if (!objs.includes(cinBg)) { drawCin(false); dom.blur() } })

    const sendBtn = this._btn(x + iconW + 4 + cinW + 4, y, 38, h, '➤',
      { fill: TEAL, fillH: TEAL_DIM, textColor: '#000', fontSize: '13px', radius: 5 })
    sendBtn.onClick(() => {
      const t = dom.getValue().trim()
      if (t) { onSend(t); dom.setValue(''); cinTxt.setText(''); cinPh.setVisible(true) }
    })

    return dom
  }

  // Update only the room rows without rebuilding the whole page
  _refreshRoomRows(rooms) {
    if (!this._rowContainer || !this._rowLayout) return
    const { tblX, tblW, rowsY, tblViewH, colWidths } = this._rowLayout
    this._filteredRooms = rooms.filter(r =>
      !this._searchQuery || r.name.toLowerCase().includes(this._searchQuery.toLowerCase())
    )
    const rowH = 32
    const scrollOffset = this._rowScrollOffset || 0
    // _buildRoomRows already calls removeAll(true) internally — no need to call it here
    this._buildRoomRows(this._rowContainer, this._filteredRooms, tblX, tblW, rowsY, tblViewH, colWidths, rowH, scrollOffset)
    this._rowSbRedraw?.()
  }

  _buildRoomRows(rowContainer, filtered, tblX, tblW, rowsY, tblViewH, colWidths, rowH, scrollOffset) {
    rowContainer.removeAll(true)
    for (let i = 0; i < filtered.length; i++) {
      const ry = rowsY + i * rowH - scrollOffset
      if (ry + rowH < rowsY || ry > rowsY + tblViewH) continue
      const room     = filtered[i]
      const isFull   = room.players >= room.maxPlayers
      const isStarted = room.started
      const canJoin  = !isFull && !isStarted

      const rowBg = this.add.graphics()
      rowBg.fillStyle(i % 2 === 0 ? BG_PANEL : BG_CARD, 1)
      rowBg.fillRect(tblX, ry, tblW, rowH)
      const sepG = this.add.graphics()
      sepG.lineStyle(1, BORDER, 0.15); sepG.lineBetween(tblX, ry + rowH, tblX + tblW, ry + rowH)
      rowContainer.add(rowBg); rowContainer.add(sepG)

      if (canJoin) {
        rowBg.setInteractive(new Phaser.Geom.Rectangle(tblX, ry, tblW, rowH), Phaser.Geom.Rectangle.Contains)
        rowBg.on('pointerover', () => {
          rowBg.clear()
          rowBg.fillStyle(0x1a3050, 1); rowBg.fillRect(tblX, ry, tblW, rowH)
          rowBg.fillStyle(TEAL, 1);     rowBg.fillRect(tblX, ry, 3, rowH)
        })
        rowBg.on('pointerout', () => {
          rowBg.clear()
          rowBg.fillStyle(i % 2 === 0 ? BG_PANEL : BG_CARD, 1); rowBg.fillRect(tblX, ry, tblW, rowH)
        })
        rowBg.on('pointerdown', () => { safePlay(this, 'select'); this._send('joinRoom', { roomId: room.id }) })
      }

      const statusColor = isStarted ? '#f59e0b' : isFull ? '#ef4444' : '#22c55e'
      const cells      = [
        room.name,
        room.host || '?',
        `${room.players}/${room.maxPlayers}`,
        isStarted ? '▶ Đang chơi' : isFull ? '🔴 Đầy' : '🟢 Chờ'
      ]
      const cellColors = ['#f8fafc', '#94a3b8', isFull ? '#ef4444' : '#22c55e', statusColor]
      let cx2 = tblX
      cells.forEach((cell, ci) => {
        const t = this.add.text(cx2 + colWidths[ci] / 2, ry + rowH / 2, cell, {
          fontSize: '12px', color: cellColors[ci], fontFamily: FONT
        }).setOrigin(0.5)
        rowContainer.add(t); cx2 += colWidths[ci]
      })
    }
    if (filtered.length === 0) {
      rowContainer.add(this.add.text(tblX + tblW / 2, rowsY + tblViewH / 2,
        'Chưa có phòng nào — hãy tạo phòng mới!', {
          fontSize: '13px', color: '#475569', fontFamily: FONT
        }).setOrigin(0.5))
    }
  }

  _showLoading() {
    this._clearPage()
    this._drawSpaceBg(); this._drawHeader()
    this._add(this.add.text(this.W / 2, this.H / 2, 'Đang kết nối...', {
      fontSize: '22px', color: '#cbd5e1', fontFamily: FONT
    }).setOrigin(0.5))
  }

  // -- Room list page ----------------------------------------------------------
  _showRoomList(rooms) {
    this._clearPage()
    const { W, H } = this
    this._drawSpaceBg()
    const startY = this._drawHeader()
    const PAD = 16, areaH = H - startY - PAD

    // -- Left: profile card --------------------------------------------------
    const avW = 200, avX = PAD, avY = startY
    this._panel(avX, avY, avW, areaH, { fill: BG_PANEL, border: BORDER, accentTop: true })
    const avCX = avX + avW / 2, avCY = avY + 70
    const cInt = COLOR_INT[this.playerColor] || 0xffffff
    const glowG = this.add.graphics()
    glowG.fillStyle(cInt, 0.1); glowG.fillCircle(avCX, avCY, 54)
    glowG.lineStyle(1.5, cInt, 0.4); glowG.strokeCircle(avCX, avCY, 50)
    this._add(glowG)
    this._add(this.add.circle(avCX, avCY, 42, cInt))
    const shineG = this.add.graphics()
    shineG.fillStyle(0xffffff, 0.18); shineG.fillCircle(avCX - 13, avCY - 13, 13)
    this._add(shineG)
    this._add(this.add.text(avCX, avCY + 56, this.playerName, {
      fontSize: '15px', color: '#f8fafc', fontFamily: FONT, fontStyle: 'bold'
    }).setOrigin(0.5))
    this._add(this.add.text(avCX, avCY + 74, this.playerColor.toUpperCase(), {
      fontSize: '10px', color: COLOR_HEX[this.playerColor], fontFamily: FONT, letterSpacing: 2
    }).setOrigin(0.5))
    const dg1 = this.add.graphics()
    dg1.lineStyle(1, BORDER, 0.7); dg1.lineBetween(avX + 16, avY + 158, avX + avW - 16, avY + 158)
    this._add(dg1)
    this._add(this.add.text(avCX, avY + 170, 'THỐNG KÊ', {
      fontSize: '9px', color: '#00e5cc', fontFamily: FONT, fontStyle: 'bold', letterSpacing: 3
    }).setOrigin(0.5))
    const statRows = [['Tên', this.playerName], ['Cấp bậc', 'Tân binh'], ['Thắng', '0'], ['Thua', '0']]
    statRows.forEach(([k, v], i) => {
      const ry = avY + 190 + i * 26
      this._add(this.add.text(avX + 14, ry, k, { fontSize: '11px', color: '#94a3b8', fontFamily: FONT }))
      this._add(this.add.text(avX + avW - 14, ry, v, {
        fontSize: '11px', color: '#f8fafc', fontFamily: FONT, fontStyle: 'bold'
      }).setOrigin(1, 0))
    })
    const backBtn = this._btn(avX + 12, avY + areaH - 46, avW - 24, 36, '← Quay lại Menu',
      { fill: RED, fillH: RED_D, textColor: '#ffffff', fontSize: '12px' })
    backBtn.onClick(() => {
      safePlay(this, 'back')
      this._socket?.disconnect()
      this.scene.start('Menu', { playerColor: this.playerColor, playerName: this.playerName })
    })

    // -- Right: main panel ---------------------------------------------------
    const mainX = avX + avW + PAD, mainW = W - mainX - PAD
    this._panel(mainX, startY, mainW, areaH, { fill: BG_PANEL, border: BORDER, accentTop: true })
    const sideW = 186, sideX = mainX + mainW - sideW - 10
    const tblX  = mainX + 10
    const SB_W  = 8  // room list scrollbar width
    const tblW  = mainW - sideW - 28 - SB_W - 4  // leave room for scrollbar

    // Table header label + refresh button
    this._add(this.add.text(tblX + 4, startY + 14, '🚀 DANH SÁCH PHÒNG', {
      fontSize: '11px', color: '#00e5cc', fontFamily: FONT, fontStyle: 'bold', letterSpacing: 2
    }))
    const refBtn = this._btn(tblX + tblW - 106, startY + 8, 102, 28, '↻  Làm mới',
      { fill: BG_CARD, fillH: BORDER_LT, textColor: '#cbd5e1', fontSize: '11px', radius: 6, bold: false })
    refBtn.onClick(() => this._socket?.emit('roomList'))

    // Search bar
    const srchY = startY + 42, srchH = 28, srchW = tblW - 54
    const srchBg = this.add.graphics()
    const drawSrch = (focused) => {
      srchBg.clear()
      srchBg.fillStyle(BG_INPUT, 1); srchBg.fillRoundedRect(tblX, srchY, srchW, srchH, 6)
      srchBg.lineStyle(1, focused ? TEAL : BORDER, 1); srchBg.strokeRoundedRect(tblX, srchY, srchW, srchH, 6)
    }
    drawSrch(false); this._add(srchBg)
    // Search icon
    this._add(this.add.text(tblX + 8, srchY + srchH / 2, '🔍', {
      fontSize: '11px', fontFamily: FONT
    }).setOrigin(0, 0.5))
    this._searchText = this._add(this.add.text(tblX + 26, srchY + srchH / 2,
      this._searchQuery || 'Tìm kiếm phòng...', {
        fontSize: '11px', color: this._searchQuery ? '#f8fafc' : '#475569', fontFamily: FONT
      }).setOrigin(0, 0.5))
    const srchBtn = this._btn(tblX + srchW + 4, srchY, 46, srchH, 'Tìm',
      { fill: TEAL, fillH: TEAL_DIM, textColor: '#000', fontSize: '11px', radius: 6 })
    srchBtn.onClick(() => this._showRoomList(this._roomList))
    const domSearch = this._trackDom(createDomInput(this, { maxLength: 20, initialValue: this._searchQuery }))
    domSearch.onValue(v => {
      this._searchQuery = v
      this._searchText.setText(v || 'Tìm kiếm phòng...').setColor(v ? '#f8fafc' : '#475569')
    })
    srchBg.setInteractive(new Phaser.Geom.Rectangle(tblX, srchY, srchW, srchH), Phaser.Geom.Rectangle.Contains)
    srchBg.on('pointerdown', () => { drawSrch(true); domSearch.focus() })
    this.input.on('pointerdown', (_p, objs) => { if (!objs.includes(srchBg)) { drawSrch(false); domSearch.blur() } })

    // Column headers
    const colY = startY + 76, colH = 28
    const colDefs = [
      { label: 'Tên phòng', pct: 0.32 }, { label: 'Chủ phòng', pct: 0.24 },
      { label: 'Người chơi', pct: 0.20 }, { label: 'Trạng thái', pct: 0.24 },
    ]
    const colWidths = colDefs.map(c => c.pct * tblW)
    const colHdrBg = this.add.graphics()
    colHdrBg.fillStyle(0x0a1828, 1); colHdrBg.fillRect(tblX, colY, tblW, colH)
    colHdrBg.lineStyle(1, TEAL, 0.2); colHdrBg.lineBetween(tblX, colY + colH, tblX + tblW, colY + colH)
    this._add(colHdrBg)
    let hx = tblX
    colDefs.forEach((col, i) => {
      this._add(this.add.text(hx + colWidths[i] / 2, colY + colH / 2, col.label, {
        fontSize: '10px', color: '#64748b', fontFamily: FONT, fontStyle: 'bold'
      }).setOrigin(0.5))
      hx += colWidths[i]
    })

    // -- Lobby chat box (bottom of table area) -------------------------------
    const chatBoxH = 168, cinH = 32
    const chatY    = startY + areaH - chatBoxH - 4
    const rowsY    = colY + colH
    const tblViewH = chatY - rowsY - 8

    // Chat panel
    this._panel(tblX, chatY, tblW + SB_W + 4, chatBoxH, { fill: BG_CARD, border: BORDER_LT, radius: 8, accentTop: true })
    this._add(this.add.text(tblX + 10, chatY + 8, '💬 LOBBY CHAT', {
      fontSize: '9px', color: '#00e5cc', fontFamily: FONT, fontStyle: 'bold', letterSpacing: 2
    }))
    this._onlineTxt = this._add(this.add.text(tblX + tblW + SB_W - 2, chatY + 8, '', {
      fontSize: '9px', color: '#475569', fontFamily: FONT
    }).setOrigin(1, 0))

    const msgAreaY = chatY + 24
    const msgAreaH = chatBoxH - 24 - cinH - 10

    const lobbyChatBox = createChatBox(this, {
      x: tblX + 4, y: msgAreaY, w: tblW + SB_W, h: msgAreaH,
      page: this._page, systemInLobby: false
    })
    this._chatBoxes.push(lobbyChatBox)

    this._makeChatInput(tblX + 6, chatY + chatBoxH - cinH - 6, tblW + SB_W - 4, cinH,
      'Nhắn tin với mọi người...', (text) => {
        this._send('lobbyChat', { text })
      })

    // Socket listeners
    this._socket.off('lobbyChat')
    this._socket.on('lobbyChat', d => {
      lobbyChatBox.addMsg({
        name: d.name, color: d.color, text: d.text,
        system: d.system || false,
        isSelf: !d.system && d.senderId === this._myId,
        ts: d.ts || null
      })
    })
    this._socket.off('chatHistory')
    this._socket.on('chatHistory', d => {
      if (d.channel === 'lobby') lobbyChatBox.loadHistory(d.messages, this._myId)
    })
    this._send('getChatHistory', { channel: 'lobby' })

    // -- Scrollable room rows ------------------------------------------------
    this._filteredRooms = rooms.filter(r =>
      !this._searchQuery || r.name.toLowerCase().includes(this._searchQuery.toLowerCase())
    )
    let scrollOffset = 0
    const rowH = 32

    // Clip mask for rows
    const maskShape = this.make.graphics({ add: false })
    maskShape.fillRect(tblX, rowsY, tblW, tblViewH)
    const rowMask = maskShape.createGeometryMask()
    const rowContainer = this.add.container(0, 0)
    rowContainer.setMask(rowMask)
    if (this._page) this._page.add(rowContainer)

    // Visual scrollbar for room list
    const sbX = tblX + tblW + 2
    const rowSbTrack = this.add.graphics()
    const rowSbThumb = this.add.graphics()
    if (this._page) { this._page.add(rowSbTrack); this._page.add(rowSbThumb) }
    rowSbTrack.fillStyle(0x060e1c, 1)
    rowSbTrack.fillRoundedRect(sbX, rowsY, SB_W, tblViewH, 3)

    const redrawRowSb = () => {
      rowSbThumb.clear()
      const maxOff = Math.max(0, this._filteredRooms.length * rowH - tblViewH)
      if (maxOff <= 0) return
      const ratio  = tblViewH / (this._filteredRooms.length * rowH)
      const thumbH = Math.max(20, tblViewH * ratio)
      const thumbY = rowsY + (scrollOffset / maxOff) * (tblViewH - thumbH)
      rowSbThumb.fillStyle(TEAL, 0.55)
      rowSbThumb.fillRoundedRect(sbX, thumbY, SB_W, thumbH, 3)
    }

    const buildRows = () => {
      this._buildRoomRows(rowContainer, this._filteredRooms, tblX, tblW, rowsY, tblViewH, colWidths, rowH, scrollOffset)
      redrawRowSb()
    }
    buildRows()

    this._rowContainer    = rowContainer
    this._rowLayout       = { tblX, tblW, rowsY, tblViewH, colWidths }
    this._rowScrollOffset = 0
    this._rowSbRedraw     = redrawRowSb

    // Wheel scroll for room rows — store ref so we can remove it on next _clearPage
    if (this._rowWheelHandler) this.input.off('wheel', this._rowWheelHandler)
    this._rowWheelHandler = (pointer, _go, _dx, dy) => {
      if (!this._currentRoom
          && pointer.y >= rowsY && pointer.y <= rowsY + tblViewH
          && pointer.x >= tblX  && pointer.x <= tblX + tblW + SB_W) {
        const maxOff = Math.max(0, this._filteredRooms.length * rowH - tblViewH)
        // Phaser dy: lăn xuống = dy < 0 → scroll down in list (increase offset) → dùng -dy
        scrollOffset = Phaser.Math.Clamp(scrollOffset - dy * 0.5, 0, maxOff)
        this._rowScrollOffset = scrollOffset
        buildRows()
      }
    }
    this.input.on('wheel', this._rowWheelHandler)

    // -- Create room sidebar -------------------------------------------------
    const sideY = startY + 8, sideH = areaH - 16
    this._panel(sideX, sideY, sideW, sideH, { fill: BG_CARD, border: BORDER_LT, accentTop: true })
    this._add(this.add.text(sideX + sideW / 2, sideY + 14, '✦ TẠO PHÒNG MỚI', {
      fontSize: '10px', color: '#00e5cc', fontFamily: FONT, fontStyle: 'bold', letterSpacing: 2
    }).setOrigin(0.5))
    const sdiv = this.add.graphics()
    sdiv.lineStyle(1, BORDER, 0.6); sdiv.lineBetween(sideX + 12, sideY + 28, sideX + sideW - 12, sideY + 28)
    this._add(sdiv)
    this._add(this.add.text(sideX + 12, sideY + 36, 'Tên phòng', { fontSize: '10px', color: '#64748b', fontFamily: FONT }))

    this._roomNameInput = `${this.playerName}'s Room`
    const rnY = sideY + 50, rnH = 32
    const rnBg = this.add.graphics()
    const drawRn = (focused) => {
      rnBg.clear(); rnBg.fillStyle(BG_INPUT, 1); rnBg.fillRoundedRect(sideX + 10, rnY, sideW - 20, rnH, 6)
      rnBg.lineStyle(focused ? 1.5 : 1, focused ? TEAL : BORDER, 1)
      rnBg.strokeRoundedRect(sideX + 10, rnY, sideW - 20, rnH, 6)
    }
    drawRn(false); this._add(rnBg)
    this._rnText = this._add(this.add.text(sideX + 18, rnY + rnH / 2, this._roomNameInput, {
      fontSize: '11px', color: '#f8fafc', fontFamily: FONT
    }).setOrigin(0, 0.5))
    const domRoomName = this._trackDom(createDomInput(this, { maxLength: 20, initialValue: this._roomNameInput }))
    domRoomName.onValue(v => { this._roomNameInput = v; this._rnText.setText(v || `${this.playerName}'s Room`) })
    rnBg.setInteractive(new Phaser.Geom.Rectangle(sideX + 10, rnY, sideW - 20, rnH), Phaser.Geom.Rectangle.Contains)
    rnBg.on('pointerdown', () => { drawRn(true); domRoomName.focus() })
    this.input.on('pointerdown', (_p3, objs) => { if (!objs.includes(rnBg)) { drawRn(false); domRoomName.blur() } })

    this._add(this.add.text(sideX + 12, rnY + rnH + 12, 'Số người tối đa', { fontSize: '10px', color: '#64748b', fontFamily: FONT }))
    this._maxPlayers = 8
    const mpOpts = [6, 8, 10], mpBtns = [], mpTxts = []
    const mpBtnW = Math.floor((sideW - 20 - 8) / 3)
    const mpY = rnY + rnH + 26
    mpOpts.forEach((n, i) => {
      const bx = sideX + 10 + i * (mpBtnW + 4), bh = 30
      const bg = this.add.graphics()
      const draw = (sel) => {
        bg.clear(); bg.fillStyle(sel ? TEAL : BG_INPUT, 1); bg.fillRoundedRect(bx, mpY, mpBtnW, bh, 6)
        bg.lineStyle(1, sel ? TEAL : BORDER, 1); bg.strokeRoundedRect(bx, mpY, mpBtnW, bh, 6)
      }
      draw(n === this._maxPlayers)
      bg.setInteractive(new Phaser.Geom.Rectangle(bx, mpY, mpBtnW, bh), Phaser.Geom.Rectangle.Contains)
      bg.on('pointerdown', () => {
        this._maxPlayers = n
        mpBtns.forEach((b, j) => b(mpOpts[j] === n))
        mpTxts.forEach((t, j) => t.setColor(mpOpts[j] === n ? '#000000' : '#cbd5e1'))
        safePlay(this, 'select')
      })
      this._add(bg)
      const lbl = this._add(this.add.text(bx + mpBtnW / 2, mpY + bh / 2, `${n}`, {
        fontSize: '13px', color: n === this._maxPlayers ? '#000000' : '#cbd5e1', fontFamily: FONT, fontStyle: 'bold'
      }).setOrigin(0.5))
      mpBtns.push(draw); mpTxts.push(lbl)
    })

    const cbY = sideY + sideH - 50
    const createBtn = this._btn(sideX + 10, cbY, sideW - 20, 38, '+ Tạo phòng',
      { fill: TEAL, fillH: TEAL_DIM, textColor: '#000000', fontSize: '13px', radius: 8 })
    createBtn.onClick(() => {
      safePlay(this, 'select')
      this._send('createRoom', {
        roomName: this._roomNameInput.trim() || `${this.playerName}'s Room`,
        maxPlayers: this._maxPlayers
      })
    })
  }

  // -- Waiting room page -------------------------------------------------------
  _showWaitingRoom(room) {
    this._clearPage()
    const { W, H } = this
    this._drawSpaceBg()
    const startY = this._drawHeader()
    const PAD = 16
    const chatW    = 260
    const panelH   = H - startY - PAD - 52
    const panelX   = PAD, panelY = startY
    const gridPanelW = W - PAD * 2 - chatW - 8

    // -- Left: player grid panel ---------------------------------------------
    this._panel(panelX, panelY, gridPanelW, panelH, { fill: BG_PANEL, border: BORDER, accentTop: true })
    this._add(this.add.text(panelX + 20, panelY + 16, room.name, {
      fontSize: '20px', color: '#f8fafc', fontFamily: FONT, fontStyle: 'bold'
    }))
    this._roomPlayerCountText = this._add(this.add.text(panelX + 20, panelY + 42, `${room.players.length} / ${room.maxPlayers} người chơi`, {
      fontSize: '12px', color: '#00e5cc', fontFamily: FONT
    }))
    this._add(this.add.text(panelX + gridPanelW - 16, panelY + 30, `ID: ${room.id.slice(-8)}`, {
      fontSize: '11px', color: '#475569', fontFamily: FONT
    }).setOrigin(1, 0.5))
    const dg = this.add.graphics()
    dg.lineStyle(1, BORDER, 0.5)
    dg.lineBetween(panelX + 12, panelY + 58, panelX + gridPanelW - 12, panelY + 58)
    this._add(dg)

    this._playerGridContainer = this.add.container(0, 0)
    this._add(this._playerGridContainer)
    this._buildPlayerGrid(room, panelX, panelY, gridPanelW)

    // -- Right: 2-tab chat panel ---------------------------------------------
    const chatX = panelX + gridPanelW + 8
    this._panel(chatX, panelY, chatW, panelH, { fill: BG_CARD, border: BORDER_LT, accentTop: true })

    let activeTab = 'room'
    const tabH = 32, tabW = chatW / 2

    const tabBg = this.add.graphics()
    this._add(tabBg)
    const tabRoomTxt  = this._add(this.add.text(chatX + tabW / 2,        panelY + tabH / 2, '🚀 Phòng', {
      fontSize: '11px', color: '#f8fafc', fontFamily: FONT, fontStyle: 'bold'
    }).setOrigin(0.5))
    const tabLobbyTxt = this._add(this.add.text(chatX + tabW + tabW / 2, panelY + tabH / 2, '💬 Lobby', {
      fontSize: '11px', color: '#64748b', fontFamily: FONT
    }).setOrigin(0.5))

    const drawTabs = () => {
      tabBg.clear()
      tabBg.fillStyle(activeTab === 'room'  ? BG_PANEL : 0x0a1525, 1)
      tabBg.fillRoundedRect(chatX + 2, panelY + 2, tabW - 1, tabH - 2, { tl: 8, tr: 0, bl: 0, br: 0 })
      tabBg.fillStyle(activeTab === 'lobby' ? BG_PANEL : 0x0a1525, 1)
      tabBg.fillRoundedRect(chatX + tabW + 1, panelY + 2, tabW - 3, tabH - 2, { tl: 0, tr: 8, bl: 0, br: 0 })
      if (activeTab === 'room')  { tabBg.lineStyle(2, TEAL, 0.9); tabBg.lineBetween(chatX + 2, panelY + tabH, chatX + tabW - 1, panelY + tabH) }
      if (activeTab === 'lobby') { tabBg.lineStyle(2, TEAL, 0.9); tabBg.lineBetween(chatX + tabW + 1, panelY + tabH, chatX + chatW - 2, panelY + tabH) }
      tabRoomTxt.setColor(activeTab === 'room'  ? '#f8fafc' : '#475569')
      tabLobbyTxt.setColor(activeTab === 'lobby' ? '#f8fafc' : '#475569')
    }
    drawTabs()

    const tabRoomZone = this.add.graphics()
    tabRoomZone.fillStyle(0xffffff, 0.001)
    tabRoomZone.fillRect(chatX + 2, panelY + 2, tabW - 1, tabH - 2)
    tabRoomZone.setInteractive(new Phaser.Geom.Rectangle(chatX + 2, panelY + 2, tabW - 1, tabH - 2), Phaser.Geom.Rectangle.Contains)
    tabRoomZone.on('pointerdown', () => {
      activeTab = 'room'; drawTabs()
      roomChatBox.container.setVisible(true); lobbyChatBox.container.setVisible(false)
    })
    this._add(tabRoomZone)

    const tabLobbyZone = this.add.graphics()
    tabLobbyZone.fillStyle(0xffffff, 0.001)
    tabLobbyZone.fillRect(chatX + tabW + 1, panelY + 2, tabW - 3, tabH - 2)
    tabLobbyZone.setInteractive(new Phaser.Geom.Rectangle(chatX + tabW + 1, panelY + 2, tabW - 3, tabH - 2), Phaser.Geom.Rectangle.Contains)
    tabLobbyZone.on('pointerdown', () => {
      activeTab = 'lobby'; drawTabs()
      roomChatBox.container.setVisible(false); lobbyChatBox.container.setVisible(true)
    })
    this._add(tabLobbyZone)

    const msgTop   = panelY + tabH + 4
    const cinH     = 32
    const voiceBtnH = 50  // Height for voice button area
    const cinY     = panelY + panelH - cinH - voiceBtnH - 12
    const msgAreaH = cinY - msgTop - 6
    const msgAreaW = chatW - 8

    const roomChatBox = createChatBox(this, {
      x: chatX + 4, y: msgTop, w: msgAreaW, h: msgAreaH,
      page: this._page, systemInLobby: true
    })
    this._chatBoxes.push(roomChatBox)

    const lobbyChatBox = createChatBox(this, {
      x: chatX + 4, y: msgTop, w: msgAreaW, h: msgAreaH,
      page: this._page, systemInLobby: false
    })
    lobbyChatBox.container.setVisible(false)
    this._chatBoxes.push(lobbyChatBox)

    // Voice chat button (above chat input)
    const voiceBtnY = panelY + panelH - voiceBtnH - 4
    const voiceBtn = createVoiceChatButton(this, chatX + 8, voiceBtnY, this._socket, room.id)
    voiceBtn.container.forEach(obj => this._add(obj))
    this._voiceBtn = voiceBtn

    // Chat input (at bottom)
    this._makeChatInput(chatX + 4, panelY + panelH - cinH - 4, chatW - 8, cinH, 'Nhắn tin...', (text) => {
      if (activeTab === 'room') this._send('roomChat', { text })
      else                      this._send('lobbyChat', { text })
    })

    // Socket listeners
    this._socket.off('roomChat')
    this._socket.on('roomChat', d => {
      roomChatBox.addMsg({
        name: d.name, color: d.color, text: d.text,
        system: d.system || false,
        isSelf: !d.system && d.senderId === this._myId,
        ts: d.ts || null
      })
    })
    this._socket.off('lobbyChat')
    this._socket.on('lobbyChat', d => {
      lobbyChatBox.addMsg({
        name: d.name, color: d.color, text: d.text,
        system: d.system || false,
        isSelf: !d.system && d.senderId === this._myId,
        ts: d.ts || null
      })
    })
    this._socket.off('chatHistory')
    this._socket.on('chatHistory', d => {
      if (d.channel === 'room')  roomChatBox.loadHistory(d.messages, this._myId)
      if (d.channel === 'lobby') lobbyChatBox.loadHistory(d.messages, this._myId)
    })
    this._send('getChatHistory', { channel: 'room',  roomId: room.id })
    this._send('getChatHistory', { channel: 'lobby' })

    // -- Bottom action bar ---------------------------------------------------
    this._actionBarContainer = this.add.container(0, 0)
    this._add(this._actionBarContainer)
    this._buildActionBar(room)
  }

  _buildPlayerGrid(room, panelX, panelY, gridPanelW) {
    const container = this._playerGridContainer
    container.removeAll(true)
    
    const cols = Math.min(5, room.maxPlayers)
    const cW = Math.floor((gridPanelW - 32) / cols), cH = 88
    const gX = panelX + 16, gY = panelY + 68

    for (let i = 0; i < room.maxPlayers; i++) {
      const col = i % cols, row = Math.floor(i / cols)
      const sx = gX + col * cW, sy = gY + row * (cH + 8)
      const p = room.players[i]
      const cardW = cW - 8
      const slotBg = this.add.graphics()
      if (p) {
        slotBg.fillStyle(BG_CARD, 1); slotBg.fillRoundedRect(sx, sy, cardW, cH, 8)
        slotBg.lineStyle(1, p.ready ? TEAL : BORDER, p.ready ? 0.9 : 0.4)
        slotBg.strokeRoundedRect(sx, sy, cardW, cH, 8)
        if (p.ready) { slotBg.fillStyle(TEAL, 1); slotBg.fillRoundedRect(sx, sy + 8, 3, cH - 16, 2) }
      } else {
        slotBg.fillStyle(BG_PANEL, 0.35); slotBg.fillRoundedRect(sx, sy, cardW, cH, 8)
        slotBg.lineStyle(1, BORDER, 0.18); slotBg.strokeRoundedRect(sx, sy, cardW, cH, 8)
      }
      container.add(slotBg)

      if (p) {
        const pInt = COLOR_INT[p.color] || 0xffffff
        const dotG = this.add.graphics()
        dotG.fillStyle(pInt, 0.15); dotG.fillCircle(sx + 18, sy + cH / 2, 16)
        container.add(dotG)
        container.add(this.add.circle(sx + 18, sy + cH / 2, 12, pInt))
        const crown = p.id === room.host ? ' 👑' : ''
        const meTxt = p.id === this._socketId ? ' (bạn)' : ''
        container.add(this.add.text(sx + 36, sy + cH / 2 - 11, p.name + crown + meTxt, {
          fontSize: '11px', color: '#f8fafc', fontFamily: FONT, fontStyle: 'bold',
          wordWrap: { width: cardW - 44 }
        }))
        container.add(this.add.text(sx + 36, sy + cH / 2 + 8, p.ready ? '✅ Sẵn sàng' : '⏳ Chờ', {
          fontSize: '10px', color: p.ready ? '#00e5cc' : '#475569', fontFamily: FONT
        }))
      } else {
        container.add(this.add.text(sx + cardW / 2, sy + cH / 2, 'Trống', {
          fontSize: '11px', color: '#1e3d6b', fontFamily: FONT
        }).setOrigin(0.5))
      }
    }
  }

  _buildActionBar(room) {
    const container = this._actionBarContainer
    container.removeAll(true)
    const { W, H } = this
    const barY = H - 52

    const barBg = this.add.graphics()
    barBg.fillStyle(0x030609, 1); barBg.fillRect(0, barY, W, 52)
    barBg.lineStyle(1, BORDER, 0.5); barBg.lineBetween(0, barY, W, barY)
    container.add(barBg)

    if (!this._isHost) {
      const myP = room.players.find(p => p.id === this._socketId)
      const isReady = myP?.ready || false
      
      const btnW = 220, btnH = 36, btnX = W / 2 - 110, btnY = barY + 8
      const bg = this.add.graphics()
      const fill = isReady ? TEAL : BG_CARD
      const fillH = isReady ? TEAL_DIM : BORDER_LT
      const draw = (hover) => {
        bg.clear(); bg.fillStyle(hover ? fillH : fill, 1)
        bg.fillRoundedRect(btnX, btnY, btnW, btnH, 8)
      }
      draw(false)
      bg.setInteractive(new Phaser.Geom.Rectangle(btnX, btnY, btnW, btnH), Phaser.Geom.Rectangle.Contains)
      bg.on('pointerover', () => draw(true))
      bg.on('pointerout',  () => draw(false))
      bg.on('pointerdown', () => {
        const cur = room.players.find(p => p.id === this._socketId)?.ready || false
        this._send('setReady', { ready: !cur }); safePlay(this, 'select')
      })
      container.add(bg)
      
      const lbl = this.add.text(W / 2, barY + 8 + 18, isReady ? '✅ Đã sẵn sàng' : '✋ Sẵn sàng', {
        fontSize: '14px', color: isReady ? '#000000' : '#f8fafc', fontFamily: FONT, fontStyle: 'bold'
      }).setOrigin(0.5)
      container.add(lbl)
    }

    if (this._isHost) {
      const nonHost = room.players.filter(p => p.id !== room.host)
      const allReady = nonHost.length > 0 && nonHost.every(p => p.ready)
      const canStart = room.players.length >= 2 && allReady
      
      const btnW = 220, btnH = 36, btnX = W / 2 - 110, btnY = barY + 8
      const bg = this.add.graphics()
      const fill = canStart ? GREEN : BG_CARD
      const fillH = canStart ? GREEN_D : BORDER
      const draw = (hover) => {
        bg.clear(); bg.fillStyle(hover ? fillH : fill, 1)
        bg.fillRoundedRect(btnX, btnY, btnW, btnH, 8)
      }
      draw(false)
      bg.setInteractive(new Phaser.Geom.Rectangle(btnX, btnY, btnW, btnH), Phaser.Geom.Rectangle.Contains)
      bg.on('pointerover', () => draw(true))
      bg.on('pointerout',  () => draw(false))
      bg.on('pointerdown', () => {
        if (!canStart) {
          this._showError(room.players.length < 2 ? 'Cần ít nhất 2 người' : 'Chờ tất cả sẵn sàng')
          return
        }
        this._send('startGame'); safePlay(this, 'roundstart')
      })
      container.add(bg)
      
      const lbl = this.add.text(W / 2, barY + 8 + 18, '▶ Bắt đầu trận', {
        fontSize: '14px', color: '#ffffff', fontFamily: FONT, fontStyle: 'bold'
      }).setOrigin(0.5)
      container.add(lbl)

      const statusMsg = room.players.length < 2
        ? 'Cần ít nhất 2 người chơi'
        : !allReady ? `Chờ ${nonHost.filter(p => !p.ready).length} người sẵn sàng...`
        : '✅ Tất cả sẵn sàng!'
      container.add(this.add.text(W / 2, barY + 46, statusMsg, {
        fontSize: '10px', color: canStart ? '#00e5cc' : '#475569', fontFamily: FONT
      }).setOrigin(0.5))
    }

    const leaveBtn = this._btn(W - 156, barY + 8, 136, 36, '← Rời phòng',
      { fill: RED, fillH: RED_D, textColor: '#ffffff', fontSize: '13px', radius: 8 })
    leaveBtn.onClick(() => { safePlay(this, 'back'); this._send('leaveRoom') })
    container.add(leaveBtn.bg)
  }

  _updateWaitingRoom(room) {
    if (this._page && this._playerGridContainer && this._actionBarContainer) {
      const PAD = 16
      const startY = 68 + 26
      const panelX = PAD, panelY = startY
      const chatW = 260
      const gridPanelW = this.W - PAD * 2 - chatW - 8
      
      if (this._roomPlayerCountText) {
        this._roomPlayerCountText.setText(`${room.players.length} / ${room.maxPlayers} người chơi`)
      }
      this._buildPlayerGrid(room, panelX, panelY, gridPanelW)
      this._buildActionBar(room)
    } else {
      this._showWaitingRoom(room)
    }
  }

  _startGame(msg) {
    this._clearPage()
    this.scene.start('Game', {
      playerColor: this.playerColor,
      playerName:  this.playerName,
      gameMode:    'multiplayer',
      isImposter:  msg.isImposter,
      roomId:      msg.roomId,
      socket:      this._socket,
      allPlayers:  msg.players
    })
  }
}
