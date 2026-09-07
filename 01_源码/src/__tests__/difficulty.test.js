// difficulty 难度校准表（35号批次2-A）回归：Beta 平滑 / 题类·板块样本门槛 / 校准提示措辞
import { describe, it, expect, beforeEach } from 'vitest'
import { betaP, aggregate, calibrationHint, ALPHA, BETA, MIN_CLS_N, MIN_PLATE_N, clearCache } from '../utils/difficulty'
import { GEN_VER } from '../utils/attemptLog'

const att = (cls, plate, ok, genVer) => ({ cls, plate, ok, genVer: genVer || GEN_VER })
const clsK = '资料分析|比重|mid|' + GEN_VER

describe('betaP Beta 平滑', () => {
  it('n=0 时向 0.5 收缩', () => {
    expect(betaP(0, 0)).toBeCloseTo(0.5, 6)
    expect(betaP(0, 0)).toBe((0 + ALPHA) / (0 + ALPHA + BETA))
  })
  it('随 ok/n 提高而提高，且落在 (0,1)', () => {
    expect(betaP(0, 4)).toBeLessThan(betaP(2, 4))
    expect(betaP(4, 4)).toBeLessThan(1)
    expect(betaP(0, 4)).toBeGreaterThan(0)
  })
  it('极端样本收敛不到 0/1（防过拟合）', () => {
    expect(betaP(1000, 1000)).toBeCloseTo((1000 + ALPHA) / (1000 + ALPHA + BETA), 6)
  })
})

describe('aggregate 聚合与 genVer 隔离', () => {
  const list = [
    att(clsK, '资料分析', true),
    att(clsK, '资料分析', false),
    att(clsK, '资料分析', true),
    att('资料分析|比重|mid|g_old', '资料分析', true, 'g_old'), // 旧版本样本（cls+genVer 都旧）必须被隔离
    att('言语理解|中心理解|easy|' + GEN_VER, '言语理解', false)
  ]
  const ag = aggregate(list)
  it('按 cls 聚合且只含当前 genVer', () => {
    expect(ag.byCls[clsK]).toMatchObject({ n: 3, ok: 2 })
    expect(ag.byCls['资料分析|比重|mid|g_old']).toBeUndefined()
  })
  it('板块聚合同样隔离旧版本', () => {
    expect(ag.byPlate['资料分析']).toMatchObject({ n: 3, ok: 2 })
    expect(ag.byPlate['言语理解']).toMatchObject({ n: 1, ok: 0 })
  })
  it('p 使用 Beta 平滑', () => {
    expect(ag.byCls[clsK].p).toBeCloseTo((2 + ALPHA) / (3 + ALPHA + BETA), 6)
  })
})

describe('calibrationHint 样本门槛与措辞', () => {
  beforeEach(() => { clearCache() })
  it('题类 n≥MIN_CLS_N 用题类标定（偏难提示降难度）', () => {
    const list = Array.from({ length: MIN_CLS_N }, (_, i) => att(clsK, '资料分析', i < 2)) // 2/5 → p≈0.44 低于 mid 目标 0.50
    const h = calibrationHint('资料分析', '比重', 'mid', list)
    expect(h).toContain('【难度校准】')
    expect(h).toContain('降低计算复杂度')
  })
  it('题类不足但板块 n≥MIN_PLATE_N 用板块均值并注明', () => {
    const list = []
    for (let i = 0; i < MIN_PLATE_N; i++) list.push(att('资料分析|其他题|hard|' + GEN_VER, '资料分析', i < 1)) // 板块 1/8 → 明显低于 hard 目标
    const h = calibrationHint('资料分析', '比重', 'hard', list)
    expect(h).toContain('【难度校准】')
    expect(h).toContain('板块级样本')
  })
  it('题类与板块样本都不足时不给数字（返回空）', () => {
    const list = [att(clsK, '资料分析', true)]
    expect(calibrationHint('资料分析', '比重', 'mid', list)).toBe('')
    expect(calibrationHint('资料分析', '比重', 'mid', [])).toBe('')
  })
  it('实测在目标区间内不打扰', () => {
    const list = Array.from({ length: 10 }, (_, i) => att(clsK, '资料分析', i < 6)) // 6/10 p≈0.58 ∈ [0.50,0.62]
    expect(calibrationHint('资料分析', '比重', 'mid', list)).toBe('')
  })
  it('题偏易（高于目标）时提示增加难度', () => {
    const list = Array.from({ length: MIN_CLS_N }, () => att(clsK, '资料分析', true))
    const h = calibrationHint('资料分析', '比重', 'mid', list)
    expect(h).toContain('高于目标区间')
    expect(h).toContain('增加拐弯')
  })
})