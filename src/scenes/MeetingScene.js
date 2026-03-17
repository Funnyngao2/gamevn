// MeetingScene.js - discussion (15s/player turn) + vote phase (15s)
import { safePlay } from '../utils/safePlay.js'
import { PLAYER_COLORS } from '../config.js'
import { createDomInput } from '../utils/domInput.js'

export class MeetingScene extends Phaser.Scene {
  constructor() { super('Meeting') }

  init(data) {
    this.players    = data.players      || []
    this.localId    = data.localPlayerId
    this.reporterId = data.reporterId
    this.victimId   = data.victimId
    this.gameMode   = data.gameMode
    this.myVote     = null
    this.votes      = {}          // playerId → targetId | 'skip'
    this.voteCountTexts = {}
    this._phase     = 'discussion' // 'discussion' | 'vote'
    this._chatLog   = []
    this._chatInput = ''
    this._chatOpen  = false
  }

  create() {
    const { width, height } = this.scale
    safePlay(this, 'alarm_emergencymeeting')

    // Background
    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.82)

    // Panel
    const pw = 760, ph = 520
    const px = (width - pw) / 2, py = (height - ph) / 2
    this._panelX = px; this._panelY = py; this._panelW = pw; this._panelH = ph
    this.add.rectangle(px + pw / 2, py + ph / 2, pw, ph, 0x0d1117)
    this.add.rectangle(px + pw / 2, py + 2, pw, 4, 0x4fc3f7)

    // Title
    const who = this._getName(this.reporterId)
    const titleStr = this.victimId
      ? `${who} báo cáo xác chết!`
      : `${who} triệu tập họp khẩn!`
    this.add.text(width / 2, py + 22, titleStr, {
      fontSize: '18px', color: '#ffffff', stroke: '#000', strokeThickness: 2
    }).setOrigin(0.5)

    // Phase label + timer
    this._phaseLabel = this.add.text(px + 10, py + 48, '', {
      fontSize: '15px', color: '#4fc3f7'
    })
    this._timerText = this.add.text(px + pw - 10, py + 48, '', {
      fontSize: '15px', color: '#ffcc00'
    }).setOrigin(1, 0)

    // Player grid (left side)
    this._buildPlayerGrid()

    // Chat area (right side)
    this._buildChatArea()

    // Bottom bar
    this._buildBottomBar()

