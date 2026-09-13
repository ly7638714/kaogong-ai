// ttsLeadTrim.test.js —— v3.8.332 语音裁剪链路重构的回归测试
//
// 背景（实测根因，见 05_工程与产品评估/_wbTtsCheck/wb_beep_baseline.mjs）：
//   1. 生产链路 gapDecode 曾做「双重裁剪」：先 smoothWavBytes（zcr/crest 判据），
//      再 applyLeadTrim（detectLeadArtifact，crest=peak/rms 判据）。两套判据不同源。
//   2. smoothWavBytes 的判据与人声失配（正常人声 crest≈1.14~1.36 < 阈值 1.45），
//      实测对纯人声恒定误裁 200ms → 每块开头吞掉一截正文。
//   3. applyLeadTrim 曾「硬裁命中即 return」，会短路智能识别（本该裁 1300ms 只裁 200ms）。
//
// 本文件锁定修复后的行为契约。
import { describe, it, expect } from 'vitest'
import { parseWavOnly, smoothWavBytes } from '../utils/tts/wav'
import { detectLeadArtifact, trimLeadingAudioArtifacts, trimWavArtifacts, applyLeadTrim } from '../utils/ttsEngine'
import { store } from '../store'

const SR = 16000
const makeCtx = (sr) => ({
  createBuffer: (ch, len) => ({ numberOfChannels: ch, length: len, sampleRate: sr, _d: [new Float32Array(len)], getChannelData(i) { return this._d[i] } })
})
const makeInput = (sr, total, data) => ({ numberOfChannels: 1, length: total, sampleRate: sr, getChannelData: () => data })
function leadCrest(out) {
  const c = out.getChannelData(0)
  const n = Math.min(out.length, Math.floor(out.sampleRate * 0.005))
  let sum = 0, peak = 0
  for (let i = 0; i < n; i++) { const v = c[i]; sum += v * v; const a = Math.abs(v); if (a > peak) peak = a }
  const rms = Math.sqrt(sum / Math.max(1, n))
  return rms > 1e-6 ? peak / rms : 99
}
// 多谐波 + 音节包络 → 人声特征（crest≈2.2、过零率漂移）
function speechAt(i, t) {
  const env = 0.72 + 0.28 * Math.sin(2 * Math.PI * 4 * t)
  return env * (0.2 * Math.sin(2 * Math.PI * 180 * t) + 0.1 * Math.sin(2 * Math.PI * 360 * t) + 0.05 * Math.sin(2 * Math.PI * 540 * t))
}
// 稳态单音 → 提示音特征（crest≈1.41）
const beepAt = (i, sr, hz, amp = 0.25) => amp * Math.sin(2 * Math.PI * hz * i / sr)

// 构造标准 16bit 单声道 WAV
function makeWav(frames, fill, sampleRate = SR) {
  const bytesPer = 2, block = bytesPer * 1
  const dataSize = frames * block
  const ab = new ArrayBuffer(44 + dataSize)
  const dv = new DataView(ab)
  const u8 = new Uint8Array(ab)
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) u8[o + i] = s.charCodeAt(i) }
  ws(0, 'RIFF'); ws(8, 'WAVE'); ws(12, 'fmt '); ws(36, 'data')
  dv.setUint32(4, 36 + dataSize, true)
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true)
  dv.setUint32(24, sampleRate, true); dv.setUint32(28, sampleRate * block, true)
  dv.setUint16(32, block, true); dv.setUint16(34, 16, true)
  dv.setUint32(40, dataSize, true)
  for (let i = 0; i < frames; i++) {
    const v = Math.max(-1, Math.min(1, fill(i) || 0))
    dv.setInt16(44 + i * 2, Math.round(v < 0 ? v * 32768 : v * 32767), true)
  }
  return ab
}
function wavFrames(buf) {
  const dv = new DataView(buf)
  return dv.getUint32(40, true) / 2
}

