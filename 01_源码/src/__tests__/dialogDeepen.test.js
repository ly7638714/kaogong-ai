// calcProtocol / recall（对话侧深化）回归
import { describe, it, expect } from 'vitest'
import { calcVerifySys } from '../utils/calcProtocol'
import { recallWrongs, recallMemories, recallBlock, isRecallAsk } from '../utils/recall'
describe('calcProtocol', () => {
  it('数量/资料解题加验算协议', () => {
    const s1 = calcVerifySys('资料分析', '2021年粮食产量同比增长多少亿吨？')
    expect(s1).toContain('【验算】')
    const s2 = calcVerifySys('数量关系', '甲乙相遇需要多少分钟？')
    expect(s2).toContain('算式')
  })
  it('概念/定义/出题不强加验算', () => {
    expect(calcVerifySys('资料分析', '同比增长率是什么意思？')).toBe('')
    expect(calcVerifySys('数量关系', '帮我出一道工程问题')).toBe('')
    expect(calcVerifySys('言语理解', '主旨是什么')).toBe('')
  })
})
describe('recall', () => {
  const wqs = [
    { id: 1, subject: '判断推理', sub: '削弱型', reasons: ['偷换论题'], question: '最能削弱上述论证的是？', wrongCount: 3 },
    { id: 2, subject: '资料分析', variant: '比重问题', reasons: ['基期找错'], question: '2019年第三产业占比为？', wrongCount: 1 }
  ]
  it('追问“削弱/为什么错”召回同题型错题', () => {
    const rs = recallWrongs(wqs, '这题又是削弱题，我为什么错？', { plate6: '判断推理' })
    expect(rs.length).toBe(1)
    expect(rs[0].id).toBe(1)
  })
  it('不相关提问不召回', () => {
    const rs = recallWrongs(wqs, '常识题：宪法规定国家主席任期？', { plate6: '常识判断' })
    expect(rs.length).toBe(0)
  })
  it('记忆召回：提问含词条标题', () => {
    const srs = { '成语|南辕北辙': { lvl: 2, due: '2026-09-01' }, '时政|二十大主题': { lvl: 1, due: '2026-09-02' } }
    const ms = recallMemories(srs, '南辕北辙这个词的用法')
    expect(ms.length).toBe(1)
    expect(ms[0].title).toBe('南辕北辙')
  })
  it('recallBlock 组装且句式门槛生效', () => {
    const blk = recallBlock({ wqs, srs: {}, query: '这道题我还是错，为什么？', plate6: '判断推理' })
    expect(blk).toContain('削弱型')
    expect(recallBlock({ wqs, srs: {}, query: '随便问问天气', plate6: '' })).toBe('')
  })
  it('isRecallAsk 识别追问句式', () => {
    expect(isRecallAsk('上一题为什么选C')).toBe(true)
    expect(isRecallAsk('帮我出三道题')).toBe(false)
  })
})
