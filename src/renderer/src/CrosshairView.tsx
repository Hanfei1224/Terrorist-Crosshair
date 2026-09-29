import { createElement, type CSSProperties, type ReactNode } from 'react'
import type { CrosshairProfile, SvgNode } from '../../shared/types'

// 将已清洗的 SVG 数据树映射为 React SVG 元素，不把用户文件当作 HTML 插入页面。
function safeSvgNode(node: SvgNode, key: number): ReactNode {
  const attributeMap: Record<string, string> = {
    'stroke-width': 'strokeWidth',
    'stroke-linecap': 'strokeLinecap',
    'stroke-linejoin': 'strokeLinejoin',
    'fill-rule': 'fillRule'
  }
  const props: Record<string, string | number> = {}
  for (const [name, value] of Object.entries(node.attributes)) {
    props[attributeMap[name] ?? name] = value
  }
  if (node.tag === 'line' || node.tag === 'polyline') props.fill ??= 'none'
  if (node.tag === 'g') props.fill ??= 'currentColor'
  return createElement(node.tag, { ...props, key }, node.children.map(safeSvgNode))
}

function Shape({ profile }: { profile: CrosshairProfile }) {
  const width = profile.lineWidth
  const length = profile.length
  const gap = profile.gap
  if (profile.shape === 'cross') {
    return <g
      fill="currentColor"
      stroke={profile.outlineEnabled ? '#000' : 'none'}
      strokeWidth={profile.outlineWidth * 2}
      strokeOpacity={profile.outlineOpacity}
      strokeLinejoin="round"
      paintOrder="stroke"
    >
      {/* 描边先画、色块后画，避免较粗的黑色描边吞掉准星本色。 */}
      {/* 横线和竖线分别缩放，避免 X/Y 参数相互影响。 */}
      <g transform={`translate(50 50) scale(${profile.scaleX} 1) translate(-50 -50)`}>
        <rect x={50 - gap - length} y={50 - width / 2} width={length} height={width} rx={width / 2} />
        <rect x={50 + gap} y={50 - width / 2} width={length} height={width} rx={width / 2} />
      </g>
      <g transform={`translate(50 50) scale(1 ${profile.scaleY}) translate(-50 -50)`}>
        <rect x={50 - width / 2} y={50 - gap - length} width={width} height={length} rx={width / 2} />
        <rect x={50 - width / 2} y={50 + gap} width={width} height={length} rx={width / 2} />
      </g>
    </g>
  }
  if (profile.shape === 'circle') {
    return <>
      {profile.outlineEnabled && <circle cx="50" cy="50" r={length / 2} fill="none" stroke="#000"
        strokeWidth={width + profile.outlineWidth * 2} strokeOpacity={profile.outlineOpacity} />}
      <circle cx="50" cy="50" r={length / 2} fill="none" stroke="currentColor" strokeWidth={width} />
    </>
  }
  if (profile.shape === 'dot') return <circle cx="50" cy="50" r={width / 2} fill="currentColor" />
  return null
}

export function CrosshairView({ profiles, visible }: { profiles: CrosshairProfile[]; visible: boolean }) {
  return <div className="overlay-root" style={{ visibility: visible ? 'visible' : 'hidden' }} aria-hidden="true">
    {profiles.filter(profile => profile.enabled).map(profile => {
      const graphicStyle: CSSProperties = {
        // 每层锚定屏幕中心；旋转作用于整体，十字 X/Y 缩放各自作用于横/竖线组。
        left: `calc(50% + ${profile.offsetX}px)`,
        top: `calc(50% + ${profile.offsetY}px)`,
        color: profile.color,
        transform: `translate(-50%, -50%) rotate(${profile.rotation}deg)${profile.shape === 'cross' ? '' : ` scale(${profile.scaleX}, ${profile.scaleY})`}`
      }
      return <div className="crosshair-anchor" style={graphicStyle} key={profile.id}>
        <svg width="100" height="100" viewBox={profile.shape === 'svg' && profile.svg
          ? profile.svg.viewBox.join(' ')
          : '0 0 100 100'}
        >
          {profile.shape === 'svg' && profile.svg
            ? <g fill="currentColor" stroke="none">{profile.svg.elements.map(safeSvgNode)}</g>
            : <>
              <Shape profile={profile} />
              {(profile.shape === 'cross' || profile.shape === 'circle') && profile.centerPointEnabled && <g>
                {profile.centerPointOutlineWidth > 0 && <circle cx="50" cy="50"
                  r={profile.centerPointSize / 2 + profile.centerPointOutlineWidth} fill="#000" />}
                <circle cx="50" cy="50" r={profile.centerPointSize / 2} fill="currentColor" />
              </g>}
            </>}
        </svg>
      </div>
    })}
  </div>
}