describe('parseWavOnly WAV 解析（只解析，不裁剪）', () => {
  it('正确解析标准 WAV 的格式与 data 块', () => {
    const wav = makeWav(SR, (i) => beepAt(i, SR, 440))
    const p = parseWavOnly(wav)
    expect(p).toBeTruthy()
    expect(p.rate).toBe(SR)
    expect(p.ch).toBe(1)
    expect(p.bits).toBe(16)
    expect(p.frames).toBe(SR)
  })

  it('能跳过 LIST 等元数据块定位 data（GLM 返回的 WAV 带 LIST）', () => {
    // 构造 RIFF/WAVE + LIST 块 + fmt + data
    const bodyFrames = 1000
    const listPayload = new Uint8Array(20).fill(65)
    const fmtSize = 16, dataSize = bodyFrames * 2
    const total = 12 + (8 + listPayload.length) + (8 + fmtSize) + (8 + dataSize)
    const ab = new ArrayBuffer(total)
    const dv = new DataView(ab)
    const u8 = new Uint8Array(ab)
    const ws = (o, s) => { for (let i = 0; i < s.length; i++) u8[o + i] = s.charCodeAt(i) }
    ws(0, 'RIFF'); dv.setUint32(4, total - 8, true); ws(8, 'WAVE')
    ws(12, 'LIST'); dv.setUint32(16, listPayload.length, true); u8.set(listPayload, 20)
    let o = 20 + listPayload.length
    ws(o, 'fmt '); dv.setUint32(o + 4, fmtSize, true)
    dv.setUint16(o + 8, 1, true); dv.setUint16(o + 10, 1, true)
    dv.setUint32(o + 12, SR, true); dv.setUint32(o + 16, SR * 2, true)
    dv.setUint16(o + 20, 2, true); dv.setUint16(o + 22, 16, true)
    o += 8 + fmtSize
    ws(o, 'data'); dv.setUint32(o + 4, dataSize, true)
    for (let i = 0; i < bodyFrames; i++) dv.setInt16(o + 8 + i * 2, Math.round(beepAt(i, SR, 440) * 32767), true)
    const p = parseWavOnly(ab)
    expect(p).toBeTruthy()
    expect(p.frames).toBe(bodyFrames)
    expect(p.dataOff).toBeGreaterThan(44) // 确认真的跳过了 LIST
  })

  it('非 WAV / 过短 / 结构损坏 → 返回 null', () => {
    expect(parseWavOnly(new Uint8Array([1, 2, 3, 4]))).toBeNull()
    const bad = makeWav(2000, () => 0)
    new DataView(bad).setUint32(40, 999999, true) // data 长度超出文件 → 拒绝
    expect(parseWavOnly(bad)).toBeNull()
  })
})

describe('smoothWavBytes 已退出生产链路（仅保留历史行为）', () => {
  it('确认它确实会误裁纯人声——这就是它被移出链路的原因', () => {
    // 纯人声 WAV（无任何提示音/静音前缀），smoothWavBytes 仍会裁掉开头一截
    const frames = SR * 2
    const wav = makeWav(frames, (i) => speechAt(i, i / SR))
    const out = smoothWavBytes(wav, { fade: false })
    const cutFrames = frames - wavFrames(out)
    // 记录现状：误裁 > 0（本测试是「缺陷证据」，不做修复断言，仅防回归到更糟）
    expect(cutFrames).toBeGreaterThan(0)
    // 而同一段音频的 PCM 判据（detectLeadArtifact）必须判定为「无前导」
    const data = new Float32Array(frames)
    const dv = new DataView(wav)
    for (let i = 0; i < frames; i++) data[i] = dv.getInt16(44 + i * 2, true) / 32768
    const info = detectLeadArtifact(makeInput(SR, frames, data))
    expect(info.lead).toBe(0)
  })
})

