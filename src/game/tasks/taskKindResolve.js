import { TASK_MINIGAME_KINDS } from './taskRegistry.js'

const VALID = new Set(TASK_MINIGAME_KINDS)

/**
 * Tên object trên map (hoặc kind cũ) → kind mini-game chuẩn.
 * Ví dụ: fuel_engine_upper → fuel_engine → fuel_engines
 */
export const TASK_KIND_ALIASES = {
  fuel_engine: 'fuel_engines',
  reboot_wifi: 'upload_data',
  stabilize_nav: 'stabilize_steering',
  scan_manifest: 'inspect_sample',
  task: 'fix_wiring',
}

export function resolveTaskKind(kind) {
  const raw = String(kind || 'task').trim()
  const step1 = TASK_KIND_ALIASES[raw] || raw
  if (VALID.has(step1)) return step1
  return 'fix_wiring'
}
