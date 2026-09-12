import { describe, test, expect } from 'vitest'
import { qualityMatrixText, qualityRubric, hasDedicatedQualityRubric } from '../api/qualityMatrix'
import { SUB_VARIANTS, EXTRA_VARIANTS } from '../components/examData'

const PLATES = ['判断推理', '逻辑判断', '图形推理', '定义判断', '类比推理', '言语理解', '资料分析', '数量关系', '常识判断', '政治理论']

describe('命题质量矩阵·全题型专属覆盖', () => {
  test('每个板块都能生成基础质量矩阵', () => {
    for (const p of PLATES) {
      const t = qualityMatrixText(p, '')
      expect(t.length, p + ' 缺默认要求').toBeGreaterThan(80)
      expect(t).toContain('五维验收硬线')
    }
  })

  test('SUB_VARIANTS 每个 canonical 题型都有专属 rubric', () => {
    const missing = []
    for (const [plate, variants] of Object.entries(SUB_VARIANTS)) {
      for (const variant of variants) {
        if (!hasDedicatedQualityRubric(plate, variant)) missing.push(plate + ' / ' + variant)
      }
    }
    expect(missing).toEqual([])
  })

  test('EXTRA_VARIANTS 每个扩展轮换题型都有专属 rubric', () => {
    const missing = []
    for (const [plate, variants] of Object.entries(EXTRA_VARIANTS)) {
      for (const variant of variants) {
        if (!hasDedicatedQualityRubric(plate, variant)) missing.push(plate + ' / ' + variant)
      }
    }
    expect(missing).toEqual([])
  })

  test('专属 rubric 必须包含五轴且不是板块默认兜底', () => {
    for (const [plate, variants] of Object.entries(SUB_VARIANTS)) {
      for (const variant of variants) {
        const r = qualityRubric(plate, variant)
        expect(r, plate + ' / ' + variant + ' 缺 rubric').toBeTruthy()
        for (const key of ['blueprint', 'correct', 'distractors', 'difficulty', 'authenticity']) {
          expect(String(r[key] || '').length, plate + ' / ' + variant + ' 缺 ' + key).toBeGreaterThan(12)
        }
      }
    }
  })

  test('典型题型命中真题命题结构', () => {
    expect(qualityMatrixText('逻辑判断', '削弱型')).toContain('论证')
    expect(qualityMatrixText('言语理解', '逻辑填空')).toContain('语境')
    expect(qualityMatrixText('资料分析', '隔年增长')).toContain('交叉项')
    expect(qualityMatrixText('资料分析', '两期比重差')).toContain('百分点')
    expect(qualityMatrixText('类比推理', '二词型')).toContain('一级')
    expect(qualityMatrixText('图形推理', '空间重构')).toContain('展开图')
  })

  test('类比推理强调真题短题干，不把词项关系复杂化', () => {
    const t = qualityMatrixText('类比推理', '二词型')
    expect(t).toContain('两个词')
    expect(t).toContain('不写故事')
    expect(t).toContain('一处二级辨析')
  })

  test('未知板块返回空，不注入噪音', () => {
    expect(qualityMatrixText('不存在板块', '')).toBe('')
    expect(hasDedicatedQualityRubric('不存在板块', '削弱型')).toBe(false)
  })
})
