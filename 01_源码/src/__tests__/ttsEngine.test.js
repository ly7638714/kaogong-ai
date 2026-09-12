import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { store } from '../store'
import {
  cleanSpeechText,
  chunkText,
  chunkForTts,
  speechPauseMs,
  slideSynthesize,
  buildTtsUrl,
  clampSpeed,
  gmCfg,
  openaiCfg,
  genEdgeSecMsGec,
  glmSynthesize,
  openaiSynthesize,
  listGmVoices,
  GLM_PRESET_VOICES,
  EDGE_PRESET_VOICES,
  OPENAI_PRESET_VOICES
} from '../utils/ttsEngine'

describe('cleanSpeechText 朗读文本清洗（去 AI 味前的正文净化）', () => {
  it('去掉代码块 / 行内代码 / Markdown 符号', () => {
    expect(cleanSpeechText('```js\nconst a=1\n``` 这是正文 `code` 部分。')).toContain('这是正文')
    expect(cleanSpeechText('```js\nconst a=1\n``` 这是正文 `code` 部分。')).not.toContain('```')
    expect(cleanSpeechText('# 标题 *加粗* _斜体_ ~删除~')).toBe('标题 加粗 斜体 删除')
  })

  it('去掉 SVG / LaTeX / 图片 / 链接，只留正文', () => {
    const s = '<svg width="10"><rect x="1"/></svg>图推规律：黑点每次右移 <b>一格</b>，$x^2$ 与 ![](a.png) 无关，[看这里](https://x.com) 结束。'
    const out = cleanSpeechText(s)
    expect(out).not.toContain('svg')
    expect(out).not.toContain('<')
    expect(out).not.toContain('$')
    expect(out).toContain('图推规律')
    expect(out).toContain('结束')
  })

  it('公式保留内容并转成口语，同时过滤依据卡/来源卡', () => {
    const out = cleanSpeechText('增长率为 $\\frac{12}{34}$，面积是 x^2。\n📚 依据卡：[判断推理·削弱题型]')
    expect(out).toContain('12除以34')
    expect(out).toContain('的平方')
    expect(out).toContain('增长率为')
    expect(out).not.toContain('依据卡')
    expect(out).not.toContain('$')
  })

  it('去掉 emoji，合并多余空白', () => {
    const out = cleanSpeechText('🎉 你好 ！  我是 AI 助教 🚀')
    expect(out).not.toMatch(/[\u{1F000}-\u{1FAFF}]/u)
    expect(out).not.toMatch(/ {2,}/)
    expect(out).toContain('我是')
  })

  it('多行无标点也补上自然停顿标点', () => {
    const out = cleanSpeechText('第一段没有标点\n第二段也没有标点')
    expect(out).toContain('第一段没有标点。')
    expect(out).toContain('第二段也没有标点。')
  })

  it('分块停顿时长随句末标点区分', () => {
    expect(speechPauseMs('这是一整句。')).toBe(45)
    expect(speechPauseMs('这里只是小停顿，')).toBe(15)
    expect(speechPauseMs('这段真的没有标点')).toBe(10)
  })
})

describe('chunkText 长文分块', () => {
  it('短文本不切分', () => {
    expect(chunkText('你好世界')).toEqual(['你好世界'])
  })

  it('按句子边界切分，且每块不超过上限', () => {
    const long = '第一句话。第二句话！第三句话？第四句话；第五句话。'.repeat(20)
    const parts = chunkText(long, 60)
    expect(parts.length).toBeGreaterThan(1)
    parts.forEach((p) => expect(p.length).toBeLessThanOrEqual(80))
  })

  it('无标点的超长句被硬切', () => {
    const parts = chunkText('无标点'.repeat(300), 100)
    expect(parts.length).toBeGreaterThan(2)
    parts.slice(0, -1).forEach((p) => expect(p.endsWith('，')).toBe(true))
  })
})

