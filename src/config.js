// Game constants - mirrors settings.py
export const WIDTH = 1280
export const HEIGHT = 640
export const FPS = 60
export const TILESIZE = 32
export const PLAYER_SPEED = 400
export const NO_OF_MISSIONS = 6
export const NO_OF_BOTS = 9

export const KILL_COOLDOWN = 16000      // ms - 16s cooldown after each kill
export const SABOTAGE_COOLDOWN = 30000  // ms
export const VENT_COOLDOWN = 10000      // ms
export const MEETING_COOLDOWN = 20000   // ms
export const REACTOR_CRITICAL_TIME = 20000 // ms

export const COLORS = ['red','blue','green','orange','yellow','pink','black','brown','purple','white']

export const PLAYER_COLORS = {
  red:    0xe74c3c, blue:   0x3b82f6, green:  0x22c55e, orange: 0xf97316,
  yellow: 0xeab308, pink:   0xec4899, black:  0x94a3b8, brown:  0xb45309,
  purple: 0xa855f7, white:  0xf1f5f9
}

export const PLAYER_COLORS_HEX = {
  red:    '#e74c3c', blue:   '#3b82f6', green:  '#22c55e', orange: '#f97316',
  yellow: '#eab308', pink:   '#ec4899', black:  '#94a3b8', brown:  '#b45309',
  purple: '#a855f7', white:  '#f1f5f9'
}
