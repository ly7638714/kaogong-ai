import { describe, it, expect } from 'vitest'
import { PASSAGES, pickPassage, buildYanQ, buildYanExam, verifyYanQ, YAN_MODES, YAN_DOMAINS, YAN_LEVELS } from '../utils/yanTrainLib'

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

  it('完整 5 问训练每篇都通过本地质检且选项唯一、题序完整', () => {
    for (let i = 0; i < 120; i++) {
      const p = pickPassage(55000 + i * 53, YAN_DOMAINS[i % YAN_DOMAINS.length])
      const exam = buildYanExam(p, 66000 + i * 29)
      expect(exam.qc.ok, p.domain + ' ' + exam.qc.errors.join('；')).toBe(true)
      expect(exam.qs).toHaveLength(5)
      expect(new Set(exam.qs.map((q) => q.kind)).size).toBeGreaterThanOrEqual(4)
      for (const q of exam.qs) {
        expect(q.options).toHaveLength(4)
        expect(new Set(q.options.map((o) => o.t)).size).toBe(4)
        expect(q.options.find((o) => o.k === q.answer)).toBeTruthy()
        expect(verifyYanQ(q, p)).toBe(true)
      }
    }
  })

  it('四级难度句数/字数落在声明范围，高级与超级隐藏归纳线索', () => {
    const range = {
      entry: { minSent: 4, maxSent: 5, minChars: 120, maxChars: 250 },
      normal: { minSent: 7, maxSent: 8, minChars: 220, maxChars: 400 },
      advanced: { minSent: 10, maxSent: 11, minChars: 350, maxChars: 700 },
      super: { minSent: 12, maxSent: 14, minChars: 550, maxChars: 900 }
    }
    for (const lv of YAN_LEVELS) {
      const r = range[lv.k]
      for (let i = 0; i < 80; i++) {
        const p = pickPassage(44000 + i * 29, YAN_DOMAINS[(i + 11) % YAN_DOMAINS.length], lv.k)
        expect(p.difficulty).toBe(lv.k)
        expect(p.sentCount, lv.k + '/' + i + ' 句数').toBeGreaterThanOrEqual(r.minSent)
        expect(p.sentCount, lv.k + '/' + i + ' 句数').toBeLessThanOrEqual(r.maxSent)
        expect(p.charCount, lv.k + '/' + i + ' 字数').toBeGreaterThanOrEqual(r.minChars)
        expect(p.charCount, lv.k + '/' + i + ' 字数').toBeLessThanOrEqual(r.maxChars)
        expect(p.roles).toHaveLength(p.sentences.length)
        if (lv.k === 'advanced' || lv.k === 'super') expect(p.hiddenMeta).toBe(true)
        if (lv.k === 'super') expect(p.obscure).toBe(true)
      }
    }
  })
})
