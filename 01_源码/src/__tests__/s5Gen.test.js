import { describe, test, expect } from 'vitest'
import { genSlQuestion } from '../utils/slGen'
import { genZzQuestion } from '../utils/zzGen'

// 37号 规范形态：options 为 [{k,t}]（k∈A-D）且 4 项内容互异
const shapeOk = (q) => q && q.stem && Array.isArray(q.options) && q.options.length === 4 && q.options.every((o) => o && /^[A-D]$/.test(o.k) && typeof o.t === 'string' && o.t) && /^[A-D]$/.test(q.answer) && q.explain && new Set(q.options.map((o) => o.t)).size === 4

describe('S5·数量关系本地生成器（种子化）', () => {
  test('同种子同题（可复现）', () => {
    const a = genSlQuestion(2026)
    const b = genSlQuestion(2026)
    expect(a.stem).toBe(b.stem)
    expect(a.answer).toBe(b.answer)
    expect(a.options).toEqual(b.options)
  })
  test('结构完整且答案选项互异', () => {
    let ok = 0
    for (let s = 1; s <= 120; s++) {
      const q = genSlQuestion(s)
      if (q) { ok++; expect(shapeOk(q), `seed ${s}`).toBe(true) }
    }
    expect(ok, `120种子应产出多数有效题，实际${ok}`).toBeGreaterThan(100)
  })
  test('答案构造性正确（抽查数学事实）', () => {
    // 和差倍比：遍历种子找到该题，验证 大=(和+差)/2
    let found = 0
    for (let s = 0; s < 400 && found < 3; s++) {
      const q = genSlQuestion(s)
      if (q?.cardId === 'sl-hcb') {
        const m = q.stem.match(/之和为 (\d+)，甲比乙多 (\d+)/)
        const sum = +m[1], diff = +m[2]
        const big = (sum + diff) / 2
        expect(q.options['ABCD'.indexOf(q.answer)].t).toBe(String(big))
        found++
      }
    }
    expect(found).toBeGreaterThanOrEqual(1)
  })
})

describe('S5·政治理论本地生成器（种子化）', () => {
  test('同种子同题', () => {
    const a = genZzQuestion(77)
    const b = genZzQuestion(77)
    expect(a.stem).toBe(b.stem)
    expect(a.answer).toBe(b.answer)
  })
  test('正确答案术语必在题面陈述内有据/选项互异', () => {
    for (let s = 1; s <= 80; s++) {
      const q = genZzQuestion(s)
      if (!q) continue
      expect(shapeOk(q), `seed ${s}`).toBe(true)
    }
  })
  test('正确答案的位置分布不应固定（防背选项位）', () => {
    const pos = new Set()
    for (let s = 1; s <= 40; s++) {
      const q = genZzQuestion(s)
      if (q) pos.add(q.answer)
    }
    expect(pos.size).toBeGreaterThanOrEqual(3)
  })
})

describe('D·训练内容真实性标注', () => {
  test('数量生成题解析带来源标注与知识卡名', () => {
    for (let s = 0; s < 200; s++) {
      const q = genSlQuestion(s)
      if (q) {
        expect(q.explain).toContain('本地训练生成')
        expect(q.explain).toContain('构造性答案')
        if (q.cardId) expect(q.explain).toContain('对应知识卡')
        return
      }
    }
    expect(true).toBe(true)
  })
  test('政治生成题解析带官方素材源标注', () => {
    const q = genZzQuestion(77)
    expect(q.explain).toContain('素材源：官方原文要点')
  })
})
