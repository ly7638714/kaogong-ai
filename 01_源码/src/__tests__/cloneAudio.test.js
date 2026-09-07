import { describe, it, expect } from 'vitest'
import { detectAudioFormat, resampleAudio, speechStartOffset, audioBufferToWavBytes } from '../utils/ttsEngine'

describe('detectAudioFormat 真实格式识别（.mp3 后缀可能是 m4a）', () => {
  const bytes = (hex) => { const a = new Uint8Array(hex.length / 2); for (let i = 0; i < a.length; i++) a[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16); return a.buffer }
  it('WAV', () => expect(detectAudioFormat(bytes('524946461234567857415645' + '00000000'))).toBe('wav'))
  it('MP4/M4A（ftyp）', () => expect(detectAudioFormat(bytes('00000018667479706d7034320000000069736f6d' + '00000000'))).toBe('m4a'))
  it('MP3（ID3 标签）', () => expect(detectAudioFormat(bytes('4944330300000000' + '00000000000000000000'))).toBe('mp3'))
  it('MP3（帧同步 FF FB）', () => expect(detectAudioFormat(bytes('fffb9064' + '00000000000000000000'))).toBe('mp3'))
  it('OGG', () => expect(detectAudioFormat(bytes('4f676753000210' + '00000000000000000000'))).toBe('ogg'))
  it('未知', () => expect(detectAudioFormat(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).buffer)).toBe('unknown'))
  it('太短', () => expect(detectAudioFormat(new Uint8Array([1, 2]).buffer)).toBe('unknown'))
})

describe('resampleAudio 线性重采样', () => {
  it('同采样率原样返回', () => {
    const d = new Float32Array([0, 0.5, 1, 0.5, 0])
    expect(resampleAudio(d, 44100, 44100)).toBe(d)
  })
  it('降采样一半长度', () => {
    const d = new Float32Array(100).fill(0.5)
    const out = resampleAudio(d, 44100, 22050)
    expect(out.length).toBe(50)
    expect(out[0]).toBeCloseTo(0.5, 5)
  })
  it('空输入不报错', () => {
    expect(resampleAudio(null, 44100, 24000)).toBe(null)
  })
})

describe('speechStartOffset 跳过开头静音', () => {
  it('有静音时返回人声起始点', () => {
    const d = new Float32Array(4096)
    d[2048] = 0.9
    expect(speechStartOffset(d, 0.012)).toBe(2048)
  })
  it('全静音返回 0', () => {
    const d = new Float32Array(1024)
    expect(speechStartOffset(d, 0.012)).toBe(0)
  })
})

describe('audioBufferToWavBytes 生成标准 16bit PCM WAV', () => {
  it('头部与数据正确', () => {
    const chan = [new Float32Array([0, 0.5, -0.5, 1, -1, 0])]
    const ab = audioBufferToWavBytes(chan, 24000)
    const v = new DataView(ab)
    const ascii = (o, n) => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(v.getUint8(o + i)); return s }
    expect(ascii(0, 4)).toBe('RIFF')
    expect(ascii(8, 4)).toBe('WAVE')
    expect(ascii(12, 4)).toBe('fmt ')
    expect(v.getUint16(20, true)).toBe(1) // PCM
    expect(v.getUint16(22, true)).toBe(1) // mono
    expect(v.getUint32(24, true)).toBe(24000)
    expect(v.getUint16(34, true)).toBe(16) // bits
    expect(ascii(36, 4)).toBe('data')
    const dataSize = v.getUint32(40, true)
    expect(dataSize).toBe(6 * 2) // 6 samples * 2 bytes
    // 采样值：0.5 → 16383 左右, -0.5 → -16384 左右
    expect(v.getInt16(44, true)).toBe(0)
    expect(Math.abs(v.getInt16(46, true))).toBeGreaterThan(16000)
    expect(Math.abs(v.getInt16(48, true))).toBeGreaterThan(16000)
  })
  it('多声道交错', () => {
    const chans = [new Float32Array([0.5, -0.5]), new Float32Array([0.25, -0.25])]
    const ab = audioBufferToWavBytes(chans, 16000)
    const v = new DataView(ab)
    expect(v.getUint16(22, true)).toBe(2)
    expect(v.getUint32(40, true)).toBe(4 * 2) // 4 samples(2ch*2frames)*2 bytes
  })
})
