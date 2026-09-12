// 实测反馈③：扩展题型池（自动轮换专属）与自选表一致性与去重回归
import { describe, it, expect } from 'vitest'
import { SUB_VARIANTS, EXTRA_VARIANTS, DIR_LIB } from '../components/examData'
import { askVariant } from '../utils/genDiversity'

describe('EXTRA_VARIANTS 自动轮换扩展题型池', () => {
  it('扩展池只存在于有自选表的板块，且与自选条目完全去重（不重复/不覆盖自选）', () => {
    const allBase = new Set()
    Object.keys(SUB_VARIANTS).forEach((k) => (SUB_VARIANTS[k] || []).forEach((v) => allBase.add(k + '|' + v)))
    for (const plate of Object.keys(EXTRA_VARIANTS)) {
      expect(SUB_VARIANTS[plate], plate + ' 无自选表').toBeTruthy()
      const list = EXTRA_VARIANTS[plate]
      expect(list.length).toBeGreaterThan(0)
      expect(new Set(list).size).toBe(list.length)
      for (const v of list) {
        expect(String(v).trim().length).toBeGreaterThan(0)
        expect(allBase.has(plate + '|' + v), plate + ' 扩展条目与自选重复: ' + v).toBe(false)
      }
    }
  })
  it('覆盖主要文字/可AI出题板块，总数足够支撑“不限”轮换多样', () => {
    const want = ['言语理解', '数量关系', '逻辑判断', '定义判断', '资料分析', '常识判断', '政治理论']
    for (const w of want) expect(Array.isArray(EXTRA_VARIANTS[w]) && EXTRA_VARIANTS[w].length >= 4, w + ' 扩展不足').toBe(true)
    const n = Object.values(EXTRA_VARIANTS).reduce((a, l) => a + l.length, 0)
    expect(n).toBeGreaterThanOrEqual(20)
  })

  it('类比推理不提供是/非问法或自定义问法池', () => {
    expect(DIR_LIB['类比推理']).toBeUndefined()
    const fixed = '下列选项中，与题干逻辑关系最为相似的是（　）。'
    for (const variant of ['二词型', '三词型', '填空型', '集合关系', '逻辑关系', '对应关系', '语法关系', '语义关系']) {
      const ask = askVariant('类比推理', variant, 0)
      expect(ask).toBe(fixed)
      expect(ask).not.toContain('最不相似')
      expect(ask).not.toContain('不属于')
      expect(ask).not.toContain('不能推出')
    }
  })
})
