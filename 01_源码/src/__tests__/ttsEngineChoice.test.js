// 朗读引擎「省钱默认迁移」回归：绝不能覆盖用户的显式选择
// 背景（真实用户走查发现）：xc_tts_migrated 是「纯本机键」（不随备份/云同步走），
// 换设备、清缓存、恢复备份后必然缺失 → 迁移会重跑。旧实现无条件把 ttsMode=glm 改成 edge、
// 并把自动朗读关掉，导致已经付费并显式选了智谱的用户被静默降级（而 Edge 在部分网络下 403 不可用）。
const __mem = {}
globalThis.localStorage = {
  getItem: (k) => (k in __mem ? __mem[k] : null),
  setItem: (k, v) => { __mem[k] = String(v) },
  removeItem: (k) => { delete __mem[k] },
  clear: () => { for (const k of Object.keys(__mem)) delete __mem[k] }
}

import { describe, it, expect, beforeEach } from 'vitest'
import { store, load } from '../store'

function seed(cfg, { migrated }) {
  for (const k of Object.keys(__mem)) delete __mem[k]
  localStorage.setItem('xc_cfg', JSON.stringify(cfg))
  if (migrated) localStorage.setItem('xc_tts_migrated', '1')
}

describe('朗读引擎「省钱默认迁移」不得覆盖用户显式选择', () => {
  beforeEach(() => { localStorage.clear() })

  it('新装用户的默认引擎是系统语音，而不是部分网络不可用的 Edge', () => {
    load()
    expect(store.cfg.ttsMode).toBe('sys')
  })

  it('已填智谱 Key + ttsMode=glm：换设备（本机迁移标记缺失）也必须保持 glm 与自动朗读', () => {
    seed({ ttsMode: 'glm', ttsOn: true, ttsGm: { key: 'sk-test' } }, { migrated: false })
    load()
    expect(store.cfg.ttsMode).toBe('glm')
    expect(store.cfg.ttsOn).toBe(true)
  })

  it('老配置 ttsMode=glm 且没有任何收费 Key：仍按省钱默认改为 sys（系统语音，本机离线免费）、并关掉自动朗读', () => {
    seed({ ttsMode: 'glm', ttsOn: true, ttsGm: { key: '' } }, { migrated: false })
    load()
    expect(store.cfg.ttsMode).toBe('sys')
    expect(store.cfg.ttsOn).toBe(false)
  })

  it('手动选过引擎（ttsEngineChosen=true）即便没有 Key 也不被改写', () => {
    seed({ ttsMode: 'sys', ttsOn: true, ttsEngineChosen: true, ttsGm: { key: '' } }, { migrated: false })
    load()
    expect(store.cfg.ttsMode).toBe('sys')
    expect(store.cfg.ttsOn).toBe(true)
  })

  it('本机已迁移过（标记已置位）时，不再做任何改写', () => {
    seed({ ttsMode: 'glm', ttsOn: true, ttsGm: { key: '' } }, { migrated: true })
    load()
    expect(store.cfg.ttsMode).toBe('glm')
    expect(store.cfg.ttsOn).toBe(true)
  })

  it('迁移只在首次执行：同设备二次 load() 不得再改写', () => {
    seed({ ttsMode: 'glm', ttsOn: true, ttsGm: { key: '' } }, { migrated: false })
    load()
    expect(store.cfg.ttsMode).toBe('sys')
    // 用户随后手动改回 glm
    store.cfg.ttsMode = 'glm'
    store.cfg.ttsOn = true
    localStorage.setItem('xc_cfg', JSON.stringify({ ttsMode: 'glm', ttsOn: true, ttsGm: { key: '' } }))
    load()
    expect(store.cfg.ttsMode).toBe('glm')
    expect(store.cfg.ttsOn).toBe(true)
  })
})
