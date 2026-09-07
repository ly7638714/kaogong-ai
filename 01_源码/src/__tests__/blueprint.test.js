// blueprint 真题蓝本RAG（35号批次5）回归：检索命中/兜底抽样/few-shot 文本/12字防照抄
import { describe, it, expect } from 'vitest'
import { retrieveBlueprint, blueprintPrompt, copyIssue } from '../utils/blueprint'

const mk = (p, n, pl, ty, s) => ({ p, n, pl, ty, s })
const index = { qs: [
  mk('2024-fushu-x', 1, '言语理解', '逻辑填空', '填入画横线部分最恰当的一组词语是甲乙丙丁四个选项对照语境选择'),
  mk('2024-fushu-x', 2, '言语理解', '中心理解', '这段文字主要强调经济发展与生态保护的辩证统一关系'),
  mk('2023-dishi-y', 1, '言语理解', '逻辑填空', '依次填入下列横线处的成语最恰当的一项是整体语境考察'),
  mk('2025-fushu-z', 5, '言语理解', '中心理解', '文段论述数据要素市场化配置改革的意义与路径'),
  mk('2022-dishi-w', 8, '数量关系', '综合', '一项工程甲乙合作需要若干天完成求单独完成时间'),
  mk('2022-dishi-w', 9, '判断推理', '图形推理', '从所给的四个选项中选最合适一个填入问号处使之呈现规律')
] }

describe('retrieveBlueprint 检索', () => {
  it('题型名精确命中优先（逻辑填空优先于中心理解）', () => {
    const r = retrieveBlueprint(index, '言语理解', '逻辑填空', 2)
    expect(r.length).toBe(2)
    expect(r.every((e) => e.plate === '言语理解')).toBe(true)
    expect(r[0].n).toBe(1)
  })
  it('无题型命中时板块内稳定抽样兜底（count 上限）', () => {
    const r = retrieveBlueprint(index, '判断推理', '削弱型', 3)
    expect(r.length).toBe(1)
    expect(r[0].plate).toBe('判断推理')
  })
  it('count 尊重上限且结果确定', () => {
    const r1 = retrieveBlueprint(index, '言语理解', '逻辑填空', 1)
    const r2 = retrieveBlueprint(index, '言语理解', '逻辑填空', 1)
    expect(r1).toEqual(r2)
    expect(r1.length).toBe(1)
  })
})

describe('blueprintPrompt 措辞', () => {
  it('包含严禁照抄与 12 字重合说明', () => {
    const t = blueprintPrompt('言语理解', '逻辑填空', retrieveBlueprint(index, '言语理解', '逻辑填空', 1))
    expect(t).toContain('严禁照抄')
    expect(t).toContain('连续 12 字')
  })
})

describe('copyIssue 防照抄（确定性）', () => {
  const e = [{ paper: 'P', n: 1, s: '填入画横线部分最恰当的一组词语是甲乙丙丁四个选项对照语境选择' }]
  it('生成题干含 12 字连续重合 → 报出蓝本 id', () => {
    const stem = '关于这道题：填入画横线部分最恰当的一组词语是甲乙丙丁，请问选哪个？'
    expect(copyIssue(stem, e)).toBe('P#1')
  })
  it('素材全新无重合 → null', () => {
    expect(copyIssue('某市推进老旧小区改造，居民满意度显著提升，问最能支持上述结论的是', e)).toBeNull()
  })
  it('空输入安全', () => {
    expect(copyIssue('', e)).toBeNull()
    expect(copyIssue('abc', [])).toBeNull()
  })
})
