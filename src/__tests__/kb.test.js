// kb 知识库完整性 lint（P0-1 回归）：防止「模板串未闭合/代码残留/板块内容错位」事故复发
import { describe, it, expect } from 'vitest'
import { KB } from '../kb'

const KEYS = ['luoji', 'yanyu', 'tutu', 'ziliao', 'leibi', 'dingyi', 'zhanggong', 'shuliang', 'zhengzhi', 'changshi']
// 缝合怪残留：属性式键名（反引号/逗号/行首后紧跟 键名:），排除合法 ```svg 围栏中的反引号
const RESIDUE = /(?:^|[`,])(?:yanyu|tutu|ziliao|shuliang|zhengzhi|changshi|luoji):/m

describe('kb.js 知识库完整性（P0-1 回归）', () => {
  it('全部板块键存在且非空、长度合理', () => {
    for (const k of KEYS) {
      expect(typeof KB[k]).toBe('string')
      expect(KB[k].length).toBeGreaterThan(300)
      expect(KB[k].length).toBeLessThan(9000)
    }
  })
  it('无模板残留/代码残留（luoji 缝合怪回归）', () => {
    for (const k of KEYS) {
      expect(RESIDUE.test(KB[k])).toBe(false)
    }
  })
  it('内容归位：zhengzhi 含马原对立统一、tutu 含图推24诀平面拼合', () => {
    expect(KB.zhengzhi.includes('对立统一')).toBe(true)
    expect(KB.tutu.includes('平面拼合')).toBe(true)
  })
  it('luoji 逻辑内容完整且不再臃肿', () => {
    expect(KB.luoji.includes('薛睿')).toBe(true)
    expect(KB.luoji.includes('五步法')).toBe(true)
    expect(KB.luoji.length).toBeLessThan(6000)
  })
})
