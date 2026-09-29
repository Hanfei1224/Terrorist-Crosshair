import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AppState } from '../shared/types'

const currentDir = fileURLToPath(new URL('.', import.meta.url))

export class OverlayWindow {
  private readonly windows = new Map<string, BrowserWindow>()
  private currentState: AppState | null = null
  private currentVisible: boolean | null = null

  constructor(private readonly preloadPath: string) {}

  async update(state: AppState, visible: boolean): Promise<void> {
    this.currentState = state
    this.currentVisible = visible
    const displays = screen.getAllDisplays()
    const displayIds = new Set(displays.map(display => String(display.id)))

    for (const [id, window] of this.windows) {
      if (!displayIds.has(id)) {
        this.windows.delete(id)
        window.destroy()
      }
    }

    for (const display of displays) {
      const id = String(display.id)
      let window = this.windows.get(id)
      if (!window || window.isDestroyed()) {
        window = this.create(id, display.bounds)
      } else {
        const bounds = window.getBounds()
        if (bounds.x !== display.bounds.x || bounds.y !== display.bounds.y ||
          bounds.width !== display.bounds.width || bounds.height !== display.bounds.height) {
          window.setBounds(display.bounds)
        }
      }
      this.publish(window, id)
    }
  }

  setVisibility(visible: boolean): void {
    const changed = this.currentVisible !== visible
    this.currentVisible = visible
    if (!changed) return
    for (const [id, window] of this.windows) {
      if (!window.isDestroyed() && !window.webContents.isLoading()) this.sendVisibility(window, id, visible)
    }
  }

  close(): void {
    for (const window of this.windows.values()) window.destroy()
    this.windows.clear()
    this.currentState = null
    this.currentVisible = null
  }

  private create(displayId: string, bounds: Electron.Rectangle): BrowserWindow {
    const window = new BrowserWindow({
      ...bounds,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      resizable: false,
      movable: false,
      focusable: false,
      hasShadow: false,
      skipTaskbar: true,
      autoHideMenuBar: true,
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })
    this.windows.set(displayId, window)
    window.setIgnoreMouseEvents(true, { forward: true })
    // Electron 的 bounds 使用 DIP 坐标，直接采用 screen 返回值可兼容缩放和负坐标副屏。
    // screen-saver 层级让无边框游戏上方保持可见；覆盖层不获取焦点，也不接收鼠标。
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    window.setAlwaysOnTop(true, 'screen-saver')
    window.once('closed', () => {
      if (this.windows.get(displayId) === window) this.windows.delete(displayId)
    })
    window.webContents.once('did-finish-load', () => this.publish(window, displayId))

    if (process.env.ELECTRON_RENDERER_URL) {
      void window.loadURL(`${process.env.ELECTRON_RENDERER_URL}?window=overlay`)
    } else {
      void window.loadFile(join(currentDir, '../renderer/index.html'), { query: { window: 'overlay' } })
    }
    return window
  }

  private publish(window: BrowserWindow, displayId: string): void {
    if (window.isDestroyed() || this.windows.get(displayId) !== window ||
      window.webContents.isLoading() || !this.currentState || this.currentVisible === null) return
    window.webContents.send('app:state-changed', this.currentState)
    if (!window.isVisible()) window.showInactive()
    this.sendVisibility(window, displayId, this.currentVisible)
  }

  private sendVisibility(window: BrowserWindow, displayId: string, visible: boolean): void {
    if (!window.isDestroyed() && this.windows.get(displayId) === window) {
      window.webContents.send('overlay:visibility-changed', visible)
    }
  }
}
