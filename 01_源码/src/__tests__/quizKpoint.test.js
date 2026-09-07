// 35号批次1-A 考点自标回归：parseKpoint / parseQuiz 输出 kpoint 且不污染题干
import { describe, it, expect } from 'vitest'
import { parseQuiz, parseKpoint } from '../utils/quiz'

const mk = (kpoint) =>
  '这段文字意在强调什么（　）。\nA. 抓好生态建设\nB. 发展循环经济\nC. 提升治理能力\nD. 实现共同富裕\n【正确答案】A' + (kpoint ? '\n' + kpoint : '')

describe('parseKpoint 考点自标提取', () => {
  it('识别【考点】行', () => {
    expect(parseKpoint('题干\n【考点】中心·转折')).toBe('中心·转折')
    expect(parseKpoint('【考点】资料分析·综合')).toBe('资料分析·综合')
  })
  it('无考点行返回空串', () => {
    expect(parseKpoint('')).toBe('')
    expect(parseKpoint('普通文本没有考点标记')).toBe('')
  })
  it('不受其他【】标记干扰（只认【考点】）', () => {
    expect(parseKpoint('【解析】略\n【正确答案】A')).toBe('')
  })
})

describe('parseQuiz 集成考点', () => {
  it('末尾考点行被解析进 kpoint，且题干不含该行', () => {
    const q = parseQuiz(mk('【考点】中心·转折'))
    expect(q).toBeTruthy()
    expect(q.kpoint).toBe('中心·转折')
    expect(q.stem).not.toContain('【考点】')
    expect(q.answer).toBe('A')
    expect(q.options.length).toBe(4)
  })
  it('考点行放在正确答案之前也能解析', () => {
    const q = parseQuiz('逻辑题（　）。\nA. 甲\nB. 乙\nC. 丙\nD. 丁\n【考点】逻辑·削弱加强\n【正确答案】B')
    expect(q).toBeTruthy()
    expect(q.kpoint).toBe('逻辑·削弱加强')
  })
  it('无考点行 kpoint 为空串（老格式兼容）', () => {
    const q = parseQuiz(mk(''))
    expect(q.kpoint).toBe('')
  })
  it('题干区误带考点行会被剔除', () => {
    const q = parseQuiz('下面说法正确的是（　）。\n【考点】常识·法律\nA. 宪法是根本法\nB. 刑法是根本法\nC. 民法是根本法\nD. 商法是根本法\n【正确答案】A')
    expect(q).toBeTruthy()
    expect(q.stem).not.toContain('【考点】')
    expect(q.stem).toContain('下面说法正确')
  })
})
