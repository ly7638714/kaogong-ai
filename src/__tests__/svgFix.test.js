import { describe, it, expect } from 'vitest'
import { normalizeSvg } from '../utils/svgFix'
import { renderMd } from '../utils/renderMd'

describe('normalizeSvg 零裁切归一化', () => {
  it('无 viewBox 时按内容补 viewBox（带内边距）', () => {
    const out = normalizeSvg('<svg width="620" height="140"><rect x="10" y="10" width="100" height="100" fill="#111"/></svg>')
    expect(out).toContain('viewBox="4 4 112 112"')
    expect(out).toContain('preserveAspectRatio="xMidYMid meet"')
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(out).toContain('width="620"')
    expect(out).toContain('height="140"')
  })

  it('元素越出画布时 viewBox 扩展到内容边界（裁切根因修复）', () => {
    const out = normalizeSvg('<svg width="620" height="140"><rect x="590" y="50" width="60" height="40" fill="red"/></svg>')
    expect(out).toContain('viewBox="584 44 72 52"')
  })

  it('text 按字号与文字宽度计算边界（含汉字全角）', () => {
    const out = normalizeSvg('<svg width="620" height="140"><text x="600" y="80" font-size="30">问</text></svg>')
    expect(out).toContain('viewBox="594 41 42 52.5"')
  })

  it('g transform=translate 后按全局坐标计算边界', () => {
    const out = normalizeSvg('<svg width="620" height="140"><g transform="translate(120,10)"><rect x="0" y="0" width="40" height="40"/></g></svg>')
    expect(out).toContain('viewBox="113.3 3.3 53.5 53.5"')
  })

  it('已有 viewBox 但内容越界时取并集扩展', () => {
    const out = normalizeSvg('<svg width="420" height="420" viewBox="0 0 420 420"><rect x="400" y="400" width="60" height="60"/></svg>')
    expect(out).toContain('viewBox="0 0 466.8 466.8"')
  })

  it('畸形/空内容回退到宽高 viewBox', () => {
    expect(normalizeSvg('<svg width="100" height="50"></svg>')).toContain('viewBox="0 0 100 50"')
    expect(normalizeSvg('not svg')).toBe('not svg')
  })

  it('circle / line / polygon / path 都能算出边界', () => {
    const svg = '<svg width="200" height="200"><circle cx="100" cy="100" r="50"/><line x1="0" y1="0" x2="200" y2="200" stroke-width="4"/><polygon points="10,10 190,10 190,190"/><path d="M 0 200 L 200 0 C 250 -50 300 50 200 200 Z"/></svg>'
    const out = normalizeSvg(svg)
    const vb = out.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number)
    const [minX, minY, w, h] = vb
    // 所有内容应落在 viewBox 内：line 到 (200,200)、path 控制点到 (300,50)、polygon 到 (190,190)、circle 到 (150,150)
    expect(minX).toBeLessThanOrEqual(-6 + 0.1)
    expect(minX + w).toBeGreaterThanOrEqual(300 + 6 - 0.1)
    expect(minY).toBeLessThanOrEqual(-6 + 0.1)
    expect(minY + h).toBeGreaterThanOrEqual(200 + 6 - 0.1)
  })

  it('白底白图安全网：纯白无描边形状自动补浅灰描边，永不空白', () => {
    const out = normalizeSvg('<svg width="200" height="100"><rect x="10" y="10" width="40" height="40" fill="#fff"/><circle cx="120" cy="50" r="30" fill="white"/></svg>')
    expect(out).toContain('stroke="#bbbbbb"')
    expect(out).toContain('stroke-width="1.5"')
    // 已有可见描边的白块不被重复加边
    const out2 = normalizeSvg('<svg width="200" height="100"><rect x="10" y="10" width="40" height="40" fill="#fff" stroke="#999" stroke-width="1"/></svg>')
    expect(out2).toContain('stroke="#999"')
    expect(out2).not.toContain('stroke="#bbbbbb"')
  })

  it('renderMd 渲染 svg 代码块时自动归一化（题干/选项同路径）', () => {
    const md = '题干\n\n```svg\n<svg width="620" height="140"><rect x="590" y="50" width="60" height="40" fill="red"/></svg>\n```\n\nA. 甲 B. 乙'
    const html = renderMd(md)
    expect(html).toContain('class="gen-svg"')
    expect(html).toContain('viewBox="584 44 72 52"')
    expect(html).toContain('preserveAspectRatio="xMidYMid meet"')
  })
})
