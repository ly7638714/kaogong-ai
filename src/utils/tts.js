import { store } from '../store'
import { showToast } from './toast'
import {
  TTS_ENGINES,
  GLM_PRESET_VOICES,
  EDGE_PRESET_VOICES,
  OPENAI_PRESET_VOICES,
  speakPro,
  stopSpeakPro,
  speakingPro,
  listGmVoices,
  listEdgeVoices,
  gmCfg,
  openaiCfg,
  glmSynthesize,
  openaiSynthesize,
  edgeSynthesize,
  cloneCosyVoice,
  cloneZhipuVoice,
  prepareCloneAudio,
  detectAudioFormat,
  resampleAudio,
  speechStartOffset,
  audioBufferToWavBytes,
  ttsStatus,
  ttsCharsToday,
  DASH_PRESET_VOICES,
  DASH_MODELS,
  dashVoicesForModel,
  dashSynthesize
} from './ttsEngine'

// ===== 场景音色清单（仅系统语音兜底时使用；真人引擎在「音色市场」里选）=====
export const SCENES = [
  { id: 'natural', name: '🎙️ 默认·自然', kw: 'xiaoxiao|natural|google|tingting' },
  { id: 'kid', name: '🎀 萝莉·童声', kw: 'xiaoshuang|child|baby|kid', pitch: 1.25 },
  { id: 'sweet', name: '🍬 少女·甜音', kw: 'xiaoyi|sweet|girl', pitch: 1.12 },
  { id: 'lady', name: '💃 御姐·知性', kw: 'xiaomo|xiaoxiao|lady', pitch: 0.88 },
  { id: 'uncle', name: '👨 大叔·磁性', kw: 'yunjian|yunyang|male|david', pitch: 0.78 },
  { id: 'teacher', name: '👩‍🏫 教师·温柔', kw: 'xiaoxiao|natural|teacher', pitch: 0.98 },
  { id: 'newsf', name: '📰 女播音腔', kw: 'xiaohan|newscast|news|broadcast', pitch: 0.98 },
  { id: 'newsm', name: '🎙️ 男播音腔', kw: 'yunyang|male|newscast|news', pitch: 0.85 }
]

let _cache = null
export function getAllVoices() {
  try {
    if (_cache && _cache.length) return _cache
    const v = window.speechSynthesis.getVoices() || []
    if (v.length) _cache = v
    return v
  } catch (e) {
    return []
  }
}
export function refreshVoices() {
  _cache = null
  try { window.speechSynthesis.getVoices() } catch (e) {}
  return getAllVoices()
}
export function onVoicesReady(cb) {
  try {
    if (getAllVoices().length) { cb && cb(); return }
    window.speechSynthesis.onvoiceschanged = () => {
      _cache = null
      cb && cb()
    }
  } catch (e) {}
}

// 按场景关键词在系统所有语音里匹配最优（仅系统引擎使用）
export function pickSceneVoice(scene) {
  try {
    const vs = window.speechSynthesis.getVoices() || []
    if (!vs.length) return null
    const custom = store.cfg && store.cfg.ttsVoice
    if (custom) {
      const hit = vs.find((v) => v.name === custom || v.voiceURI === custom)
      if (hit) return hit
    }
    if (!scene) scene = 'natural'
    const s = SCENES.find((x) => x.id === scene) || SCENES[0]
    const kw = new RegExp(s.kw, 'i')
    const zh = vs.filter((v) => v && v.lang && v.lang.toLowerCase().startsWith('zh'))
    let hit = zh.find((v) => kw.test(v.name || ''))
    if (!hit) hit = zh.find((v) => /neural|natural|online/i.test(v.name || ''))
    if (!hit) hit = vs.find((v) => kw.test(v.name || ''))
    if (!hit) hit = zh.find((v) => vwGuess(v.name, scene))
    return hit || zh[0] || null
  } catch (e) {
    return null
  }
}
function vwGuess(name, scene) {
  const n = (name || '').toLowerCase()
  if (scene === 'kid') return /\b(xiaoshuang|child|kid|baby)\b|儿童|小孩/.test(n)
  if (scene === 'uncle' || scene === 'newsm') return /\b(male|yunyang|yunjian)\b|男/.test(n)
  return /natural|online|neural/.test(n)
}

// 计算该场景的目标音调（若用户在 speak 传 pitch 则覆盖）
function scenePitch(scene) {
  const s = SCENES.find((x) => x.id === scene)
  return (s && s.pitch) || 0.98
}

let _lastErrToast = 0
function errToast(msg) {
  const now = Date.now()
  if (now - _lastErrToast < 8000) return
  _lastErrToast = now
  showToast('🔊 朗读失败：' + String(msg || '').slice(0, 80), 'error')
}

// 朗读：opts={ scene:'lady', rate:1, pitch:null, onEnd: fn, onError: fn }
// 按 store.cfg.ttsMode 分发：glm(默认·智谱超拟人) / openai / edge / sys
export function speak(text, opts) {
  opts = opts || {}
  speakPro(text, {
    voice: opts.voice,
    rate: opts.rate != null ? opts.rate : 0.98,
    pitch: opts.pitch != null ? opts.pitch : scenePitch(opts.scene),
    speed: opts.rate != null ? opts.rate : 1,
    onEnd: opts.onEnd,
    onError: (msg) => { errToast(msg); if (opts.onError) opts.onError(msg) }
  })
}
export function stopSpeak() {
  stopSpeakPro()
}
export function speaking() {
  return speakingPro()
}

