import Phaser from 'phaser'
import { BootScene } from './scenes/BootScene.js'
import { PreloadScene } from './scenes/PreloadScene.js'
import { MenuScene } from './scenes/MenuScene.js'
import { LobbyScene } from './scenes/LobbyScene.js'
import { GameScene } from './scenes/GameScene.js'
import { MeetingScene } from './scenes/MeetingScene.js'
import { GameOverScene } from './scenes/GameOverScene.js'
import { TaskScene } from './scenes/TaskScene.js'

const config = {
  type: Phaser.AUTO,
  width: 1280,
  height: 640,
  backgroundColor: '#000000',
  physics: {
    default: 'arcade',
    arcade: { debug: false }
  },
  scene: [BootScene, PreloadScene, MenuScene, LobbyScene, GameScene, MeetingScene, GameOverScene, TaskScene]
}

new Phaser.Game(config)
