// wrongTaxonomy（六大板块→细分→题型归一）回归
import { describe, it, expect } from 'vitest'
import { WRONG_GROUPS, groupOfName, isRealSub, canonicalTypeOf, typeLabelOf, canonicalSubOf, canonicalGroupOf, taxonOf, typeOrderOfSub, groupLabelOf, fullGroupOfToken, canonicalSubjectOf } from '../utils/wrongTaxonomy'
describe('wrongTaxonomy 基础映射', () => {
  it('判断推理组细分只有 图推/定义/类比/逻辑；组名不作为细分', () => {
    const g = WRONG_GROUPS.find((x) => x.label === '判断推理')
    expect(g.subs).toEqual(['图形推理', '定义判断', '类比推理', '逻辑判断'])
    expect(isRealSub('判断推理')).toBe(false)
    expect(isRealSub('逻辑判断')).toBe(true)
    expect(groupOfName('图形推理')).toBe('判断推理')
    expect(groupOfName('数量关系')).toBe('数量关系')
  })
  it('subject=逻辑判断 + 削弱正文 → 判断推理组·逻辑判断·削弱型', () => {
    const q = { subject: '逻辑判断', question: '最能削弱上述论证的是？（A…）' }
    expect(canonicalTypeOf(q)).toBe('削弱型')
    expect(canonicalSubOf(q)).toBe('逻辑判断')
    expect(canonicalGroupOf(q)).toBe('判断推理')
  })
  it('subject=判断推理 + sub=削弱型 → 归位到 逻辑判断', () => {
    const q = { subject: '判断推理', sub: '削弱型', question: '题' }
    expect(canonicalSubOf(q)).toBe('逻辑判断')
    expect(canonicalGroupOf(q)).toBe('判断推理')
    expect(canonicalTypeOf(q)).toBe('削弱型')
  })
  it('subject=判断推理 且无 sub：正文识别逻辑题 → 归 逻辑判断；未知 → 逻辑判断兜底', () => {
    const q1 = { subject: '判断推理', question: '最能削弱上述论证的是？' }
    expect(canonicalSubOf(q1)).toBe('逻辑判断')
    expect(canonicalTypeOf(q1)).toBe('削弱型')
    const q2 = { subject: '判断推理', question: '随便聊聊这道题' }
    expect(canonicalTypeOf(q2)).toBe('')
    expect(typeLabelOf(q2)).toBe('未分类')
    expect(canonicalSubOf(q2)).toBe('逻辑判断')
  })
  it('言语/数量/资料 等单细分板块：细分=板块名', () => {
    expect(taxonOf({ subject: '言语理解', sub: '中心理解' })).toEqual({ group: '言语理解', sub: '言语理解', type: '中心理解' })
    expect(taxonOf({ subject: '片段阅读', sub: '中心理解' }).sub).toBe('片段阅读')
    expect(taxonOf({ subject: '数量关系', sub: '工程问题' })).toEqual({ group: '数量关系', sub: '数量关系', type: '工程问题' })
    expect(taxonOf({ subject: '资料分析', variant: '平均数' }).type).toBe('平均数')
  })
  it('typeOrderOfSub：片段/篇章共用言语题型表；逻辑判断有自己的表', () => {
    expect(typeOrderOfSub('片段阅读').length).toBeGreaterThan(5)
    expect(typeOrderOfSub('逻辑判断')).toContain('削弱型')
  })
})
describe('大板块全称（消除与细分歧义）', () => {
  it('groupLabelOf：判断推理→逻辑判断与推理；言语理解→言语理解与表达', () => {
    expect(groupLabelOf('判断推理')).toBe('逻辑判断与推理')
    expect(groupLabelOf('言语理解')).toBe('言语理解与表达')
    expect(groupLabelOf('数量关系')).toBe('数量关系')
    expect(groupLabelOf('不存在')).toBe('不存在')
  })
})
describe('全称兼容（杜绝歧义兜底）', () => {
  it('subject 存“逻辑判断与推理/言语理解与表达”全称也能归一', async () => {
    const m = await import('../utils/wrongTaxonomy')
    expect(m.canonicalGroupOf({ subject: '逻辑判断与推理', sub: '削弱型' })).toBe('判断推理')
    expect(m.canonicalSubOf({ subject: '逻辑判断与推理', sub: '削弱型' })).toBe('逻辑判断')
    expect(m.canonicalGroupOf({ subject: '言语理解与表达', sub: '中心理解' })).toBe('言语理解')
    expect(m.oldGroupOf('判断推理')).toBe('判断推理')
    expect(m.oldGroupOf('逻辑判断与推理')).toBe('判断推理')
    expect(m.oldGroupOf('言语理解与表达')).toBe('言语理解')
  })
})

describe('写入统一与组全称解析', () => {
  it('fullGroupOfToken：旧组名/全称/细分 → 统一大板块全称', () => {
    expect(fullGroupOfToken('判断推理')).toBe('逻辑判断与推理')
    expect(fullGroupOfToken('逻辑判断与推理')).toBe('逻辑判断与推理')
    expect(fullGroupOfToken('逻辑判断')).toBe('逻辑判断与推理')
    expect(fullGroupOfToken('图形推理')).toBe('逻辑判断与推理')
    expect(fullGroupOfToken('言语理解与表达')).toBe('言语理解与表达')
    expect(fullGroupOfToken('言语理解')).toBe('言语理解与表达')
    expect(fullGroupOfToken('片段阅读')).toBe('言语理解与表达')
  })
  it('canonicalSubjectOf：细分可确定→细分；仅组级→大板块全称', () => {
    expect(canonicalSubjectOf({ subject: '判断推理', sub: '削弱型' })).toBe('逻辑判断')
    expect(canonicalSubjectOf({ subject: '逻辑判断', sub: '削弱型' })).toBe('逻辑判断')
    expect(canonicalSubjectOf({ subject: '图形推理', sub: '位置规律' })).toBe('图形推理')
    expect(canonicalSubjectOf({ subject: '判断推理', question: '随便聊聊' })).toBe('逻辑判断与推理')
    expect(canonicalSubjectOf({ subject: '言语理解', sub: '中心理解' })).toBe('言语理解与表达')
    expect(canonicalSubjectOf({ subject: '资料分析', variant: '平均数' })).toBe('资料分析')
  })
})
