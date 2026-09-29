import { uIOhook, UiohookKey, type UiohookKeyboardEvent, type UiohookMouseEvent } from 'uiohook-napi'
import type { TriggerCaptureResult, TriggerKey } from '../shared/types'
import type { ShortcutInput } from '../shared/shortcut-state'

export class GlobalInput {
  private capturing = false
  private started = false
  private readonly pressed = new Set<string>()
  private readonly keyNames = new Map<number, string>(
    Object.entries(UiohookKey).map(([name, keycode]) => [keycode, name])
  )

  constructor(
    private readonly onInput: (input: ShortcutInput) => void,
    private readonly onCapture: (result: TriggerCaptureResult) => void
  ) {
    // 键盘与鼠标只在这里转换为统一事件；显隐优先级由共享状态机负责。
    uIOhook.on('keydown', event => this.key(event.keycode, 'down', event))
    uIOhook.on('keyup', event => this.key(event.keycode, 'up', event))
    uIOhook.on('mousedown', event => this.mouse(event.button, 'down', event))
    uIOhook.on('mouseup', event => this.mouse(event.button, 'up', event))
  }

  start(): void {
    if (this.started) return
    uIOhook.start()
    this.started = true
  }

  stop(): void {
    if (!this.started) return
    uIOhook.stop()
    this.started = false
    this.pressed.clear()
    this.capturing = false
  }

  beginCapture(): void {
    this.capturing = true
  }

  private modified(event: Pick<UiohookKeyboardEvent | UiohookMouseEvent, 'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey'>): boolean {
    return event.ctrlKey || event.shiftKey || event.altKey || event.metaKey
  }

  private acceptEdge(device: TriggerKey['device'], code: string, edge: 'down' | 'up'): boolean {
    const id = `${device}:${code}`
    if (edge === 'up') { this.pressed.delete(id); return true }
    // 捕获时也过滤重复按下，防止组合键中的修饰键先松开后靠重复事件绕过限制。
    if (this.pressed.has(id)) return false
    this.pressed.add(id)
    return true
  }

  private key(keycode: number, edge: 'down' | 'up', event: UiohookKeyboardEvent): void {
    const code = this.keyNames.get(keycode) ?? String(keycode)
    if (!this.acceptEdge('keyboard', code, edge)) return
    const modified = this.modified(event)
    if (this.capturing && edge === 'down') {
      if (code === 'Escape' && !modified) {
        this.capturing = false
        this.onCapture({ cancelled: true })
        return
      }
      if (modified || /^(?:Ctrl|Shift|Alt|Meta)(?:Right)?$/i.test(code)) {
        this.onCapture({ error: '请单独按下一个普通按键或鼠标键，不支持组合键。' })
        return
      }
      this.capturing = false
      const key: TriggerKey = { device: 'keyboard', code }
      this.onCapture({ key, label: this.label(key) })
      return
    }
    this.onInput({ device: 'keyboard', code, edge, modified })
  }

  private mouse(button: unknown, edge: 'down' | 'up', event: UiohookMouseEvent): void {
    if (typeof button !== 'number' || !Number.isFinite(button)) return
    const code = String(button)
    if (!this.acceptEdge('mouse', code, edge)) return
    const modified = this.modified(event)
    if (this.capturing && edge === 'down') {
      if (modified) {
        this.onCapture({ error: '请单独按下一个鼠标键，不支持组合键。' })
        return
      }
      this.capturing = false
      const key: TriggerKey = { device: 'mouse', code }
      this.onCapture({ key, label: this.label(key) })
      return
    }
    this.onInput({ device: 'mouse', code, edge, modified })
  }

  private label(key: TriggerKey): string {
    return key.device === 'keyboard'
      ? key.code
      : ({ '1': '鼠标左键', '2': '鼠标右键', '3': '鼠标中键', '4': '鼠标侧键 1', '5': '鼠标侧键 2' }[key.code] ?? `鼠标按键 ${key.code}`)
  }
}