    // Start discussion phase
    this._startDiscussion()
  }

  // ── Player grid ────────────────────────────────────────────────────────────

  _buildPlayerGrid() {
    const { px, py } = { px: this._panelX, py: this._panelY }
    const alive = this.players.filter(p => p.alive)
    const dead  = this.players.filter(p => !p.alive)
    const all   = [...alive, ...dead]
    const cols  = 2, itemW = 170, itemH = 52, startX = px + 14, startY = py + 76

    this._playerRows = {}
    all.forEach((p, i) => {
      const col = i % cols, row = Math.floor(i / cols)
      const x = startX + col * (itemW + 8)
      const y = startY + row * (itemH + 4)

      const bg = this.add.rectangle(x + itemW / 2, y + itemH / 2, itemW, itemH,
        p.alive ? 0x1a2a3a : 0x1a1a1a, 0.9)
      this.add.circle(x + 18, y + itemH / 2, 13, this._colorHex(p.color))
      if (!p.alive) this.add.text(x + 18, y + itemH / 2, '☠', { fontSize: '14px', color: '#ff4444' }).setOrigin(0.5)

      this.add.text(x + 36, y + 8, p.name || p.color, {
        fontSize: '14px', color: p.alive ? '#ffffff' : '#666666'
      })

      const voteCount = this.add.text(x + 36, y + 28, '', { fontSize: '12px', color: '#aaaaaa' })
      this.voteCountTexts[p.id] = voteCount

      // Vote button (alive players only, shown in vote phase)
      if (p.alive && p.id !== this.localId) {
        const voteBtn = this.add.rectangle(x + itemW - 28, y + itemH / 2, 44, 28, 0x223344)
          .setInteractive({ useHandCursor: true }).setVisible(false)
        const voteBtnTxt = this.add.text(x + itemW - 28, y + itemH / 2, 'Vote', {
          fontSize: '12px', color: '#88ccff'
        }).setOrigin(0.5).setVisible(false)
        voteBtn.on('pointerover', () => voteBtn.setFillStyle(0x3355aa))
        voteBtn.on('pointerout',  () => voteBtn.setFillStyle(this.myVote === p.id ? 0x115511 : 0x223344))
        voteBtn.on('pointerdown', () => this._castVote(p.id))
        this._playerRows[p.id] = { bg, voteBtn, voteBtnTxt }
      } else {
        this._playerRows[p.id] = { bg }
      }
    })
  }

  // ── Chat area ──────────────────────────────────────────────────────────────

  _buildChatArea() {
    const px = this._panelX + 370, py = this._panelY + 70
    const cw = 370, ch = 340
    this.add.rectangle(px + cw / 2, py + ch / 2, cw, ch, 0x0a0f14, 0.95)
    this.add.rectangle(px + cw / 2, py, cw, 2, 0x334455)

    this._chatAreaX = px; this._chatAreaY = py
    this._chatAreaW = cw; this._chatAreaH = ch
    this._chatLineObjs = []

    // Speaker highlight
    this._speakerBadge = this.add.text(px + cw / 2, py - 14, '', {
      fontSize: '13px', color: '#ffff88', stroke: '#000', strokeThickness: 2
    }).setOrigin(0.5)
  }

  _addChatLine(name, text, color = '#ffffff', isSystem = false) {
    const px = this._chatAreaX + 6, ch = this._chatAreaH
    // Shift existing lines up
    this._chatLineObjs.forEach(o => { o.y -= 20 })
    while (this._chatLineObjs.length >= 16) {
      this._chatLineObjs.shift().destroy()
    }
    const prefix = isSystem ? '' : `${name}: `
    const obj = this.add.text(px, this._chatAreaY + ch - 20, `${prefix}${text}`, {
      fontSize: '13px', color: isSystem ? '#888888' : color,
      wordWrap: { width: this._chatAreaW - 12 }
    })
    this._chatLineObjs.push(obj)
  }

  // ── Bottom bar ─────────────────────────────────────────────────────────────

  _buildBottomBar() {
    const { width } = this.scale
    const py = this._panelY + this._panelH - 44

    // Chat input background
    this._inputBg = this.add.rectangle(width / 2 - 60, py + 22, 480, 34, 0x111a22, 0.95)
      .setInteractive()
    this._inputLabel = this.add.text(width / 2 - 290, py + 22, 'Chat:', {
      fontSize: '13px', color: '#888888'
    }).setOrigin(0, 0.5)
    this._inputDisplay = this.add.text(width / 2 - 250, py + 22, '', {
      fontSize: '14px', color: '#ffffff'
    }).setOrigin(0, 0.5)
    this._inputPlaceholder = this.add.text(width / 2 - 250, py + 22, 'Nhập tin nhắn...', {
      fontSize: '14px', color: '#334155'
    }).setOrigin(0, 0.5)

    // DOM input for proper Vietnamese IME support
    this._domInput = createDomInput(this, { maxLength: 60 })
    this._domInput.onValue(v => {
      this._chatInput = v
      this._inputDisplay.setText(v)
      this._inputPlaceholder.setVisible(v.length === 0)
    })
    this._domInput.onEnter(() => {
      const t = this._chatInput.trim()
      if (t) this._sendMeetingChat(t)
      this._domInput.setValue('')
      this._chatInput = ''
      this._inputDisplay.setText('')
      this._inputPlaceholder.setVisible(true)
    })

    // Click input area to focus
    this._inputBg.on('pointerdown', () => this._domInput.focus())

    // Skip vote button (vote phase only)
    this._skipBtn = this.add.rectangle(width / 2 + 200, py + 22, 100, 34, 0x332200)
      .setInteractive({ useHandCursor: true }).setVisible(false)
    this._skipBtnTxt = this.add.text(width / 2 + 200, py + 22, 'Bỏ qua', {
      fontSize: '14px', color: '#ffcc44'
    }).setOrigin(0.5).setVisible(false)
    this._skipBtn.on('pointerdown', () => this._castVote('skip'))
    this._skipBtn.on('pointerover', () => this._skipBtn.setFillStyle(0x554400))
    this._skipBtn.on('pointerout',  () => this._skipBtn.setFillStyle(0x332200))
  }

  _sendMeetingChat(text) {
    const me = this.players.find(p => p.id === this.localId)
    const nameColor = me ? this._colorHex(me.color) : 0xffffff
    const hexStr = '#' + nameColor.toString(16).padStart(6, '0')
    this._addChatLine(me?.name || 'Bạn', text, hexStr)
    const gs = this.scene.get('Game')
    if (gs?.ws?.connected) gs.ws.emit('meetingChat', { text })
  }

  // ── Discussion phase ───────────────────────────────────────────────────────

  _startDiscussion() {
    this._phase = 'discussion'
    this._aliveSpeakers = this.players.filter(p => p.alive).map(p => p.id)
    this._speakerIndex = 0
    this._addChatLine('', '── Giai đoạn thảo luận ──', '#4fc3f7', true)
    this._nextSpeaker()
  }

  _nextSpeaker() {
    if (this._speakerIndex >= this._aliveSpeakers.length) {
      this._startVote()
      return
    }
    const speakerId = this._aliveSpeakers[this._speakerIndex]
    const speaker = this.players.find(p => p.id === speakerId)
    const isMe = speakerId === this.localId
    const name = speaker?.name || '?'

    this._phaseLabel.setText(`💬 Thảo luận — lượt: ${name}`)
    this._speakerBadge.setText(isMe ? `🎤 Lượt bạn nói (15s)` : `🎤 ${name} đang nói...`)
    this._addChatLine('', `── Lượt ${name} ──`, '#666666', true)

    let t = 15
    this._timerText.setText(`${t}s`)
    if (this._speakerTimer) this._speakerTimer.remove()
    this._speakerTimer = this.time.addEvent({
      delay: 1000, repeat: 14,
      callback: () => {
        t--
        this._timerText.setText(`${t}s`)
        if (t <= 0) {
          this._speakerIndex++
          this._nextSpeaker()
        }
      }
    })
  }

  // ── Vote phase ─────────────────────────────────────────────────────────────

  _startVote() {
    this._phase = 'vote'
    if (this._speakerTimer) this._speakerTimer.remove()
    this._speakerBadge.setText('')
    this._phaseLabel.setText('🗳 Bỏ phiếu')
    this._addChatLine('', '── Giai đoạn bỏ phiếu (15s) ──', '#ffcc44', true)

    // Show vote buttons
    Object.values(this._playerRows).forEach(row => {
      row.voteBtn?.setVisible(true)
      row.voteBtnTxt?.setVisible(true)
    })
    this._skipBtn.setVisible(true)
    this._skipBtnTxt.setVisible(true)

    let t = 15
    this._timerText.setText(`${t}s`)
    this._voteTimer = this.time.addEvent({
      delay: 1000, repeat: 14,
      callback: () => {
        t--
        this._timerText.setText(`${t}s`)
        if (t <= 0) this._endVoting()
      }
    })
  }

  // ── Voting ─────────────────────────────────────────────────────────────────

  _castVote(targetId) {
    if (this._phase !== 'vote' || this.myVote !== null) return
    const me = this.players.find(p => p.id === this.localId)
    if (!me?.alive) return

    this.myVote = targetId
    this.votes[this.localId] = targetId
    safePlay(this, 'votescreen_avote')
    this._updateVoteCounts()

    // Highlight voted row
    if (targetId !== 'skip' && this._playerRows[targetId]) {
      this._playerRows[targetId].bg?.setFillStyle(0x115511)
      this._playerRows[targetId].voteBtn?.setFillStyle(0x115511)
    }

    const gs = this.scene.get('Game')
    if (gs?.ws?.connected) gs.ws.emit('vote', { targetId })
  }

  _updateVoteCounts() {
    const counts = {}
    Object.values(this.votes).forEach(v => { counts[v] = (counts[v] || 0) + 1 })
    Object.entries(this.voteCountTexts).forEach(([id, txt]) => {
      const c = counts[id] || 0
      txt.setText(c > 0 ? `${c} phiếu` : '')
    })
  }

  _endVoting() {
    if (this._voteTimer) this._voteTimer.remove()
    safePlay(this, 'votescreen_locking')

    const counts = {}
    Object.values(this.votes).forEach(v => { counts[v] = (counts[v] || 0) + 1 })

    const totalVotes = Object.values(counts).reduce((a, b) => a + b, 0)
    const skipVotes  = counts['skip'] || 0

    // Find max non-skip votes
    let maxVotes = 0, ejectedId = null, tied = false
    Object.entries(counts).forEach(([id, c]) => {
      if (id === 'skip') return
      if (c > maxVotes) { maxVotes = c; ejectedId = Number(id); tied = false }
      else if (c === maxVotes && maxVotes > 0) { tied = true }
    })

    // Tie or majority skip → no ejection
    if (tied || skipVotes > totalVotes / 2 || maxVotes === 0) ejectedId = null

    const ejected = ejectedId ? this.players.find(p => p.id === ejectedId) : null
    let resultMsg
    if (ejected) {
      resultMsg = ejected.isImposter
        ? `${ejected.name} bị loại! (Là Sát Nhân ☠)`
        : `${ejected.name} bị loại! (Không phải Sát Nhân)`
    } else if (tied) {
      resultMsg = 'Hòa phiếu — không ai bị loại!'
    } else {
      resultMsg = 'Đa số bỏ qua — không ai bị loại!'
    }

    const { width, height } = this.scale
    const overlay = this.add.rectangle(width / 2, height / 2, width, 90, 0x000000, 0.92)
    this.add.text(width / 2, height / 2, resultMsg, {
      fontSize: '22px', color: ejected ? (ejected.isImposter ? '#ff4444' : '#ffcc44') : '#aaaaaa',
      stroke: '#000', strokeThickness: 4
    }).setOrigin(0.5)

    this.time.delayedCall(3500, () => {
      this._domInput?.destroy()
      this.events.emit('meetingEnd', ejectedId)
      this.scene.stop()
    })
  }

  // ── Server messages ────────────────────────────────────────────────────────

  receiveVote(voterId, targetId) {
    if (this.votes[voterId] !== undefined) return
    this.votes[voterId] = targetId
    this._updateVoteCounts()
  }

  receiveMeetingChat(senderId, text) {
    const p = this.players.find(pl => pl.id === senderId)
    if (!p) return
    const hexStr = '#' + this._colorHex(p.color).toString(16).padStart(6, '0')
    this._addChatLine(p.name, text, hexStr)
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  _getName(id) {
    return this.players.find(p => p.id === id)?.name || 'Ai đó'
  }

  _colorHex(color) {
    return PLAYER_COLORS[color] ?? 0xffffff
  }
}
