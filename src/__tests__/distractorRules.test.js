// 35号批次1-C 通用干扰项质检回归：长度离散度 / 干扰项前缀同质化（确定性零 API）
import { describe, it, expect } from 'vitest'
import { distractorIssues, plateChecks } from '../utils/quizVerifyProfiles'

describe('distractorIssues 选项长度离散度', () => {
  it('长度均衡的选项通过', () => {
    const q = {
      answer: 'B',
      options: [
        { k: 'A', t: '抓好生态文明建设' },
        { k: 'B', t: '推动绿色低碳发展' },
        { k: 'C', t: '完善基层治理体系' },
        { k: 'D', t: '健全公共服务网络' }
      ]
    }
    expect(distractorIssues(q)).toEqual([])
  })
  it('正确项长度显著异常被驳回', () => {
    const q = {
      answer: 'D',
      options: [
        { k: 'A', t: '甲国' },
        { k: 'B', t: '乙国' },
        { k: 'C', t: '丙国' },
        { k: 'D', t: '甲乙两国签署了为期十年的自由贸易协定并建立了联合投资机制' }
      ]
    }
    const errs = distractorIssues(q)
    expect(errs.length).toBeGreaterThan(0)
    expect(errs[0]).toContain('长度失衡')
  })
  it('含 SVG 的图形题豁免长度规则', () => {
    const q = {
      answer: 'A',
      options: [
        { k: 'A', t: '<svg width=10 height=10><rect width=10 height=10 /></svg>' },
        { k: 'B', t: '<svg width=10 height=10><circle cx=5 cy=5 r=3 /></svg>' },
        { k: 'C', t: '<svg width=10 height=10><line x1=0 y1=0 x2=10 y2=10 /></svg>' },
        { k: 'D', t: '<svg width=10 height=10><polygon points=0,0 5,10 10,0 /></svg>' }
      ]
    }
    expect(distractorIssues(q)).toEqual([])
  })
})

describe('distractorIssues 干扰项前缀同质化', () => {
  it('三个干扰项前 4 字完全相同被驳回', () => {
    const q = {
      answer: 'C',
      options: [
        { k: 'A', t: '小明今天早上七点起床去跑步' },
        { k: 'B', t: '小明今天早上八点起床去跑步' },
        { k: 'C', t: '小红今天早上九点起床去游泳' },
        { k: 'D', t: '小明今天早上十点起床去跑步' }
      ]
    }
    const errs = distractorIssues(q)
    expect(errs.some((e) => e.includes('模板化'))).toBe(true)
  })
  it('前缀不同的干扰项通过', () => {
    const q = {
      answer: 'A',
      options: [
        { k: 'A', t: '经济增长动能增强' },
        { k: 'B', t: '失业压力显著上升' },
        { k: 'C', t: '居民消费持续低迷' },
        { k: 'D', t: '出口总额大幅回落' }
      ]
    }
    expect(distractorIssues(q)).toEqual([])
  })
  it('少于 4 个选项不触发', () => {
    const q = { answer: 'A', options: [{ k: 'A', t: '对' }, { k: 'B', t: '错' }] }
    expect(distractorIssues(q)).toEqual([])
  })
})

describe('plateChecks 叠加通用质检', () => {
  it('通用规则通过时返回板块专属结果（不抛错）', () => {
    const q = { answer: 'B', stem: '这是一段足够长的言语理解文段内容用于通过长度检查，包含了主题词与完整表述。', options: [
      { k: 'A', t: '甲选项内容' }, { k: 'B', t: '乙选项内容' }, { k: 'C', t: '丙选项内容' }, { k: 'D', t: '丁选项内容' }
    ] }
    const errs = plateChecks(q, '言语理解', '中心理解')
    expect(Array.isArray(errs)).toBe(true)
  })
  it('通用规则失败时并入板块检查错误', () => {
    const q = { answer: 'D', options: [
      { k: 'A', t: '甲国' }, { k: 'B', t: '乙国' }, { k: 'C', t: '丙国' }, { k: 'D', t: '某个国家建立了长期战略合作伙伴关系并签署多项协议' }
    ] }
    const errs = plateChecks(q, '常识判断', '')
    expect(errs.some((e) => e.includes('长度失衡'))).toBe(true)
  })
})