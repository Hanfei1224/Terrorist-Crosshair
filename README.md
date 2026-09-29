# Terrorist Crosshair

Terrorist Crosshair 是一款适用于 Windows 10/11 x64 的桌面准星覆盖层，使用 Electron、React 和 TypeScript 构建。它通过透明窗口绘制准星，不向游戏进程注入代码。

## 功能

- 创建和管理多个准星档案，支持十字、圆形、点状和 SVG 图形。
- 调整颜色、线条长度与粗细、间距、描边、缩放、旋转和位置。
- 十字准星的 X/Y 缩放分别控制左右线条和上下线条。
- 通过按键切换、按住显示/隐藏或常开模式控制准星；常开模式不需要触发按键。
- 在所有已连接的显示器上显示准星。
- 导入经过校验的 SVG；设置窗口收至系统托盘后，可以从托盘重新打开。

## 兼容性

覆盖层面向窗口和无边框显示模式。独占全屏以及具体游戏、反作弊软件的兼容性尚未逐项验证，请以实际环境为准。不向游戏进程注入代码不代表已验证与所有游戏或反作弊软件兼容。

## 开发

开发环境需要 Node.js 22.12 或更高版本。

```bash
npm ci
npm run dev
```

Windows 下也可以运行 `启动准星开发版.bat`。

## 检查与构建

```bash
npm test
npm run typecheck
npm run build
npm run dist
```

`npm run dist` 会生成未签名的 Windows x64 NSIS 安装包。

## 项目结构

- `src/shared`：档案类型、默认值和快捷键状态逻辑。
- `src/main`：应用窗口、系统托盘、全局输入、配置存储和 SVG 校验。
- `src/preload`：设置界面使用的类型化 IPC 桥接。
- `src/renderer`：React 设置界面和透明覆盖层绘制。
- `tests`：快捷键状态、配置存储和 SVG 导入测试。
