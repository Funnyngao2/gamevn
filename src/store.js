import { create } from 'zustand'

// view: 'menu' | 'lobby' | 'game' | 'gameover'
export const useAppStore = create((set) => ({
  view:        'menu',
  playerName:  '',
  playerColor: 'red',
  roomId:      null,
  currentRoom: null,   // Lưu thông tin phòng hiện tại
  isHost:      false,  // Lưu vai trò chủ phòng
  gameData:    null,   // { isImposter, players, roomId }
  gameResult:  null,   // { winner, roomId }
  gameAlert:   null,   // { text, type, duration }
  gamePrompt:  null,   // { text }
  activeTask:  null,   // { id, name }

  setActiveTask:  (activeTask) => set({ activeTask }),
  setGameAlert:   (gameAlert)  => set({ gameAlert }),
  setGamePrompt:  (gamePrompt) => set({ gamePrompt }),
  setView:        (view)        => set({ view }),
  setProfile:     (name, color) => set({ playerName: name, playerColor: color }),
  setRoom:        (roomId)      => set({ roomId }),
  setCurrentRoom: (room)        => set({ currentRoom: room }),
  setIsHost:      (isHost)      => set({ isHost }),
  startGame:      (gameData)    => set({ view: 'game', gameData, currentRoom: null }),
  endGame:        (gameResult)  => set({ view: 'gameover', gameResult }),
  returnToLobby:  ()            => set({ view: 'lobby', gameData: null, gameResult: null }),
}))