describe('chunkForTts / slideSynthesize 朗读提速（首块更小 + 滑动窗口按序投递）', () => {
  it('chunkForTts 首块更小且内容不丢失', () => {
    const long = '第一句，这是比较长的一句话。第二句也在这里。第三句继续。第四句再补一点。第五句收尾。'.repeat(2)
    const parts = chunkForTts(long, 60, 30)
    expect(parts.length).toBeGreaterThan(1)
    expect(parts[0].length).toBeLessThanOrEqual(30)
    expect(parts.join('').replace(/\s+/g, '')).toBe(long.replace(/\s+/g, ''))
  })

  it('chunkForTts 短文本不切分、无 firstLen 时不缩首块', () => {
    expect(chunkForTts('你好世界', 60, 30)).toEqual(['你好世界'])
    const parts = chunkForTts('一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十。', 60, 0)
    expect(parts[0].length).toBeGreaterThan(30)
  })

  // 回归（真实用户朗读实测发现）：首块 42 字只有约 9s 播放，而第 2 块 240 字要约 16s 合成
  // → 开头两块之间出现约 5 秒空白。渐进式分块必须保证「第 1 块播放时长 ≥ 第 2 块合成耗时」。
  it('chunkForTts 渐进式分块：次块明显小于全长，且不丢内容', () => {
    const long = '第一句，这是比较长的一句话。第二句也在这里。第三句继续。第四句再补一点。第五句收尾。'.repeat(8)
    const parts = chunkForTts(long, 240, 42)
    expect(parts[0].length).toBeLessThanOrEqual(42)
    expect(parts[1].length).toBeLessThanOrEqual(80) // ≈ maxLen/3
    expect(parts.every((p) => p.length <= 240)).toBe(true)
    expect(parts.join('').replace(/\s+/g, '')).toBe(long.replace(/\s+/g, ''))
  })

  it('渐进式分块满足「首块播放时长 ≥ 次块合成耗时」（按实测速率 4.6字/秒 播放、14.8字/秒 合成）', () => {
    const PLAY_CPS = 4.6 // 实测：42 字播放约 9.0s
    const SYNTH_CPS = 14.8 // 实测：240 字合成约 16.2s
    const long = '第一句，这是比较长的一句话。第二句也在这里。第三句继续。第四句再补一点。第五句收尾。'.repeat(8)
    const parts = chunkForTts(long, 240, 42)
    expect(parts[0].length / PLAY_CPS).toBeGreaterThanOrEqual(parts[1].length / SYNTH_CPS)
  })

  it('slideSynthesize 乱序完成仍按序投递（gapless 依赖顺序）', async () => {
    const chunks = ['块一', '块二', '块三', '块四']
    const out = []
    // worker 故意乱序完成：块2 最先、块0 最后
    const delay = (ms) => new Promise((r) => setTimeout(r, ms))
    const r = await slideSynthesize(
      chunks,
      async (c) => {
        if (c === '块三') { await delay(5); return c + '-buf' }
        if (c === '块二') { await delay(15); return c + '-buf' }
        if (c === '块一') { await delay(25); return c + '-buf' }
        await delay(40)
        return c + '-buf'
      },
      (buf) => out.push(buf)
    )
    // 顺序投递（块一→块二→块三→块四），不依赖完成顺序
    expect(out).toEqual(['块一-buf', '块二-buf', '块三-buf', '块四-buf'])
    expect(r.firstErr).toBe('')
  })
})
describe('URL 与参数工具', () => {
  it('buildTtsUrl 归一化 OpenAI 兼容地址', () => {
    expect(buildTtsUrl('https://api.siliconflow.cn/v1')).toBe('https://api.siliconflow.cn/v1/audio/speech')
    expect(buildTtsUrl('https://api.siliconflow.cn/v1/chat/completions')).toBe('https://api.siliconflow.cn/v1/audio/speech')
    expect(buildTtsUrl('https://x.com/v1/audio/speech')).toBe('https://x.com/v1/audio/speech')
    expect(buildTtsUrl('https://x.com/')).toBe('https://x.com/audio/speech')
  })

  it('clampSpeed 限制在 0.5-2', () => {
    expect(clampSpeed(0.98)).toBe(0.98)
    expect(clampSpeed(3)).toBe(2)
    expect(clampSpeed(0.1)).toBe(0.5)
    expect(clampSpeed(null)).toBe(1)
  })

  it('genEdgeSecMsGec 生成 64 位 hex 鉴权 token', async () => {
    const sec = await genEdgeSecMsGec()
    expect(sec).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('gmCfg 智谱配置与 Key 自动复用', () => {
  beforeEach(() => {
    store.cfg.ttsGm = { key: '', url: 'https://open.bigmodel.cn/api/paas/v4/audio/speech', model: 'glm-tts', voice: 'tongtong' }
    store.cfg.ttsOpenAI = { key: '', url: 'https://api.siliconflow.cn/v1', model: 'FunAudioLLM/CosyVoice2-0.5B', voice: 'default' }
    store.cfg.fig = { key: '', url: '' }
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('无 Key 返回 null', () => {
    expect(gmCfg()).toBeNull()
  })

  it('自动复用图形增强里的智谱 Key', () => {
    store.cfg.fig = { key: 'fig-key-123', url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions' }
    const cfg = gmCfg()
    expect(cfg).not.toBeNull()
    expect(cfg.key).toBe('fig-key-123')
  })

  it('图形增强不是智谱时不误复用', () => {
    store.cfg.fig = { key: 'other', url: 'https://api.siliconflow.cn/v1/chat/completions' }
    expect(gmCfg()).toBeNull()
  })
})

describe('glmSynthesize 智谱合成（mock fetch）', () => {
  beforeEach(() => {
    store.cfg.ttsGm = { key: 'k', url: 'https://open.bigmodel.cn/api/paas/v4/audio/speech', model: 'glm-tts', voice: 'tongtong' }
    store.cfg.fig = { key: '', url: '' }
    store.cfg.ttsRate = 0.98
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('成功合成返回 wav 字节', async () => {
    const wav = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3]).buffer
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => wav, json: async () => ({}) })))
    const r = await glmSynthesize('你好，测试朗读。')
    expect(r.ok).toBe(true)
    expect(r.mime).toBe('audio/wav')
    expect(r.bytes.byteLength).toBe(7)
  })

  it('API 报错时返回可读错误', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({ error: { message: 'key 无效' } }) })))
    const r = await glmSynthesize('你好')
    expect(r.ok).toBe(false)
    expect(r.msg).toContain('key 无效')
  })

  it('无 Key 时给出配置提示', async () => {
    store.cfg.ttsGm.key = ''
    store.cfg.fig = { key: '', url: '' }
    const r = await glmSynthesize('你好')
    expect(r.ok).toBe(false)
    expect(r.msg).toContain('智谱')
  })
})

