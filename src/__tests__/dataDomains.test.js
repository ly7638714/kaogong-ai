// 资料速算·领域字典 & 按领域出材料
import { describe, it, expect } from 'vitest'
import { DOMAINS, HOT_DOMAINS, COLD_DOMAINS, domainOf } from '../data/dataDomains'
import { genDataQ } from '../utils/dataTrainGen'
describe('dataDomains', () => {
  it('领域 60+ 且热/冷分档、每项含指标', () => {
    expect(DOMAINS.length).toBeGreaterThanOrEqual(60)
    expect(HOT_DOMAINS.length).toBeGreaterThan(10)
    expect(COLD_DOMAINS.length).toBeGreaterThan(10)
    DOMAINS.forEach((d) => { expect(d.n.length).toBeGreaterThan(1); expect(Array.isArray(d.inds) && d.inds.length >= 3).toBe(true); expect(d.unit).toBeTruthy() })
    expect(domainOf('汽车').inds).toContain('新能源汽车产量')
    expect(domainOf('不存在的领域')).toBe(null)
  })
  it('选汽车领域 → 找数据材料出现 汽车 + 汽车类指标（不串领域）', () => {
    const q = genDataQ('locate', 12345, 2, undefined, domainOf('汽车'))
    expect(q && q.materialMd).toBeTruthy()
    expect(q.materialMd).toContain('汽车')
    expect(q.materialMd).toMatch(/汽车产量|新能源汽车产量|汽车销量|汽车类零售额/)
  })
})
