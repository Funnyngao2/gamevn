// VoiceChatUI.js - Voice Chat UI Component for Phaser
import { VoiceChatManager } from '../utils/voiceChat.js'

export function createVoiceChatButton(scene, x, y, socket, roomId) {
  const BTN_W = 44
  const BTN_H = 44
  const TEAL = 0x00e5cc
  const RED = 0xef4444
  const BG_CARD = 0x111d30
  const BORDER = 0x1e3d6b
  
  let voiceManager = null
  let isActive = false
  let isMuted = false

  // Button background
  const btnBg = scene.add.graphics()
  const btnIcon = scene.add.text(x + BTN_W / 2, y + BTN_H / 2, '🎤', {
    fontSize: '20px',
    fontFamily: 'Roboto, Arial, sans-serif'
  }).setOrigin(0.5)

  const statusText = scene.add.text(x + BTN_W / 2, y + BTN_H + 8, 'Voice Off', {
    fontSize: '9px',
    color: '#64748b',
    fontFamily: 'Roboto, Arial, sans-serif'
  }).setOrigin(0.5, 0)

  const drawButton = (hover = false) => {
    btnBg.clear()
    
    if (isActive) {
      // Active state
      btnBg.fillStyle(isMuted ? RED : TEAL, 1)
      btnBg.fillCircle(x + BTN_W / 2, y + BTN_H / 2, BTN_W / 2)
      btnBg.lineStyle(2, isMuted ? RED : TEAL, 0.5)
      btnBg.strokeCircle(x + BTN_W / 2, y + BTN_H / 2, BTN_W / 2 + 3)
      btnIcon.setText(isMuted ? '🔇' : '🎤')
      statusText.setText(isMuted ? 'Muted' : 'Voice On').setColor(isMuted ? '#ef4444' : '#00e5cc')
    } else {
      // Inactive state
      btnBg.fillStyle(hover ? BORDER : BG_CARD, 1)
      btnBg.fillCircle(x + BTN_W / 2, y + BTN_H / 2, BTN_W / 2)
      btnBg.lineStyle(1, BORDER, 1)
      btnBg.strokeCircle(x + BTN_W / 2, y + BTN_H / 2, BTN_W / 2)
      btnIcon.setText('🎤')
      statusText.setText('Voice Off').setColor('#64748b')
    }
  }

  drawButton()

  // Make interactive
  btnBg.setInteractive(
    new Phaser.Geom.Circle(x + BTN_W / 2, y + BTN_H / 2, BTN_W / 2),
    Phaser.Geom.Circle.Contains
  )

  btnBg.on('pointerover', () => {
    if (!isActive) drawButton(true)
  })

  btnBg.on('pointerout', () => {
    drawButton(false)
  })

  btnBg.on('pointerdown', async () => {
    if (!isActive) {
      // Start voice chat
      voiceManager = new VoiceChatManager(socket, roomId)
      const success = await voiceManager.start()
      
      if (success) {
        isActive = true
        drawButton()
        console.log('Voice chat started')
      } else {
        // Show error
        statusText.setText('Mic Error').setColor('#ef4444')
        scene.time.delayedCall(2000, () => {
          if (!isActive) statusText.setText('Voice Off').setColor('#64748b')
        })
      }
    } else {
      // Toggle mute
      isMuted = voiceManager.toggleMute()
      drawButton()
    }
  })

  // Long press to turn off
  let pressTimer = null
  btnBg.on('pointerdown', () => {
    if (isActive) {
      pressTimer = scene.time.delayedCall(1000, () => {
        // Stop voice chat
        if (voiceManager) {
          voiceManager.destroy()
          voiceManager = null
        }
        isActive = false
        isMuted = false
        drawButton()
        console.log('Voice chat stopped')
      })
    }
  })

  btnBg.on('pointerup', () => {
    if (pressTimer) {
      pressTimer.remove()
      pressTimer = null
    }
  })

  // Cleanup function
  const destroy = () => {
    if (voiceManager) {
      voiceManager.destroy()
      voiceManager = null
    }
    btnBg.destroy()
    btnIcon.destroy()
    statusText.destroy()
  }

  return {
    container: [btnBg, btnIcon, statusText],
    destroy,
    isActive: () => isActive,
    isMuted: () => isMuted
  }
}
