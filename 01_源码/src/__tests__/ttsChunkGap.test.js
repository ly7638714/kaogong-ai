// ttsChunkGap.test.js —— v3.8.332 分块停顿 / 接缝 / 渐进式分块契约
import { describe, it, expect } from 'vitest'
import { speechPauseMs, chunkForTts, chunkText, cleanSpeechText } from '../utils/ttsEngine'

describe('speechPauseMs 标点语义停顿（v3.8.332 重设）', () => {
  it('句末标点给最长换气（260ms）', () => {
    for (const p of ['。', '！', '？', '!', '?', '…']) {
      expect(speechPauseMs('一句' + p)).toBe(260)
    }
  })
  it('分号次之（200ms）', () => {
    expect(speechPauseMs('并列；')).toBe(200)
    expect(speechPauseMs('a;')).toBe(200)
  })
  it('逗号/冒号/顿号（140ms）', () => {
    for (const p of ['，', ',', '：', ':', '、']) {
      expect(speechPauseMs('短停' + p)).toBe(140)
    }
  })
  it('无标点给最低呼吸感（90ms），且不返回 0（避免完全粘连）', () => {
    expect(speechPauseMs('没有标点的一句话')).toBe(90)
    expect(speechPauseMs('')).toBe(90)
    expect(speechPauseMs(null)).toBe(90)
  })
  it('停顿必须单调递减：句末 > 分号 > 逗号 > 无标点', () => {
    const a = speechPauseMs('。'), b = speechPauseMs('；'), c = speechPauseMs('，'), d = speechPauseMs('x')
    expect(a).toBeGreaterThan(b)
    expect(b).toBeGreaterThan(c)
    expect(c).toBeGreaterThan(d)
  })
  it('真人换气下限：句末停顿不得低于 150ms（否则听感抢话）', () => {
    expect(speechPauseMs('。')).toBeGreaterThanOrEqual(150)
  })
})

describe('chunkForTts 渐进式分块（首块小 → 最快开口）', () => {
  const long = '这是一段用于测试的长文本。' .repeat(40) // ~520 字
  it('首块被压到 firstLen 附近，保证最快开口', () => {
    const out = chunkForTts(long, 240, 42)
    expect(out.length).toBeGreaterThan(1)
    expect(out[0].length).toBeLessThanOrEqual(60) // 允许在自然停顿时稍有超出
  })
  it('第二块约 maxLen/3，避免首块播完时第二块还没合成', () => {
    const out = chunkForTts(long, 240, 42)
    expect(out[1].length).toBeLessThanOrEqual(120)
    expect(out[1].length).toBeGreaterThan(20)
  })
  it('没有内容丢失：所有分块拼接后的字符数不低于原文去空白后的量级', () => {
    const out = chunkForTts(long, 240, 42)
    const joined = out.join('')
    // 分块只在标点处切，标点保留 → 拼接长度不应短于原文（去掉块间可能的空白）
    expect(joined.length).toBeGreaterThanOrEqual(cleanSpeechText(long).length * 0.98)
  })
  it('firstLen=0（singleRequest 语义）时不切分首块，退化为普通分块', () => {
    const out = chunkForTts(long, 240, 0)
    expect(out[0].length).toBeGreaterThan(60)
  })
  it('短文本不分块', () => {
    expect(chunkForTts('短句。', 240, 42)).toEqual(['短句。'])
  })
})

describe('chunkText 长句硬切也不产生空块', () => {
  it('无标点超长文本被硬切成多块，且无空串', () => {
    const s = '啊'.repeat(1000)
    const parts = chunkText(s, 240)
    expect(parts.length).toBeGreaterThan(1)
    parts.forEach((p) => {
      expect(p.length).toBeGreaterThan(0)
      expect(p.length).toBeLessThanOrEqual(250)
    })
  })
  it('硬切后每块尽量补标点收尾（除最后一块）', () => {
    const s = '啊'.repeat(1000)
    const parts = chunkText(s, 240)
    for (let i = 0; i < parts.length - 1; i++) {
      expect(/[。，！？；]$/.test(parts[i])).toBe(true)
    }
  })
})
