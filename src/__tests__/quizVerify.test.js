import { describe, it, expect } from 'vitest'
import { localQuizVerify, askDirection } from '../utils/quizVerify'

const good = {
  stem: '2023年某省GDP为5.2万亿元，同比增长6%。2023年该省GDP比2022年约增加多少万亿元？',
  options: [
    { k: 'A', t: '0.25' },
    { k: 'B', t: '0.29' },
    { k: 'C', t: '0.45' },
    { k: 'D', t: '0.60' }
  ],
  answer: 'B',
  explain: '增长量=5.2×6%/(1+6%)≈0.29，故正确答案是B，其余选项均为误算。'
}

describe('本地出题质检 skill quizVerify（严格单选·唯一正确项）', () => {
  it('合格题目 → ok=true', () => {
    const r = localQuizVerify(good)
    expect(r.ok).toBe(true)
  })

  it('重复/同义选项 → 判不合格（无法唯一单选）', () => {
    const q = { ...good, options: [
      { k: 'A', t: '0.29' },
      { k: 'B', t: '0.29' },
      { k: 'C', t: '0.45' },
      { k: 'D', t: '0.60' }
    ] }
    const r = localQuizVerify(q)
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('重复')
  })

  it('选项数不是4 → 判不合格', () => {
    const q = { ...good, options: good.options.slice(0, 3) }
    expect(localQuizVerify(q).ok).toBe(false)
  })

  it('答案标记非法/缺失 → 判不合格', () => {
    const q = { ...good, answer: 'E' }
    expect(localQuizVerify(q).ok).toBe(false)
    const q2 = { ...good, answer: '' }
    expect(localQuizVerify(q2).ok).toBe(false)
  })

  it('解析点明的答案与答案标记不一致 → 判不合格', () => {
    const q = { ...good, explain: '增长量约0.25，故正确答案是A。' }
    const r = localQuizVerify(q)
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('不一致')
  })

  it('答案项内容为空 → 判不合格', () => {
    const q = { ...good, options: [
      { k: 'A', t: '0.25' },
      { k: 'B', t: '' },
      { k: 'C', t: '0.45' },
      { k: 'D', t: '0.60' }
    ] }
    expect(localQuizVerify(q).ok).toBe(false)
  })

  it('题干过短 → 判不合格（无图的纯文字题）', () => {
    const q = { ...good, stem: '选哪个？' }
    expect(localQuizVerify(q).ok).toBe(false)
  })

  it('图推题带 SVG 时题干短可接受', () => {
    const q = { ...good, stem: '选择最合适的一个填入问号处，使之呈现一定规律性。```svg\n<svg width="620" height="140" viewBox="0 0 620 140"></svg>\n```' }
    expect(localQuizVerify(q).ok).toBe(true)
  })

  it('askDirection 识别 选非/选是 问法', () => {
    expect(askDirection({ stem: '下列说法错误的是（ ）。' })).toBe('fei')
    expect(askDirection({ stem: '根据材料，以下说法正确的是（ ）。' })).toBe('shi')
    expect(askDirection({ stem: '2023年GDP比2022年增长了多少？' })).toBe('auto')
  })
})
