import { describe, it, expect } from 'vitest'
import { buildPaperTex, mdToTex } from '../utils/export'

const SAMPLE_QS = [
  { subject: '判断推理', stem: '以下哪项最能削弱上述论证？', options: [{ k: 'A', t: '另有他因' }, { k: 'B', t: '因果倒置' }, { k: 'C', t: '无关选项' }, { k: 'D', t: '加强项' }], answer: 'A', explain: '削弱要找到论证漏洞，另有他因最强。' },
  { subject: '资料分析', stem: '2024年某省GDP同比增长8%，求2023年基期（亿元）。', options: [{ k: 'A', t: '100' }, { k: 'B', t: '120' }], answer: 'B', explain: '基期=现期÷(1+8%)。' }
]

const noDouble = (s) => !/\\\\begin|\\\\section|\\\\end\{|\\\\item|\\\\textbf|\\\\textbackslash/.test(s)

describe('buildPaperTex 整卷 LaTeX 生成', () => {
  const tex = buildPaperTex({
    title: '模拟组卷 · 测试（2026/8/31）',
    qs: SAMPLE_QS,
    stat: { score: 1, rate: 50, sec: 610, moduleStats: [{ subject: '判断推理', total: 1, ok: 1 }, { subject: '资料分析', total: 1, ok: 0 }], marks: [{ pick: 'A', ok: true }, { pick: 'B', ok: false }] },
    separate: false
  })

  it('包含可编译的 document 结构（单反斜杠）', () => {
    expect(tex).toContain('\\documentclass[12pt,a4paper]{article}')
    expect(tex).toContain('\\begin{document}')
    expect(tex).toContain('\\end{document}')
    expect(tex).toContain('\\usepackage[UTF8]{ctex}')
    expect(noDouble(tex)).toBe(true)
  })

  it('包含成绩/板块统计与逐题结构', () => {
    expect(tex).toContain('\\section*{成绩概览}')
    expect(tex).toContain('\\begin{longtable}')
    expect(tex).toContain('\\section*{第1题 · 判断推理}')
    expect(tex).toContain('\\textbf{题干：}')
    expect(tex).toContain('\\textbf{选项：}')
    expect(tex).toContain('\\textbf{我的答案：}A')
    expect(tex).toContain('\\textbf{正确答案：}A')
  })

  it('特殊字符转义（% & _ #）', () => {
    const t = buildPaperTex({ title: 'x', qs: [{ subject: '言语', stem: '正确率 50% 且 A&B 中 _ 是#1', options: [], answer: '', explain: '' }], stat: { moduleStats: [] }, separate: false })
    expect(t).toContain('50\\%')
    expect(t).toContain('A\\&B')
    expect(t).toContain('\\_')
    expect(t).toContain('\\#')
  })
})

describe('mdToTex AI 排版转 LaTeX', () => {
  const md = [
    '## 📄 卷面总结',
    '共 2 题 · 答对 1 题 · 正确率 50%。整体表现中等，判断推理掌握较好。',
    '',
    '**第1题 · 判断推理（❌）**',
    '> 做错题：没抓住论证缺口。',
    '',
    '- 考点：削弱论证',
    '- 秒杀：另有他因 > 因果倒置',
    '',
    '| 板块 | 题数 | 答对 | 正确率 |',
    '|---|---|---|---|',
    '| 判断推理 | 1 | 1 | 100% |'
  ].join('\n')
  const tex = mdToTex(md)

  it('生成单反斜杠可编译 LaTeX', () => {
    expect(tex).toContain('\\begin{document}')
    expect(tex).toContain('\\end{document}')
    expect(noDouble(tex)).toBe(true)
  })

  it('识别标题/加粗/引用/列表/表格', () => {
    expect(tex).toContain('\\section*{卷面总结}')
    expect(tex).toContain('\\textbf{第1题 · 判断推理（）}')
    expect(tex).toContain('\\begin{quote}')
    expect(tex).toContain('\\begin{itemize}')
    expect(tex).toContain('\\item 考点：削弱论证')
    expect(tex).toContain('\\begin{longtable}')
  })
})
