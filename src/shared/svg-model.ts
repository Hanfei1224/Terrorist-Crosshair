import type { ImportedSvg, SvgNode } from './types'

// 这份白名单用于复验导入结果和磁盘配置，限制 SVG 节点、属性、数量与嵌套深度。
export const SVG_TAGS = new Set(['g', 'path', 'line', 'polyline', 'polygon', 'circle', 'ellipse', 'rect'])

const ATTRIBUTES: Record<string, Set<string>> = {
  g: new Set(['transform']),
  path: new Set(['d', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'fill-rule', 'opacity']),
  line: new Set(['x1', 'y1', 'x2', 'y2', 'stroke', 'stroke-width', 'stroke-linecap', 'opacity']),
  polyline: new Set(['points', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'opacity']),
  polygon: new Set(['points', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'fill-rule', 'opacity']),
  circle: new Set(['cx', 'cy', 'r', 'fill', 'stroke', 'stroke-width', 'opacity']),
  ellipse: new Set(['cx', 'cy', 'rx', 'ry', 'fill', 'stroke', 'stroke-width', 'opacity']),
  rect: new Set(['x', 'y', 'width', 'height', 'rx', 'ry', 'fill', 'stroke', 'stroke-width', 'opacity'])
}

export function isSafeSvgDocument(value: unknown): value is ImportedSvg {
  if (!value || typeof value !== 'object') return false
  const svg = value as Partial<ImportedSvg>
  if (!Array.isArray(svg.viewBox) || svg.viewBox.length !== 4 || !svg.viewBox.every(Number.isFinite)) return false
  if (svg.viewBox[2] <= 0 || svg.viewBox[3] <= 0 || !Array.isArray(svg.elements) || svg.elements.length > 500) return false
  if (typeof svg.sourceName !== 'string' || svg.sourceName.length > 128) return false

  let count = 0
  const visit = (nodes: unknown[], depth: number): boolean => {
    if (depth > 16) return false
    for (const value of nodes) {
      if (++count > 500 || !value || typeof value !== 'object') return false
      const node = value as Partial<SvgNode>
      if (typeof node.tag !== 'string' || !SVG_TAGS.has(node.tag)) return false
      if (!node.attributes || typeof node.attributes !== 'object' || Array.isArray(node.attributes)) return false
      for (const [name, attribute] of Object.entries(node.attributes)) {
        if (!ATTRIBUTES[node.tag].has(name) || typeof attribute !== 'string' || attribute.length > 50000) return false
        if (/url\s*\(|javascript:|data:/i.test(attribute)) return false
      }
      if (!Array.isArray(node.children) || !visit(node.children, depth + 1)) return false
    }
    return true
  }
  return visit(svg.elements, 0)
}
