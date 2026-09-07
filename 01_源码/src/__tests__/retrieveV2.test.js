import { describe, it, expect } from 'vitest'
import { retrieveDetailed, retrieveCardsV2, isStrongHit } from '../kb/retrieveV2'

describe('P0-1 retrieveV2 检索升级', () => {
  it('type 分词强命中：经济利润最佳定价', () => {
    const r = retrieveDetailed('数量关系', '经济利润 最佳定价 收入最大 二次函数顶点', 4)
    expect(r.length).toBeGreaterThan(0)
    const hit = r.find((x) => x.card.id === 'sl-jlr3')
    expect(hit).toBeTruthy()
    expect(isStrongHit(hit)).toBe(true)
  })
  it('浓度·线段混合可被命中', () => {
    const cards = retrieveCardsV2('数量关系', '两溶液混合 浓度距离比 十字交叉 求混合浓度', 4)
    expect(cards.some((c) => c.id === 'sl-nong2')).toBe(true)
  })
  it('无命中返回空数组（便于旧检索兜底）', () => {
    expect(retrieveCardsV2('数量关系', '这是一段与行测无关的闲聊文本xyz', 4)).toEqual([])
  })
  it('板块归一化后仍可检索（逻辑判断→判断推理）', () => {
    const r = retrieveDetailed('逻辑判断', '最能削弱上述结论 因果倒置', 4)
    expect(r.every((x) => x.card.plate === '判断推理')).toBe(true)
  })
  it('资料分析：隔年增长题优先命中隔年卡', () => {
    const r = retrieveDetailed('资料分析', '2023年比2021年增长 两年平均增速', 4)
    expect(r.some((x) => x.card.id === 'zl-gn' || x.card.id === 'zl-jz2')).toBe(true)
  })
})