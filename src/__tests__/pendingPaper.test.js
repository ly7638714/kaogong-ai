import { describe, it, expect, beforeEach } from 'vitest'
import { savePending, loadPending, clearPending } from '../utils/pendingPaper'
import { KEYS } from '../utils/storage'

const mem = new Map()
beforeEach(() => {
  mem.clear()
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, String(v)) },
    removeItem: (k) => { mem.delete(k) }
  }
})
const Q = (over = {}) => ({ subject: '数量关系', variant: '工程问题', difficulty: 'mid', stem: '题干文本…', options: [{ k: 'A', t: '1' }, { k: 'B', t: '2' }, { k: 'C', t: '3' }, { k: 'D', t: '4' }], answer: 'C', explain: '解析…', picked: null, correct: null, timeout: false, ...over })

describe('pendingPaper 组卷断点续出', () => {
  it('保存→读取 往返一致（ok/n/name/失败题保留 err）', () => {
    const paper = { name: '模拟卷·X', questions: [Q(), Q({ err: true, stem: '（出题失败：X）' }), Q({ subject: '言语理解', variant: '片段阅读' })] }
    expect(savePending(paper)).toBe(true)
    const d = loadPending()
    expect(d.ok).toBe(2)
    expect(d.n).toBe(1)
    expect(d.items).toHaveLength(3)
    expect(d.items[1].err).toBe(true)
    expect(d.items[1].stem).toContain('出题失败')
    expect(d.name).toBe('模拟卷·X')
    expect(d.items[0].picked).toBeUndefined() // 运行态字段被剔除
  })
  it('全成功卷不落草稿（无失败 → 无意义）', () => {
    const paper = { name: 'A', questions: [Q(), Q()] }
    expect(savePending(paper)).toBe(false)
    expect(loadPending()).toBeNull()
  })
  it('clearPending 清空；空/脏数据读取为 null', () => {
    const paper = { name: 'B', questions: [Q(), Q({ err: true })] }
    savePending(paper)
    expect(loadPending()).not.toBeNull()
    clearPending()
    expect(loadPending()).toBeNull()
    mem.set(KEYS.PENDING_PAPER, 'not json {')
    expect(loadPending()).toBeNull()
  })
  it('超出 MAX_ITEMS 时截断保存仍可用', () => {
    const items = []
    for (let i = 0; i < 320; i++) items.push(Q({ variant: 'v' + i }))
    items[10].err = true
    expect(savePending({ name: '大卷', questions: items })).toBe(true)
    const d = loadPending()
    expect(d.items.length).toBe(300)
  })
})
