import { describe, it, expect } from 'vitest'
import { renderMd } from '../utils/renderMd'

describe('renderMd smoke', () => {
  it('table renders', () => {
    const md = '| a | b |\n|---|---|\n| 1 | 2 |'
    const html = renderMd(md)
    expect(html).toContain('<table')
    expect(html).not.toContain('|---|---|')
  })
  it('svg fence renders svg', () => {
    const md = 'head\n\n```svg\n<svg viewBox="0 0 10 10"><rect width="5" height="5"/></svg>\n```'
    const html = renderMd(md)
    expect(html).toContain('<svg')
  })
  it('empty svg fence not shown', () => {
    const html = renderMd('A. ```svg ```')
    expect(html.includes('```')).toBe(false)
  })
})

describe('GFM 表格渲染', () => {
  it('管道表格渲染成 <table><th><td>', async () => {
    const m = await import('../utils/renderMd')
    const h = m.renderMd('## 标题\n\n| 板块 | 错题 |\n| --- | --- |\n| 逻辑判断与推理 | 5 |\n| 资料分析 | 22 |')
    expect(h).toContain('<table>')
    expect(h).toContain('<th>板块</th>')
    expect(h).toContain('<td>5</td>')
    expect(h).toContain('table-scroll')
  })
})
