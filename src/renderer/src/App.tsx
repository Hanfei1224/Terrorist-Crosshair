import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import type { AppState, CrosshairProfile, CrosshairShape, TriggerKey } from '../../shared/types'
import { CrosshairView } from './CrosshairView'

// 设置页只持有 IPC 同步来的界面状态；实际持久化和窗口控制都由主进程完成。

function shapeName(shape: CrosshairShape): string {
  return { cross: '十字', circle: '圆形', dot: '点状', svg: 'SVG' }[shape]
}

function triggerLabel(key: TriggerKey): string {
  return key.device === 'mouse'
    ? ({ '1': '鼠标左键', '2': '鼠标右键', '3': '鼠标中键', '4': '鼠标侧键 1', '5': '鼠标侧键 2' }[key.code] ?? `鼠标按键 ${key.code}`)
    : key.code
}

// 强调色可由用户选到很亮或很暗；按对比度选择气泡文字颜色。
function accentTextColor(hex: string): string {
  const channels = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255)
  const [red, green, blue] = channels.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  return red * 0.2126 + green * 0.7152 + blue * 0.0722 > 0.179 ? '#111820' : '#ffffff'
}

function Slider({
  label, value, min, max, step = 1, onChange
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
}) {
  const decimals = step < 0.1 ? 2 : step < 1 ? 1 : 0
  return <label className="slider-control">
    <span className="slider-label">{label}</span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={event => onChange(event.currentTarget.valueAsNumber)} />
    <input className="number-input" type="number" min={min} max={max} step={step} value={Number(value.toFixed(decimals))}
      onChange={event => { if (event.currentTarget.value !== '') onChange(event.currentTarget.valueAsNumber) }} />
  </label>
}

function TriggerButton({
  triggerKey, capturing, onClick
}: {
  triggerKey: TriggerKey
  capturing: boolean
  onClick: () => void
}) {
  return <button className={`shortcut-button ${capturing ? 'listening' : ''}`} onClick={onClick}>
    {capturing ? '映射中…' : triggerLabel(triggerKey)}
  </button>
}

