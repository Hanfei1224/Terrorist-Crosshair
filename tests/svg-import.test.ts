import assert from 'node:assert/strict'
import test from 'node:test'
import { sanitizeSvg } from '../src/main/svg-import.ts'

// 检查静态 SVG 的标准化结果，并锁定脚本、外链和不支持标签的拒绝行为。
test('imports static SVG geometry and normalizes artwork to the selected tint', () => {
  const svg = sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g transform="translate(2 3)"><path d="M0 0h10" stroke="#000" fill="none"/></g></svg>', 'custom.svg')
  assert.equal(svg.sourceName, 'custom')
  assert.deepEqual(svg.viewBox, [0, 0, 100, 100])
  assert.equal(svg.elements[0].children[0].attributes.stroke, 'currentColor')
  assert.equal(svg.elements[0].children[0].attributes.fill, 'none')
})

test('rejects scripts, external resources, and unsupported SVG elements', () => {
  assert.throws(() => sanitizeSvg('<svg viewBox="0 0 10 10"><script>alert(1)</script></svg>', 'x.svg'), /不受支持/)
  assert.throws(() => sanitizeSvg('<svg viewBox="0 0 10 10"><image href="https://example.com/a.png"/></svg>', 'x.svg'), /不受支持/)
  assert.throws(() => sanitizeSvg('<svg viewBox="0 0 10 10"><path d="M0 0" onload="alert(1)"/></svg>', 'x.svg'), /事件脚本/)
})
