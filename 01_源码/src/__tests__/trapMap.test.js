// trapMap 陷阱映射→错因（35号批次3-A）回归：归一/解析/就近归因/映射到 wrongReasons/占位兜底
import { describe, it, expect } from 'vitest'
import { normalizeTrap, parseTrapMap, parseTrapFromExplain, reasonForTrap, autoWrongReasons, PLACEHOLDER_REASON } from '../utils/trapMap'

describe('normalizeTrap 别名归一', () => {
  it('枚举原词与常见别名归一到同一陷阱', () => {
    expect(normalizeTrap('偷换概念')).toBe('偷换概念')
    expect(normalizeTrap('偷换')).toBe('偷换概念')
    expect(normalizeTrap('时间单位陷阱')).toBe('时间单位陷阱')
    expect(normalizeTrap('看错单位')).toBe('时间单位陷阱')
  })
  it('未知词返回空', () => {
    expect(normalizeTrap('随便说说')).toBe('')
    expect(normalizeTrap('')).toBe('')
  })
})

describe('parseTrapMap 解析【陷阱映射】', () => {
  it('A:B:C:D 冒号换行格式', () => {
    const m = parseTrapMap('说明正文…\n【陷阱映射】A:偷换概念\nB:以偏概全\nC:因果倒置\nD:绝对化')
    expect(m).toEqual({ A: '偷换概念', B: '以偏概全', C: '因果倒置', D: '绝对化' })
  })
  it('同行逗号分隔格式', () => {
    const m = parseTrapMap('【陷阱映射】A:时间口径, B:无中生有, C:缺要件, D:范围扩大')
    expect(m.B).toBe('无中生有')
    expect(m.D).toBe('范围扩大')
  })
  it('无映射段返回空对象', () => {
    expect(parseTrapMap('无陷阱映射的说明')).toEqual({})
  })
})

describe('parseTrapFromExplain 解析就近归因（无 designer 兜底）', () => {
  it('识别 B项/选项X 就近陷阱', () => {
    const m = parseTrapFromExplain('正确项A。B项偷换概念，把主体换掉；C项以偏概全只对部分成立。')
    expect(m.B).toBe('偷换概念')
    expect(m.C).toBe('以偏概全')
  })
})

describe('reasonForTrap 陷阱×板块→错因条目', () => {
  it('判断推理·偷换概念 → 具体条目', () => {
    expect(reasonForTrap('判断推理', '偷换概念')).toBe('偷换概念没发现')
  })
  it('资料分析·时间单位陷阱 → 看错单位条目', () => {
    expect(reasonForTrap('资料分析', '时间单位陷阱')).toContain('单位')
  })
  it('未知陷阱返回空', () => {
    expect(reasonForTrap('判断推理', '胡说八道')).toBe('')
  })
})

describe('autoWrongReasons 单题自动归因', () => {
  const q = {
    subject: '判断推理',
    designer: '干扰项设计：B项偷换概念。\n【陷阱映射】A:无中生有\nB:偷换概念\nC:力度不足\nD:绝对化'
  }
  it('所选错误项有陷阱映射 → 结构化错因', () => {
    expect(autoWrongReasons(q, 'B')).toEqual(['偷换概念没发现'])
  })
  it('所选选项无映射 → 占位符（不张冠李戴）', () => {
    expect(autoWrongReasons(q, 'X')).toEqual([PLACEHOLDER_REASON])
    expect(autoWrongReasons(q, '')).toEqual([PLACEHOLDER_REASON])
  })
  it('无 designer/解析信息 → 占位符', () => {
    expect(autoWrongReasons({ subject: '资料分析' }, 'A')).toEqual([PLACEHOLDER_REASON])
  })
  it('无 designer 但解析里有就近陷阱 → 归因成功', () => {
    const q2 = { subject: '判断推理', explain: 'B项偷换概念，考生要注意。', picked: '' }
    expect(autoWrongReasons(q2, 'B')).toEqual(['偷换概念没发现'])
  })
})
