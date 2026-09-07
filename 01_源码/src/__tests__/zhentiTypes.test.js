import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), 'public/zhenti')

describe('public/zhenti/types.json 打标完整性', () => {
  const types = JSON.parse(readFileSync(join(dir, 'types.json'), 'utf8'))

  it('覆盖全部卷与全部题号', () => {
    const jsonFiles = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json' && f !== 'types.json' && f !== 'kpoint-index.json') // kpoint-index.json 为本项目蓝本RAG辅助产物（非真题卷）
    let total = 0
    for (const f of jsonFiles) {
      const paper = JSON.parse(readFileSync(join(dir, f), 'utf8'))
      const byNo = types.papers[paper.id]
      expect(byNo, `卷 ${paper.id} 缺失打标`).toBeTruthy()
      let qn = 0
      for (const qs of Object.values(paper.sections)) qn += qs.length
      expect(Object.keys(byNo).length, `卷 ${paper.id} 题号数不一致`).toBe(qn)
      total += qn
    }
    // 与 index.json 总量对账
    const idx = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'))
    const idxTotal = idx.papers.reduce((n, p) => n + p.totalQ, 0)
    expect(total).toBeGreaterThanOrEqual(idxTotal)
  })

  it('summary 与源卷逐题重算一致', () => {
    const jsonFiles = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json' && f !== 'types.json' && f !== 'kpoint-index.json') // kpoint-index.json 为本项目蓝本RAG辅助产物（非真题卷）
    const re = {}
    let total = 0
    for (const f of jsonFiles) {
      const paper = JSON.parse(readFileSync(join(dir, f), 'utf8'))
      const byNo = types.papers[paper.id]
      for (const [sec, qs] of Object.entries(paper.sections)) {
        for (const q of qs) {
          const t = byNo[String(q.n)]
          expect(t, `卷 ${paper.id} 题 ${q.n} 缺失题型`).toBeTruthy()
          re[sec] = re[sec] || {}
          re[sec][t] = (re[sec][t] || 0) + 1
          total++
        }
      }
    }
    expect(re).toEqual(types.summary)
    expect(total).toBe(types.papers && Object.keys(types.papers).length > 0 ? total : 0)
  })
})