import { basename } from 'node:path'
import { DOMParser, type Element as XmlElement, type Node as XmlNode } from '@xmldom/xmldom'
import type { ImportedSvg, SvgNode } from '../shared/types.ts'
import { createProfile } from '../shared/defaults.ts'
import { SVG_TAGS } from '../shared/svg-model.ts'

const ROOT_ATTRIBUTES = new Set(['viewBox', 'xmlns', 'width', 'height', 'version', 'xml:space'])
const NUMERIC_ATTRIBUTES = new Set([
  'x', 'y', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r', 'rx', 'ry',
  'x1', 'y1', 'x2', 'y2', 'stroke-width', 'opacity'
])

function fail(message: string): never {
  throw new Error(message)
}

function finiteNumbers(value: string): number[] {
  const numbers = value.trim().split(/[\s,]+/).filter(Boolean).map(Number)
  if (!numbers.length || numbers.some(number => !Number.isFinite(number))) fail('SVG 中包含无效的数字。')
  return numbers
}

function sanitizeTransform(value: string): string {
  const allowed = /^(?:\s*(?:matrix|translate|scale|rotate|skewX|skewY)\(\s*[-+\d.eE,\s]+\)\s*)+$/
  if (value.length > 500 || !allowed.test(value) || /(?:NaN|Infinity)/i.test(value)) {
    fail('SVG 的 transform 格式不受支持。')
  }
  finiteNumbers(value.replace(/[a-zA-Z()]/g, ' '))
  return value.trim()
}

function sanitizeAttribute(tag: string, name: string, value: string): string {
  const allowed: Record<string, Set<string>> = {
    g: new Set(['transform']),
    path: new Set(['d', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'fill-rule', 'opacity']),
    line: new Set(['x1', 'y1', 'x2', 'y2', 'stroke', 'stroke-width', 'stroke-linecap', 'opacity']),
    polyline: new Set(['points', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'opacity']),
    polygon: new Set(['points', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'fill-rule', 'opacity']),
    circle: new Set(['cx', 'cy', 'r', 'fill', 'stroke', 'stroke-width', 'opacity']),
    ellipse: new Set(['cx', 'cy', 'rx', 'ry', 'fill', 'stroke', 'stroke-width', 'opacity']),
    rect: new Set(['x', 'y', 'width', 'height', 'rx', 'ry', 'fill', 'stroke', 'stroke-width', 'opacity'])
  }
  if (!allowed[tag]?.has(name)) fail(`SVG 属性 “${name}” 不受支持。`)
  if (value.length > 50000 || /url\s*\(|javascript:|data:/i.test(value)) fail('SVG 不能引用外部资源或脚本。')
  if (name === 'transform') return sanitizeTransform(value)
  if (name === 'd' || name === 'points') return value
  if (name === 'fill' || name === 'stroke') {
    if (value.trim().toLowerCase() === 'none') return 'none'
    if (/^currentcolor$/i.test(value.trim()) || value.trim()) return 'currentColor'
  }
  if (name === 'stroke-linecap' && ['butt', 'round', 'square'].includes(value)) return value
  if (name === 'stroke-linejoin' && ['miter', 'round', 'bevel'].includes(value)) return value
  if (name === 'fill-rule' && ['nonzero', 'evenodd'].includes(value)) return value
  if (NUMERIC_ATTRIBUTES.has(name)) {
    const numbers = finiteNumbers(value)
    if (numbers.length !== 1 || Math.abs(numbers[0]) > 100000) fail(`SVG 数值 “${name}” 超出支持范围。`)
    return String(numbers[0])
  }
  fail(`SVG 属性 “${name}” 的值不受支持。`)
}

function childElements(node: XmlNode): XmlNode[] {
  const children: XmlNode[] = []
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.nodeType === 1) children.push(child)
    else if (child.nodeType === 3 && child.nodeValue?.trim()) fail('SVG 内的文本内容不受支持。')
    else if (child.nodeType !== 3 && child.nodeType !== 8) fail('SVG 含有不受支持的 XML 节点。')
  }
  return children
}

function sanitizeElement(element: XmlElement, depth: number, count: { value: number }): SvgNode {
  if (depth > 16 || ++count.value > 500) fail('SVG 结构过于复杂。')
  const tag = element.localName || element.tagName.replace(/^.*:/, '')
  if (!SVG_TAGS.has(tag)) fail(`SVG 标签 “${tag}” 不受支持。请使用 path、line、circle、rect 等静态图形。`)
  const attributes: Record<string, string> = {}
  for (let i = 0; i < element.attributes.length; i++) {
    const attribute = element.attributes.item(i)
    if (!attribute) continue
    const name = attribute.name
    if (name.toLowerCase().startsWith('on')) fail('SVG 不能包含事件脚本。')
    attributes[name] = sanitizeAttribute(tag, name, attribute.value)
  }
  const children = childElements(element).map(child => sanitizeElement(child as XmlElement, depth + 1, count))
  const shape = tag as SvgNode['tag']
  if (shape === 'path' && !attributes.d) fail('SVG path 缺少 d 图形数据。')
  if (shape === 'line' && !['x1', 'y1', 'x2', 'y2'].every(key => key in attributes)) fail('SVG line 缺少端点坐标。')
  return { tag: shape, attributes, children }
}

export function sanitizeSvg(source: string, fileName: string): ImportedSvg {
  // SVG 不以 HTML 片段直接插入页面；这里只把有限的几何标签转成可验证的数据树。
  if (Buffer.byteLength(source, 'utf8') > 512 * 1024) fail('SVG 文件不能超过 512 KB。')
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) fail('SVG 不能包含 DOCTYPE 或自定义实体。')

  const parser = new DOMParser({
    onError: (_level, message) => fail(`SVG XML 无法解析：${message}`)
  })
  const document = parser.parseFromString(source, 'image/svg+xml')
  const root = document.documentElement
  if (!root || root.localName !== 'svg' || document.doctype) fail('文件不是受支持的 SVG 文档。')
  if (root.namespaceURI && root.namespaceURI !== 'http://www.w3.org/2000/svg') fail('SVG 命名空间不受支持。')

  let viewBoxValue: string | null = null
  for (let i = 0; i < root.attributes.length; i++) {
    const attribute = root.attributes.item(i)
    if (!attribute) continue
    if (!ROOT_ATTRIBUTES.has(attribute.name)) {
      if (attribute.name.toLowerCase().startsWith('on')) fail('SVG 不能包含事件脚本。')
      fail(`SVG 根属性 “${attribute.name}” 不受支持。`)
    }
    if (attribute.name === 'viewBox') viewBoxValue = attribute.value
  }
  if (!viewBoxValue) fail('SVG 必须声明 viewBox。')
  const viewBox = finiteNumbers(viewBoxValue)
  if (viewBox.length !== 4 || viewBox[2] <= 0 || viewBox[3] <= 0 || viewBox.some(n => Math.abs(n) > 100000)) {
    fail('SVG viewBox 无效或超出支持范围。')
  }

  const count = { value: 0 }
  const elements = childElements(root).map(node => sanitizeElement(node as XmlElement, 0, count))
  if (!elements.length) fail('SVG 中没有可绘制的图形。')
  return {
    viewBox: [viewBox[0], viewBox[1], viewBox[2], viewBox[3]],
    elements,
    sourceName: basename(fileName).replace(/\.svg$/i, '').slice(0, 64) || '自定义准星'
  }
}

export function createSvgProfile(svg: ImportedSvg) {
  const profile = createProfile('cross', svg.sourceName)
  profile.shape = 'svg'
  profile.svg = svg
  return profile
}
