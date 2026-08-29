import { describe, it, expect } from 'vitest'
import { petPersona, petSkin } from '../utils/pet'
import { store } from '../store'

const SKIN_CASES = [
  { id: 'xueshen', kw: ['判断推理名师', '美丑鉴定', '走进科学'] },
  { id: 'zhangruonan', kw: ['章若楠', '再试一次'] },
  { id: 'lixingyun', kw: ['李星云', '江湖', '仗剑'] },
  { id: 'jiruxue', kw: ['姬如雪', '星云', '点穴'] }
]

describe('petPersona 公共底座 + 角色层', () => {
  it('公共底座：功能百科/界面感知/名师知识/出题质检 全部在场', () => {
    store.mode = 'ziliao'
    const p = petPersona()
    expect(p).toContain('全能行测助教')
    expect(p).toContain('本项目功能百科')
    expect(p).toContain('当前界面感知')
    expect(p).toContain('名师方法论与知识库')
    expect(p).toContain('AI出题质检')
    expect(p).toContain('双师理论课堂')
    store.mode = 'all'
  })

  it('四个内置角色都基于「万能行测助教」底座且保持各自性格', () => {
    for (const c of SKIN_CASES) {
      store.cfg.petSkin = c.id
      const p = petPersona()
      expect(p, c.id + ' 缺少底座').toContain('万能行测助教')
      expect(p, c.id + ' 缺少功能百科').toContain('本项目功能百科')
      for (const kw of c.kw) expect(p, c.id + ' 缺少关键词 ' + kw).toContain(kw)
    }
  })

  it('角色切换后 petSkin 同步生效', () => {
    store.cfg.petSkin = 'jiruxue'
    expect(petSkin.value.id).toBe('jiruxue')
    const p = petPersona()
    expect(p).toContain('姬如雪')
    store.cfg.petSkin = 'xueshen'
  })
})
