import { describe, it, expect } from 'vitest'
import { APP_FEATURES, petFeatureText, petDetectUi, DATA_TRAIN_INDEX } from '../utils/petKnowledge'
import { KNOWLEDGE_CARDS } from '../utils/dataTrainLib'
import { store } from '../store'

describe('petKnowledge 萌宠功能知识库', () => {
  it('功能条目 ≥25 且必填字段齐全', () => {
    expect(APP_FEATURES.length).toBeGreaterThanOrEqual(25)
    const ids = new Set()
    for (const f of APP_FEATURES) {
      expect(f.id).toBeTruthy()
      expect(ids.has(f.id)).toBe(false)
      ids.add(f.id)
      expect(String(f.name).length).toBeGreaterThanOrEqual(2)
      expect(String(f.entry).length).toBeGreaterThan(2)
      expect(String(f.desc).length).toBeGreaterThan(5)
      expect(String(f.how).length).toBeGreaterThan(5)
    }
  })

  it('petFeatureText 长度适中，且覆盖关键功能关键词', () => {
    const t = petFeatureText()
    expect(t.length).toBeGreaterThan(1800)
    expect(t.length).toBeLessThan(5000)
    for (const kw of ['单题快练', '模拟组卷', '立体图推', '资料速算', '理论课堂', '错题本', 'AI 用量', '音色市场', '3D', '朗读']) {
      expect(t, '缺少关键词：' + kw).toContain(kw)
    }
  })

  it('petDetectUi 感知 tab / panel / 板块', () => {
    store.tab = 'wrong'
    store.uiCtx.panel = null
    expect(petDetectUi()).toContain('错题本')
    store.uiCtx.panel = 'data'
    expect(petDetectUi()).toContain('资料速算')
    store.uiCtx.panel = 'solid'
    expect(petDetectUi()).toContain('立体图推')
    store.uiCtx.panel = null
    store.mode = 'ziliao'
    expect(petDetectUi()).toContain('资料分析')
    store.mode = 'all'
  })

  it('DATA_TRAIN_INDEX 覆盖 dataTrainLib 全部 52 张卡', () => {
    const idx = DATA_TRAIN_INDEX()
    expect(KNOWLEDGE_CARDS.length).toBeGreaterThanOrEqual(40)
    for (const c of KNOWLEDGE_CARDS) {
      expect(idx, '缺少卡：' + c.title).toContain(c.title)
    }
    expect(idx).toContain('①判题型')
    expect(idx).toContain('④速算')
  })
})
