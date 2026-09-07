import { describe, it, expect } from 'vitest'
import { clampTimeoutSec, genTimeoutMs, genDeadlineMs, GEN_TIMEOUT_MIN, GEN_TIMEOUT_MAX } from '../utils/genBudget'

describe('genBudget 出题时间预算', () => {
  it('默认无配置 → 45s', () => {
    expect(clampTimeoutSec(undefined)).toBe(45)
    expect(clampTimeoutSec(null)).toBe(45)
    expect(clampTimeoutSec(NaN)).toBe(45)
    expect(clampTimeoutSec('abc')).toBe(45)
    expect(clampTimeoutSec(0)).toBe(45)
    expect(clampTimeoutSec(-5)).toBe(45)
    expect(clampTimeoutSec('')).toBe(45)
  })
  it('10..90 区间内原样保留（含边界）', () => {
    expect(clampTimeoutSec(10)).toBe(10)
    expect(clampTimeoutSec(45)).toBe(45)
    expect(clampTimeoutSec(90)).toBe(90)
  })
  it('越界一律收敛到 [10,90]', () => {
    expect(clampTimeoutSec(9)).toBe(GEN_TIMEOUT_MIN)
    expect(clampTimeoutSec(1)).toBe(GEN_TIMEOUT_MIN)
    expect(clampTimeoutSec(91)).toBe(GEN_TIMEOUT_MAX)
    expect(clampTimeoutSec(1000)).toBe(GEN_TIMEOUT_MAX)
  })
  it('毫秒换算：×1000', () => {
    expect(genTimeoutMs()).toBe(45000)
    expect(genTimeoutMs(45)).toBe(45000)
    expect(genTimeoutMs(10)).toBe(10000)
    expect(genTimeoutMs(90)).toBe(90000)
    expect(genTimeoutMs(5)).toBe(10000)
    expect(genTimeoutMs(120)).toBe(90000)
  })
  it('整题总预算默认=单次×2（45→90s 止损，绝不超过 180s）', () => {
    expect(genDeadlineMs()).toBe(90000)
    expect(genDeadlineMs(45)).toBe(90000)
    expect(genDeadlineMs(90)).toBe(180000)
    expect(genDeadlineMs(10)).toBe(20000)
  })
})
