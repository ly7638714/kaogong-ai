import { describe, it, expect } from 'vitest'
import { verifyTruthTable } from '../utils/logicVerify'

describe('verifyTruthTable', () => {
  it('parses and evaluates implication C->D correctly (regression for token-split bug)', () => {
    // 题设：exprs = [A, B, C, C->D]，要求恰好 4 个条件为真。
    // 唯一解恰为 A=B=C=D=true。
    // 回归背景：旧 token 分隔符不含 '->'，把 'C->D' 拆成 'C-' + '>'，
    // 使 C->D 被算出恒为真 -> 「A=B=C=T,D=F」也会满足 4 真，
    // 于是出现 2 个解, 校验误判为"不唯一"。
    const r = verifyTruthTable({
      exprs: ['A', 'B', 'C', 'C->D'],
      trueCount: 4,
      opts: ['!A', '!B', 'A&B&C&!D', 'A&B&C&D'],
      ans: 'D' // D 选项 = A&B&C&D，唯一真
    })
    expect(r.ok).toBe(true)
    expect(r.sol).toEqual({ A: true, B: true, C: true, D: true })
  })

  it('rejects when the premise has no unique solution (multiple satisfying rows)', () => {
    // 仅 'A' 且恰好 1 真：A=true 时 B/C/D 任意（共 8 行），非唯一解
    const r = verifyTruthTable({
      exprs: ['A'],
      trueCount: 1,
      opts: ['A', 'B', 'C', 'D'],
      ans: 'A'
    })
    expect(r.ok).toBe(false)
  })

  it('2-3 主体题可判定唯一解（回归：旧实现固定枚举 A-D，未引用原子成自由变量导致永无唯一解）', () => {
    // 题设只有 A/B/C 三个主体。旧实现 atoms 固定为 A-D，D 成为自由变量使解数翻倍，
    // 任何 2-3 主体真假话题都会被误判为"不唯一"。新实现只枚举实际出现的原子。
    const r = verifyTruthTable({
      exprs: ['A', 'B', 'C'],
      trueCount: 3, // 仅 A=B=C=true 时恰好 3 真 -> 唯一解
      opts: ['!A', '!B', '!C', 'A&B&C'],
      ans: 'D'
    })
    expect(r.ok).toBe(true)
    expect(r.sol).toEqual({ A: true, B: true, C: true })
  })

  it('两个主体可直接判定唯一解', () => {
    // 只有 A、B 两个主体：exprs=['A','!B']，trueCount=2 → 唯一解 {A=T,B=F}
    const r = verifyTruthTable({
      exprs: ['A', '!B'],
      trueCount: 2,
      opts: ['!A', 'B', 'A&!B', '!A&!B'],
      ans: 'C' // C 选项 = 'A&!B'，唯一真
    })
    expect(r.ok).toBe(true)
    expect(r.sol).toEqual({ A: true, B: false })
  })

  it('rejects a malformed expression that leaves an unknown atom token (no silent false)', () => {
    // 'C-D' 中的 '-' 不是合法语法，解析后产生未知原子 'C-D'。
    // 旧实现 evalE 对未知原子静默返回 false, 掩盖解析错误；现应判无效。
    const r = verifyTruthTable({
      exprs: ['C-D'],
      trueCount: 1,
      opts: ['A', 'B'],
      ans: 'A'
    })
    expect(r.ok).toBe(false)
  })
})
