// deterministicGate.test.js —— 37号 量化门禁·基线1：确定性生成器「生成即校验，零已知错题」
// 对本地确定性生成器（图推/数量/政治）批量抽取并跑 localQuizVerify 全闸；任一出错即失败 → 倒逼修复。
import { describe, it, expect } from 'vitest'
import { genTutuQuestion } from '../utils/tutuGen'
import { genSlQuestion } from '../utils/slGen'
import { genZzQuestion } from '../utils/zzGen'
import { localQuizVerify } from '../utils/quizVerify'

const runs = { 图推: 60, 数量: 80, 政治: 60 }
function probe(name, gen) {
  const errs = []
  for (let i = 0; i < runs[name]; i++) {
    let q = null
    for (let k = 0; k < 6 && !q; k++) { try { q = gen() } catch (e) { errs.push('gen throw #' + i + ': ' + e.message); break } }
    if (!q || !q.stem || !Array.isArray(q.options) || !q.answer) { errs.push('结构缺失 #' + i); continue }
    // 统一为 {k,t} 规范形态（legacy 纯字符串数组也按序补键）
    const norm = q.options.map((o, ix) => (o && typeof o === 'object' && o.t != null ? { k: o.k, t: o.t } : { k: 'ABCD'[ix], t: String(o) }))
    if (norm.some((o) => !o.k)) { errs.push('选项缺键 #' + i); continue }
    const v = localQuizVerify({ ...q, options: norm })
    if (!v.ok) errs.push('verify fail #' + i + ': ' + v.reason)
  }
  return errs
}

describe('37号 门禁·确定性生成器零已知错题', () => {
  it('图推 60 抽全过闸', () => {
    const errs = probe('图推', genTutuQuestion)
    expect(errs).toEqual([])
  })
  it('数量 80 抽全过闸', () => {
    const errs = probe('数量', genSlQuestion)
    expect(errs).toEqual([])
  })
  it('政治 60 抽全过闸', () => {
    const errs = probe('政治', genZzQuestion)
    expect(errs).toEqual([])
  })
})