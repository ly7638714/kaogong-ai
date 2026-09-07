import { describe, it, expect } from 'vitest'
import { isQuizAsk } from '../utils/quiz'

describe('isQuizAsk 出题请求判定（防真实题被误包成选项卡）', () => {
  it('叫我出题/练题 → true', () => {
    expect(isQuizAsk('帮我出几道言语理解题')).toBe(true)
    expect(isQuizAsk('出一道图形推理题')).toBe(true)
    expect(isQuizAsk('来一道数量题练练')).toBe(true)
    expect(isQuizAsk('出题练习一下逻辑填空')).toBe(true)
    expect(isQuizAsk('给我出道题')).toBe(true)
    expect(isQuizAsk('做几道资料分析练习')).toBe(true)
  })
  it('真实提问/解析追问 → false', () => {
    expect(isQuizAsk('这几道言语理解题目怎么做')).toBe(false)
    expect(isQuizAsk('这题怎么做')).toBe(false)
    expect(isQuizAsk('这道削弱题为什么选D')).toBe(false)
    expect(isQuizAsk('练习册第12题帮我看看')).toBe(false)
    expect(isQuizAsk('帮我解析一下刚才那道题')).toBe(false)
    expect(isQuizAsk('这题直接告诉我答案')).toBe(false)
    expect(isQuizAsk('')).toBe(false)
  })
})
