import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, screen, Tray } from 'electron'
import { readFile, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDefaultState, createProfile } from '../shared/defaults'
import { createShortcutState, isValidTriggerKey, resolveVisibility, transitionShortcutState } from '../shared/shortcut-state'
import type { AppState, CrosshairProfile, CrosshairShape, HoldBehavior, TriggerCaptureResult, TriggerKey, TriggerMode } from '../shared/types'
import { createSvgProfile, sanitizeSvg } from './svg-import'
import { GlobalInput } from './global-input'
import { OverlayWindow } from './overlay-window'
import { normalizeAppState, StateStore } from './state-store'
import { enableWindowAcrylic, roundSettingsWindow } from './window-material'

// 主进程装配各独立模块，并作为应用状态的唯一写入方；设置页只能通过 preload 暴露的 IPC 命令更新状态。
const currentDir = fileURLToPath(new URL('.', import.meta.url))
// 与构建配置的 CommonJS preload 文件名保持一致，供沙箱窗口加载。
const preloadPath = join(currentDir, '../preload/index.cjs')
const appLock = app.requestSingleInstanceLock()

if (!appLock) {
  app.quit()
} else {
  let state = createDefaultState()
  let shortcutState = createShortcutState(state.toggledVisible)
  let settingsWindow: BrowserWindow | null = null
  let tray: Tray | null = null
  let isQuitting = false
  let saveTimer: NodeJS.Timeout | null = null
  let pendingSave: Promise<void> = Promise.resolve()
  let store: StateStore
  let overlay: OverlayWindow
  let globalInput: GlobalInput

  const isOverlayVisible = () => resolveVisibility(shortcutState, state.triggerMode, state.holdBehavior)

  function publishSettingsState(snapshot: AppState = structuredClone(state)): void {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.webContents.send('app:state-changed', snapshot)
    }
  }

  function publishState(): void {
    const snapshot = structuredClone(state)
    publishSettingsState(snapshot)
    void overlay.update(snapshot, isOverlayVisible())
  }

  function queueSave(): void {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = null
      pendingSave = pendingSave.then(() => store.save(state))
      pendingSave.catch(error => console.error('保存准星配置失败：', error))
    }, 250)
  }

  async function flushSave(): Promise<void> {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    pendingSave = pendingSave.then(() => store.save(state))
    await pendingSave
  }

  function applyState(next: AppState): void {
    state = normalizeAppState(next)
    shortcutState = { ...shortcutState, toggledVisible: state.toggledVisible }
    queueSave()
    publishState()
  }

  function applyTriggerKey(key: TriggerKey): { ok: boolean; error?: string } {
    if (!isValidTriggerKey(key)) return { ok: false, error: '只支持单个普通按键或鼠标键。' }
    state = normalizeAppState({ ...state, triggerKey: key })
    shortcutState = createShortcutState(state.toggledVisible)
    queueSave()
    publishSettingsState()
    overlay.setVisibility(isOverlayVisible())
    return { ok: true }
  }

  function handleShortcutInput(input: Parameters<typeof transitionShortcutState>[1]): void {
    const before = shortcutState
    const beforeVisible = isOverlayVisible()
    const next = transitionShortcutState(shortcutState, input, state)
    if (next === before) return
    shortcutState = next
    const changedToggle = before.toggledVisible !== next.toggledVisible
    if (changedToggle) {
      state = { ...state, toggledVisible: next.toggledVisible }
      queueSave()
    }
    const visible = isOverlayVisible()
    if (changedToggle) publishSettingsState()
    // 按键边沿只发显隐布尔值，不重发档案或调整窗口尺寸，避免输入路径排队重绘。
    if (beforeVisible !== visible) overlay.setVisibility(visible)
  }

  function createSettingsWindow(): void {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.show()
      settingsWindow.focus()
      return
    }

    settingsWindow = new BrowserWindow({
      width: 1040,
      height: 760,
      minWidth: 900,
      minHeight: 640,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      title: 'Terrorist Crosshair 1.0.0',
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })
    roundSettingsWindow(settingsWindow)
    settingsWindow.on('resize', () => { if (settingsWindow && !settingsWindow.isDestroyed()) roundSettingsWindow(settingsWindow) })
    settingsWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    settingsWindow.on('close', event => {
      if (isQuitting) return
      event.preventDefault()
      settingsWindow?.hide()
    })
    settingsWindow.on('closed', () => { settingsWindow = null })

    if (process.env.ELECTRON_RENDERER_URL) {
      void settingsWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    } else {
      void settingsWindow.loadFile(join(currentDir, '../renderer/index.html'))
    }
    const window = settingsWindow
    settingsWindow.once('ready-to-show', () => {
      window.show()
      try { enableWindowAcrylic(window) }
      catch (error) { console.warn('系统材质不可用，使用 CSS 半透明背景：', error) }
    })
  }

  function createTray(): void {
    const iconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><path d="M8 1v5M8 10v5M1 8h5M10 8h5" stroke="#ff4055" stroke-width="2" stroke-linecap="round"/><circle cx="8" cy="8" r="1" fill="#ff4055"/></svg>'
    const icon = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(iconSvg).toString('base64')}`)
    tray = new Tray(icon)
    tray.setToolTip('Terrorist Crosshair 1.0.0 准星')
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: '打开设置', click: createSettingsWindow },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() }
    ]))
    tray.on('click', createSettingsWindow)
  }

  function publishTriggerCapture(result: TriggerCaptureResult): void {
    settingsWindow?.webContents.send('trigger:captured', result)
  }

  function registerIpc(): void {
    ipcMain.handle('state:get', () => structuredClone(state))
    ipcMain.handle('overlay:visibility:get', () => isOverlayVisible())
    ipcMain.handle('settings:hide', () => settingsWindow?.hide())
    ipcMain.handle('settings:minimize', () => settingsWindow?.minimize())
    ipcMain.handle('profiles:save', (_event, profiles: CrosshairProfile[]) => {
      // 只写档案数据，避免设置页旧快照覆盖主进程维护的显隐/快捷键状态。
      applyState({ ...state, profiles })
    })
    ipcMain.handle('appearance:accent', (_event, color: string) => {
      if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) throw new Error('强调色格式无效。')
      applyState({ ...state, accentColor: color })
    })
    ipcMain.handle('visibility:set', (_event, visible: boolean) => {
      if (typeof visible !== 'boolean') throw new Error('可见状态无效。')
      state = { ...state, toggledVisible: visible }
      shortcutState = { ...shortcutState, toggledVisible: visible }
      queueSave()
      publishSettingsState()
      overlay.setVisibility(isOverlayVisible())
    })
    ipcMain.handle('trigger:mode', (_event, mode: TriggerMode) => {
      if (mode !== 'hold' && mode !== 'toggle' && mode !== 'always') throw new Error('触发方式无效。')
      state = { ...state, triggerMode: mode }
      shortcutState = { ...shortcutState, holdActive: false }
      queueSave()
      publishSettingsState()
      overlay.setVisibility(isOverlayVisible())
    })
    ipcMain.handle('hold-behavior:set', (_event, behavior: HoldBehavior) => {
      if (behavior !== 'show' && behavior !== 'hide') throw new Error('按住模式无效。')
      state = { ...state, holdBehavior: behavior }
      queueSave()
      publishSettingsState()
      overlay.setVisibility(isOverlayVisible())
    })
    ipcMain.handle('profile:create', (_event, shape: Exclude<CrosshairShape, 'svg'>) => {
      if (!['cross', 'circle', 'dot'].includes(shape)) throw new Error('准星样式无效。')
      applyState({ ...state, profiles: [...state.profiles, createProfile(shape)] })
    })
    ipcMain.handle('profile:import-svg', async () => {
      const result = settingsWindow
        ? await dialog.showOpenDialog(settingsWindow, { properties: ['openFile'], filters: [{ name: 'SVG 图像', extensions: ['svg'] }] })
        : await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'SVG 图像', extensions: ['svg'] }] })
      if (result.canceled || !result.filePaths[0]) return { ok: true }
      try {
        const filePath = result.filePaths[0]
        if ((await stat(filePath)).size > 512 * 1024) throw new Error('SVG 文件不能超过 512 KB。')
        const svg = sanitizeSvg(await readFile(filePath, 'utf8'), basename(filePath))
        applyState({ ...state, profiles: [...state.profiles, createSvgProfile(svg)] })
        return { ok: true }
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : 'SVG 导入失败。' }
      }
    })
    ipcMain.handle('profile:delete', (_event, id: string) => {
      applyState({ ...state, profiles: state.profiles.filter(profile => profile.id !== id) })
    })
    ipcMain.handle('profile:duplicate', (_event, id: string) => {
      const profile = state.profiles.find(item => item.id === id)
      if (!profile) throw new Error('准星档案不存在。')
      const duplicate = { ...structuredClone(profile), id: crypto.randomUUID(), name: `${profile.name} 副本`, enabled: false }
      applyState({ ...state, profiles: [...state.profiles, duplicate] })
    })
    ipcMain.handle('trigger:key', (_event, key: TriggerKey) => applyTriggerKey(key))
    ipcMain.handle('trigger:capture', () => globalInput.beginCapture())
  }

  async function start(): Promise<void> {
    app.setAppUserModelId('dev.crosshair.overlay')
    await app.whenReady()
    store = new StateStore(app.getPath('userData'))
    try {
      state = await store.load()
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT') {
        await dialog.showMessageBox({
          type: 'warning',
          title: '配置无法读取',
          message: '无法读取准星配置，原文件已保留。本次先使用默认配置。',
          detail: error instanceof Error ? error.message : String(error)
        })
      }
      state = createDefaultState()
    }
    shortcutState = createShortcutState(state.toggledVisible)
    overlay = new OverlayWindow(preloadPath)
    globalInput = new GlobalInput(handleShortcutInput, result => {
      if (!result.key) return publishTriggerCapture(result)
      const update = applyTriggerKey(result.key)
      publishTriggerCapture({ ...result, ...(!update.ok ? { error: update.error } : {}) })
    })
    registerIpc()
    createTray()
    createSettingsWindow()
    await overlay.update(state, isOverlayVisible())
    try {
      globalInput.start()
    } catch (error) {
      await dialog.showMessageBox({
        type: 'warning',
        title: '全局快捷键不可用',
        message: '准星仍可通过设置窗口和系统托盘控制，但全局键盘和鼠标快捷键无法启动。',
        detail: error instanceof Error ? error.message : String(error)
      })
    }

    const handleDisplaysChanged = () => {
      publishState()
    }
    screen.on('display-added', handleDisplaysChanged)
    screen.on('display-removed', handleDisplaysChanged)
    screen.on('display-metrics-changed', handleDisplaysChanged)
    app.on('activate', createSettingsWindow)
  }

  app.on('second-instance', createSettingsWindow)
  app.on('before-quit', event => {
    if (isQuitting) return
    event.preventDefault()
    void flushSave().catch(error => {
      dialog.showErrorBox('配置保存失败', error instanceof Error ? error.message : String(error))
    }).finally(() => {
      isQuitting = true
      globalInput?.stop()
      overlay?.close()
      tray?.destroy()
      app.quit()
    })
  })

  void start()
}
