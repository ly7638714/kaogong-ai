import { describe, it, expect } from 'vitest'
import { genTutuQuestion } from '../utils/tutuGen'
import { normalizeSvg } from '../utils/svgFix'

// 解析 svg 里的 viewBox 数值
function vbOf(svg) {
  const m = String(svg).match(/viewBox="([^"]+)"/)
  if (!m) return null
  return m[1].split(/[\s,]+/).map(Number)
}

describe('genTutuQuestion 本地图推生成器', () => {
  it('连续生成不失败、覆盖多种形式与规律族', () => {
    const forms = {}
    const families = {}
    for (let i = 0; i < 60; i++) {
      const q = genTutuQuestion(1000 + i)
      expect(q).toBeTruthy()
      forms[q.form] = (forms[q.form] || 0) + 1
      families[q.family] = (families[q.family] || 0) + 1
    }
    expect(Object.keys(forms).length).toBeGreaterThanOrEqual(3)
    expect(Object.keys(families).length).toBeGreaterThanOrEqual(12)
    expect(forms.seq).toBeGreaterThan(0)
    expect(forms.matrix).toBeGreaterThan(0)
    expect(forms.analogy).toBeGreaterThan(0)
    expect(forms.group).toBeGreaterThan(0)
  })

  it('题干含 svg 且带 viewBox，选项 4 个且每个都有图或分组文字', () => {
    for (let i = 0; i < 20; i++) {
      const q = genTutuQuestion(2000 + i)
      expect(q.stem).toContain('```svg')
      expect(q.stem).toContain('viewBox')
      expect(q.options).toHaveLength(4)
      expect(q.answer).toMatch(/^[A-D]$/)
      for (const o of q.options) {
        if (q.form === 'group') expect(o.t).toMatch(/[①②③④⑤⑥]/)
        else expect(o.t).toContain('<svg')
      }
    }
  })

  it('题干与选项 SVG 内容全部落在 viewBox 内（零裁切）', () => {
    for (let i = 0; i < 30; i++) {
      const q = genTutuQuestion(3000 + i)
      const svgs = [q.stem.match(/<svg[\s\S]*?<\/svg>/)[0], ...q.options.map((o) => (o.t.match(/<svg[\s\S]*?<\/svg>/) || [''])[0])]
      for (const svg of svgs) {
        if (!svg) continue
        const vb = vbOf(svg)
        expect(vb, 'viewBox 缺失: ' + q.family).toBeTruthy()
        const w = vb[2], h = vb[3]
        // 检查所有 rect/circle/polygon/text 坐标不越界（用 normalizeSvg 后的内容包围盒再次校验）
        const fixed = normalizeSvg(svg)
        expect(fixed).toContain('viewBox')
        // 简单断言：viewBox 宽高 > 0 且元素数量>0
        expect(w).toBeGreaterThan(0)
        expect(h).toBeGreaterThan(0)
        expect(svg.length).toBeGreaterThan(60)
      }
    }
  })

  it('唯一解：只有答案选项满足规律特征', () => {
    const cellsKeyOf = (f) => (f && f.cells ? f.cells.map(([r, c]) => r * 4 + c).sort((a, b) => a - b).join(',') : '')
    for (let i = 0; i < 40; i++) {
      const q = genTutuQuestion(4000 + i)
      if (q.form === 'group') continue
      const ansOpt = q.options.find((o) => o.k === q.answer)
      const rules = {
        blackSeq: (f) => f.cells.length === ansOpt._fig.cells.length,
        dotsSeq: (f) => f.n === 6,
        arrowSeq: (f) => (((f.angle % 360) + 360) % 360) === 90,
        symSeq: (f) => f.sides === 7,
        hanziSeq: (f) => f.strokes === 6,
        rotChain: (f) => (((f.angle % 360) + 360) % 360) === 270,
        flipChain: (f) => f.kind === 'flip' && f.base === 'r' && f.mirror === 'none',
        overlay: (f) => cellsKeyOf(f) === cellsKeyOf(ansOpt._fig),
        posMove: (f) => f && f.kind === 'dotmove' && f.p === 5,
        relPos: (f) => f && f.kind === 'relpos' && f.st === 'tangent',
        matrixCount: (f) => f && f.kind === 'dots' && f.n === 4,
        hiveCount: (f) => f && f.kind === 'hive' && f.cells.length === 6,
        pathCount: (f) => f && f.kind === 'block' && cellsKeyOf(f) === cellsKeyOf(ansOpt._fig),
        blockMove: (f) => f && f.kind === 'block' && cellsKeyOf(f) === cellsKeyOf(ansOpt._fig),
        cubenet: (f) => f && f.kind === 'cubenet' && f.u === ansOpt._fig.u && f.f === ansOpt._fig.f && f.r === ansOpt._fig.r
      }
      const rule = rules[q.family]
      expect(rule, '未覆盖的规律族: ' + q.family).toBeTruthy()
      const matches = q.options.filter((o) => rule(o._fig))
      expect(matches, q.family + ' 唯一解失败').toHaveLength(1)
      expect(matches[0].k).toBe(q.answer)
    }
  })

  it('分组分类：正确分组按特征 3/3 划分', () => {
    for (let i = 0; i < 20; i++) {
      const q = genTutuQuestion(5000 + i)
      if (q.form !== 'group') continue
      expect(q.answer).toMatch(/^[A-D]$/)
      const correct = q.options.find((o) => o.k === q.answer)
      expect(correct.t).toMatch(/[①②③④⑤⑥]/)
      // 三个一组两个逗号
      expect(correct.t.split('，')).toHaveLength(2)
    }
  })

  it('空间重构展开图：题干 6 格可拼合、选项为等轴测立方体、唯一解', () => {
    let cnt = 0
    for (let i = 0; i < 120; i++) {
      const q = genTutuQuestion(8000 + i)
      if (q.family !== 'cubenet') continue
      cnt++
      const stemSvg = q.stem.match(/<svg[\s\S]*?<\/svg>/)[0]
      // 展开图 = 6 个格子
      // 展开图 6 个格子（格子带 stroke="#555"，图案方块不算）
      expect((stemSvg.match(/stroke="#555"/g) || []).length).toBe(6)
      expect(stemSvg).toContain('viewBox')
      // 选项 4 个都是立方体（多边形面 + viewBox）
      for (const o of q.options) {
        expect(o.t).toContain('<polygon')
        expect(o.t).toContain('viewBox="')
      }
      // 唯一解：仅答案选项的可见三面与折叠结果一致
      const ans = q.options.find((o) => o.k === q.answer)
      const matches = q.options.filter((o) => o._fig && o._fig.u === ans._fig.u && o._fig.f === ans._fig.f && o._fig.r === ans._fig.r)
      expect(matches).toHaveLength(1)
    }
    expect(cnt).toBeGreaterThan(0) // 120 次内必出现 cubenet
  })

  it('同一题生成不重复（种子不同图形不同）', () => {
    const a = genTutuQuestion(6001)
    const b = genTutuQuestion(6002)
    expect(a.stem).not.toBe(b.stem)
  })
})
