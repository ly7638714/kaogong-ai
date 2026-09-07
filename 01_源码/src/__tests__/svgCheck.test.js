import { describe, it, expect } from 'vitest'
import { checkFigureText } from '../utils/svgCheck'

describe('svgCheck 配图强校验', () => {
  it('合法 svg（含 viewBox）通过', () => {
    const svg = '<svg viewBox="0 0 100 100"><rect x="0" y="0" width="10" height="10"/></svg>'
    expect(checkFigureText('题干 ' + svg).ok).toBe(true)
    expect(checkFigureText('题干 ' + svg).n).toBe(1)
  })
  it('无 svg 纯文字：ok（由调用方决定“必须有图”约束）', () => {
    expect(checkFigureText('没有图形的题干')).toEqual({ ok: true, n: 0, issue: '' })
  })
  it('未闭合 svg → 拒绝', () => {
    expect(checkFigureText('<svg viewBox="0 0 100 100"><rect/>').ok).toBe(false)
  })
  it('缺 viewBox → 拒绝', () => {
    expect(checkFigureText('<svg width="100" height="100"><rect/></svg>').ok).toBe(false)
  })
  it('多个 svg 需全部合法', () => {
    const a = '<svg viewBox="0 0 1 1"></svg>'
    const b = '<svg viewBox="0 0 2 2"></svg>'
    expect(checkFigureText(a + '与' + b).n).toBe(2)
    expect(checkFigureText(a + '<svg></svg>').ok).toBe(false)
  })
  it('非法输入安全', () => {
    expect(checkFigureText(null).ok).toBe(true)
    expect(checkFigureText('').ok).toBe(true)
  })
})
