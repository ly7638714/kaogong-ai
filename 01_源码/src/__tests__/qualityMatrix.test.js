import { describe, test, expect } from 'vitest'
import { qualityMatrixText } from '../api/qualityMatrix'

describe('批次7·命题人质量矩阵', () => {
  test('六大盘块均有默认质量要求', () => {
    for (const p of ['逻辑判断', '言语理解', '资料分析', '数量关系', '常识判断', '政治理论']) {
      const t = qualityMatrixText(p, '')
      expect(t.length, p + ' 缺默认要求').toBeGreaterThan(20)
      expect(t).toContain('命题质量矩阵')
    }
  })
  test('子题型命中专属要求', () => {
    expect(qualityMatrixText('逻辑判断', '削弱型')).toContain('因果倒置')
    expect(qualityMatrixText('言语理解', '逻辑填空')).toContain('语境呼应')
    expect(qualityMatrixText('资料分析', '增长率')).toContain('百化分')
  })
  test('未知板块返回空（不注噪音）', () => {
    expect(qualityMatrixText('不存在板块', '')).toBe('')
  })
})


// 批次8·C2 质量矩阵补全（前提/语句/态度/平均数/倍数/隔年/地理/人文/时政年内）
describe('批次8·C2 质量矩阵补全', () => {
  test('逻辑-前提/假设命中专属规格', () => {
    expect(qualityMatrixText('逻辑判断', '前提型')).toContain('必要前提')
    expect(qualityMatrixText('逻辑判断', '假设')).toContain('过度假设')
  })
  test('言语-语句表达/态度命中专属规格', () => {
    expect(qualityMatrixText('言语理解', '语句排序')).toContain('连贯')
    expect(qualityMatrixText('言语理解', '语句填空')).toContain('契合')
    expect(qualityMatrixText('言语理解', '态度')).toContain('态度词')
  })
  test('资料-平均数/倍数/隔年命中专属规格', () => {
    expect(qualityMatrixText('资料分析', '平均数')).toContain('分母')
    expect(qualityMatrixText('资料分析', '倍数')).toContain('-1')
    expect(qualityMatrixText('资料分析', '隔年增长率')).toContain('乘积')
  })
  test('常识-地理/人文命中专属规格', () => {
    expect(qualityMatrixText('常识判断', '地理')).toContain('行政区划')
    expect(qualityMatrixText('常识判断', '人文历史')).toContain('错配')
  })
  test('政治-时政年内大事命中专属规格', () => {
    expect(qualityMatrixText('政治理论', '时政')).toContain('原文提法')
  })
})

