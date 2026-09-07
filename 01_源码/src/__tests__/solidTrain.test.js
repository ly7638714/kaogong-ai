// 立体图推 P0-5 回归：2×2×2 去角块外露面数 = 24
import { describe, it, expect } from 'vitest'
import { exposedFaces, REAL_QUESTIONS } from '../scene/solidTrain'

describe('solidTrain 立体图推（P0-5 回归）', () => {
  it('2×2×2 去掉一个角块后外露面数 = 24（原题误标 33）', () => {
    const cells = []
    for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) for (let z = 0; z < 2; z++) {
      if (!(x === 0 && y === 0 && z === 0)) cells.push([x, y, z])
    }
    expect(exposedFaces(cells)).toBe(24)
  })
  it('REAL_QUESTIONS 拼接题答案修正为 B(24)，选项包含 24', () => {
    const q = REAL_QUESTIONS.find((x) => String(x.q || '').includes('2×2×2 大正方体'))
    expect(q).toBeTruthy()
    expect(q.a).toBe('B')
    expect(String(q.q || '')).toContain('B 24')
  })
})
