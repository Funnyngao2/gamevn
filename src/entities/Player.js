// Player.js - local and remote player entity
import Phaser from 'phaser'
import { PLAYER_SPEED } from '../config.js'

// Sprite sheet layout: 3 cols × 4 rows, 32×32
// Row 0 (Down):  frames 0,1,2  — idle = frame 1
// Row 1 (Left):  frames 3,4,5  — idle = frame 4
// Row 2 (Right): frames 6,7,8  — idle = frame 7
// Row 3 (Up):    frames 9,10,11 — idle = frame 10
const DIR_FRAMES = {
  down:  { frames: [0, 1, 2],    idle: 1  },
  left:  { frames: [3, 4, 5],    idle: 4  },
  right: { frames: [6, 7, 8],    idle: 7  },
  up:    { frames: [9, 10, 11],  idle: 10 },
}

// Lerp factor per frame — higher = snappier, lower = smoother
// Delta-time based: target 60fps, lerp speed = 12 → rất mượt
const LERP_SPEED = 12

export class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, color, isLocal = true) {
    super(scene, x, y, `char_${color}`, 1)  // frame 1 = idle down
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

    // Scale character up so players are readable on the large map.
    this.setScale(2)
    this.body.setSize(20, 20).setOffset(6, 10)
    this.setDepth(2)

    // Name label
    this.nameLabel = scene.add.text(x, y - 40, '', {
      fontSize: '18px', color: '#ffffff', stroke: '#000', strokeThickness: 4
    }).setOrigin(0.5).setDepth(3)

    this._buildAnims(scene, color)
    this._dir = 'down'
    this.play(`${color}_idle_${this._dir}`)

    this._moving = false
    this._footTimer = 0
    this._footIndex = 0

    // Remote interpolation targets
    this._targetX = x
    this._targetY = y
  }

  _buildAnims(scene, color) {
    const key = `char_${color}`
    Object.entries(DIR_FRAMES).forEach(([dir, { frames, idle }]) => {
      const walkKey = `${color}_walk_${dir}`
      if (!scene.anims.exists(walkKey)) {
        scene.anims.create({
          key: walkKey,
          frames: frames.map(f => ({ key, frame: f })),
          frameRate: 10,
          repeat: -1,
        })
      }
      const idleKey = `${color}_idle_${dir}`
      if (!scene.anims.exists(idleKey)) {
        scene.anims.create({
          key: idleKey,
          frames: [{ key, frame: idle }],
          frameRate: 1,
        })
      }
    })
  }

  setName(name) {
    this.playerName = name
    this.nameLabel.setText(name)
  }

  // Called every frame by GameScene.update() for local player
  // moveStick: { x, y } từ joystick ảo — mỗi trục ~[-1,1], độ lớn theo kéo ra mép vòng
  update(cursors, time, moveStick = null) {
    if (!this.isLocal) return

    let vx = 0, vy = 0
    const sx = moveStick?.x ?? 0
    const sy = moveStick?.y ?? 0
    const stickMag2 = sx * sx + sy * sy
    const STICK_DEAD2 = 0.015

    if (stickMag2 > STICK_DEAD2) {
      vx = sx * PLAYER_SPEED
      vy = sy * PLAYER_SPEED
      if (Math.abs(sx) >= Math.abs(sy)) this._dir = sx > 0 ? 'right' : 'left'
      else this._dir = sy > 0 ? 'down' : 'up'
    } else {
      if (cursors.left.isDown || cursors.a?.isDown) { vx = -PLAYER_SPEED; this._dir = 'left' }
      else if (cursors.right.isDown || cursors.d?.isDown) { vx = PLAYER_SPEED; this._dir = 'right' }

      if (cursors.up.isDown || cursors.w?.isDown) { vy = -PLAYER_SPEED; this._dir = 'up' }
      else if (cursors.down.isDown || cursors.s?.isDown) { vy = PLAYER_SPEED; this._dir = 'down' }

      if (vx !== 0 && vy !== 0) { vx *= 0.707; vy *= 0.707 }
    }

    this._moving = vx !== 0 || vy !== 0

    if (this.alive) {
      this.setVelocity(vx, vy)
    } else {
      // Ghost movement is manual because the physics body is disabled to pass through walls.
      const dt = (this.scene?.game?.loop?.delta || 16.67) / 1000
      this.x += vx * dt
      this.y += vy * dt
      const bounds = this.scene?.physics?.world?.bounds
      if (bounds) {
        this.x = Phaser.Math.Clamp(this.x, bounds.x, bounds.x + bounds.width)
        this.y = Phaser.Math.Clamp(this.y, bounds.y, bounds.y + bounds.height)
      }
    }

    if (this._moving) {
      this.play(`${this.color}_walk_${this._dir}`, true)
      if (this.alive && time - this._footTimer > 300) {
        this._footTimer = time
        this._footIndex = (this._footIndex + 1) % 8
        const key = `footstep0${this._footIndex + 1}`
        if (this.scene.cache.audio.has(key)) {
          this.scene.sound.play(key, { volume: 0.25 })
        }
      }
    } else {
      this.play(`${this.color}_idle_${this._dir}`, true)
    }

    this.nameLabel.setPosition(this.x, this.y - 54)
  }

  // Called every frame by GameScene.update() for remote players — smooth lerp
  updateRemote(delta = 16.67) {
    if (this.isLocal) return

    const dx = this._targetX - this.x
    const dy = this._targetY - this.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist < 0.5) {
      this.x = this._targetX
      this.y = this._targetY
      if (this.alive && !this._isGhost) this.play(`${this.color}_idle_${this._dir}`, true)
    } else if (dist > 300) {
      // Teleport nếu quá xa
      this.x = this._targetX
      this.y = this._targetY
    } else {
      // Delta-time based lerp — mượt bất kể framerate
      const t = 1 - Math.pow(1 - LERP_SPEED / 1000, delta)
      this.x += dx * t
      this.y += dy * t
      
      // Update animation based on movement direction during lerp
      if (this.alive && !this._isGhost) {
        const absDx = Math.abs(dx), absDy = Math.abs(dy)
        if (absDx > absDy) this._dir = dx > 0 ? 'right' : 'left'
        else this._dir = dy > 0 ? 'down' : 'up'
        this.play(`${this.color}_walk_${this._dir}`, true)
      }
    }

    this.nameLabel.setPosition(this.x, this.y - 54)
  }

  // Called when server sends new position data — only updates target, no teleport
  syncRemote(data) {
    this.isImposter = data.imposter
    this.tasksCompleted = data.tasks
    this.alive = data.alive !== false && data.isGhost !== true

    // Update interpolation target
    this._targetX = data.x
    this._targetY = data.y

    if (!this.alive) {
      if (!this._isGhost) this.becomeGhost()
      return
    }

    this._isGhost = false
    this.setAlpha(1)
    this.setTint(0xffffff)
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
