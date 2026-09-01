// 密钥脱敏（批次3.2 回归）：备份/同步前 key/pass 字段打码，结构保留
import { describe, it, expect } from 'vitest'
import { stripSecrets } from '../utils/stripSecrets'

describe('stripSecrets 密钥脱敏（批次3.2）', () => {
  it('顶层 key/pass 字段被打码', () => {
    const out = stripSecrets({ text: { key: 'sk-abc', model: 'x' }, webdav: { pass: 'p123' }, name: 'ok' })
    expect(out.text.key).toBe('***')
    expect(out.webdav.pass).toBe('***')
    expect(out.text.model).toBe('x')
    expect(out.name).toBe('ok')
  })
  it('嵌套对象递归打码，非敏感字段保留', () => {
    const cfg = { ttsGm: { key: 'secret', voice: 'tongtong' }, fig: { on: true } }
    const out = stripSecrets(cfg)
    expect(out.ttsGm.key).toBe('***')
    expect(out.ttsGm.voice).toBe('tongtong')
    expect(out.fig.on).toBe(true)
  })
  it('数组内对象也递归处理', () => {
    const out = stripSecrets([{ key: 'k1' }, { a: 1 }])
    expect(out[0].key).toBe('***')
    expect(out[1].a).toBe(1)
  })
  it('空字符串/非法输入不抛错', () => {
    expect(stripSecrets(null)).toBeNull()
    expect(stripSecrets(undefined)).toBeUndefined()
    expect(stripSecrets('str')).toBe('str')
  })
})


// 批次3补课：localData 本地文件夹备份输出结构断言（cfg 走 stripSecrets，密钥不打进磁盘）
describe('localData 备份输出结构（批次3补课）', () => {
  it('备份 data.cfg 经 stripSecrets 后不含任何明文 key/pass', () => {
    // 模拟 store.cfg 的完整形状
    const storeCfg = {
      text: { key: 'sk-123456', url: 'https://api.deepseek.com', model: 'deepseek-v4-flash' },
      vision: { key: 'sk-789', url: '', model: 'deepseek-v4-flash-vision-exp' },
      fig: { key: 'sf-key', on: true },
      ttsGm: { key: 'tts-key', voice: 'tongtong' },
      ttsOpenAI: { key: 'oa-key' },
      webdav: { user: 'u', pass: 'p123', url: 'https://dav.example.com' },
      text2: null, bgMode: 'default', petSkin: 'lixingyun'
    }
    const data = { app: '行测AI问答助手', ts: Date.now(), cfg: stripSecrets(storeCfg) }
    const json = JSON.stringify(data)
    expect(json).not.toContain('sk-123456')
    expect(json).not.toContain('sk-789')
    expect(json).not.toContain('sf-key')
    expect(json).not.toContain('tts-key')
    expect(json).not.toContain('oa-key')
    expect(json).not.toContain('p123')
    // 非敏感字段保留
    expect(data.cfg.webdav.user).toBe('u')
    expect(data.cfg.bgMode).toBe('default')
    expect(data.cfg.petSkin).toBe('lixingyun')
  })
})

