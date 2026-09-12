// 萌宠悬浮面板的「暂停 / 继续 / 倍速后继续」回归
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../utils/tts', () => ({
  speak: vi.fn(),
  stopSpeak: vi.fn(),
  speaking: vi.fn(() => true),
  pauseSpeak: vi.fn(() => true),
  resumeSpeak: vi.fn(() => true),
  speakPaused: vi.fn(() => false),
  setGaplessRate: vi.fn()
}))

import { store } from '../store'
import { petPauseToggle, petReadPaused, petNextSpeed, petRead } from '../utils/pet'
import { pauseSpeak, resumeSpeak, speakPaused, speaking, stopSpeak, speak, setGaplessRate } from '../utils/tts'

describe('萌宠朗读：暂停 / 继续 / 倍速调整后继续', () => {
  beforeEach(() => {
    vi.mocked(speaking).mockReturnValue(true)
    vi.mocked(speakPaused).mockReturnValue(false)
    vi.mocked(pauseSpeak).mockClear()
    vi.mocked(resumeSpeak).mockClear()
    vi.mocked(stopSpeak).mockClear()
    vi.mocked(speak).mockClear()
    vi.mocked(setGaplessRate).mockClear()
    store.cfg.petVoice = true
    store.cfg.ttsRate = 1
    store.cfg.ttsGm = { key: '', url: '', model: 'glm-tts', voice: 'tongtong' }
    store.cfg.fig = { key: '', url: '' }
  })

  it('朗读中点击 → 暂停', () => {
    petPauseToggle()
    expect(pauseSpeak).toHaveBeenCalled()
    expect(resumeSpeak).not.toHaveBeenCalled()
  })

  it('暂停中点击 → 继续（不重头读）', () => {
    vi.mocked(speakPaused).mockReturnValue(true)
    petPauseToggle()
    expect(resumeSpeak).toHaveBeenCalled()
    expect(stopSpeak).not.toHaveBeenCalled()
  })

  it('朗读期间调倍速 → 当前音频立即生效', () => {
    petRead('这是一段用来测试倍速继续的朗读文本。', { speed: 1 })
    vi.mocked(speak).mockClear()
    vi.mocked(speakPaused).mockReturnValue(true)
    const next = petNextSpeed() // 1 → 1.1
    expect(next).toBe(1.1)
    expect(setGaplessRate).toHaveBeenCalledWith(1.1)
    petPauseToggle()
    expect(resumeSpeak).toHaveBeenCalled()
    expect(stopSpeak).not.toHaveBeenCalled()
  })

  it('没有在朗读时点击 → 不误触暂停', () => {
    vi.mocked(speaking).mockReturnValue(false)
    petPauseToggle()
    expect(pauseSpeak).not.toHaveBeenCalled()
  })

  it('暂停状态可被 UI 读到', () => {
    vi.mocked(speakPaused).mockReturnValue(true)
    expect(petReadPaused()).toBe(true)
  })
})
