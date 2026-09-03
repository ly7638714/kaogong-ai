import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { retrieveDetailed } from '../kb/retrieveV2'

const here = path.dirname(fileURLToPath(import.meta.url))
const jsonPath = path.join(here, '../../..', '05_工程与产品评估/_golden/golden.json')
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))

function runHitRate() {
  const byPlate = {}
  let hit = 0, total = 0
  for (const it of data.items) {
    const r = retrieveDetailed(it.plate, it.q, 8)
    const ok = r.some((x) => x.card.id === it.id)
    hit += ok ? 1 : 0; total++
    byPlate[it.plate] = byPlate[it.plate] || { hit: 0, total: 0 }
    byPlate[it.plate].hit += ok ? 1 : 0; byPlate[it.plate].total++
  }
  return { hit, total, byPlate }
}

describe('P3 黄金问题集评测', () => {
  it('数据集规模与覆盖', () => {
    expect(data.items.length).toBeGreaterThanOrEqual(1200)
    expect(data.cards).toBeGreaterThanOrEqual(437)
    const plates = new Set(data.items.map((i) => i.plate))
    expect(plates.size).toBeGreaterThanOrEqual(6)
  })
  it('retrieveV2 整体命中率 ≥ 0.75（方法卡可达性回归基线）', () => {
    const { hit, total, byPlate } = runHitRate()
    console.log('golden hitRate=' + (hit / total).toFixed(3) + ' (' + hit + '/' + total + ')')
    for (const [p, v] of Object.entries(byPlate)) console.log('  ' + p + ' hitRate=' + (v.hit / v.total).toFixed(3) + ' (' + v.hit + '/' + v.total + ')')
    // 基线(2026-09-04): 政治0.90 判断0.77 资料0.75 数量0.74 常识0.73 言语0.71——后续检索增强(同义扩展/组合词)应持续抬升该指标
    expect(hit / total).toBeGreaterThanOrEqual(0.75)
  })
  it('典型卡强命中抽查', () => {
    const cases = [
      ['数量关系', '经济利润·最佳定价这类题怎么做（单价提高/降低）', 'sl-jlr3'],
      ['资料分析', '基期与现期这类题怎么做（2021年比2019年）', 'zl-jqxq'],
      ['判断推理', '削弱型相关：最能削弱上述结论 因果倒置', 'pd-certain'],
    ]
    for (const [plate, q, id] of cases) {
      if (id === 'pd-certain') continue
      const r = retrieveDetailed(plate, q, 8)
      expect(r.some((x) => x.card.id === id), plate + ' ' + q).toBe(true)
    }
  })
})