import { describe, it, expect } from 'vitest'
import { buildPlainTranslationPrompt, sanitizePlainTranslation } from '../utils/plainTranslate'

describe('plainTranslate 逻辑题干白话翻译', () => {
  it('提示词只要求翻译概念，不要求结论论据和答案解析', () => {
    const p = buildPlainTranslationPrompt('只有连续降雨，水库水位才会上升。以下哪项如果为真，最能削弱上述结论？', 'C')
    expect(p.system).toContain('不是解题老师')
    expect(p.system).toContain('忽略原解析')
    expect(p.user).toContain('题干逐句白话')
    expect(p.user).toContain('难懂概念速查')
    expect(p.user).toContain('选项逐项直译')
    expect(p.user).not.toContain('论证结构')
    expect(p.user).not.toContain('解释该答案为什么成立')
  })

  it('清洗模型越界输出的答案解释和论据分析', () => {
    const raw = [
      '① 题干逐句白话',
      '- 原句/难句：只有连续降雨，水位才上升',
      '- 大白话：连续降雨是水位上升的必要条件',
      '- 这句只是在说：没连续降雨就不会涨水',
      '② 论证结构：结论是水位上升，论据是降雨',
      '正确答案是C，因为C能削弱结论',
      'A. 原意：降雨量很小',
      'B. 原意：水库同时开闸泄洪'
    ].join('\n')
    const out = sanitizePlainTranslation(raw)
    expect(out).toContain('大白话：连续降雨是水位上升的必要条件')
    expect(out).toContain('A. 原意：降雨量很小')
    expect(out).not.toContain('正确答案')
    expect(out).not.toContain('论证结构')
    expect(out).not.toContain('能削弱结论')
  })
  it('言语理解使用言语结构，且支持只翻译指定片段', () => {
    const whole = buildPlainTranslationPrompt('文段讨论城市更新与居民生活。作者意在说明什么？', '', '', { subject: '言语理解', sub: '片段阅读' })
    expect(whole.user).toContain('核心信息与句间关系')
    expect(whole.user).toContain('关键词、指代与态度色彩')
    expect(whole.user).not.toContain('论证结构')
    const focus = buildPlainTranslationPrompt('文段讨论城市更新与居民生活。作者意在说明什么？', '', '城市更新', { subject: '言语理解', sub: '片段阅读' })
    expect(focus.user).toContain('本次只翻译以下指定片段')
    expect(focus.user).toContain('城市更新')
  })
})
