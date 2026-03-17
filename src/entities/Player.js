// Player.js - local and remote player entity
import { PLAYER_SPEED } from '../config.js'

// Frame counts per direction (matches actual assets)
const FRAME_COUNTS = {
  down_walk: 18, up_walk: 17, left_walk: 17, right_walk: 17
}
// Colors with only 1 frame per direction
const SINGLE_FRAME_COLORS = new Set(['black','brown','pink','purple','white'])

// Lerp factor per frame — higher = snappier, lower = smoother
// At 60fps, 0.2 means ~3 frames to close 50% of the gap → very smooth
const LERP = 0.2

export class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, color, isLocal = true) {
    super(scene, x, y, `${color}_down_walk_1`)
    scene.add.existing(this)
    scene.physics.add.existing(this)

    this.color = color
    this.isLocal = isLocal
    this.alive = true
    this.isImposter = false
    this.tasksCompleted = 0
    this.voted = null
    this.gotVotes = 0
    this.playerId = null
    this.playerName = ''

    this.body.setSize(30, 30).setOffset(12, 30)
    this.setDepth(2)

    // Name label
    this.nameLabel = scene.add.text(x, y - 40, '', {
      fontSize: '14px', color: '#ffffff', stroke: '#000', strokeThickness: 3
    }).setOrigin(0.5).setDepth(3)

    this._buildAnims(scene, color)
    this.play(`${color}_walk_down`)

    this._dir = 'down'
    this._moving = false
    this._footTimer = 0
    this._footIndex = 0

    // Remote interpolation targets
    this._targetX = x
    this._targetY = y
  }

  _buildAnims(scene, color) {
    const isSingle = SINGLE_FRAME_COLORS.has(color)
    const dirMap = { down: 'down_walk', up: 'up_walk', left: 'left_walk', right: 'right_walk' }
    Object.entries(dirMap).forEach(([dir, folder]) => {
      const key = `${color}_walk_${dir}`
      if (!scene.anims.exists(key)) {
        const count = isSingle ? 1 : FRAME_COUNTS[folder]
        const frames = []
        for (let f = 1; f <= count; f++) frames.push({ key: `${color}_${folder}_${f}` })
        scene.anims.create({ key, frames, frameRate: count > 1 ? 10 : 1, repeat: -1 })
      }
    })
    const idleKey = `${color}_idle`
    if (!scene.anims.exists(idleKey)) {
      scene.anims.create({ key: idleKey, frames: [{ key: `${color}_down_walk_1` }], frameRate: 1 })
    }
  }

  setName(name) {
    this.playerName = name
    this.nameLabel.setText(name)
  }

  // Called every frame by GameScene.update() for local player
  update(cursors, time) {
    if (!this.isLocal || !this.alive) return

    let vx = 0, vy = 0

    if (cursors.left.isDown  || cursors.a?.isDown) { vx = -PLAYER_SPEED; this._dir = 'left' }
    if (cursors.right.isDown || cursors.d?.isDown) { vx =  PLAYER_SPEED; this._dir = 'right' }
    if (cursors.up.isDown    || cursors.w?.isDown) { vy = -PLAYER_SPEED; this._dir = 'up' }
    if (cursors.down.isDown  || cursors.s?.isDown) { vy =  PLAYER_SPEED; this._dir = 'down' }

    if (vx !== 0 && vy !== 0) { vx *= 0.707; vy *= 0.707 }

    this.setVelocity(vx, vy)
    this._moving = vx !== 0 || vy !== 0

    if (this._moving) {
      this.play(`${this.color}_walk_${this._dir}`, true)
      if (time - this._footTimer > 350) {
        this._footTimer = time
        this._footIndex = (this._footIndex + 1) % 8
        const key = `footstep0${this._footIndex + 1}`
        if (this.scene.cache.audio.has(key)) {
          this.scene.sound.play(key, { volume: 0.3 })
        }
      }
    } else {
      this.play(`${this.color}_idle`, true)
    }

    this.nameLabel.setPosition(this.x, this.y - 40)
  }

  // Called every frame by GameScene.update() for remote players — smooth lerp
  updateRemote() {
    if (this.isLocal) return

    const dx = this._targetX - this.x
    const dy = this._targetY - this.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist < 1) {
      // Close enough — snap and stop
      this.x = this._targetX
      this.y = this._targetY
    } else if (dist > 300) {
      // Too far (teleport / respawn) — snap immediately
      this.x = this._targetX
      this.y = this._targetY
    } else {
      // Lerp toward target
      this.x += dx * LERP
      this.y += dy * LERP
    }

    this.nameLabel.setPosition(this.x, this.y - 40)
  }

  // Called when server sends new position data — only updates target, no teleport
  syncRemote(data) {
    this.isImposter = data.imposter
    this.tasksCompleted = data.tasks

    // Update interpolation target
    this._targetX = data.x
    this._targetY = data.y

    // Update animation based on movement direction toward target
    const dx = data.x - this.x
    const dy = data.y - this.y
    const moving = Math.abs(dx) > 2 || Math.abs(dy) > 2

    if (!data.alive) return  // ghost: position handled by updateRemote, no anim change

    this.alive = true

    if (moving) {
      const absDx = Math.abs(dx), absDy = Math.abs(dy)
      const dir = absDx > absDy ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up')
      this.play(`${this.color}_walk_${dir}`, true)
    } else {
      this.play(`${this.color}_idle`, true)
    }
  }

  die() {
    this.alive = false
    this.setVelocity(0, 0)
    if (this.body) this.body.enable = false
    this.setTexture(`${this.color}_dead`)
    this.nameLabel.setAlpha(0.5)
  }

  becomeGhost() {
    if (this.isLocal) return  // local ghost handled by GameScene._becomeGhost
    if (this._isGhost) return  // guard: don't re-apply every frame
    this._isGhost = true
    this.alive = false
    if (this.body) this.body.enable = false
    this.setVelocity(0, 0)
    this.setAlpha(0.4)
    this.setTint(0x8888ff)
    this.nameLabel.setAlpha(0.4)
    this.nameLabel.setColor('#aaaaff')
  }

  destroy() {
    this.nameLabel?.destroy()
    super.destroy()
  }
}
