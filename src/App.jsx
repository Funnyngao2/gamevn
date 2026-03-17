import React from 'react'
import { useAppStore } from './store.js'
import MenuView    from './views/MenuView.jsx'
import LobbyView   from './views/LobbyView.jsx'
import GameOverView from './views/GameOverView.jsx'
import PhaserGame  from './game/PhaserGame.jsx'

export default function App() {
  const view = useAppStore(s => s.view)

  return (
    <div className="w-screen h-screen bg-black overflow-hidden">
      {view === 'menu'     && <MenuView />}
      {view === 'lobby'    && <LobbyView />}
      {view === 'gameover' && <GameOverView />}
      {/* PhaserGame luôn mount nhưng ẩn khi không cần — giữ Phaser context */}
      <PhaserGame visible={view === 'game'} />
    </div>
  )
}
