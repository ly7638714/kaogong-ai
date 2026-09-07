// 悬浮物落点约束（批次2.3 回归）：安全区避让 + 视口钳制 + 分档存储键
import { describe, it, expect } from 'vitest'
import { floatSafeClamp, vpBucket, FLOAT_TOP_SAFE, FLOAT_BOTTOM_SAFE } from '../utils/floatClamp'

describe('floatClamp 悬浮物落点约束（批次2.3）', () => {
  it('不会落在顶部 HUD 区（y < 96 被上推）', () => {
    const r = floatSafeClamp(200, 20, 54, 54, 1280, 720)
    expect(r.y).toBeGreaterThanOrEqual(FLOAT_TOP_SAFE)
    expect(r.y).toBe(FLOAT_TOP_SAFE)
  })
  it('不会落在底部输入区（超出 y 上限被上推）', () => {
    const r = floatSafeClamp(200, 700, 54, 54, 1280, 720)
    expect(r.y).toBeLessThanOrEqual(720 - 54 - FLOAT_BOTTOM_SAFE)
  })
  it('横向不越出视口', () => {
    const r = floatSafeClamp(-50, 300, 54, 54, 390, 844)
    expect(r.x).toBeGreaterThanOrEqual(4)
    const r2 = floatSafeClamp(9999, 300, 54, 54, 390, 844)
    expect(r2.x).toBeLessThanOrEqual(390 - 54 - 4)
  })
  it('视口内正常位置不变', () => {
    const r = floatSafeClamp(300, 300, 54, 54, 1280, 720)
    expect(r).toEqual({ x: 300, y: 300 })
  })
  it('vpBucket 按视口分档（≤640=m，>640=d）', () => {
    expect(vpBucket(390)).toBe('m')
    expect(vpBucket(820)).toBe('d')
    expect(vpBucket(1280)).toBe('d')
  })
})
