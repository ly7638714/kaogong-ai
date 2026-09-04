import { describe, it, expect } from 'vitest'
import { normalizeRichText, richMd, snippet, cleanTextKeepFigures } from '../utils/wrongText'

describe('wrongText 渲染净化', () => {
  it('字面 \\n 被还原为真实换行（表格因此可渲染）', () => {
    const raw = '| a | b |\\n|---|---|\\n| 1 | 2 |'
    const n = normalizeRichText(raw)
    expect(n.includes('| a | b |\n')).toBe(true)
    const html = richMd(raw)
    expect(html).toContain('<table')
  })
  it('空 svg 围栏与 ``` 残留被清除', () => {
    expect(normalizeRichText('A. ```svg ``` B. ```svg')).not.toContain('```svg')
    expect(richMd('A. ```svg ```')).not.toContain('```')
  })
  it('真实 svg 围栏保留并渲染', () => {
    const raw = 'head\n\n```svg\n<svg viewBox="0 0 10 10"></svg>\n```'
    expect(normalizeRichText(raw)).toContain('```svg\n<svg')
    expect(richMd(raw)).toContain('<svg')
  })
  it('空/非法输入安全', () => {
    expect(normalizeRichText(null)).toBe('')
    expect(richMd('')).toBe('')
  })
  it('snippet：真图围栏→【图】占位、清 ``` 记号、限长', () => {
    const raw = '题干开头\\n\\n```svg\\n<svg viewBox="0 0 10 10"></svg>\\n``` 后文'
    const s = snippet(raw, 40)
    expect(s).toContain('【图】')
    expect(s).not.toContain('```')
    expect(s.length).toBeLessThanOrEqual(40)
    expect(snippet('  多个  空格  词  ', 10)).not.toContain('  ')
    expect(snippet('', 5)).toBe('')
  })
  it('整题脏记录（字面换行+表格+真图+残留围栏）净化后为真表格/真图且无源码记号', () => {
    const dirty = '材料：\\n| 城市 | 增量 |\\n|---|---|\\n| 甲 | 12 |\\n\\n```svg\\n<svg viewBox="0 0 120 80"><rect x="1" y="1" width="118" height="78" fill="none" stroke="#333"/><line x1="10" y1="70" x2="110" y2="70" stroke="#2f6fb3" stroke-width="2"/></svg>\\n```\\n据此判断（ ）\\n```svg``` \\nA. 甲最高 \\nB. 乙次之'
    const html = richMd(dirty)
    expect(html).toContain('<table')
    expect(html).toContain('gen-svg')
    expect(html).toContain('<svg')
    expect(html).not.toContain('```')
  })
  it('snippet 默认长度 60', () => {
    const s = snippet('x'.repeat(200), undefined)
    expect(s.length).toBe(60)
  })
})
describe('cleanTextKeepFigures 复盘/变式保真清洗', () => {
  it('保留 svg 围栏与表格换行，仅去除围栏外 HTML', () => {
    const dirty = '表格<b>样式</b>\\n| 城市 | 增量 |\\n|---|---|\\n| 甲 | 12 |\\n\\n```svg\\n<svg viewBox="0 0 10 10"><rect/></svg>\\n```\\n尾 <i>注</i>'
    const c = cleanTextKeepFigures(dirty)
    expect(c).toContain('<svg viewBox')
    expect(c).toContain('| 城市 | 增量 |')
    expect(c).toContain('|---|---|')
    expect(c).not.toContain('<b>')
    expect(c).not.toContain('<i>')
  })
  it('空/孤立 svg 围栏仍被净化掉', () => {
    expect(cleanTextKeepFigures('A. ```svg ``` B. ```svg 文本')).not.toContain('```')
  })
})
