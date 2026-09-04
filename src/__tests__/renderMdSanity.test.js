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
