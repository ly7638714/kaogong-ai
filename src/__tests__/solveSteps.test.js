// solveSteps（v3.8.192）回归：全题型模板覆盖 / ALIAS / 解析优先链 / canonical 归一
import { describe, it, expect } from 'vitest'
import { VARIANTS, ALIAS, canonicalType, resolveVariant, variantStepPrompt } from '../data/solveSteps'
import { SUB_VARIANTS } from '../components/examData'

const allNames = new Set()
Object.keys(SUB_VARIANTS).forEach((k) => (SUB_VARIANTS[k] || []).forEach((t) => allNames.add(t)))

describe('VARIANTS 模板覆盖（与 SUB_VARIANTS 一一对应）', () => {
  it('每个 canonical 题型都有模板且 steps>=3/keypoint/trapFocus 非空', () => {
    for (const name of allNames) {
      const v = VARIANTS[name]
      expect(v, '缺模板: ' + name).toBeTruthy()
      expect(v.steps.length, name + ' steps<3').toBeGreaterThanOrEqual(3)
      expect(String(v.keypoint || '').length, name + ' 缺 keypoint').toBeGreaterThan(0)
      expect(String(v.trapFocus || '').length, name + ' 缺 trapFocus').toBeGreaterThan(0)
    }
    expect(Object.keys(VARIANTS).length).toBeGreaterThanOrEqual(80)
  })
})

describe('ALIAS 常见旧名映射', () => {
  it('削弱/真假推理/工程 等映射到 canonical', () => {
    expect(ALIAS['削弱']).toBe('削弱型')
    expect(ALIAS['真假推理']).toBe('真假话')
    expect(ALIAS['工程']).toBe('工程问题')
    expect(ALIAS['肯定型']).toBe('选是题')
    expect(ALIAS['中心理解']).toBe('中心理解')
  })
})

describe('canonicalType', () => {
  it('canonical 原样 / legacy 归一 / 空与未知返回空', () => {
    expect(canonicalType('', '中心理解')).toBe('中心理解')
    expect(canonicalType('', '削弱')).toBe('削弱型')
    expect(canonicalType('', '工程')).toBe('工程问题')
    expect(canonicalType('', '')).toBe('')
    expect(canonicalType('', '不存在的题型XYZ')).toBe('')
  })
})

describe('resolveVariant 优先链', () => {
  it('type 显式命中 > detected 短名 > sub canonical；未知返回 null', () => {
    expect(resolveVariant({ plate6: '判断推理', type: '削弱型' }).type).toBe('削弱型')
    expect(resolveVariant({ plate6: '判断推理', detected: '削弱' }).type).toBe('削弱型')
    expect(resolveVariant({ plate6: '言语理解', sub: '逻辑填空' }).type).toBe('逻辑填空')
    expect(resolveVariant({ plate6: '判断推理', type: '不存在型' })).toBe(null)
    expect(resolveVariant({})).toBe(null)
  })
})

describe('variantStepPrompt', () => {
  it('含题型标注与专属步骤', () => {
    const v = resolveVariant({ plate6: '判断推理', type: '削弱型' })
    const p = variantStepPrompt(v)
    expect(p.includes('削弱型')).toBe(true)
    expect(p.includes('关键：')).toBe(true)
    expect(p.includes('陷阱：')).toBe(true)
  })
})
