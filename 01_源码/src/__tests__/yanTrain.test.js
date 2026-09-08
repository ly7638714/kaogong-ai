import { describe, it, expect } from 'vitest'
import { PASSAGES, pickPassage, buildYanQ, verifyYanQ, YAN_MODES, YAN_DOMAINS } from '../utils/yanTrainLib'

describe('yanTrain 片段阅读结构四步拆解引擎', () => {
  it('每个领域都能抽取文段且四步题目完整、答案唯一', () => {
    for (const domain of YAN_DOMAINS) {
      for (let i = 0; i < 40; i++) {
        const p = pickPassage(77000 + i * 37, domain)
        expect(p).toBeTruthy()
        for (const m of YAN_MODES) {
          const q = buildYanQ(p, m.k, 33000 + i * 19, i % p.sentences.length)
          expect(q, domain + '/' + m.k + '/' + i).toBeTruthy()
          expect(q.options).toHaveLength(4)
          expect(new Set(q.options.map((o) => o.t)).size).toBe(4)
          expect(q.options.find((o) => o.k === q.answer)).toBeTruthy()
          expect(verifyYanQ(q, p)).toBe(true)
          expect(q.explain).toBeTruthy()
        }
      }
    }
  })

  it('PASSAGES 每篇句子数量、角色数量一致，无占位符', () => {
    for (const p of PASSAGES) {
      expect(p.sentences.length).toBeGreaterThanOrEqual(4)
      expect(p.roles).toHaveLength(p.sentences.length)
      expect(p.keywords.length).toBeGreaterThanOrEqual(2)
      expect(JSON.stringify(p)).not.toContain('……')
      expect(JSON.stringify(p)).not.toContain('【材料】')
    }
  })
})
