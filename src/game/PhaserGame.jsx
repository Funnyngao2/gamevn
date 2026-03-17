import React, { useEffect, useRef } from 'react'
import { useAppStore } from '../store.js'
import { getSocket } from '../socket.js'

export default function PhaserGame({ visible }) {
  const containerRef = useRef(null)
  const gameRef      = useRef(null)
  const { gameData, playerName, playerColor, endGame } = useAppStore()

  useEffect(() => {
    if (!visible || !gameData) return

    let game = gameRef.current

    const launchGame = (Phaser, scenes) => {
      if (game) {
        // Restart existing game with new scene
        game.destroy(true)
        gameRef.current = null
      }

      const { PreloadScene, GameScene, TaskScene, MeetingScene } = scenes

      game = new Phaser.Game({
        type: Phaser.AUTO,
        width: window.innerWidth,
        height: window.innerHeight,
        backgroundColor: '#000000',
        parent: containerRef.current,
        physics: { default: 'arcade', arcade: { debug: false } },
        scene: [PreloadScene, GameScene, MeetingScene, TaskScene],
      })

      // Pass data to GameScene via registry
      game.registry.set('playerName',  playerName)
      game.registry.set('playerColor', playerColor)
      game.registry.set('isImposter',  gameData.isImposter)
      game.registry.set('roomId',      gameData.roomId)
      game.registry.set('allPlayers',  gameData.players)
      game.registry.set('socket',      getSocket())
      game.registry.set('onGameEnd',   (winner) => endGame({ winner, roomId: gameData.roomId }))

      gameRef.current = game
    }

    // Lazy import Phaser + scenes only when entering game
    Promise.all([
      import('phaser'),
      import('./scenes/PreloadScene.js'),
      import('./scenes/GameScene.js'),
      import('./scenes/TaskScene.js'),
      import('./scenes/MeetingScene.js'),
    ]).then(([{ default: Phaser }, { PreloadScene }, { GameScene }, { TaskScene }, { MeetingScene }]) => {
      launchGame(Phaser, { PreloadScene, GameScene, TaskScene, MeetingScene })
    })

    return () => {
      // Don't destroy on hide — keep game alive for performance
    }
  }, [visible, gameData])

  // Destroy when component unmounts
  useEffect(() => {
    return () => { gameRef.current?.destroy(true) }
  }, [])

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ display: visible ? 'block' : 'none' }}
    />
  )
}
