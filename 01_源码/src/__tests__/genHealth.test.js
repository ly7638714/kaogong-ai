import { describe, it, expect, beforeEach } from 'vitest'
import { genHealth } from '../utils/genHealth'
import { KEYS } from '../utils/storage'

const mem = new Map()
function seed(arr) { mem.set(KEYS.QUIZ_LOG, JSON.stringify(arr)) }
beforeEach(() => { mem.clear(); globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)) }, removeItem: (k) => { mem.delete(k) } } })
const rec = (plate, variant, ok, attempts = 1, reasons = []) => ({ t: Date.now(), plate, variant, ok, attempts, reasons, src: 'single' })

describe('genHealth 跨卷出题健康', () => {
  it('汇总总数并找出失败最多的板块·题型', () => {
    seed([rec('言语理解', '片段阅读', false, 3, ['AI质检未过']), rec('言语理解', '片段阅读', false, 1, ['AI质检未过']), rec('言语理解', '片段阅读', true),
          rec('数量关系', '工程问题', true), rec('图形推理', '', false)])
    const h = genHealth({ minGen: 2 })
    expect(h.total).toEqual({ gen: 5, fail: 3, attempts: 7 })
    expect(h.rows[0]).toMatchObject({ plate: '言语理解', variant: '片段阅读', gen: 3, fail: 2, attempts: 5 })
    expect(h.reasonsTop.join('')).toContain('AI质检未过')
  })
  it('出题量低于 minGen 的组不进入薄弱点榜', () => {
    seed([rec('言语理解', '片段阅读', false), rec('图形推理', '', false), rec('图形推理', '', false)])
    const h = genHealth({ minGen: 2, topN: 3 })
    expect(h.rows.some((r) => r.plate === '言语理解')).toBe(false)
    expect(h.rows[0]).toMatchObject({ plate: '图形推理', variant: '综合', gen: 2, fail: 2 })
  })
  it('空日志安全；minGen/topN 边界防呆', () => {
    expect(genHealth()).toEqual({ total: { gen: 0, fail: 0, attempts: 0 }, rows: [], reasonsTop: [] })
    expect(genHealth({ minGen: 0, topN: 0 }).rows).toEqual([])
  })
  it('干净数据失败为 0 时 rows 仍按出题量排序', () => {
    const arr = []
    for (let i = 0; i < 6; i++) arr.push(rec('常识判断', '', true))
    for (let i = 0; i < 3; i++) arr.push(rec('言语理解', '逻辑填空', true))
    seed(arr)
    const h = genHealth({ minGen: 2, topN: 2 })
    expect(h.total.fail).toBe(0)
    expect(h.rows).toHaveLength(2)
    expect(h.rows[0].plate).toBe('常识判断')
  })
})
