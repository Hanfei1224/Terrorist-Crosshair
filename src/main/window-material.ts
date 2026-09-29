import { release } from 'node:os'
import type { BrowserWindow } from 'electron'

// Windows 10 不会为无边框窗口自动裁掉系统 Acrylic 的矩形底层。
// 用窗口形状同步裁剪绘制和点击区域；坐标与 BrowserWindow 尺寸同为 DIP。
export function roundSettingsWindow(window: BrowserWindow): void {
  if (process.platform !== 'win32' || Number(release().split('.')[2]) >= 22621) return
  const [width, height] = window.getSize()
  const radius = 24
  const strips: Electron.Rectangle[] = [{ x: 0, y: radius, width, height: height - radius * 2 }]
  for (let y = 0; y < radius; y++) {
    const inset = Math.ceil(radius - Math.sqrt(radius * radius - (radius - y - 0.5) ** 2))
    strips.push({ x: inset, y, width: width - inset * 2, height: 1 })
    strips.push({ x: inset, y: height - y - 1, width: width - inset * 2, height: 1 })
  }
  window.setShape(strips)
}

// Electron 的系统 Acrylic 只支持 Windows 11 22H2+；旧版 Windows 用 CSS 半透明层保留圆角。
export function enableWindowAcrylic(window: BrowserWindow): void {
  if (process.platform !== 'win32') return
  if (Number(release().split('.')[2]) >= 22621) {
    window.setBackgroundMaterial('acrylic')
  }
}
