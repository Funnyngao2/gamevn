// GameOverScene.js - pure graphics, no image assets
export class GameOverScene extends Phaser.Scene {
  constructor() { super('GameOver') }

  init(data) {
    this.winner        = data.winner
    this.playerColor   = data.playerColor   || 'red'
    this.playerName    = data.playerName    || 'Player'
    this.socket        = data.socket        || null
    this.roomId        = data.roomId        || null
  }

  create() {
    const { width, height } = this.scale
    const isCrew = this.winner === 'crew'
    const isLeft = this.winner === null  // ghost left early
    const bgColor  = isCrew ? 0x0a1a2e : isLeft ? 0x111111 : 0x1a0a0a
    const accColor = isCrew ? 0x44ff88  : isLeft ? 0x888888 : 0xff4444

    this.add.rectangle(width / 2, height / 2, width, height, bgColor)

    // Stars
    for (let i = 0; i < 60; i++) {
      const star = this.add.circle(
        Phaser.Math.Between(0, width), Phaser.Math.Between(0, height),
        Phaser.Math.Between(1, 3), 0xffffff, Phaser.Math.FloatBetween(0.2, 0.8))
      this.tweens.add({ targets: star, alpha: 0, duration: Phaser.Math.Between(800, 2000),
        yoyo: true, repeat: -1, delay: Phaser.Math.Between(0, 1500) })
    }

    // Icon
    const iconY = height / 2 - 80
    const icon = isLeft ? '🚪' : isCrew ? '✓' : '☠'
    const iconBg = this.add.circle(width / 2, iconY, 60, accColor)
    this.add.text(width / 2, iconY, icon, { fontSize: '72px', color: '#000' }).setOrigin(0.5)
    this.tweens.add({ targets: iconBg, scaleX: 1.1, scaleY: 1.1, yoyo: true, repeat: -1, duration: 800 })

    // Result text
    const label = isLeft ? 'Bạn đã rời trận' : isCrew ? 'CREWMATES THẮNG!' : 'IMPOSTOR THẮNG!'
    const resultText = this.add.text(width / 2, height / 2 + 20, label, {
      fontSize: '48px', color: `#${accColor.toString(16).padStart(6, '0')}`,
      stroke: '#000', strokeThickness: 5, fontStyle: 'bold'
    }).setOrigin(0.5).setAlpha(0)
    this.tweens.add({ targets: resultText, alpha: 1, y: height / 2 + 10, duration: 600, ease: 'Back.Out' })

    // Sub text
    const sub = isLeft ? '' : isCrew ? 'Tất cả nhiệm vụ hoàn thành!' : 'Kẻ phản bội đã chiến thắng!'
    if (sub) this.time.delayedCall(400, () => {
      this.add.text(width / 2, height / 2 + 80, sub, {
        fontSize: '22px', color: '#cccccc', stroke: '#000', strokeThickness: 3
      }).setOrigin(0.5)
    })

    // Buttons
    const btnY = height / 2 + 160

    // Back to lobby button (if we have socket)
    if (this.socket) {
      const lobbyBg = this.add.rectangle(width / 2 - 130, btnY, 220, 50, accColor, 0.9)
        .setInteractive({ useHandCursor: true })
      const lobbyTxt = this.add.text(width / 2 - 130, btnY, '↩ Quay lại phòng', {
        fontSize: '20px', color: '#000', stroke: '#00000044', strokeThickness: 1
      }).setOrigin(0.5)
      lobbyBg.on('pointerover', () => lobbyBg.setFillStyle(0xffffff, 0.9))
      lobbyBg.on('pointerout',  () => lobbyBg.setFillStyle(accColor, 0.9))
      lobbyBg.on('pointerdown', () => {
        this.scene.start('Lobby', {
          playerColor: this.playerColor,
          playerName:  this.playerName,
          socket:      this.socket,
          roomId:      this.roomId
        })
      })
    }

    // Main menu button
    const menuX = this.socket ? width / 2 + 130 : width / 2
    const menuBg = this.add.rectangle(menuX, btnY, 200, 50, 0x333333, 0.9)
      .setInteractive({ useHandCursor: true })
    const menuTxt = this.add.text(menuX, btnY, 'MENU CHÍNH', {
      fontSize: '20px', color: '#ffffff', stroke: '#000', strokeThickness: 2
    }).setOrigin(0.5)
    menuBg.on('pointerover', () => { menuBg.setFillStyle(accColor, 0.9); menuTxt.setColor('#000') })
    menuBg.on('pointerout',  () => { menuBg.setFillStyle(0x333333, 0.9); menuTxt.setColor('#fff') })
    menuBg.on('pointerdown', () => { this.socket?.disconnect(); this.scene.start('Menu') })

    // Countdown auto-return to lobby (or menu if no lobby)
    let countdown = 15
    const timerText = this.add.text(width / 2, height / 2 + 230,
      `Tự động quay lại phòng: ${countdown}s`, { fontSize: '14px', color: '#888888' }).setOrigin(0.5)

    this.time.addEvent({
      delay: 1000, repeat: 14,
      callback: () => {
        if (!this.scene.isActive('GameOver')) return  // scene đã bị destroy
        countdown--
        timerText.setText(`Tự động quay lại phòng: ${countdown}s`)
        if (countdown <= 0) {
          if (this.socket) {
            this.scene.start('Lobby', {
              playerColor: this.playerColor, playerName: this.playerName,
              socket: this.socket, roomId: this.roomId
            })
          } else {
            this.scene.start('Menu')
          }
        }
      }
    })
  }
}
