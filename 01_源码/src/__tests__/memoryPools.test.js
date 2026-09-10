// memoryPools（v3.8.188）回归：数据池完整性 + findPoolItem 检索
import { describe, it, expect } from 'vitest'
import { CHANGSHI, SHIZHENG, CHENGYU, SHICI, YUFEN_CHENGYU, YUFEN_SHICI, skillMemCS, skillMemZZ, findPoolItem } from '../data/memoryPools'

describe('memoryPools 数据池单源', () => {
  it('各池非空且池内标题无重复', () => {
    const pools = [['常识', CHANGSHI], ['时政', SHIZHENG], ['成语', CHENGYU], ['实词', SHICI]]
    for (const [name, arr] of pools) {
      expect(arr.length, name + ' 空池').toBeGreaterThan(0)
      const seen = new Set()
      arr.forEach((x) => { const t = String(x && x.t || ''); expect(t, name + ' 空标题').toBeTruthy(); expect(seen.has(t), name + ' 重复: ' + t).toBe(false); seen.add(t) })
    }
    expect(skillMemCS.length).toBeGreaterThan(0)
    expect(skillMemZZ.length).toBeGreaterThan(0)
  })
  it('findPoolItem 命中返回原条目内容、未命中返回 null', () => {
    const hit = findPoolItem('浅尝辄止')
    expect(hit).toBeTruthy()
    expect(hit.yishi).toBeTruthy()
    expect(findPoolItem('宪法规定：中华人民共和国的一切权力属于人民。')).toBeTruthy()
    expect(findPoolItem('不存在的词条XYZ')).toBe(null)
    expect(findPoolItem('')).toBe(null)
  })
  it('雨菲/半月谈 OCR 词库已完成全量质量门校验', () => {
    const corpus = YUFEN_CHENGYU.concat(YUFEN_SHICI)
    expect(corpus.length).toBeGreaterThan(1000)
    expect(corpus.every((x) => x.verified === true)).toBe(true)
    expect(corpus.every((x) => String(x.yishi || '').length >= 8)).toBe(true)
    expect(corpus.some((x) => /[@�]|(?:了眼睛)|(?:药且)|(?:发拌)/.test(String(x.yishi || '')))).toBe(false)
    expect(corpus.some((x) => /\b[a-z]{2,}\d*\b/i.test(String(x.yishi || '')))).toBe(false)
    const titles = new Set()
    corpus.forEach((x) => {
      expect(titles.has(x.t), '校订后重复词条: ' + x.t).toBe(false)
      titles.add(x.t)
    })
  })
  it('已知 OCR 错词不再进入展示词库', () => {
    const bad = ['第路蓝缕', '不寒而票', '不敢茶同', '对长莫及', '吕夷不展', '鸠居竟梨', '鸠占更梨']
    const titles = new Set(YUFEN_CHENGYU.concat(YUFEN_SHICI).map((x) => x.t))
    bad.forEach((x) => expect(titles.has(x)).toBe(false))
  })
})