export function App() {
  const isOverlay = new URLSearchParams(location.search).get('window') === 'overlay'
  const [state, setState] = useState<AppState | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [page, setPage] = useState<'profiles' | 'appearance'>('profiles')
  const [capturing, setCapturing] = useState(false)
  const [message, setMessage] = useState('')
  const [overlayVisible, setOverlayVisible] = useState(false)

  useEffect(() => {
    if (isOverlay) {
      const unsubscribe = window.crosshair.onStateChanged(setState)
      const unsubscribeVisibility = window.crosshair.onOverlayVisibilityChanged(setOverlayVisible)
      void Promise.all([window.crosshair.getState(), window.crosshair.getOverlayVisibility()]).then(([next, visible]) => {
        setState(next)
        setOverlayVisible(visible)
      })
      return () => { unsubscribe(); unsubscribeVisibility() }
    }
    const unsubscribeState = window.crosshair.onStateChanged(next => {
      setState(next)
      setSelectedId(current => next.profiles.some(profile => profile.id === current) ? current : next.profiles[0]?.id ?? null)
    })
    const unsubscribeCapture = window.crosshair.onTriggerCaptured(result => {
      if (result.error) { setMessage(result.error); return }
      setCapturing(false)
      setMessage(result.cancelled ? '已取消按键映射。' : `触发按键已设置：${result.label}`)
    })
    void window.crosshair.getState().then(next => {
      setState(next)
      setSelectedId(next.profiles[0]?.id ?? null)
    }).catch(error => setMessage(error instanceof Error ? error.message : '读取设置失败。'))
    return () => { unsubscribeState(); unsubscribeCapture() }
  }, [isOverlay])

  const selected = useMemo(() => state?.profiles.find(profile => profile.id === selectedId) ?? null, [state, selectedId])

  if (isOverlay) return <CrosshairView profiles={state?.profiles ?? []} visible={overlayVisible} />
  if (!state) return <main className="loading-shell"><span className="loading-mark" />正在载入准星设置…</main>

  const saveProfiles = (profiles: CrosshairProfile[]) => {
    setState(current => current ? { ...current, profiles } : current)
    void window.crosshair.saveProfiles(profiles).catch(error => setMessage(error instanceof Error ? error.message : '保存档案失败。'))
  }
  const updateProfile = (id: string, change: Partial<CrosshairProfile>) => {
    saveProfiles(state.profiles.map(profile => profile.id === id ? { ...profile, ...change } : profile))
  }
  const createProfile = async (shape: Exclude<CrosshairShape, 'svg'>) => {
    await window.crosshair.createProfile(shape)
    const next = await window.crosshair.getState()
    setState(next)
    setSelectedId(next.profiles.at(-1)?.id ?? null)
  }
  const importSvg = async () => {
    const result = await window.crosshair.importSvg()
    if (!result.ok) { setMessage(result.error ?? 'SVG 导入失败。'); return }
    const next = await window.crosshair.getState()
    setState(next)
    if (next.profiles.length) setSelectedId(next.profiles.at(-1)!.id)
    setMessage('')
  }
  const beginCapture = async () => {
    setCapturing(true)
    try {
      await window.crosshair.beginTriggerCapture()
    } catch (error) {
      setCapturing(false)
      setMessage(error instanceof Error ? error.message : '无法开始按键映射。')
    }
  }
  const reorderProfile = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= state.profiles.length) return
    const profiles = [...state.profiles]
    ;[profiles[index], profiles[target]] = [profiles[target], profiles[index]]
    saveProfiles(profiles)
  }

  return <main className="app-shell" style={{ '--accent': state.accentColor, '--accent-text': accentTextColor(state.accentColor) } as CSSProperties}>
    <header className="titlebar">
      <div className="brand-mark" aria-hidden="true"><i /><i /><i /><i /><b /></div>
      <div className="brand-copy"><strong>Terrorist Crosshair 1.0.0</strong></div>
      <div className="titlebar-spacer" />
      <button className="window-action" aria-label="最小化" onClick={() => void window.crosshair.minimizeSettings()}>−</button>
      <button className="window-action close-action" aria-label="收至托盘" title="收至系统托盘" onClick={() => void window.crosshair.hideSettings()}>×</button>
    </header>

    <div className="workspace">
      <aside className="sidebar">
        <nav className="sidebar-nav" aria-label="设置页面">
          <button className={page === 'profiles' ? 'active' : ''} onClick={() => setPage('profiles')}>准星档案 <span className="count-badge">{state.profiles.length}</span></button>
          <button className={page === 'appearance' ? 'active' : ''} onClick={() => setPage('appearance')}>界面设置 <span aria-hidden="true">⚙</span></button>
        </nav>
        <div className="sidebar-heading"><span>图层列表</span></div>
        <div className="profile-list">
          {state.profiles.map((profile, index) => <div key={profile.id} className={`profile-row ${selectedId === profile.id ? 'selected' : ''}`}>
            <button className="profile-main" onClick={() => { setSelectedId(profile.id); setPage('profiles') }}>
              <span className={`shape-icon shape-${profile.shape}`} style={{ color: profile.color }} aria-hidden="true"><i /></span>
              <span className="profile-label"><b>{profile.name}</b><small>{shapeName(profile.shape)}</small></span>
            </button>
            <label className="switch mini-switch" title={profile.enabled ? '停用图层' : '启用图层'}>
              <input type="checkbox" checked={profile.enabled} onChange={event => updateProfile(profile.id, { enabled: event.currentTarget.checked })} />
              <span />
            </label>
            <div className="order-buttons">
              <button aria-label="上移图层" onClick={() => reorderProfile(index, -1)} disabled={index === 0}>↑</button>
              <button aria-label="下移图层" onClick={() => reorderProfile(index, 1)} disabled={index === state.profiles.length - 1}>↓</button>
            </div>
          </div>)}
          {!state.profiles.length && <div className="empty-list">还没有准星档案</div>}
        </div>

        <div className="create-actions">
          <button onClick={() => void createProfile('cross')}><span>＋</span> 新建十字</button>
          <button onClick={() => void createProfile('circle')}><span>＋</span> 新建圆形</button>
          <button onClick={() => void createProfile('dot')}><span>＋</span> 新建点状</button>
          <button onClick={() => void importSvg()}><span>↥</span> 导入 SVG</button>
        </div>
      </aside>

      <section className="settings-panel">
        <div className="panel-topline">
          <div><div className="eyebrow">{page === 'appearance' ? 'APPEARANCE' : 'CROSSHAIR PROFILE'}</div><h1>{page === 'appearance' ? '界面设置' : selected?.name ?? '准星设置'}</h1></div>
          {page === 'profiles' && (state.triggerMode === 'toggle'
            ? <button className={`visibility-pill ${state.toggledVisible ? 'active' : ''}`} onClick={() => void window.crosshair.setToggledVisible(!state.toggledVisible)}>
              <span className="status-dot" />{state.toggledVisible ? '准星已启动' : '准星已隐藏'}
            </button>
            : <span className="visibility-pill hold-mode"><span className="status-dot" />{state.triggerMode === 'always' ? '准星常开' : state.holdBehavior === 'show' ? '按住时显示' : '按住时隐藏'}</span>)}
        </div>

        <div className="panel-scroll">
          {page === 'appearance' ? <section className="card appearance-card">
            <div className="card-title"><div><h2>玻璃界面</h2></div></div>
            <label className="color-field"><span><b>强调色</b></span>
              <input type="color" value={state.accentColor} onChange={event => {
                const color = event.currentTarget.value
                setState(current => current ? { ...current, accentColor: color } : current)
                void window.crosshair.setAccentColor(color).catch(error => setMessage(error instanceof Error ? error.message : '强调色保存失败。'))
              }} />
            </label>
          </section> : <>
          {selected ? <>
            <section className="card profile-card">
              <div className="card-title"><div><h2>档案</h2></div>
                <div className="card-actions">
                  <button className="icon-button" title="复制档案" aria-label="复制档案" onClick={async () => {
                    await window.crosshair.duplicateProfile(selected.id)
                    const next = await window.crosshair.getState(); setState(next); setSelectedId(next.profiles.at(-1)?.id ?? null)
                  }}>⧉</button>
                  <button className="icon-button danger" title="删除档案" aria-label="删除档案" onClick={async () => {
                    await window.crosshair.deleteProfile(selected.id)
                    const next = await window.crosshair.getState(); setState(next); setSelectedId(next.profiles[0]?.id ?? null)
                  }}>⌫</button>
                </div>
              </div>
              <label className="text-field"><span>名称</span><input key={`${selected.id}:${selected.name}`} defaultValue={selected.name} maxLength={48}
                onBlur={event => { if (event.currentTarget.value !== selected.name) updateProfile(selected.id, { name: event.currentTarget.value }) }} /></label>
            </section>

            <section className="card">
              <div className="card-title"><div><h2>外观</h2></div></div>
              <label className="color-field"><span><b>颜色</b></span><input type="color" value={selected.color} onChange={event => updateProfile(selected.id, { color: event.currentTarget.value })} /></label>
              {selected.shape === 'cross' && <>
                <div className="slider-grid">
                  <Slider label="线条粗细" value={selected.lineWidth} min={1} max={16} step={0.5} onChange={lineWidth => updateProfile(selected.id, { lineWidth })} />
                  <Slider label="线条长度" value={selected.length} min={2} max={160} onChange={length => updateProfile(selected.id, { length })} />
                  <Slider label="中心间距" value={selected.gap} min={0} max={32} onChange={gap => updateProfile(selected.id, { gap })} />
                </div>
              </>}
              {selected.shape === 'circle' && <div className="slider-grid">
                <Slider label="圆环直径" value={selected.length} min={4} max={80} onChange={length => updateProfile(selected.id, { length })} />
                <Slider label="线条粗细" value={selected.lineWidth} min={1} max={16} step={0.5} onChange={lineWidth => updateProfile(selected.id, { lineWidth })} />
              </div>}
              {(selected.shape === 'cross' || selected.shape === 'circle') && <>
                <div className="outline-section">
                  <div className="outline-head"><span><b>黑色描边</b></span>
                    <label className="switch" title={selected.outlineEnabled ? '关闭描边' : '开启描边'}>
                      <input type="checkbox" aria-label="开启描边" checked={selected.outlineEnabled}
                        onChange={event => updateProfile(selected.id, { outlineEnabled: event.currentTarget.checked })} />
                      <span />
                    </label>
                  </div>
                  {selected.outlineEnabled && <div className="slider-grid">
                    <Slider label="描边粗细" value={selected.outlineWidth} min={0.5} max={6} step={0.5} onChange={outlineWidth => updateProfile(selected.id, { outlineWidth })} />
                    <Slider label="描边透明度 %" value={Math.round((1 - selected.outlineOpacity) * 100)} min={0} max={100}
                      onChange={percent => updateProfile(selected.id, { outlineOpacity: 1 - percent / 100 })} />
                  </div>}
                </div>
                <div className="outline-section">
                  <div className="outline-head"><span><b>中心点</b></span>
                    <label className="switch" title={selected.centerPointEnabled ? '关闭中心点' : '开启中心点'}>
                      <input type="checkbox" aria-label="显示中心点" checked={selected.centerPointEnabled}
                        onChange={event => updateProfile(selected.id, { centerPointEnabled: event.currentTarget.checked })} />
                      <span />
                    </label>
                  </div>
                  {selected.centerPointEnabled && <div className="slider-grid">
                    <Slider label="中心点直径" value={selected.centerPointSize} min={1} max={24} step={0.5}
                      onChange={centerPointSize => updateProfile(selected.id, { centerPointSize })} />
                    <Slider label="中心点描边" value={selected.centerPointOutlineWidth} min={0} max={6} step={0.5}
                      onChange={centerPointOutlineWidth => updateProfile(selected.id, { centerPointOutlineWidth })} />
                  </div>}
                </div>
              </>}
              {selected.shape === 'dot' && <div className="slider-grid">
                <Slider label="点直径" value={selected.lineWidth} min={1} max={24} step={0.5} onChange={lineWidth => updateProfile(selected.id, { lineWidth })} />
              </div>}
              {selected.shape === 'svg' && <div className="svg-note"><span className="svg-badge">SVG</span><span>{selected.svg?.sourceName ?? '自定义图形'}</span></div>}
            </section>

            <section className="card">
              <div className="card-title"><div><h2>变换</h2></div><span className="transform-mark">↗</span></div>
              <div className="slider-grid">
                <Slider label="X 缩放" value={selected.scaleX} min={0.2} max={4} step={0.1} onChange={scaleX => updateProfile(selected.id, { scaleX })} />
                <Slider label="Y 缩放" value={selected.scaleY} min={0.2} max={4} step={0.1} onChange={scaleY => updateProfile(selected.id, { scaleY })} />
                <Slider label="旋转" value={selected.rotation} min={-180} max={180} onChange={rotation => updateProfile(selected.id, { rotation })} />
                <Slider label="X 移动" value={selected.offsetX} min={-200} max={200} onChange={offsetX => updateProfile(selected.id, { offsetX })} />
                <Slider label="Y 移动" value={selected.offsetY} min={-200} max={200} onChange={offsetY => updateProfile(selected.id, { offsetY })} />
              </div>
            </section>
          </> : null}

          <section className="card shortcut-card">
            <div className="card-title"><div><h2>触发设置</h2></div><span className="keyboard-mark">⌘</span></div>
            <div className="mode-options">
              <span>切换方式</span>
              <div className="segmented-control">
                <button className={state.triggerMode === 'hold' ? 'chosen' : ''} onClick={() => void window.crosshair.setTriggerMode('hold')}>按住</button>
                <button className={state.triggerMode === 'toggle' ? 'chosen' : ''} onClick={() => void window.crosshair.setTriggerMode('toggle')}>切换</button>
                <button className={state.triggerMode === 'always' ? 'chosen' : ''} onClick={() => void window.crosshair.setTriggerMode('always')}>常开</button>
              </div>
            </div>
            {state.triggerMode === 'hold' && <div className="mode-options">
              <span>按住行为</span>
              <div className="segmented-control">
                <button className={state.holdBehavior === 'hide' ? 'chosen' : ''} onClick={() => void window.crosshair.setHoldBehavior('hide')}>按住隐藏</button>
                <button className={state.holdBehavior === 'show' ? 'chosen' : ''} onClick={() => void window.crosshair.setHoldBehavior('show')}>按住显示</button>
              </div>
            </div>}
            {state.triggerMode !== 'always' && <div className="shortcut-row"><div><b>触发按键</b></div>
              <TriggerButton triggerKey={state.triggerKey} capturing={capturing} onClick={() => void beginCapture()} /></div>}
          </section>
          </>}
        </div>

        {message && <div className="toast" role="status"><span>i</span>{message}<button aria-label="关闭提示" onClick={() => setMessage('')}>×</button></div>}
      </section>
    </div>
  </main>
}
