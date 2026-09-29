import type { AppState, TriggerKey } from './types'

export interface ShortcutInput extends TriggerKey {
  edge: 'down' | 'up'
  modified: boolean
}

export interface ShortcutState {
  toggledVisible: boolean
  holdActive: boolean
  pressedTrigger: boolean
}

const RESERVED_KEY = /^(?:Escape|(?:Ctrl|Shift|Alt|Meta)(?:Right)?)$/i

// 配置只接受一个非修饰键或一个鼠标键；额外的 ctrl/shift 等字段也视为无效组合键。
export function isValidTriggerKey(value: unknown): value is TriggerKey {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const key = value as Record<string, unknown>
  return (key.device === 'keyboard' || key.device === 'mouse') &&
    typeof key.code === 'string' && key.code.length > 0 && key.code.length <= 32 &&
    Object.keys(key).every(name => name === 'device' || name === 'code') &&
    (key.device === 'mouse' ? /^[1-9]\d*$/.test(key.code) : !RESERVED_KEY.test(key.code))
}

export function createShortcutState(toggledVisible: boolean): ShortcutState {
  return { toggledVisible, holdActive: false, pressedTrigger: false }
}

export function transitionShortcutState(
  state: ShortcutState,
  input: ShortcutInput,
  config: Pick<AppState, 'triggerMode' | 'triggerKey'>
): ShortcutState {
  if (config.triggerMode === 'always') return state
  if (input.device !== config.triggerKey.device || input.code !== config.triggerKey.code) return state

  if (input.edge === 'up') {
    return state.pressedTrigger ? { ...state, pressedTrigger: false, holdActive: false } : state
  }
  if (state.pressedTrigger) return state

  // 首次按下带修饰键时仍记录按住状态，避免松开修饰键后的重复 keydown 意外触发。
  const next = { ...state, pressedTrigger: true }
  if (input.modified) return next
  if (config.triggerMode === 'hold') next.holdActive = true
  else next.toggledVisible = !next.toggledVisible
  return next
}

export function resolveVisibility(
  state: ShortcutState,
  mode: AppState['triggerMode'],
  holdBehavior: AppState['holdBehavior']
): boolean {
  if (mode === 'always') return true
  if (mode === 'hold') return holdBehavior === 'show' ? state.holdActive : !state.holdActive
  return state.toggledVisible
}
