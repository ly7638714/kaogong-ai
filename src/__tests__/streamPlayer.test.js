import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { spEnqueue, spStop, spPlaying, spSetCallbacks } from '../utils/ttsEngine'

// 用一个假的 Audio 记录播放/结束，验证流式播放“第一块立刻播、后续按序续播、最后回调”
class FakeAudio {
  constructor(url) { this.url = url; this.paused = true; this.ended = false; this.onended = null; this.onerror = null; FakeAudio.instances.push(this) }
  play() { this.paused = false; FakeAudio.played.push(this); return Promise.resolve() }
  pause() { this.paused = true }
}
const bytes = (n) => new Uint8Array([n])

describe('流式播放器（边到边播，降低发音滞后）', () => {
  beforeEach(() => {
    FakeAudio.instances = []
    FakeAudio.played = []
    globalThis.Audio = FakeAudio
    globalThis.URL = { createObjectURL: (b) => 'blob:' + (b && b.size || 0), revokeObjectURL: () => {} }
    globalThis.Blob = class { constructor(parts) { this.parts = parts; this.size = parts.reduce((a, p) => a + (p.byteLength || p.length || 0), 0) } }
    spStop()
  })
  afterEach(() => { spStop(); vi.unstubAllGlobals() })

  it('第一块入队立即开始播放（不等整段合成完）', () => {
    spEnqueue(bytes(1), 'audio/wav')
    expect(FakeAudio.played.length).toBe(1)
    expect(spPlaying()).toBe(true)
  })

  it('后续块按序续播，最后一块播完触发 end 回调', () => {
    let ended = 0
    spSetCallbacks(() => { ended++ }, () => {})
    spEnqueue(bytes(1), 'audio/wav')
    spEnqueue(bytes(2), 'audio/wav')
    spEnqueue(bytes(3), 'audio/wav')
    // 队列3块，第一块在播
    expect(FakeAudio.played.length).toBe(1)
    // 播完第一块 → 自动续播第二块
    FakeAudio.instances[0].onended()
    expect(FakeAudio.played.length).toBe(2)
    FakeAudio.instances[1].onended()
    expect(FakeAudio.played.length).toBe(3)
    expect(ended).toBe(0)
    FakeAudio.instances[2].onended()
    expect(ended).toBe(1)
    expect(spPlaying()).toBe(false)
  })

  it('中途停止：清空队列并停播', () => {
    spEnqueue(bytes(1), 'audio/wav')
    spEnqueue(bytes(2), 'audio/wav')
    expect(spPlaying()).toBe(true)
    spStop()
    expect(spPlaying()).toBe(false)
    // 已暂停的 audio 不再续播
    expect(FakeAudio.instances[0].paused).toBe(true)
  })
})
