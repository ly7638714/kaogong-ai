// numericOptionIssues（深化② 数值可算校验）回归
import { describe, it, expect } from 'vitest'
import { numericOptionIssues, plateChecks } from '../utils/quizVerifyProfiles'

describe('numericOptionIssues', () => {
  it('数值格式不同但相等（2 与 2.0）判重', () => {
    const q = { answer: 'D', options: [{ k: 'A', t: '2' }, { k: 'B', t: '2.0' }, { k: 'C', t: '3' }, { k: 'D', t: '4' }] }
    const errs = numericOptionIssues(q)
    expect(errs.length).toBeGreaterThan(0)
  })
  it('带百分号同值（2% 与 2）不误判为重复（量纲不同）', () => {
    const q = { answer: 'A', options: [{ k: 'A', t: '2' }, { k: 'B', t: '2%' }, { k: 'C', t: '3' }, { k: 'D', t: '4' }] }
    expect(numericOptionIssues(q)).toEqual([])
  })
  it('非数值型选项（方向表述）跳过', () => {
    const q = { answer: 'A', options: [{ k: 'A', t: '高于上年' }, { k: 'B', t: '低于上年' }, { k: 'C', t: '与上年持平' }, { k: 'D', t: '无法判断' }] }
    expect(numericOptionIssues(q)).toEqual([])
  })
  it('plateChecks 对数量/资料叠加数值校验', () => {
    const q = { answer: 'D', options: [{ k: 'A', t: '12' }, { k: 'B', t: '12.0' }, { k: 'C', t: '13' }, { k: 'D', t: '14' }] }
    const errs = plateChecks(q, '数量关系', '工程问题')
    expect(errs.some((e) => e.includes('数值重复'))).toBe(true)
  })
})
