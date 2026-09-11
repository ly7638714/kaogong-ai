import { describe, it, expect } from 'vitest'
import { isYanWrong, buildYanTrainingFromWrong } from '../utils/yanWrongImport'

describe('yanWrongImport 言语理解错题联动片段阅读', () => {
  it('识别言语理解及其细分题型错题', () => {
    expect(isYanWrong({ subject: '言语理解', subx: '片段阅读' })).toBe(true)
    expect(isYanWrong({ subject: '逻辑填空' })).toBe(true)
    expect(isYanWrong({ subject: '判断推理', subx: '逻辑判断' })).toBe(false)
  })

  it('解析片段阅读保存格式的完整材料、题目、选项和答案', () => {
    const wq = {
      id: 'w1',
      subject: '言语理解',
      subx: '片段阅读',
      question: [
        '【片段阅读材料】韧性城市',
        '第1句：城市地下管网越修越密，仍会在极端暴雨中承受巨大压力。',
        '第2句：让绿地、湖塘和透水铺装参与雨水调节，能在源头削减洪峰。',
        '第3句：韧性城市不是把所有雨水都装进管道，而是给水留出缓一缓的空间。',
        '',
        '【题目】这段文字意在说明（ ）。',
        'A 城市应只提高管网排水速度',
        'B 城市应通过生态设施增强雨水调节韧性',
        'C 城市建设应减少公共绿地',
        'D 极端暴雨无法通过规划应对'
      ].join('\n'),
      answer: '正确答案 B（我选A）',
      explain: '作者强调从末端排水转向源头韧性建设。'
    }
    const r = buildYanTrainingFromWrong(wq)
    expect(r.ok).toBe(true)
    expect(r.paper.sentences).toHaveLength(3)
    expect(r.paper.sourceWrong).toBe(true)
    expect(r.question.q).toContain('意在说明')
    expect(r.question.options).toHaveLength(4)
    expect(r.question.answer).toBe('B')
    expect(r.question.explain).toContain('韧性')
  })

  it('解析普通言语理解题并把最后的提问句与材料拆开', () => {
    const wq = {
      id: 'w2',
      subject: '言语理解',
      question: '传统村落保护不只是保存建筑外观，更要延续社区生活和地方记忆。然而，一些地方把原住民迁走后只留下静态展示，村落因此失去了活力。这段文字主要强调（ ）。 A 原住民应全部迁出 B 保护要兼顾社区生活 C 建筑外观最重要 D 静态展示更有效',
      answer: 'B'
    }
    const r = buildYanTrainingFromWrong(wq)
    expect(r.ok).toBe(true)
    expect(r.paper.sentences.length).toBeGreaterThanOrEqual(2)
    expect(r.question.q).toContain('主要强调')
    expect(r.question.options.map((o) => o.k)).toEqual(['A', 'B', 'C', 'D'])
    expect(r.question.answer).toBe('B')
  })
})
