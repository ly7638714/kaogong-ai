import { describe, it, expect } from 'vitest'
import { flaggedToCsv, flaggedToMd } from '../utils/flagExport'

const sample = [
  { t: 1700000000000, plate: '数量关系', kpoint: '工程问题', variant: '', note: '两个选项都成立', question: '甲 12 天完成工程…A 与 B 都能推出？', answer: 'A' },
  { t: 1700000100000, plate: '言语理解', kpoint: '', variant: '片段阅读', note: '含引号"与,逗号' + String.fromCharCode(10) + '换行备注', question: '主旨概括，需要看上下文吗', answer: 'B' }
]

describe('flagExport 疑题清单导出', () => {
  it('CSV 带 UTF-8 BOM，表头完整', () => {
    const csv = flaggedToCsv(sample)
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    const firstLine = csv.slice(1).split('\n')[0]
    expect(firstLine).toBe('上报时间,板块,考点,题型,备注,题干(截断),答案')
  })
  it('CSV 对 引号/逗号/换行 正确转义', () => {
    const csv = flaggedToCsv(sample)
    const lines = csv.slice(1).split('\n')
    // 第2行含转义引号的双引号与包裹逗号/换行的单元格
    const row2 = lines[2]
    expect(row2).toContain('""')
    expect(row2).toContain('片段阅读')
  })
  it('CSV 行数与条目一致', () => {
    const csv = flaggedToCsv(sample)
    expect(csv.slice(1).split('\n').filter(Boolean)).toHaveLength(1 + sample.length) // 表头 + 每疑题一行
  })
  it('空表导出仅剩表头', () => {
    const csv = flaggedToCsv([])
    expect(csv.slice(1).split('\n').filter(Boolean)).toHaveLength(1)
    expect(csv.startsWith('\uFEFF上报时间')).toBe(true)
  })
  it('Markdown 含 编号/题干引用/答案/总数', () => {
    const md = flaggedToMd(sample)
    expect(md).toContain('# 疑题反馈清单（已自动降权）')
    expect(md).toContain('1. 【数量关系】工程问题')
    expect(md).toContain('> 甲 12 天完成工程')
    expect(md).toContain('（答案 A）')
    expect(md).toContain('共 2 条')
  })
  it('非法输入安全', () => {
    expect(flaggedToCsv(null).slice(1).split('\n').filter(Boolean)).toHaveLength(1)
    expect(flaggedToMd(undefined)).toContain('共 0 条')
  })
})
