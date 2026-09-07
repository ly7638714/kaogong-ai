// anchorSet 锚点题（35号批次4-B）回归：每板块固定10题、id 唯一、纸面可定位
import { describe, it, expect } from 'vitest'
import { anchorsOf, allAnchors, ANCHOR_META } from '../data/anchorSet'
import indexData from '../../public/zhenti/index.json'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

describe('anchorSet 数据完整性', () => {
  it('五大板块各固定 10 题且 id 唯一', () => {
    const plates = Object.keys(ANCHOR_META.counts || {})
    expect(plates.length).toBe(5)
    plates.forEach((pl) => {
      const list = anchorsOf(pl)
      expect(list.length).toBe(10)
      const keys = list.map((a) => a.paper + '#' + a.n)
      expect(new Set(keys).size).toBe(10)
    })
  })
  it('每个 (paper, n) 都能在真题索引中找到', () => {
    const ids = new Set(indexData.papers.map((p) => p.id))
    allAnchors().forEach((a) => { expect(ids.has(a.paper)).toBe(true); expect(Number(a.n)).toBeGreaterThan(0) })
  })
  it('抽查：每个板块首末锚点在对应真题卷对应板块中真实存在（防数据漂移）', async () => {
    const root = join(process.cwd(), 'public', 'zhenti')
    for (const pl of Object.keys(ANCHOR_META.counts)) {
      const list = anchorsOf(pl)
      for (const pick of [0, list.length - 1]) {
        const a = list[pick]
        const rec = JSON.parse(await readFile(join(root, a.paper + '.json'), 'utf8'))
        const hit = (rec.sections && rec.sections[pl] || []).find((q) => Number(q.n) === Number(a.n))
        expect(!!hit).toBe(true)
      }
    }
  })
})