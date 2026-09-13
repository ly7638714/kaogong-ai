// ttsFallbackGuard.test.js —— v3.8.332：提示音兜底默认值 / 迁移 / 省钱护栏预警
const __mem = {}
globalThis.localStorage = {
  getItem: (k) => (k in __mem ? __mem[k] : null),
  setItem: (k, v) => { __mem[k] = String(v) },
  removeItem: (k) => { delete __mem[k] },
  clear: () => { for (const k of Object.keys(__mem)) delete __mem[k] }
}

import { describe, it, expect, beforeEach } from 'vitest'
import { store, load } from '../store'

function seed(cfg, extra = {}) {
  for (const k of Object.keys(__mem)) delete __mem[k]
  localStorage.setItem('xc_cfg', JSON.stringify(cfg))
  for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, v)
}

describe('提示音强制兜底默认值（v3.8.332：0 → 200ms 双保险）', () => {
  beforeEach(() => { localStorage.clear() })

  it('新装用户默认 ttsTrimLeadMs=200，且提示音裁剪开关默认开', () => {
    load()
    expect(store.cfg.ttsTrimLeadMs).toBe(200)
    expect(store.cfg.ttsTrimLead).toBe(true)
  })

  it('老配置（ttsTrimLeadMs=0）升级后被迁移为 200', () => {
    seed({ ttsTrimLeadMs: 0, ttsOn: true, ttsMode: 'glm' }, { xc_tts_migrated: '1' })
    load()
    expect(store.cfg.ttsTrimLeadMs).toBe(200)
  })

  it('迁移只跑一次：用户手动设成 0 后不再被强制改回 200', () => {
    // 第一次：老配置升级
    seed({ ttsTrimLeadMs: 0 }, { xc_tts_migrated: '1' })
    load()
    expect(store.cfg.ttsTrimLeadMs).toBe(200)
    // 第二次：用户手动关掉兜底，且迁移标记已在
    seed({ ttsTrimLeadMs: 0 }, { xc_tts_trimlead_migrated: '1', xc_tts_migrated: '1' })
    load()
    expect(store.cfg.ttsTrimLeadMs).toBe(0)
  })

  it('用户已自行设过正值（如 300）不被迁移覆盖', () => {
    seed({ ttsTrimLeadMs: 300 }, { xc_tts_migrated: '1' })
    load()
    expect(store.cfg.ttsTrimLeadMs).toBe(300)
  })
})

describe('省钱护栏配置默认值', () => {
  beforeEach(() => { localStorage.clear() })

  it('护栏默认开启，日额度默认 20000 字', () => {
    load()
    expect(store.cfg.ttsGuard).toBe(true)
    expect(store.cfg.ttsDayCap).toBe(20000)
  })

  it('护栏可被显式关闭（关＝不拦真人引擎）', () => {
    seed({ ttsGuard: false, ttsMode: 'glm' }, { xc_tts_migrated: '1' })
    load()
    expect(store.cfg.ttsGuard).toBe(false)
  })
})

describe('朗读引擎默认与迁移（回归：不得静默改写用户选择）', () => {
  beforeEach(() => { localStorage.clear() })

  it('新装默认 sys；填过收费引擎 Key 的用户保持 glm', () => {
    load()
    expect(store.cfg.ttsMode).toBe('sys')

    seed({ ttsMode: 'glm', ttsGm: { key: 'sk-xxx' } })
    load()
    expect(store.cfg.ttsMode).toBe('glm')
  })

  it('从未表达偏好的旧配置 → 迁移到 sys 且自动朗读关闭', () => {
    seed({ ttsMode: 'glm', ttsOn: true }, { xc_tts_migrated: '' })
    load()
    expect(store.cfg.ttsMode).toBe('sys')
    expect(store.cfg.ttsOn).toBe(false)
  })
})
