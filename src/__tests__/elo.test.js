// elo 单人能力值引擎（35号批次4-A 灰度）回归：收敛方向 / 步长衰减 / 时间折价 / 层级收缩
import { describe, it, expect } from 'vitest'
import { replayElo, THETA0 } from '../utils/elo'

// 生成一段作答序列：plate/kpoint/diff 固定，控制正确率与用时
function seq(n, okRatio, okSec, wrongSec, t0 = 1000000) {
  const arr = []
  for (let i = 0; i < n; i++) {
    const ok = i / n < okRatio
    arr.push({
      t: t0 + i * 60000,
      plate: '资料分析',
      kpoint: '资料分析·比重',
      variant: '比重',
      reqDiff: 'mid',
      ok,
      usedSec: ok ? okSec : wrongSec,
      genVer: 'g1'
    })
  }
  return arr
}

describe('replayElo 收敛方向', () => {
  it('正确率高 → θ 高于基线；正确率低 → θ 低于基线', () => {
    const good = replayElo(seq(300, 0.8, 30, 30)).kpoints['资料分析·比重']
    const poor = replayElo(seq(300, 0.3, 30, 30)).kpoints['资料分析·比重']
    expect(good.θ).toBeGreaterThan(THETA0 + 80)
    expect(poor.θ).toBeLessThan(THETA0 - 80)
    expect(good.n).toBe(300)
  })
  it('无数据返回空表', () => {
    const r = replayElo([])
    expect(r.plates).toEqual({})
    expect(r.kpoints).toEqual({})
  })
})

describe('replayElo 时间折价', () => {
  it('慢答对（超过中位数 1.8 倍）所得 θ 低于快答对', () => {
    // 板块中位数由用时列表决定：ok 30 / wrong 10 → 中位 10，1.8×=18：ok30>18 → 应被打折
    const fast = replayElo(seq(200, 0.3, 12, 10)).kpoints['资料分析·比重'].θ
    const slowr = replayElo(seq(200, 0.3, 90, 10)).kpoints['资料分析·比重'].θ
    expect(slowr).toBeLessThan(fast)
  })
})

describe('replayElo 层级收缩', () => {
  it('样本少的考点 θ 更贴近板块基线（收缩系数 8/(n+8)）', () => {
    const mk = (n, okRatio, kp) => Array.from({ length: n }, (_, i) => ({ t: i, plate: '判断推理', kpoint: kp, reqDiff: 'mid', ok: i / n < okRatio, usedSec: 30, genVer: 'g1' }))
    // 板块整体低水平（baseline 低），单考点样本多但表现好
    const atts = [].concat(mk(120, 0.3, '判断推理·其他A'), mk(6, 0.9, '判断推理·熟练B'));
    const r = replayElo(atts)
    const base = r.plates['判断推理'].base
    const few = r.kpoints['判断推理·熟练B'].θ
    const many = r.kpoints['判断推理·其他A'].θ
    // 样本少的 B 即使全对也被板块基线拉住（离 base 距离小于 A 的偏离）
    expect(Math.abs(few - base)).toBeLessThan(Math.abs(many - base))
  })
})

describe('replayElo 步长衰减（K 随样本衰减）', () => {
  it('同样一个「答错」更新，早期样本少时对 θ 的回落大于晚期', () => {
    const mkRun = (pre, t0) => Array.from({ length: pre }, (_, i) => ({ t: t0 + i * 1000, plate: '言语理解', kpoint: '言语理解·综合', reqDiff: 'mid', ok: true, usedSec: 20, genVer: 'g1' }))
    const wrong = (t0) => ({ t: t0 + 999999, plate: '言语理解', kpoint: '言语理解·综合', reqDiff: 'mid', ok: false, usedSec: 20, genVer: 'g1' })
    const t0 = 100000
    const before5 = replayElo(mkRun(5, t0)).kpoints['言语理解·综合'].θ
    const after5 = replayElo(mkRun(5, t0).concat([wrong(t0)])).kpoints['言语理解·综合'].θ
    const before60 = replayElo(mkRun(60, t0)).kpoints['言语理解·综合'].θ
    const after60 = replayElo(mkRun(60, t0).concat([wrong(t0)])).kpoints['言语理解·综合'].θ
    expect(before5 - after5).toBeGreaterThan(before60 - after60)
  })
})