// ===== 真人引擎辅助（设置页「音色市场」用）=====
export { TTS_ENGINES, GLM_PRESET_VOICES, EDGE_PRESET_VOICES, OPENAI_PRESET_VOICES, DASH_PRESET_VOICES, DASH_MODELS, dashVoicesForModel, listGmVoices, listEdgeVoices, gmCfg, openaiCfg, dashSynthesize, ttsStatus, ttsCharsToday, cloneCosyVoice, cloneZhipuVoice, prepareCloneAudio, detectAudioFormat, resampleAudio, speechStartOffset, audioBufferToWavBytes }

// 试听某个音色（固定短句，立即播放；engine: glm/openai/edge）
export async function previewVoice(engine, voice, opts = {}) {
  const text = opts.text || '你好，我是你的行测智能助教，这套真人音色听起来自然吗？'
  try {
    if (engine === 'glm') {
      const r = await glmSynthesize(text, { voice, speed: 1 })
      if (!r.ok) { ttsStatus.state = 'error'; ttsStatus.msg = '❌ 试听失败：' + r.msg; showToast('🔊 试听失败：' + r.msg, 'error'); return { ok: false } }
      ttsStatus.state = 'speaking'; ttsStatus.msg = '正在播放真人音色试听…'
      const played = await playBuf(r.bytes, r.mime)
      ttsStatus.state = played ? 'done' : 'error'; ttsStatus.msg = played ? '✅ 真人音色试听完成' : '❌ 播放失败'
      return { ok: played }
    }
    if (engine === 'openai') {
      const r = await openaiSynthesize(text, { voice, speed: 1 })
      if (!r.ok) { ttsStatus.state = 'error'; ttsStatus.msg = '❌ 试听失败：' + r.msg; showToast('🔊 试听失败：' + r.msg, 'error'); return { ok: false } }
      ttsStatus.state = 'speaking'; ttsStatus.msg = '正在播放真人音色试听…'
      const played = await playBuf(r.bytes, r.mime)
      ttsStatus.state = played ? 'done' : 'error'; ttsStatus.msg = played ? '✅ 真人音色试听完成' : '❌ 播放失败'
      return { ok: played }
    }
    if (engine === 'dash') {
      const r = await dashSynthesize(text, { voice, speed: 1, voiceCustom: (store.cfg.ttsDash && store.cfg.ttsDash.voiceCustom) || '' })
      if (!r.ok) { ttsStatus.state = 'error'; ttsStatus.msg = '❌ 试听失败：' + r.msg; showToast('🔊 试听失败：' + r.msg, 'error'); return { ok: false } }
      ttsStatus.state = 'speaking'; ttsStatus.msg = '正在播放真人音色试听…'
      const played = await playBuf(r.bytes, r.mime)
      ttsStatus.state = played ? 'done' : 'error'; ttsStatus.msg = played ? '✅ 真人音色试听完成' : '❌ 播放失败'
      return { ok: played }
    }
    if (engine === 'edge') {
      const r = await edgeSynthesize(text, { voice, rate: 1, pitch: 0 })
      if (!r.ok) { ttsStatus.state = 'error'; ttsStatus.msg = '❌ 试听失败：' + r.msg; showToast('🔊 试听失败：' + r.msg, 'error'); return { ok: false } }
      ttsStatus.state = 'speaking'; ttsStatus.msg = '正在播放真人音色试听…'
      const played = await playBuf(r.bytes, r.mime)
      ttsStatus.state = played ? 'done' : 'error'; ttsStatus.msg = played ? '✅ 真人音色试听完成' : '❌ 播放失败'
      return { ok: played }
    }
  } catch (e) {
    showToast('🔊 试听失败：' + e.message, 'error')
    return { ok: false }
  }
}
// 播放二进制（复用 ttsEngine 内部播放器，通过动态引入避免重复实现）
async function playBuf(bytes, mime) {
  const { playBytes } = await import('./ttsEngine')
  return playBytes(bytes, mime)
}
// 把「图形增强」里的 Key 复制到对应真人引擎（智谱/OpenAI 兼容）
export function copyFigKeyToTts() {
  const fig = store.cfg.fig || {}
  const k = String(fig.key || '').trim()
  if (!k) { showToast('图形增强里还没有填 Key', 'info'); return false }
  const url = String(fig.url || '')
  if (/bigmodel|zhipu|glm/i.test(url)) {
    store.cfg.ttsGm.key = k
    showToast('✅ 已把智谱 Key 复制到真人朗读', 'success')
  } else {
    store.cfg.ttsOpenAI.key = k
    showToast('✅ 已把图形增强 Key 复制到 OpenAI 兼容朗读', 'success')
  }
  return true
}

let recog = null,
  recogOn = false
export function startRecog(onText) {
  if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) return false
  if (recogOn) {
    if (recog) recog.stop()
    recogOn = false
    return true
  }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition
  recog = new SR()
  recog.lang = 'zh-CN'
  recog.continuous = true
  recog.interimResults = true
  recog.onresult = (e) => {
    let t = ''
    for (let i = e.resultIndex; i < e.results.length; i++) t += e.results[i][0].transcript
    onText(t)
  }
  recog.onend = () => {
    recogOn = false
  }
  recog.onerror = () => {
    recogOn = false
  }
  recogOn = true
  recog.start()
  return true
}
export function recogActive() {
  return recogOn
}
