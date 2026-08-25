import { store } from '../store'

function strip(t) {
  return String(t || '')
    .replace(/[#*`>|_]/g, '')
    .replace(/\s+/g, ' ')
}

// ===== 场景音色清单（映射到系统神经语音，可通过音调进一步变声）=====
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

// 按场景关键词在系统所有语音里匹配最优；匹配不到返回系统默认 zh 语音或 null
export function pickSceneVoice(scene) {
  try {
    const vs = window.speechSynthesis.getVoices() || []
    if (!vs.length) return null
    // 自定义本机语音优先（设置里选择的系统语音）
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

// 朗读：opts={ scene:'lady', rate:1, pitch:null, onEnd: fn }
export function speak(text, opts) {
  if (!('speechSynthesis' in window)) return
  opts = opts || {}
  try {
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(strip(text))
    u.lang = 'zh-CN'
    const v = pickSceneVoice(opts.scene)
    if (v) u.voice = v
    u.rate = opts.rate != null ? opts.rate : 0.98
    u.pitch = opts.pitch != null ? opts.pitch : scenePitch(opts.scene)
    if (opts.onEnd) u.onend = opts.onEnd
    if (opts.onError) u.onerror = opts.onError
    window.speechSynthesis.speak(u)
  } catch (e) {}
}
export function stopSpeak() {
  try {
    window.speechSynthesis.cancel()
  } catch (e) {}
}
export function speaking() {
  try {
    return window.speechSynthesis.speaking || window.speechSynthesis.pending
  } catch (e) {
    return false
  }
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
