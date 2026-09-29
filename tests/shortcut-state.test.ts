import assert from 'node:assert/strict'
import test from 'node:test'
import { createDefaultState } from '../src/shared/defaults.ts'
import {
  createShortcutState,
  isValidTriggerKey,
  resolveVisibility,
  transitionShortcutState
} from '../src/shared/shortcut-state.ts'
import type { ShortcutInput } from '../src/shared/shortcut-state.ts'

// 覆盖单键映射、按下去重、按住显隐及组合键拒绝规则。
const key = (code: string, edge: 'down' | 'up', modified = false): ShortcutInput => ({
  device: 'keyboard' as const,
  code,
  edge,
  modified
})
const mouse = (code: string, edge: 'down' | 'up'): ShortcutInput => ({
  device: 'mouse',
  code,
  edge,
  modified: false
})

test('toggle reacts once per bare key press and restores after another press', () => {
  const state = createDefaultState()
  let input = createShortcutState(true)
  input = transitionShortcutState(input, key('F8', 'down'), state)
  assert.equal(input.toggledVisible, false)
  assert.equal(transitionShortcutState(input, key('F8', 'down'), state).toggledVisible, false)
  input = transitionShortcutState(input, key('F8', 'up'), state)
  input = transitionShortcutState(input, key('F8', 'down'), state)
  assert.equal(resolveVisibility(input, 'toggle', 'show'), true)
})

test('hold-show and hold-hide apply only while the trigger is down', () => {
  const state = createDefaultState()
  state.triggerMode = 'hold'
  let input = createShortcutState(false)
  assert.equal(resolveVisibility(input, 'hold', 'show'), false)
  assert.equal(resolveVisibility(input, 'hold', 'hide'), true)
  input = transitionShortcutState(input, key('F8', 'down'), state)
  assert.equal(resolveVisibility(input, 'hold', 'show'), true)
  assert.equal(resolveVisibility(input, 'hold', 'hide'), false)
  input = transitionShortcutState(input, key('F8', 'up'), state)
  assert.equal(resolveVisibility(input, 'hold', 'show'), false)
  assert.equal(resolveVisibility(input, 'hold', 'hide'), true)
})

test('modified key press cannot trigger later through key-repeat', () => {
  const state = createDefaultState()
  let input = transitionShortcutState(createShortcutState(true), key('F8', 'down', true), state)
  input = transitionShortcutState(input, key('F8', 'down', false), state)
  assert.equal(input.toggledVisible, true)
  input = transitionShortcutState(input, key('F8', 'up'), state)
  assert.equal(input.pressedTrigger, false)
})

test('mouse button can trigger hold visibility', () => {
  const state = createDefaultState()
  state.triggerMode = 'hold'
  state.triggerKey = { device: 'mouse', code: '4' }
  let input = transitionShortcutState(createShortcutState(false), mouse('4', 'down'), state)
  assert.equal(resolveVisibility(input, 'hold', 'show'), true)
  input = transitionShortcutState(input, mouse('4', 'up'), state)
  assert.equal(resolveVisibility(input, 'hold', 'show'), false)
})

test('rapid right-button taps toggle once per press edge', () => {
  const state = createDefaultState()
  state.triggerKey = { device: 'mouse', code: '2' }
  let input = createShortcutState(false)

  for (let tap = 1; tap <= 10; tap++) {
    input = transitionShortcutState(input, mouse('2', 'down'), state)
    assert.equal(resolveVisibility(input, 'toggle', 'show'), tap % 2 === 1)
    assert.equal(transitionShortcutState(input, mouse('2', 'down'), state), input)
    input = transitionShortcutState(input, mouse('2', 'up'), state)
    assert.equal(resolveVisibility(input, 'toggle', 'show'), tap % 2 === 1)
  }
})

test('always mode ignores trigger keys and remains visible', () => {
  const config = { ...createDefaultState(), triggerMode: 'always' as const }
  const state = createShortcutState(false)
  assert.equal(transitionShortcutState(state, key('F8', 'down'), config), state)
  assert.equal(resolveVisibility(state, 'always', 'hide'), true)
})

test('right-button hold-show and hold-hide follow each press and release edge', () => {
  for (const behavior of ['show', 'hide'] as const) {
    const state = createDefaultState()
    state.triggerMode = 'hold'
    state.holdBehavior = behavior
    state.triggerKey = { device: 'mouse', code: '2' }
    let input = createShortcutState(false)
    const initial = behavior === 'hide'

    for (let tap = 0; tap < 5; tap++) {
      assert.equal(resolveVisibility(input, 'hold', behavior), initial)
      input = transitionShortcutState(input, mouse('2', 'down'), state)
      assert.equal(resolveVisibility(input, 'hold', behavior), !initial)
      assert.equal(transitionShortcutState(input, mouse('2', 'down'), state), input)
      input = transitionShortcutState(input, mouse('2', 'up'), state)
      assert.equal(resolveVisibility(input, 'hold', behavior), initial)
    }
  }
})

test('trigger mapping rejects modifier keys and shortcut objects with modifiers', () => {
  assert.equal(isValidTriggerKey({ device: 'keyboard', code: 'F8' }), true)
  assert.equal(isValidTriggerKey({ device: 'keyboard', code: 'Ctrl' }), false)
  assert.equal(isValidTriggerKey({ device: 'keyboard', code: 'Escape' }), false)
  assert.equal(isValidTriggerKey({ device: 'keyboard', code: 'F8', ctrl: true }), false)
})
