import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createDefaultState } from '../shared/defaults.ts'
import { isValidTriggerKey } from '../shared/shortcut-state.ts'
import { isSafeSvgDocument } from '../shared/svg-model.ts'
import type { AppState, CrosshairProfile, TriggerKey } from '../shared/types.ts'

const SHAPES = new Set(['cross', 'circle', 'dot', 'svg'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, value))
}

function migrateTriggerKey(value: Record<string, unknown>, fallback: TriggerKey): TriggerKey {
  const old = value.toggleShortcut
  if (isRecord(old) && ['ctrl', 'shift', 'alt', 'meta'].every(name => old[name] === false)) {
    const key = { device: old.device, code: old.code }
    if (isValidTriggerKey(key)) return key
  }
  return fallback
}

function normalizeProfile(value: unknown): CrosshairProfile {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id || value.id.length > 80 ||
    typeof value.name !== 'string' || typeof value.shape !== 'string' || !SHAPES.has(value.shape) ||
    typeof value.enabled !== 'boolean' || typeof value.color !== 'string' ||
    !/^#[0-9a-f]{6}$/i.test(value.color)) {
    throw new Error('准星档案格式无效。')
  }
  if (value.shape === 'svg' && !isSafeSvgDocument(value.svg)) throw new Error('SVG 档案无效或包含不支持的内容。')

  return {
    id: value.id,
    name: value.name.slice(0, 48) || '未命名准星',
    shape: value.shape as CrosshairProfile['shape'],
    enabled: value.enabled,
    color: value.color,
    lineWidth: clampNumber(value.lineWidth, 2, 1, 40),
    length: clampNumber(value.length, 8, 1, 160),
    gap: clampNumber(value.gap, 4, 0, 100),
    outlineEnabled: typeof value.outlineEnabled === 'boolean' ? value.outlineEnabled : false,
    outlineWidth: clampNumber(value.outlineWidth, 1, 0.5, 6),
    outlineOpacity: clampNumber(value.outlineOpacity, 1, 0, 1),
    centerPointEnabled: typeof value.centerPointEnabled === 'boolean' ? value.centerPointEnabled : false,
    centerPointSize: clampNumber(value.centerPointSize, 4, 1, 24),
    centerPointOutlineWidth: clampNumber(value.centerPointOutlineWidth, 1, 0, 6),
    scaleX: clampNumber(value.scaleX, 1, 0.1, 4),
    scaleY: clampNumber(value.scaleY, 1, 0.1, 4),
    rotation: clampNumber(value.rotation, 0, -180, 180),
    offsetX: clampNumber(value.offsetX, 0, -500, 500),
    offsetY: clampNumber(value.offsetY, 0, -500, 500),
    ...(value.shape === 'svg' ? { svg: value.svg as CrosshairProfile['svg'] } : {})
  }
}

export function normalizeAppState(value: unknown): AppState {
  if (!isRecord(value) || ![1, 2, 3].includes(value.schemaVersion as number) || !Array.isArray(value.profiles) ||
    typeof value.toggledVisible !== 'boolean' ||
    (value.holdBehavior !== 'show' && value.holdBehavior !== 'hide')) {
    throw new Error('配置文件版本或格式无效。')
  }
  if (value.schemaVersion !== 1 &&
    ((value.triggerMode !== 'hold' && value.triggerMode !== 'toggle' && value.triggerMode !== 'always') ||
      (value.triggerMode !== 'always' && !isValidTriggerKey(value.triggerKey)))) {
    throw new Error('触发方式或按键配置无效。')
  }
  if (value.schemaVersion === 3 && (typeof value.accentColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(value.accentColor))) {
    throw new Error('强调色格式无效。')
  }
  const profiles = value.profiles.map(normalizeProfile)
  if (new Set(profiles.map(profile => profile.id)).size !== profiles.length) throw new Error('配置中存在重复的档案 ID。')
  const fallback = createDefaultState()
  // 旧版同时存在两个组合快捷键；升级后保留显隐基线，仅复用合法的单键，否则改用 F8。
  const oldVersion = value.schemaVersion === 1
  return {
    schemaVersion: 3,
    profiles,
    accentColor: value.schemaVersion === 3 ? value.accentColor as string : fallback.accentColor,
    toggledVisible: value.toggledVisible,
    triggerMode: oldVersion ? 'toggle' : value.triggerMode as AppState['triggerMode'],
    holdBehavior: value.holdBehavior,
    triggerKey: oldVersion
      ? migrateTriggerKey(value, fallback.triggerKey)
      : isValidTriggerKey(value.triggerKey) ? value.triggerKey : fallback.triggerKey
  }
}

export class StateStore {
  readonly filePath: string

  constructor(userDataPath: string) {
    this.filePath = join(userDataPath, 'settings.json')
  }

  async load(): Promise<AppState> {
    // 损坏或未知版本配置由启动流程提示；这里不静默覆盖原文件。
    const source = await readFile(this.filePath, 'utf8')
    return normalizeAppState(JSON.parse(source) as unknown)
  }

  async save(state: AppState): Promise<void> {
    const normalized = normalizeAppState(state)
    await mkdir(dirname(this.filePath), { recursive: true })
    const tempPath = `${this.filePath}.${process.pid}.tmp`
    // 临时文件与正式配置位于同一目录，避免进程中断时留下半份 JSON。
    await writeFile(tempPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8')
    await rename(tempPath, this.filePath)
  }
}
