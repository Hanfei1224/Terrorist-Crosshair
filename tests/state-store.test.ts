import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import test from 'node:test'
import { createDefaultState } from '../src/shared/defaults.ts'
import { normalizeAppState, StateStore } from '../src/main/state-store.ts'

// 确认配置可以往返保存，且损坏文件不会被默认状态静默覆盖。
test('settings round-trip and an invalid file is left intact for recovery', async () => {
  const workspaceTemp = resolve(process.cwd(), '.tmp')
  await mkdir(workspaceTemp, { recursive: true })
  const userData = await mkdtemp(join(workspaceTemp, 'state-store-'))
  try {
    const store = new StateStore(userData)
    const state = createDefaultState()
    state.profiles[0].offsetX = 23
    state.profiles[0].outlineEnabled = true
    state.profiles[0].outlineOpacity = 0.4
    state.accentColor = '#258ad7'
    await store.save(state)
    assert.equal((await store.load()).profiles[0].offsetX, 23)
    assert.equal((await store.load()).profiles[0].outlineOpacity, 0.4)
    assert.equal((await store.load()).accentColor, '#258ad7')

    await writeFile(store.filePath, '{broken', 'utf8')
    await assert.rejects(store.load())
    assert.equal(await readFile(store.filePath, 'utf8'), '{broken')
  } finally {
    const resolved = resolve(userData)
    if (!resolved.startsWith(`${workspaceTemp}${sep}`)) throw new Error('拒绝清理工作区外的测试目录。')
    await rm(resolved, { recursive: true, force: true })
  }
})

test('version 1 settings preserve profiles and visibility while migrating to one trigger key', () => {
  const oldProfile: Record<string, unknown> = { ...createDefaultState().profiles[0], color: '#16f8f4' }
  delete oldProfile.outlineEnabled
  delete oldProfile.outlineWidth
  delete oldProfile.outlineOpacity
  const oldState = {
    schemaVersion: 1,
    profiles: [oldProfile],
    selectedDisplayId: null,
    toggledVisible: false,
    holdBehavior: 'show',
    toggleShortcut: { device: 'keyboard', code: 'X', ctrl: true, shift: true, alt: false, meta: false }
  }
  const migrated = normalizeAppState(oldState)
  assert.equal(migrated.schemaVersion, 3)
  assert.equal(migrated.accentColor, createDefaultState().accentColor)
  assert.equal(migrated.profiles[0].color, '#16f8f4')
  assert.equal(migrated.profiles[0].outlineEnabled, false)
  assert.equal(migrated.profiles[0].outlineOpacity, 1)
  assert.equal(migrated.toggledVisible, false)
  assert.equal(migrated.triggerMode, 'toggle')
  assert.deepEqual(migrated.triggerKey, { device: 'keyboard', code: 'F8' })
})

test('version 2 settings gain a default accent without changing saved crosshair settings', () => {
  const oldState = { ...createDefaultState(), schemaVersion: 2, profiles: [{ ...createDefaultState().profiles[0], color: '#16f8f4' }] }
  delete (oldState as Partial<typeof oldState>).accentColor
  const migrated = normalizeAppState(oldState)
  assert.equal(migrated.schemaVersion, 3)
  assert.equal(migrated.accentColor, createDefaultState().accentColor)
  assert.equal(migrated.profiles[0].color, '#16f8f4')
  assert.throws(() => normalizeAppState({ ...migrated, accentColor: 'red' }))
})

test('center point settings default for old profiles and clamp to supported sizes', () => {
  const state = createDefaultState()
  const legacyProfile: Record<string, unknown> = { ...state.profiles[0] }
  delete legacyProfile.centerPointEnabled
  delete legacyProfile.centerPointSize
  delete legacyProfile.centerPointOutlineWidth
  const legacy = normalizeAppState({ ...state, profiles: [legacyProfile] })
  assert.equal(legacy.profiles[0].centerPointEnabled, false)
  assert.equal(legacy.profiles[0].centerPointSize, 4)
  assert.equal(legacy.profiles[0].centerPointOutlineWidth, 1)

  const clamped = normalizeAppState({ ...state, profiles: [{
    ...state.profiles[0], centerPointSize: 30, centerPointOutlineWidth: -1
  }] })
  assert.equal(clamped.profiles[0].centerPointSize, 24)
  assert.equal(clamped.profiles[0].centerPointOutlineWidth, 0)
})

test('always mode does not require a trigger key and ignores legacy display selection', () => {
  const normalized = normalizeAppState({
    ...createDefaultState(),
    triggerMode: 'always',
    triggerKey: undefined,
    selectedDisplayId: 'legacy-display-id'
  })
  assert.equal(normalized.triggerMode, 'always')
  assert.deepEqual(normalized.triggerKey, { device: 'keyboard', code: 'F8' })
  assert.equal('selectedDisplayId' in normalized, false)
})
