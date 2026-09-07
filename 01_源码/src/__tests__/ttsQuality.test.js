import { describe, it, expect } from 'vitest'
import { symbolsToChinese, cleanSpeechText, smoothWavBytes } from '../utils/ttsEngine'

describe('symbolsToChinese 符号智能朗读', () => {
  it('箭头 → 推出', () => {
    expect(symbolsToChinese('A → B')).toContain('推出')
    expect(symbolsToChinese('若 P ⇒ Q')).toContain('推出')
  })
  it('斜杠：单位间读“每”，其余读“或”', () => {
    expect(symbolsToChinese('车速 60公里/小时')).toContain('公里每小时')
    expect(symbolsToChinese('选 A/B')).toContain('A或B')
    expect(symbolsToChinese('3/4')).toContain('3分之4')
  })
  it('数学符号转中文', () => {
    expect(symbolsToChinese('x ≤ 5')).toContain('小于等于')
    expect(symbolsToChinese('x ≥ 3')).toContain('大于等于')
    expect(symbolsToChinese('a ≠ b')).toContain('不等于')
    expect(symbolsToChinese('√9')).toContain('根号')
    expect(symbolsToChinese('π')).toContain('派')
    expect(symbolsToChinese('3 × 4 ÷ 2')).toContain('乘')
    expect(symbolsToChinese('3 × 4 ÷ 2')).toContain('除以')
  })
  it('百分数与范围', () => {
    expect(symbolsToChinese('正确率 85%')).toContain('百分之85')
    expect(symbolsToChinese('第 1-3 题')).toContain('1到3')
  })
  it('cleanSpeechText 集成', () => {
    expect(cleanSpeechText('如果 A → B，则说明 A 推出 B 吗？')).toContain('推出')
    expect(cleanSpeechText('60公里/小时')).toContain('公里每小时')
  })
})

describe('smoothWavBytes WAV 平滑（去静音/淡入淡出）', () => {
  function makeWav(totalFrames, amp) {
    const rate = 8000, ch = 1, block = 2
    const dataSize = totalFrames * block
    const ab = new ArrayBuffer(44 + dataSize)
    const v = new DataView(ab)
    const ws = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
    ws(0, 'RIFF'); v.setUint32(4, 36 + dataSize, true); ws(8, 'WAVE')
    ws(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true)
    v.setUint16(22, ch, true); v.setUint32(24, rate, true); v.setUint32(28, rate * block, true)
    v.setUint16(32, block, true); v.setUint16(34, 16, true)
    ws(36, 'data'); v.setUint32(40, dataSize, true)
    for (let i = 0; i < totalFrames; i++) {
      // 语音段用 400Hz 正弦（有过零变化，不是纯 DC）
      const s = (i < 100 || i >= totalFrames - 100) ? 0 : Math.round(amp * 32767 * Math.sin(2 * Math.PI * 400 * i / rate))
      v.setInt16(44 + i * 2, s, true)
    }
    return ab
  }
  it('去掉头尾静音并保持合法 WAV', () => {
    const wav = makeWav(800, 0.5) // 800 frames @8k = 100ms, 前后各100帧静音
    const out = smoothWavBytes(wav)
    const dv = new DataView(out)
    const ascii = (o, n) => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(dv.getUint8(o + i)); return s }
    expect(ascii(0, 4)).toBe('RIFF')
    expect(ascii(8, 4)).toBe('WAVE')
    const dataSize = dv.getUint32(40, true)
    const frames = dataSize / 2
    expect(frames).toBeLessThan(700) // 去掉了前后静音
    expect(frames).toBeGreaterThanOrEqual(500)
    // 整体能量非零（语音仍在）+ 淡入后前帧能量小于原始幅度（有淡入）
    let total = 0
    for (let i = 0; i < frames; i++) total += Math.abs(dv.getInt16(44 + i * 2, true))
    expect(total).toBeGreaterThan(0)
    expect(Math.abs(dv.getInt16(44 + 30 * 2, true))).toBeLessThan(12000)
  })
  it('非 WAV 原样返回', () => {
    const junk = new Uint8Array([1, 2, 3, 4])
    expect(smoothWavBytes(junk)).toBe(junk)
  })
  it('过短音频不处理', () => {
    const wav = makeWav(10, 0.5)
    expect(smoothWavBytes(wav)).toBe(wav)
  })
})