describe('detectLeadArtifact 多段提示音扫描（GLM 真实结构）', () => {
  // 复刻 GLM 单块开头：[嘟①][静音][嘟②][长静音][正文]
  // 注意：正文必须够长。detectLeadArtifact 有安全阀「正文至少占 45%」，
  // 真实 GLM 240 字块约 15s，1.5s 前导只占 10%，远在阈值内；夹具也按真实比例给足正文。
  function glmHead(sr, segs, speechSec = 3.0) {
    const head = segs.reduce((s, x) => s + Math.floor(sr * x.sec), 0)
    const total = head + Math.floor(sr * speechSec)
    const data = new Float32Array(total)
    let p = 0
    for (const sg of segs) {
      const n = Math.floor(sr * sg.sec)
      for (let i = 0; i < n; i++) {
        const idx = p + i
        data[idx] = sg.kind === 'beep' ? beepAt(i, sr, sg.hz || 1000) : 0
      }
      p += n
    }
    for (let i = p; i < total; i++) data[i] = speechAt(i, (i - p) / sr)
    return { total, data, speechStart: p }
  }
  const run = (sr, segs) => {
    const { total, data, speechStart } = glmHead(sr, segs)
    const info = detectLeadArtifact(makeInput(sr, total, data))
    return { total, data, speechStart, info }
  }

  it('嘟①+静音+嘟②+长静音 → 整段前导全部检出（不提前收手）', () => {
    const sr = SR
    const { speechStart, info } = run(sr, [
      { kind: 'beep', sec: 0.12, hz: 1000 },
      { kind: 'silence', sec: 0.165 },
      { kind: 'beep', sec: 0.3, hz: 800 },
      { kind: 'silence', sec: 0.65 }
    ])
    expect(info.confident).toBe(true)
    // 检出量应逼近真实人声起点（允许 1 个 5ms 窗的误差）
    expect(Math.abs(info.lead - speechStart)).toBeLessThanOrEqual(sr * 0.01)
  })

  it('三段交替嘟声（1200/800/1000Hz）→ 全部检出', () => {
    const sr = SR
    const { speechStart, info } = run(sr, [
      { kind: 'beep', sec: 0.1, hz: 1200 },
      { kind: 'silence', sec: 0.165 },
      { kind: 'beep', sec: 0.3, hz: 800 },
      { kind: 'silence', sec: 0.165 },
      { kind: 'beep', sec: 0.12, hz: 1000 },
      { kind: 'silence', sec: 0.65 }
    ])
    expect(info.confident).toBe(true)
    expect(Math.abs(info.lead - speechStart)).toBeLessThanOrEqual(sr * 0.01)
  })

  it('纯人声（无前导）→ 判定为 0，绝不误裁', () => {
    const sr = SR
    const total = sr * 2
    const data = new Float32Array(total)
    for (let i = 0; i < total; i++) data[i] = speechAt(i, i / sr)
    const info = detectLeadArtifact(makeInput(sr, total, data))
    expect(info.lead).toBe(0)
  })
})

describe('trimLeadingAudioArtifacts 裁剪后必须是完整正文（不残留提示音）', () => {
  it('多段提示音裁净后，开头第一个 5ms 窗口已进入人声', () => {
    const sr = SR
    const total = sr * 5 // 前导 1.235s + 正文 3.765s（逼近真实块比例）
    const data = new Float32Array(total)
    const segs = [
      [0, 0.12, 'beep', 1000], [0.12, 0.285, 'silence'], [0.285, 0.585, 'beep', 800], [0.585, 1.235, 'silence']
    ]
    for (const [a, b, kind, hz] of segs) {
      for (let i = Math.floor(a * sr); i < Math.floor(b * sr); i++) data[i] = kind === 'beep' ? beepAt(i, sr, hz) : 0
    }
    for (let i = Math.floor(1.235 * sr); i < total; i++) data[i] = speechAt(i, (i - 1.235 * sr) / sr)
    const out = trimLeadingAudioArtifacts(makeCtx(sr), makeInput(sr, total, data))
    expect(leadCrest(out)).toBeGreaterThan(1.62)
    // 正文应几乎完整保留（原 5s，裁掉约 1.235s 前导 → 剩约 3.76s）
    expect(out.length).toBeGreaterThan(sr * 3.5)
  })

  it('生产 WAV 裁剪：纯人声在没有提示音时不得被默认硬裁 200ms', () => {
    const frames = SR * 2
    const wav = makeWav(frames, (i) => speechAt(i, i / SR))
    store.cfg.ttsTrimLead = true
    store.cfg.ttsTrimLeadMs = 200
    const out = trimWavArtifacts(wav)
    expect(frames - wavFrames(out)).toBe(0)
  })

  it('Web Audio 生产裁剪：纯人声 + 默认 200ms 硬裁值也不得吞掉开头', () => {
    const frames = SR * 2
    const data = new Float32Array(frames)
    for (let i = 0; i < frames; i++) data[i] = speechAt(i, i / SR)
    store.cfg.ttsTrimLead = true
    store.cfg.ttsTrimLeadMs = 200
    const out = applyLeadTrim(makeCtx(SR), makeInput(SR, frames, data))
    expect(out.length).toBe(frames)
  })
})
