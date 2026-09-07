import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { recordGenLog, genLogStats, genLogHint, clearGenLog, genLogSize } from '../utils/quizLog'
import { plateChecks, plateAiHint, plateLearn } from '../utils/quizVerifyProfiles'

function memStore() {
  const m = new Map()
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() }
}
let ls
beforeEach(() => {
  ls = memStore()
  vi.stubGlobal('localStorage', ls)
  clearGenLog()
})
afterEach(() => vi.unstubAllGlobals())

describe('出题历史记录 quizLog（供 AI 持续学习）', () => {
  it('记录成功/失败并统计失败原因 Top', () => {
    recordGenLog({ plate: '资料分析', variant: '比重', ok: false, attempts: 2, reasons: ['重复选项', '解析答案不一致'] })
    recordGenLog({ plate: '资料分析', variant: '比重', ok: false, attempts: 3, reasons: ['重复选项'] })
    recordGenLog({ plate: '资料分析', variant: '比重', ok: true, attempts: 1, reasons: [] })
    const st = genLogStats('资料分析', '比重')
    expect(st.total).toBe(3)
    expect(st.fail).toBe(2)
    expect(st.topReasons[0]).toContain('重复选项')
    expect(genLogSize()).toBe(3)
  })

  it('genLogHint 生成学习提示（含失败原因与规避建议）', () => {
    recordGenLog({ plate: '图形推理', ok: false, attempts: 2, reasons: ['SVG越界'] })
    const hint = genLogHint('图形推理')
    expect(hint).toContain('历史质检学习')
    expect(hint).toContain('SVG越界')
    expect(hint).toContain('唯一正确项')
  })

  it('无历史时不生成提示', () => {
    expect(genLogHint('常识判断')).toBe('')
  })
})

describe('各板块质检子命题人 quizVerifyProfiles', () => {
  it('图推题不带 SVG → 判不合格', () => {
    const errs = plateChecks({ stem: '从所给选项中选最合适的一个填入问号处。', options: [{ t: 'A' }, { t: 'B' }, { t: 'C' }, { t: 'D' }] }, '图形推理')
    expect(errs.some((e) => e.includes('SVG'))).toBe(true)
  })

  it('言语题干过短 → 判不合格；完整文段 → 通过', () => {
    const short = plateChecks({ stem: '这段文字意在说明？', options: [{ t: 'a' }, { t: 'b' }, { t: 'c' }, { t: 'd' }] }, '言语理解')
    expect(short.some((e) => e.includes('过短'))).toBe(true)
    const long = 'x'.repeat(100)
    expect(plateChecks({ stem: long, options: [{ t: 'a' }, { t: 'b' }, { t: 'c' }, { t: 'd' }] }, '言语理解')).toEqual([])
  })

  it('数量关系选项非数值 → 判不合格', () => {
    const errs = plateChecks({ stem: '问甲需要多少天？', options: [{ t: '不确定' }, { t: '看情况' }, { t: '无法判断' }, { t: '都有可能' }] }, '数量关系')
    expect(errs.some((e) => e.includes('数值'))).toBe(true)
  })

  it('各板块 AI 质检提示与避坑建议非空', () => {
    expect(plateAiHint('逻辑判断')).toContain('论证')
    expect(plateLearn('资料分析')).toContain('验算')
    expect(plateAiHint('资料分析')).toContain('资料分析')
  })
})
