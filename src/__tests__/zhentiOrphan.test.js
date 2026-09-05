// P3-4 真题库孤儿卷防回归：index.json 未收录的卷必须显式登记于 KNOWN_ORPHANS
// 背景：5 个 *shengkao-*.json（2022-2026）为源数据既有孤儿卷（与同年在册 xingzheng 卷非重复、SHA 不同），
//       数据源负责人核验前不改目录。此后任何「新出现的未索引卷」都会让本测试红，需显式处置/登记。
import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), 'public/zhenti')
const SKIP = new Set(['index.json', 'types.json', 'kpoint-index.json'])
// 已登记孤儿卷（在数据源核验并择期处置前，维持「文件在、不进 index」）
const KNOWN_ORPHANS = new Set([
  '2022-shengkao-lhp9',
  '2023-shengkao-1na1',
  '2024-shengkao-q1aa',
  '2025-shengkao-1rtm',
  '2026-shengkao-ukvc'
])

function listPapers() {
  return readdirSync(dir).filter((f) => f.endsWith('.json') && !SKIP.has(f)).map((f) => f.replace(/\.json$/, ''))
}

describe('public/zhenti 卷文件 ↔ index.json 一致性', () => {
  it('未索引文件集合 == 已登记孤儿卷（新增未收录卷会红）', () => {
    const idx = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'))
    const inIndex = new Set(idx.papers.map((p) => p.id))
    const actualOrphans = listPapers().filter((id) => !inIndex.has(id))
    const unexpected = actualOrphans.filter((id) => !KNOWN_ORPHANS.has(id))
    expect(unexpected, `发现未登记孤儿卷：${unexpected.join(', ')}——需补入 index.json 或显式登记`).toEqual([])
    expect(actualOrphans.sort(), '孤儿卷集合变化：请核对是否为数据源处置结果，并同步更新 KNOWN_ORPHANS').toEqual([...KNOWN_ORPHANS].sort())
  })
  it('index.json 每个 id 都有真实卷文件（无悬空索引）', () => {
    const idx = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'))
    for (const p of idx.papers) {
      expect(existsSync(join(dir, p.id + '.json')), `index 卷 ${p.id} 文件缺失`).toBe(true)
    }
  })
  it('已登记孤儿卷文件真实存在', () => {
    for (const id of KNOWN_ORPHANS) {
      expect(existsSync(join(dir, id + '.json')), `孤儿卷 ${id} 文件缺失（若为数据源处置结果请更新本 allowlist）`).toBe(true)
    }
  })
})