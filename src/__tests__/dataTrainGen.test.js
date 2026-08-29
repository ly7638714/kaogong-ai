import { describe, it, expect } from 'vitest'
import { genDataQ, DATA_MODES, CALC_METHOD_LIB } from '../utils/dataTrainGen'

describe('genDataQ 资料分析四层训练生成器', () => {
  it('四种模式都能生成结构完整、唯一正确的题目', () => {
    for (const m of ['type', 'locate', 'formula', 'calc']) {
      for (let i = 0; i < 60; i++) {
        const q = genDataQ(m, 1000 + i, 2)
        expect(q, m + ' 生成失败 seed=' + (1000 + i)).toBeTruthy()
        expect(String(q.q).length).toBeGreaterThan(10)
        expect(q.options).toHaveLength(4)
        expect(q.answer).toMatch(/^[A-D]$/)
        expect(q.explain).toBeTruthy()
        expect(q.tip).toBeTruthy()
        // 唯一正确：4 个选项文本互不相同，且答案字母确实指向某一选项
        const ts = q.options.map((o) => String(o.t))
        expect(new Set(ts).size).toBe(4)
        expect(q.options.find((o) => o.k === q.answer)).toBeTruthy()
      }
    }
  })

  it('相同种子生成相同题目（确定性）', () => {
    for (const m of ['type', 'locate', 'formula', 'calc']) {
      const a = genDataQ(m, 777, 1)
      const b = genDataQ(m, 777, 1)
      expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    }
  })

  it('判题型覆盖全部 14 类考点，且答案题型与解析一致', () => {
    const seen = new Set()
    for (let i = 0; i < 200; i++) {
      const q = genDataQ('type', 5000 + i, 2)
      expect(q.extra.name).toBeTruthy()
      seen.add(q.extra.name)
      // 解析里必须指出该题型
      expect(q.explain).toContain(q.extra.name)
      // 题干提问关键词应能匹配该题型的 ask 词（通过 extra 间接保证）
      expect(q.options.map((o) => o.t)).toContain(q.extra.name)
    }
    expect(seen.size).toBeGreaterThanOrEqual(14)
  })

  it('找数据定位覆盖 文字/表格/图表 三种材料', () => {
    const types = new Set()
    for (let i = 0; i < 200; i++) {
      const q = genDataQ('locate', 6000 + i, 2)
      types.add(q.materialType)
      expect(q.options).toHaveLength(4)
      if (q.materialType === 'chart') {
        expect(q.materialSvg).toContain('<svg')
        expect(q.materialSvg).toContain('viewBox')
      } else {
        expect(q.materialMd).toContain('【材料】')
        if (q.materialType === 'table') expect(q.materialMd).toContain('|')
      }
    }
    expect(types.has('text')).toBe(true)
    expect(types.has('table')).toBe(true)
    expect(types.has('chart')).toBe(true)
  })

  it('公式应激覆盖多种公式族，选项含 LaTeX 且互不相同', () => {
    const seen = new Set()
    for (let i = 0; i < 200; i++) {
      const q = genDataQ('formula', 7000 + i, 2)
      seen.add(q.extra.name)
      expect(q.explain).toContain('【完整解题路径】')
      expect(q.explain).toContain(q.extra.name)
      for (const o of q.options) expect(String(o.t)).toMatch(/\$|倍|居中|%|÷/)
    }
    expect(seen.size).toBeGreaterThanOrEqual(10)
  })

  it('速算估算覆盖多种速算法，且答案数值与速算方法一致', () => {
    const seen = new Set()
    for (let i = 0; i < 240; i++) {
      const q = genDataQ('calc', 8000 + i, 2)
      seen.add(q.extra.name)
      expect(q.explain).toContain('【速算过程】')
      expect(q.explain).toContain(q.extra.name)
      // 答案选项文本必须出现在解析里（解析展示了该值）
      const ansT = String(q.options.find((o) => o.k === q.answer).t)
      expect(q.explain.replace(/,/g, '')).toContain(ansT.replace(/,/g, ''))
    }
    expect(seen.size).toBeGreaterThanOrEqual(7)
  })

  it('三档难度在实战档包含截位/混合等高级方法且不失败', () => {
    for (let lv = 1; lv <= 3; lv++) {
      let ok = 0
      const seen = new Set()
      for (let i = 0; i < 120; i++) {
        const q = genDataQ('calc', 9000 + i, lv)
        expect(q).toBeTruthy()
        ok++
        seen.add(q.extra.name)
      }
      expect(ok).toBe(120)
      if (lv === 3) {
        expect(seen.has('截位直除') || seen.has('混合居中')).toBe(true)
      }
    }
  })

  it('模式元信息齐全', () => {
    expect(DATA_MODES).toHaveLength(4)
    expect(DATA_MODES.map((m) => m.k)).toEqual(['type', 'locate', 'formula', 'calc'])
    for (const m of DATA_MODES) {
      expect(m.t).toBeTruthy()
      expect(m.layer).toMatch(/[①②③④]/)
    }
  })

  it('内容多样性：连续 200 道完整题重复率低（防止退化为固定题库）', () => {
    for (const m of ['type', 'locate', 'formula', 'calc']) {
      const seen = new Set()
      for (let i = 0; i < 200; i++) {
        const q = genDataQ(m, 880000 + i * 13, 2)
        expect(q).toBeTruthy()
        const content = (q.materialMd || q.materialSvg || '') + '|' + q.q + '|' + q.options.map((o) => o.k + String(o.t)).join('') + '|' + q.answer
        seen.add(content)
      }
      expect(seen.size, m + ' 200道完整题应几乎不重复').toBeGreaterThan(190)
    }
  })

  it('单位合理性：金额/产值类指标不出现动物类单位', () => {
    for (let i = 0; i < 300; i++) {
      const q = genDataQ('type', 660000 + i, 2)
      const t = String(q.q)
      expect(t).not.toMatch(/(收入|产值|投资|总额|增加值|保费|预算).*(万头|亿千瓦时|万公顷|亿吨公里)/)
    }
  })

  it('速算分阶段：识别/应用/实战 三阶段结构正确', () => {
    for (const st of ['identify', 'apply', 'practice']) {
      for (let i = 0; i < 60; i++) {
        const q = genDataQ('calc', 990000 + i, 2, st)
        expect(q).toBeTruthy()
        expect(q.stage).toBe(st)
        expect(q.options).toHaveLength(4)
        if (st === 'identify') {
          expect(String(q.q)).toContain('最适合用哪种速算方法')
          expect(q.explain).toContain('【方法识别】')
          expect(q.explain).toContain(q.extra.name)
        } else if (st === 'apply') {
          expect(String(q.q)).toContain('请用「')
        } else {
          expect(q.explain).toContain('【速算过程】')
        }
      }
    }
  })

  it('速算方法教学库齐全：每种方法都有适用条件/原理/操作步骤', () => {
    expect(Object.keys(CALC_METHOD_LIB).length).toBeGreaterThanOrEqual(9)
    for (const m of Object.values(CALC_METHOD_LIB)) {
      expect(m.trigger).toBeTruthy()
      expect(m.concept).toBeTruthy()
      expect(m.steps.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('复杂定位材料：表格含多级表头/单位行/备注，图表为柱+折线组合图', () => {
    let tableOk = false, chartOk = false
    for (let i = 0; i < 200; i++) {
      const q = genDataQ('locate', 770000 + i, 2)
      if (q.materialType === 'table') {
        expect(q.materialMd).toContain('注：')
        expect(q.materialMd).toContain('| 单位 |')
        tableOk = true
      }
      if (q.materialType === 'chart') {
        expect(q.materialSvg).toContain('polyline')
        expect(q.materialSvg).toContain('增速')
        chartOk = true
      }
    }
    expect(tableOk).toBe(true)
    expect(chartOk).toBe(true)
  })
})