// 定义跨进程使用的档案与应用状态结构；持久化状态保持为可序列化数据，桥接接口只描述 renderer 可调用的能力。
export type CrosshairShape = 'cross' | 'circle' | 'dot' | 'svg'
export type HoldBehavior = 'show' | 'hide'
export type TriggerMode = 'hold' | 'toggle' | 'always'

export interface SvgNode {
  tag: 'g' | 'path' | 'line' | 'polyline' | 'polygon' | 'circle' | 'ellipse' | 'rect'
  attributes: Record<string, string>
  children: SvgNode[]
}

export interface ImportedSvg {
  viewBox: [number, number, number, number]
  elements: SvgNode[]
  sourceName: string
}

export interface CrosshairProfile {
  id: string
  name: string
  shape: CrosshairShape
  enabled: boolean
  color: string
  lineWidth: number
  length: number
  gap: number
  outlineEnabled: boolean
  outlineWidth: number
  outlineOpacity: number
  centerPointEnabled: boolean
  centerPointSize: number
  centerPointOutlineWidth: number
  scaleX: number
  scaleY: number
  rotation: number
  offsetX: number
  offsetY: number
  svg?: ImportedSvg
}

export interface TriggerKey {
  device: 'keyboard' | 'mouse'
  code: string
}

export interface AppState {
  schemaVersion: 3
  profiles: CrosshairProfile[]
  accentColor: string
  toggledVisible: boolean
  triggerMode: TriggerMode
  holdBehavior: HoldBehavior
  triggerKey: TriggerKey
}

export interface TriggerCaptureResult {
  key?: TriggerKey
  label?: string
  error?: string
  cancelled?: boolean
}

export interface CrosshairBridge {
  getState(): Promise<AppState>
  hideSettings(): Promise<void>
  minimizeSettings(): Promise<void>
  saveProfiles(profiles: CrosshairProfile[]): Promise<void>
  setAccentColor(color: string): Promise<void>
  setToggledVisible(visible: boolean): Promise<void>
  setTriggerMode(mode: TriggerMode): Promise<void>
  setHoldBehavior(behavior: HoldBehavior): Promise<void>
  createProfile(shape: Exclude<CrosshairShape, 'svg'>): Promise<void>
  importSvg(): Promise<{ ok: boolean; error?: string }>
  deleteProfile(id: string): Promise<void>
  duplicateProfile(id: string): Promise<void>
  setTriggerKey(key: TriggerKey): Promise<{ ok: boolean; error?: string }>
  beginTriggerCapture(): Promise<void>
  getOverlayVisibility(): Promise<boolean>
  onStateChanged(callback: (state: AppState) => void): () => void
  onOverlayVisibilityChanged(callback: (visible: boolean) => void): () => void
  onTriggerCaptured(callback: (result: TriggerCaptureResult) => void): () => void
}

declare global {
  interface Window {
    crosshair: CrosshairBridge
  }
}
