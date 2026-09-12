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

  // 构造「提示音 + 紧随有音节起伏的人声」的测试信号。
  // opts.envelope：提示音带渐强渐弱包络（真实 TTS 的提示音常常不是等幅的）
  // opts.gapSec ：提示音与人声之间的静音间隔
  function beepThenSpeech(sr, beepHz, beepSec, speechSec = 1.0, opts = {}) {
    const gapSec = opts.gapSec || 0
    const total = Math.floor(sr * (beepSec + gapSec + speechSec + 0.3))
    const data = new Float32Array(total)
    const beepEnd = Math.floor(sr * beepSec)
    for (let i = 0; i < beepEnd; i++) {
      const p = beepEnd > 1 ? i / (beepEnd - 1) : 0
      const env = opts.envelope ? Math.sin(Math.PI * p) : 1
      // 提示音 = 稳态单音：波峰因子 ≈1.41、过零率恒定
      data[i] = 0.25 * env * Math.sin(2 * Math.PI * beepHz * i / sr)
    }
    const speechStart = beepEnd + Math.floor(sr * gapSec)
    const speechEnd = Math.min(total, speechStart + Math.floor(sr * speechSec))
    for (let i = speechStart; i < speechEnd; i++) {
      const t = (i - speechStart) / sr
      // 音节包络（4Hz 起伏）+ 多谐波 → 人声特征：波峰因子 ≈2.2、过零率持续漂移
      const env2 = 0.72 + 0.28 * Math.sin(2 * Math.PI * 4 * t)
      data[i] = env2 * (0.2 * Math.sin(2 * Math.PI * 180 * t) + 0.1 * Math.sin(2 * Math.PI * 360 * t) + 0.05 * Math.sin(2 * Math.PI * 540 * t))
    }
    return { total, data }
  }
  const makeCtx = (sr) => ({
    createBuffer: (ch, len) => ({ numberOfChannels: ch, length: len, sampleRate: sr, _d: [new Float32Array(len)], getChannelData(i) { return this._d[i] } })
  })
  const makeInput = (sr, total, data) => ({ numberOfChannels: 1, length: total, sampleRate: sr, getChannelData: () => data })
  // 开头第一个 5ms 窗口的波峰因子：提示音 ≈1.41、人声 ≈2.2
  function leadCrest(out) {
    const c = out.getChannelData(0)
    const n = Math.min(out.length, Math.floor(out.sampleRate * 0.005))
    let sum = 0, peak = 0
    for (let i = 0; i < n; i++) { const v = c[i]; sum += v * v; const a = Math.abs(v); if (a > peak) peak = a }
    const rms = Math.sqrt(sum / Math.max(1, n))
    return rms > 1e-6 ? peak / rms : 99
  }
  const runTrim = (sr, opts) => {
    const { total, data } = beepThenSpeech(sr, opts.beepHz, opts.beepSec, opts.speechSec, opts)
    const out = trimLeadingAudioArtifacts(makeCtx(sr), makeInput(sr, total, data))
    return { total, data, out }
  }

  it('高频提示音（880Hz）+ 紧跟人声、无静音间隔：裁掉提示音', () => {
    const sr = 16000
    const { total, out } = runTrim(sr, { beepHz: 880, beepSec: 0.12 })
    expect(out.length).toBeLessThan(total)
    expect(out.length).toBeGreaterThan(sr)
    expect(leadCrest(out)).toBeGreaterThan(1.62) // 开头已是人声，不再是提示音
  })

  it('低频提示音（400Hz）+ 紧跟人声：同样能裁掉（不依赖过零率）', () => {
    const sr = 16000
    const { total, out } = runTrim(sr, { beepHz: 400, beepSec: 0.2 })
    expect(out.length).toBeLessThan(total)
    expect(out.length).toBeGreaterThan(sr)
    expect(leadCrest(out)).toBeGreaterThan(1.62)
  })

  // 回归（用户实测问题）：短提示音、带包络的提示音、长提示音、微小间隙，四种都必须删掉，
  // 否则分块朗读时每一句之间都会听见「嘟」。
  it('短提示音 30ms + 紧跟人声：也要裁掉（旧版 60ms 等幅门禁会漏删）', () => {
    const sr = 16000
    const { out } = runTrim(sr, { beepHz: 1000, beepSec: 0.03 })
    expect(leadCrest(out)).toBeGreaterThan(1.62)
  })

  it('带渐强渐弱包络的 120ms 提示音：也要裁掉（旧版「等幅才算提示音」会漏删）', () => {
    const sr = 16000
    const { out } = runTrim(sr, { beepHz: 800, beepSec: 0.12, envelope: true })
    expect(leadCrest(out)).toBeGreaterThan(1.62)
  })

  it('长提示音 300ms + 低频：裁掉且不吃掉正文', () => {
    const sr = 16000
    const { total, out } = runTrim(sr, { beepHz: 400, beepSec: 0.3 })
    expect(out.length).toBeLessThan(total)
    expect(out.length).toBeGreaterThan(sr * 0.9)
    expect(leadCrest(out)).toBeGreaterThan(1.62)
  })

  it('提示音后只有 10ms 微间隙：也要裁干净', () => {
    const sr = 16000
    const { out } = runTrim(sr, { beepHz: 900, beepSec: 0.15, gapSec: 0.01 })
    expect(leadCrest(out)).toBeGreaterThan(1.62)
  })

  it('开头只有静音（无提示音）时，静音一并裁掉，声音从正文开始', () => {
    const sr = 16000
    const total = sr * 2
    const data = new Float32Array(total)
    for (let i = sr * 0.25; i < total; i++) {
      const t = (i - sr * 0.25) / sr
      const env2 = 0.72 + 0.28 * Math.sin(2 * Math.PI * 4 * t)
      data[i] = env2 * (0.2 * Math.sin(2 * Math.PI * 180 * t) + 0.1 * Math.sin(2 * Math.PI * 360 * t) + 0.05 * Math.sin(2 * Math.PI * 540 * t))
    }
    const out = trimLeadingAudioArtifacts(makeCtx(sr), makeInput(sr, total, data))
    expect(out.length).toBeLessThan(total - sr * 0.2)
    expect(leadCrest(out)).toBeGreaterThan(1.62)
  })

  it('开头就是人声（无提示音）时不裁开头，避免吃掉第一个音', () => {
    const sr = 16000
    const { data, out } = runTrim(sr, { beepHz: 400, beepSec: 0 }) // 直接人声
    expect(out.getChannelData(0)[0]).toBe(data[0])
    expect(out.length).toBeGreaterThan(sr * 0.9)
  })

  // 回归：块尾静音裁剪的窗口网格锚定在样本 0（而不是从末尾往前推），
  // 重复裁剪必须收敛，不得出现「再裁一次又短一截」。
  it('重复裁剪幂等：二次裁剪不会再吃掉正文', () => {
    const sr = 16000
    const { out } = runTrim(sr, { beepHz: 800, beepSec: 0.15 })
    const again = trimLeadingAudioArtifacts(makeCtx(sr), out)
    // 噪声底由开头自适应估计，二次裁剪允许一个分析窗量级的差异（≤25ms），听感不可闻
    expect(Math.abs(again.length - out.length)).toBeLessThan(sr * 0.025)
  })

  it('块尾长静音被裁到 30ms 左右，分块之间停顿均匀', () => {
    const sr = 16000
    const { total, data } = beepThenSpeech(sr, 800, 0.12, 1.0, {})
    const tailLen = sr * 0.5 // 手工在正文后追加 500ms 静音
    const padded = new Float32Array(total + tailLen)
    padded.set(data)
    const out = trimLeadingAudioArtifacts(makeCtx(sr), makeInput(sr, padded.length, padded))
    // 尾部静音应被削到大半（至少削掉 300ms）
    expect(padded.length - out.length).toBeGreaterThan(sr * 0.3)
    // 且残留的最后一段静音不超过 30ms + 1 个窗（≈40ms）
    const win = Math.floor(sr * 0.005)
    const c = out.getChannelData(0)
    let silent = 0
    for (let s1 = out.length; s1 - win >= 0; s1 -= win) {
      let sum = 0
      for (let i = s1 - win; i < s1; i++) sum += c[i] * c[i]
      if (Math.sqrt(sum / win) >= 0.01) break
      silent += win
    }
    expect(silent / sr * 1000).toBeLessThanOrEqual(40)
  })
})
