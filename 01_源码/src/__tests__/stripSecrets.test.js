// 密钥脱敏（批次3.2 回归）：备份/同步前 key/pass 字段打码，结构保留
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { stripSecrets, scrubSecretValues, containsSecretLike } from '../utils/stripSecrets'

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

describe('stripSecrets v2 加固（值级兜底 + 更多字段名）', () => {
  it('access_token / private_token / password / client_secret / authorization 都被打码', () => {
    const out = stripSecrets({
      a: { access_token: 'x' },
      b: { private_token: 'y' },
      c: { password: 'z' },
      d: { client_secret: 'w' },
      e: { authorization: 'Bearer abc' }
    })
    expect(out.a.access_token).toBe('***')
    expect(out.b.private_token).toBe('***')
    expect(out.c.password).toBe('***')
    expect(out.d.client_secret).toBe('***')
    expect(out.e.authorization).toBe('***')
  })

  it('字段名不含敏感词、但值形如密钥时也打码', () => {
    const out = stripSecrets({
      note: 'sk-abcdefghijklmnop',
      other: 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
      keep: '普通文本'
    })
    expect(out.note).toBe('***')
    expect(out.other).toBe('***')
    expect(out.keep).toBe('普通文本')
  })

  it('不误伤设备 ID / 题目哈希 / 音色 UUID（非强特征前缀）', () => {
    const out = stripSecrets({
      device: 'dev_abc123_xyz789',
      hash: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
      uuid: '18a24e59-6e8c-57bd-aeb8-6584c7a7ada2'
    })
    expect(out.device).toBe('dev_abc123_xyz789')
    expect(out.hash).toBe('a1b2c3d4e5f60718293a4b5c6d7e8f90')
    expect(out.uuid).toBe('18a24e59-6e8c-57bd-aeb8-6584c7a7ada2')
  })

  it('scrubSecretValues 只清洗“整值即密钥”的字符串', () => {
    const out = scrubSecretValues({
      a: 'sk-abcdefghijklmnop',
      b: ['ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'],
      c: '正常内容',
      d: { nested: 'glpat-abcdefghijklmnop' }
    })
    expect(out.a).toBe('***')
    expect(out.b[0]).toBe('***')
    expect(out.c).toBe('正常内容')
    expect(out.d.nested).toBe('***')
  })

  it('containsSecretLike 可快速判定文本里是否含强特征密钥', () => {
    expect(containsSecretLike('{"k":"sk-abcdefghijklmnop"}')).toBe(true)
    expect(containsSecretLike('{"k":"hello"}')).toBe(false)
  })
})

describe('collectAll 导出兜底（密钥即使落在非 cfg 键里也不外泄）', () => {
  const mem = new Map()
  beforeEach(() => {
    mem.clear()
    vi.stubGlobal('localStorage', {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => mem.set(k, String(v)),
      removeItem: (k) => mem.delete(k),
      key: (i) => [...mem.keys()][i] ?? null,
      get length() { return mem.size }
    })
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('xc_cfg 与其它 xc_ 键里的明文密钥都会被替换为 ***', async () => {
    mem.set('xc_cfg', JSON.stringify({ text: { key: 'sk-abcdefghijklmnop' } }))
    mem.set('xc_msgs', JSON.stringify([{ role: 'user', text: 'sk-abcdefghijklmnop' }]))
    const { collectAll } = await import('../utils/dataBackup')
    const out = collectAll()
    expect(out.data.xc_cfg).not.toContain('sk-abcdefghijklmnop')
    expect(out.data.xc_msgs).not.toContain('sk-abcdefghijklmnop')
    expect(out.data.xc_cfg).toContain('***')
    expect(out.data.xc_msgs).toContain('***')
  })
})
