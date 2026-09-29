import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppState,
  CrosshairBridge,
  CrosshairProfile,
  CrosshairShape,
  HoldBehavior,
  TriggerCaptureResult,
  TriggerKey,
  TriggerMode
} from '../shared/types'

// 只公开设置页确实需要的命令和订阅；Node/Electron 对象不穿过隔离上下文。
const bridge: CrosshairBridge = {
  getState: () => ipcRenderer.invoke('state:get') as Promise<AppState>,
  hideSettings: () => ipcRenderer.invoke('settings:hide'),
  minimizeSettings: () => ipcRenderer.invoke('settings:minimize'),
  saveProfiles: profiles => ipcRenderer.invoke('profiles:save', profiles as CrosshairProfile[]),
  setAccentColor: color => ipcRenderer.invoke('appearance:accent', color),
  setToggledVisible: visible => ipcRenderer.invoke('visibility:set', visible),
  setTriggerMode: mode => ipcRenderer.invoke('trigger:mode', mode as TriggerMode),
  setHoldBehavior: behavior => ipcRenderer.invoke('hold-behavior:set', behavior as HoldBehavior),
  createProfile: shape => ipcRenderer.invoke('profile:create', shape as Exclude<CrosshairShape, 'svg'>),
  importSvg: () => ipcRenderer.invoke('profile:import-svg') as Promise<{ ok: boolean; error?: string }>,
  deleteProfile: id => ipcRenderer.invoke('profile:delete', id),
  duplicateProfile: id => ipcRenderer.invoke('profile:duplicate', id),
  setTriggerKey: key => ipcRenderer.invoke('trigger:key', key as TriggerKey),
  beginTriggerCapture: () => ipcRenderer.invoke('trigger:capture'),
  getOverlayVisibility: () => ipcRenderer.invoke('overlay:visibility:get') as Promise<boolean>,
  onStateChanged: callback => {
    const listener = (_event: Electron.IpcRendererEvent, state: AppState) => callback(state)
    ipcRenderer.on('app:state-changed', listener)
    return () => ipcRenderer.removeListener('app:state-changed', listener)
  },
  onOverlayVisibilityChanged: callback => {
    const listener = (_event: Electron.IpcRendererEvent, visible: boolean) => callback(visible)
    ipcRenderer.on('overlay:visibility-changed', listener)
    return () => ipcRenderer.removeListener('overlay:visibility-changed', listener)
  },
  onTriggerCaptured: callback => {
    const listener = (_event: Electron.IpcRendererEvent, result: TriggerCaptureResult) => callback(result)
    ipcRenderer.on('trigger:captured', listener)
    return () => ipcRenderer.removeListener('trigger:captured', listener)
  }
}

contextBridge.exposeInMainWorld('crosshair', bridge)
