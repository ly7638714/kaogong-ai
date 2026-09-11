import { describe, it, expect, beforeEach } from 'vitest'
import { isFastGenMode, pickGenCfg } from '../utils/fastMode'
import { store } from '../store'

const mem = new Map()
beforeEach(() => {
  mem.clear()
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => {
      mem.set(k, String(v))
    },
    removeItem: (k) => {
      mem.delete(k)
    }
  }
})

describe('fastMode 快模型出题检测', () => {
  it('未配置 → 非快模式', () => {
    expect(isFastGenMode()).toBe(false)
  })
  it('填了出题快模型名 → 快模式', () => {
    mem.set('xc_fast_gen_model', 'deepseek-chat')
    expect(isFastGenMode()).toBe(true)
  })
  it('开启图形快模型开关 → 快模式（即使快模型名为空）', () => {
    mem.set('xc_use_fig_gen', '1')
    expect(isFastGenMode()).toBe(true)
  })
  it('开关为 0 / 空串 / 非法 localStorage → false', () => {
    mem.set('xc_use_fig_gen', '0')
    expect(isFastGenMode()).toBe(false)
    mem.set('xc_fast_gen_model', '   ')
    expect(isFastGenMode()).toBe(false)
  })
  it('DeepSeek 配 Key 后即使未手填也自动进入非思考快模式', () => {
    store.cfg.text = { prov: 'ds', key: 'k', url: 'https://api.deepseek.com/chat/completions', model: 'deepseek-v4-pro' }
    expect(isFastGenMode()).toBe(true)
  })
})

describe('pickGenCfg 快模型生成路由（单题快练/错题变式共用）', () => {
  beforeEach(() => {
    store.cfg.text = {
      prov: 'ds',
      key: 'k',
      url: 'https://api.deepseek.com/chat/completions',
      model: 'deepseek-v4-flash'
    }
    store.cfg.fig = {
      prov: 'zhipu',
      key: '',
      url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      model: 'glm-4.6-flash'
    }
  })

  it('无文字 Key 时返回 null', () => {
    store.cfg.text.key = ''
    expect(pickGenCfg()).toBeNull()
  })

  it('未配快模型时自动使用服务商快模型并标记非思考', () => {
    const c = pickGenCfg()
    expect(c.key).toBe('k')
    // 2026-09-10 起 DeepSeek 官方快模型请求名统一为 deepseek-flash（V4.1-Flash）
    expect(c.model).toBe('deepseek-flash')
    expect(c.noThink).toBe(true)
  })

  it('出题快模型覆盖思考型文字模型', () => {
    mem.set('xc_fast_gen_model', 'deepseek-chat')
    expect(pickGenCfg().model).toBe('deepseek-chat')
  })

  it('对话快模型同样可被生成类调用复用', () => {
    mem.set('xc_chat_fast_model', 'glm-4-flash')
    expect(pickGenCfg().model).toBe('glm-4-flash')
  })

  it('图形快模型开关优先于快模型名', () => {
    store.cfg.fig.key = 'fig-k'
    mem.set('xc_use_fig_gen', '1')
    mem.set('xc_fast_gen_model', 'deepseek-chat')
    const c = pickGenCfg()
    expect(c.key).toBe('fig-k')
    expect(c.model).toContain('glm')
  })
})
