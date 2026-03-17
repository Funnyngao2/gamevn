import { create } from 'zustand'

// view: 'menu' | 'lobby' | 'game' | 'gameover'
export const useAppStore = create((set) => ({
  view:        'menu',
  playerName:  '',
  playerColor: 'red',
  roomId:      null,
  gameData:    null,   // { isImposter, players, roomId }
  gameResult:  null,   // { winner, roomId }

  setView:        (view)        => set({ view }),
  setProfile:     (name, color) => set({ playerName: name, playerColor: color }),
  setRoom:        (roomId)      => set({ roomId }),
  startGame:      (gameData)    => set({ view: 'game', gameData }),
  endGame:        (gameResult)  => set({ view: 'gameover', gameResult }),
  returnToLobby:  ()            => set({ view: 'lobby', gameData: null, gameResult: null }),
}))