describe('openaiSynthesize OpenAI 兼容合成（mock fetch）', () => {
  beforeEach(() => {
    store.cfg.ttsOpenAI = { key: 'k', url: 'https://api.siliconflow.cn/v1', model: 'FunAudioLLM/CosyVoice2-0.5B', voice: 'default' }
    store.cfg.ttsRate = 1
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('成功合成返回 mp3 字节且地址归一化', async () => {
    const mp3 = new Uint8Array([0xff, 0xfb, 1]).buffer
    const fetchMock = vi.fn(async (url) => {
      expect(url).toBe('https://api.siliconflow.cn/v1/audio/speech')
      return { ok: true, arrayBuffer: async () => mp3, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchMock)
    const r = await openaiSynthesize('你好')
    expect(r.ok).toBe(true)
    expect(r.mime).toBe('audio/mpeg')
  })
})

describe('openaiCfg OpenAI 兼容配置', () => {
  beforeEach(() => {
    store.cfg.ttsOpenAI = { key: '', url: 'https://api.siliconflow.cn/v1', model: 'FunAudioLLM/CosyVoice2-0.5B', voice: 'default' }
  })
  it('无 Key 返回 null；有 Key 返回归一化地址', () => {
    expect(openaiCfg()).toBeNull()
    store.cfg.ttsOpenAI.key = 'k'
    const cfg = openaiCfg()
    expect(cfg.url).toBe('https://api.siliconflow.cn/v1/audio/speech')
    expect(cfg.model).toContain('CosyVoice2')
  })
})

describe('音色市场预设', () => {
  it('智谱 / Edge / OpenAI 都有内置常用音色', () => {
    expect(GLM_PRESET_VOICES.length).toBeGreaterThan(8)
    expect(GLM_PRESET_VOICES.some((v) => v.id === 'tongtong')).toBe(true)
    expect(GLM_PRESET_VOICES.some((v) => v.id === 'doushen_teacher_0')).toBe(true)
    expect(EDGE_PRESET_VOICES.some((v) => v.id === 'zh-CN-XiaoxiaoNeural')).toBe(true)
    expect(EDGE_PRESET_VOICES.some((v) => v.id === 'zh-CN-YunjianNeural')).toBe(true)
    expect(OPENAI_PRESET_VOICES.some((v) => v.id === 'default')).toBe(true)
  })
})

describe('listGmVoices 音色列表去重', () => {
  beforeEach(() => {
    store.cfg.ttsGm = { key: 'k', url: 'https://open.bigmodel.cn/api/paas/v4/audio/speech', model: 'glm-tts', voice: 'tongtong' }
    store.cfg.fig = { key: '', url: '' }
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('同一音色以 UUID / 名称别名 / 重复项返回时只保留一个', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        voice_list: [
          { voice: '18a24e59-6e8c-57bd-aeb8-6584c7a7ada2', voice_name: '姬如雪声线_mtdxfni0' },
          { voice: '姬如雪声线_mtdxfni0', voice_name: '姬如雪声线_mtdxfni0' },
          { voice: 'tongtong', voice_name: 'tongtong' },
          { voice: 'tongtong', voice_name: 'tongtong' }
        ]
      })
    })))
    const list = await listGmVoices()
    expect(list).not.toBeNull()
    const names = list.map((v) => v.name)
    expect(names.filter((n) => n === '姬如雪').length).toBe(1)
    expect(names.filter((n) => n === '彤彤 · 温柔女声（默认）').length).toBe(1)
    expect(list.length).toBe(2)
  })

  it('空列表返回 null（调用方回退内置音色）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ voice_list: [] }) })))
    expect(await listGmVoices()).toBeNull()
  })
})
