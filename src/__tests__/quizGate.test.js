import { describe, it, expect } from 'vitest'
import { canRelaxDecision, needAiRecheck } from '../utils/quizGate'

// 39号矩阵 §4 组合铁律：出题闸门判定纯函数（对应 v3.8.128/129/130/163 四次"闸门互打架"）

describe('canRelaxDecision 放宽兜底判定（39号 §4 铁律）', () => {
  it('无 lastParsed → 禁放宽', () => {
    expect(canRelaxDecision({ hasLastParsed: false, lastOk: true, calcBad: false, isTruthTable: false, qcHardFail: false })).toBe(false)
  })
  it('本地质检不过 → 绝不收（唯一单选底线）', () => {
    expect(canRelaxDecision({ hasLastParsed: true, lastOk: false, calcBad: false, isTruthTable: false, qcHardFail: false })).toBe(false)
  })
  it('calcBad=true（数值验算未过）→ 禁复活数值错误题', () => {
    expect(canRelaxDecision({ hasLastParsed: true, lastOk: true, calcBad: true, isTruthTable: false, qcHardFail: false })).toBe(false)
  })
  it('真假话 → 禁放宽（必须程序真值表硬校验）', () => {
    expect(canRelaxDecision({ hasLastParsed: true, lastOk: true, calcBad: false, isTruthTable: true, qcHardFail: false })).toBe(false)
  })
  it('strictGen 开 + AI 复核真否决(qcHardFail) → 禁放宽，宁判失败重出（v3.8.130）', () => {
    expect(canRelaxDecision({ hasLastParsed: true, lastOk: true, calcBad: false, isTruthTable: false, qcHardFail: true })).toBe(false)
  })
  it('本地过 + 无数值错 + 非真假话 + 未被硬否决 → 可放宽兜底收下（调用失败不算硬否决）', () => {
    expect(canRelaxDecision({ hasLastParsed: true, lastOk: true, calcBad: false, isTruthTable: false, qcHardFail: false })).toBe(true)
  })
})

describe('needAiRecheck 本轮是否走 AI 复核', () => {
  it('无 AI 门 → 不走', () => {
    expect(needAiRecheck({ aiGateOn: false, ttVerified: false, isBlank: false, attempt: 0 })).toBe(false)
  })
  it('已过真值表硬校验 → 免二次 AI 复核', () => {
    expect(needAiRecheck({ aiGateOn: true, ttVerified: true, isBlank: false, attempt: 0 })).toBe(false)
  })
  it('填空类 本地质检过 + attempt>=1 → 放行免复核（防误杀，v3.8.163）', () => {
    expect(needAiRecheck({ aiGateOn: true, ttVerified: false, isBlank: true, attempt: 1 })).toBe(false)
    expect(needAiRecheck({ aiGateOn: true, ttVerified: false, isBlank: true, attempt: 2 })).toBe(false)
  })
  it('非填空 + AI 门开 + 未过真值表 + attempt=0 → 需复核', () => {
    expect(needAiRecheck({ aiGateOn: true, ttVerified: false, isBlank: false, attempt: 0 })).toBe(true)
  })
})
