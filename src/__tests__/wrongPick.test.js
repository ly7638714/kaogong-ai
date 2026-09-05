// wrongPick（截图/出题卡存错题取题源）回归
import { describe, it, expect } from 'vitest'
import { quizTextOf, pickWrongSource } from '../utils/wrongPick'
const mkQuiz = (extra = {}) => ({ role: 'assistant', quiz: { stem: '材料…问基期是多少？', options: [{ k: 'A', t: '100' }, { k: 'B', t: '120' }], answer: 'B' }, ...extra })
describe('quizTextOf', () => {
  it('组装题干与 A-D 选项', () => {
    const t = quizTextOf({ stem: '题目', options: [{ k: 'A', t: '甲' }, { k: 'B', t: '乙' }] })
    expect(t).toContain('题目')
    expect(t).toContain('A. 甲')
    expect(t).toContain('B. 乙')
  })
})
describe('pickWrongSource', () => {
  const ocrUser = { role: 'user', content: { text: '这题怎么做', imgs: ['data:image/png;base64,xx'] }, _curImgRead: '2023年GDP…问增长量？\nA. 100\nB. 200' }
  it('优先取截图 OCR 全文（而非用户短文字）', () => {
    const msgs = [ocrUser, { role: 'assistant', content: '答案是 B，解析……' }]
    const r = pickWrongSource(msgs, 1)
    expect(r.source).toBe('ocr')
    expect(r.q).toContain('GDP')
    expect(r.imgs.length).toBe(1)
  })
  it('有结构化题目卡时优先题目卡', () => {
    const msgs = [ocrUser, mkQuiz({ orgImg: ['data:image/png;base64,yy'] }), { role: 'assistant', content: '讲解……' }]
    const r = pickWrongSource(msgs, 2)
    expect(r.source).toBe('quiz')
    expect(r.q).toContain('A. 100')
  })
  it('纯文字问答回退最近用户提问', () => {
    const msgs = [{ role: 'user', content: '第一问：中心理解怎么做' }, { role: 'assistant', content: '答1' }, { role: 'user', content: '第二问：这题选什么' }, { role: 'assistant', content: '答2' }]
    const r = pickWrongSource(msgs, 3)
    expect(r.source).toBe('text')
    expect(r.q).toContain('第二问')
  })
  it('点较早的 AI 回复时取它自己那轮的用户提问，而不是最新的', () => {
    const msgs = [
      { role: 'user', content: '早期问题A' },
      { role: 'assistant', content: '早答A' },
      { role: 'user', content: '后期问题B' },
      { role: 'assistant', content: '晚答B' }
    ]
    const r = pickWrongSource(msgs, 1)
    expect(r.q).toContain('早期问题A')
  })
})
