import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { normalizeZhentiId } from '../data/zhenti'

const dir = join(process.cwd(), 'public/zhenti')

describe('真题卷 id 兼容（文件名英文化别名）', () => {
  // 代表性旧中文名 id → 应映射到新名，且新名文件真实存在（存量 localStorage 旧记录自愈）
  const cases = [
    '2017-副省级-t2ii',   // → 2017-fushu-t2ii
    '2017-地市级-1wmn',   // → 2017-dishi-1wmn
    '2022-省考-lhp9',     // → 2022-shengkao-lhp9
    '2022-行政执法-lhp9', // → 2022-xingzheng-lhp9
    '2024-贵州省考-plmh', // → 2024-guizhou-plmh
    '2026-副省级-17us'
  ]
  it('旧中文名 id 均映射到新名且文件存在', () => {
    for (const oldId of cases) {
      const mapped = normalizeZhentiId(oldId)
      expect(mapped).not.toBe(oldId)
      expect(existsSync(join(dir, mapped + '.json')), `旧名 ${oldId} -> ${mapped} 文件应存在`).toBe(true)
    }
  })
  it('已是新名或纯 id 保持不变', () => {
    expect(normalizeZhentiId('2017-fushu-t2ii')).toBe('2017-fushu-t2ii')
    expect(normalizeZhentiId('abc-123')).toBe('abc-123')
    expect(normalizeZhentiId('')).toBe('')
  })
})
