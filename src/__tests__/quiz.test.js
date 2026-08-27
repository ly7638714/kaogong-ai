import { describe, it, expect } from 'vitest'
import { parseQuiz, answerLetter, extractChoices, parseMaterialQuiz } from '../utils/quiz'

describe('parseQuiz 选项提取', () => {
  it('保留含大写字母的选项文本（回归：旧正则 [^A-D\\n] 会把 GDP 截成 G）', () => {
    const q = parseQuiz(
      '以下关于宏观经济的说法正确的是\nA. GDP增长\nB. 产能过剩\nC. 结构优化\nD. 全面下滑\n【正确答案】A'
    )
    expect(q).toBeTruthy()
    expect(q.options.map((o) => o.t)).toEqual(['GDP增长', '产能过剩', '结构优化', '全面下滑'])
  })

  it('选项含字母且为标准逐行格式可完整提取', () => {
    const q = parseQuiz('某数列下一项是多少？\nA. 2\nB. 3\nC. 4\nD. 5\n【正确答案】C')
    expect(q).toBeTruthy()
    expect(q.options.map((o) => o.t)).toEqual(['2', '3', '4', '5'])
  })
})

describe('extractChoices', () => {
  it('返回 2 个以上选项', () => {
    const cs = extractChoices('A. 甲\nB. 乙\nC. 丙\nD. 丁')
    expect(cs.length).toBe(4)
  })
})

describe('answerLetter 答案提取', () => {
  it('识别【正确答案】/答案/正确选项 前缀', () => {
    expect(answerLetter('正确答案 B（我选了A）')).toBe('B')
    expect(answerLetter('答案：D')).toBe('D')
    expect(answerLetter('正确选项 C')).toBe('C')
  })
  it('整行独立字母可识别', () => {
    expect(answerLetter('B')).toBe('B')
    expect(answerLetter('# 答案\nA')).toBe('A')
  })
  it('无答案语义时不误判正文字母', () => {
    expect(answerLetter('解析：甲说乙是凶手，乙说丙是凶手，问谁真谁假？')).toBe('')
  })
  it('优先答案标记，不受正文其他字母影响', () => {
    expect(answerLetter('答案 C。其中第D项为干扰项')).toBe('C')
  })
  it('parseMaterialQuiz：材料标题同行也能抓取材料', () => {
    const r = parseMaterialQuiz(
      '### 📄 材料 2024年城镇就业人口1234万人，比上年增长3.2%。\n### 第1题\n下面正确的是？\nA. 就业增长 B. 人口下降\nC. 翻倍 D. 不变\n【正确答案】A\n### 第2题\n求增长率\nA. 1% B. 3.2%\nC. 5% D. 10%\n【正确答案】B',
      2
    )
    expect(r).toBeTruthy()
    expect(r.material).toContain('1234万人')
    expect(r.qs.length).toBe(2)
  })
  it('"选 X"独立动词才识别，避免 入选 误判', () => {
    expect(answerLetter('答案：选 B')).toBe('B')
    expect(answerLetter('当选 B 项')).toBe('B') // 当选 = 明确答案语义
    expect(answerLetter('本题选 C')).toBe('C') // 主流出题收尾格式
    expect(answerLetter('此题选 D')).toBe('D')
    expect(answerLetter('入选 C 项的是甲')).toBe('') // 入选 中的"选"不该被当答案
    expect(answerLetter('参加A组的是乙')).toBe('') // 无答案语义，正文字母不误判
  })
})
