import type { AppState, CrosshairProfile, CrosshairShape } from './types'

// 新安装或配置不可用时统一从这里创建初始档案，避免设置页和主进程各自定义默认值。
export function createProfile(shape: Exclude<CrosshairShape, 'svg'>, name?: string): CrosshairProfile {
  const names: Record<Exclude<CrosshairShape, 'svg'>, string> = {
    cross: '十字准星',
    circle: '圆形准星',
    dot: '点状准星'
  }

  return {
    id: crypto.randomUUID(),
    name: name ?? names[shape],
    shape,
    enabled: true,
    color: '#ff4055',
    lineWidth: shape === 'dot' ? 6 : 2,
    length: shape === 'circle' ? 24 : 8,
    gap: 4,
    outlineEnabled: false,
    outlineWidth: 1,
    outlineOpacity: 1,
    centerPointEnabled: false,
    centerPointSize: 4,
    centerPointOutlineWidth: 1,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    offsetX: 0,
    offsetY: 0
  }
}

export function createDefaultState(): AppState {
  return {
    schemaVersion: 3,
    profiles: [createProfile('cross')],
    accentColor: '#d94666',
    toggledVisible: true,
    triggerMode: 'toggle',
    holdBehavior: 'show',
    triggerKey: { device: 'keyboard', code: 'F8' }
  }
}
