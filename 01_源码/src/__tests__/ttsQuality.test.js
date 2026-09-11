import { describe, it, expect } from 'vitest'
import { symbolsToChinese, cleanSpeechText, smoothWavBytes, trimLeadingAudioArtifacts } from '../utils/ttsEngine'

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

describe('朗读元信息剔除（不进朗读 = 不花钱）', () => {
  const raw = [
    '📊 组卷来源：国家统计局 · 烟酒 · 当前第 1 篇（烟酒），同一篇供 5 问连续作答；10/15/20 题会自动混编多领域材料。',
    '第 1 / 5 题 · ④ 速算 · 四层第 4 / 4',
    '2020年至2024年上半年，某省烟酒类主要产品产量总体呈现波动增长态势。',
    '本材料为训练模拟数据，非官方实际公布值。',
    '📚 依据卡：[判断推理·削弱题型]'
  ].join('\n')

  it('题号进度 / 组卷来源 / 训练声明 / 依据卡都整行丢弃，正文保留', () => {
    const out = cleanSpeechText(raw)
    expect(out).not.toContain('组卷来源')
    expect(out).not.toContain('国家统计局')
    expect(out).not.toContain('第 1 / 5 题')
    expect(out).not.toContain('速算')
    expect(out).not.toContain('训练模拟数据')
    expect(out).not.toContain('依据卡')
    expect(out).not.toContain('削弱题型')
    expect(out).toContain('某省烟酒类主要产品产量总体呈现波动增长态势')
  })
})

describe('smoothWavBytes WAV 平滑（去静音/纯音提示声）', () => {
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
    let seed = 123456789
    for (let i = 0; i < totalFrames; i++) {
      // 用变频+幅度起伏+少量噪声模拟语音，避免被纯音检测正确当成提示音
      seed = (seed * 1103515245 + 12345) >>> 0
      const rnd = (seed % 2000) / 1000 - 1
      const env = 0.35 + 0.65 * Math.abs(Math.sin(2 * Math.PI * i / 173))
      const wave = 0.55 * Math.sin(2 * Math.PI * (260 + (i % 90) * 7) * i / rate) + 0.45 * rnd
      const s = (i < 100 || i >= totalFrames - 100) ? 0 : Math.round(amp * 32767 * env * wave)
      v.setInt16(44 + i * 2, s, true)
    }
    return ab
  }
  it('保持合法 WAV；疑似误判时不把整段正文剪掉', () => {
    const wav = makeWav(800, 0.5) // 800 frames @8k = 100ms, 前后各100帧静音
    const out = smoothWavBytes(wav)
    const dv = new DataView(out)
    const ascii = (o, n) => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(dv.getUint8(o + i)); return s }
    expect(ascii(0, 4)).toBe('RIFF')
    expect(ascii(8, 4)).toBe('WAVE')
    const dataSize = dv.getUint32(40, true)
    const frames = dataSize / 2
    expect(frames).toBeGreaterThanOrEqual(500)
    // 整体能量非零，且不能因为提示音/静音识别把正文裁成很短的碎片
    let total = 0
    for (let i = 0; i < frames; i++) total += Math.abs(dv.getInt16(44 + i * 2, true))
    expect(total).toBeGreaterThan(0)
    expect(Math.abs(dv.getInt16(44 + 200 * 2, true))).toBeGreaterThan(0)
  })
  it('去除每段开头常见的低频短提示音，不再出现“嘟嘟”前导', () => {
    const wav = makeWav(1800, 0.5)
    const v = new DataView(wav)
    for (let i = 0; i < 900; i++) v.setInt16(44 + i * 2, Math.round(0.12 * 32767 * Math.sin(2 * Math.PI * 160 * i / 8000)), true)
    for (let i = 900; i < 1700; i++) v.setInt16(44 + i * 2, i % 5 === 0 ? Math.round((i % 10 === 0 ? 0.8 : -0.8) * 32767) : 0, true)
    const out = smoothWavBytes(wav)
    const ov = new DataView(out)
    const frames = ov.getUint32(40, true) / 2
    expect(frames).toBeLessThan(1200)
    expect(frames).toBeGreaterThan(500)
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

describe('trimLeadingAudioArtifacts 解码后 PCM 清杂', () => {
  it('能裁掉开头的短提示音和其后静音，同时保留正文', () => {
    const sr = 8000
    const total = sr * 2
    const data = new Float32Array(total)
    for (let i = 0; i < sr * 0.12; i++) data[i] = 0.25 * Math.sin(2 * Math.PI * 880 * i / sr)
    for (let i = sr * 0.14; i < sr * 0.5; i++) data[i] = 0.03 * Math.sin(2 * Math.PI * 260 * i / sr) + 0.015 * Math.sin(2 * Math.PI * 430 * i / sr)
    const input = { numberOfChannels: 1, length: total, sampleRate: sr, getChannelData: () => data }
    const ctx = {
      createBuffer: (ch, len) => ({ numberOfChannels: ch, length: len, sampleRate: sr, _d: [new Float32Array(len)], getChannelData(i) { return this._d[i] } })
    }
    const out = trimLeadingAudioArtifacts(ctx, input)
    expect(out.length).toBeLessThan(total)
    expect(out.length).toBeGreaterThan(sr)
  })
})
