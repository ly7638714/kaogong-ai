// ttsEngine.js —— 真人级 TTS 引擎（去掉「AI 味」的核心）
// 四引擎统一分发：智谱 GLM-TTS（超拟人·真人级，默认） / OpenAI 兼容（CosyVoice2） / Edge 免费神经音色 / 系统语音（兜底）
// 外部（tts.js / App.vue）只依赖 speakPro / stopSpeakPro / speakingPro 与语音列表接口，改造时不影响调用方。
/* global Audio, crypto, FormData, File */
import { reactive } from 'vue'
import { store } from '../store'

// ============ 引擎元信息 ============
export const TTS_ENGINES = [
  { id: 'glm', name: '🎙️ 智谱 GLM-TTS', tag: '超拟人·真人级（推荐）', desc: '新一代语音大模型，情绪/语气随内容变化，几乎听不出合成感；用你已有的智谱 Key 即可' },
  { id: 'openai', name: '🎨 OpenAI 兼容', tag: 'CosyVoice2 等', desc: '任意 OpenAI 兼容 TTS 接口（硅基流动 CosyVoice2 / 自定义），支持音色克隆' },
  { id: 'edge', name: '🚀 Edge 免费神经', tag: '微软 Neural 音色', desc: '免费无 Key，但部分网络会拦截微软服务器；失败会自动回退系统语音' },
  { id: 'sys', name: '🧠 系统语音', tag: '本机兜底', desc: '浏览器自带语音，无需联网；机械感较强，作为最后兜底' }
]

// ============ 全局朗读状态（设置页可见，便于用户感知是否在播/是否失败）============
export const ttsStatus = reactive({ state: 'idle', msg: '', at: 0 })
function setStatus(state, msg) {
  ttsStatus.state = state
  ttsStatus.msg = msg || ''
  ttsStatus.at = Date.now()
}

// ============ 文本清洗：去掉 Markdown / 代码 / SVG / LaTeX / emoji，只留适合朗读的正文 ============
export function cleanSpeechText(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/~~~[\s\S]*?~~~/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\$[^$]*\$/g, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#*_~>`|]/g, ' ')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s+/g, ' ')
    .trim()
}

// ============ 长文分块：按句子边界切，避免一次请求超长 ============
export function chunkText(text, maxLen = 420) {
  const t = cleanSpeechText(text)
  if (!t) return []
  if (t.length <= maxLen) return [t]
  const parts = []
  let cur = ''
  // 按中文/英文句号、感叹、问号、分号、换行切
  const segs = String(t).split(/(?<=[。！？!?；;\n])/)
  for (const s of segs) {
    if (!s) continue
    if ((cur + s).length > maxLen && cur) {
      parts.push(cur.trim())
      cur = s
    } else {
      cur += s
    }
  }
  if (cur.trim()) parts.push(cur.trim())
  // 若仍有超长单句（无标点），硬切为多个独立分块
  return parts.flatMap((p) => {
    if (p.length <= maxLen) return [p]
    const m = String(p).match(new RegExp('.{1,' + maxLen + '}', 'g')) || []
    return m.map((s) => s.trim()).filter(Boolean)
  })
}

// ============ 统一音频播放器（一次只播一个）============
let _player = { audio: null, url: '' }
export function stopPlayback() {
  const p = _player
  _player = { audio: null, url: '' }
  if (p.audio) { try { p.audio.pause() } catch (e) {} }
  if (p.url) { try { URL.revokeObjectURL(p.url) } catch (e) {} }
}
export function playing() {
  try {
    return !!(_player.audio && !_player.audio.paused && !_player.audio.ended)
  } catch (e) {
    return false
  }
}
// 播放二进制音频；mime 如 audio/wav / audio/mpeg；resolve(true)=正常播完
export function playBytes(bytes, mime) {
  return new Promise((resolve) => {
    try {
      stopPlayback()
      const blob = new Blob([bytes], { type: mime || 'audio/mpeg' })
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      _player = { audio, url }
      audio.onended = () => { stopPlayback(); resolve(true) }
      audio.onerror = () => { stopPlayback(); resolve(false) }
      audio.play().catch(() => { stopPlayback(); resolve(false) })
    } catch (e) {
      stopPlayback()
      resolve(false)
    }
  })
}

// ============ 流式播放器：分块边到边播（解决“文字出来半天才发音”的滞后）============
// speakPro 合成长文时分块请求；第一块音频一到就立刻开始播放，后续块在播放中续入队列，
// 用户听到的“开口时间”= 第一块合成时间，而不是整段合成完的时间。
const _sp = { q: [], playing: false, audio: null, url: '', endCb: null, errCb: null }
export function spClean() {
  if (_sp.url) { try { URL.revokeObjectURL(_sp.url) } catch (e) {} _sp.url = '' }
  _sp.audio = null
}
export function spNext() {
  if (_sp.playing || !_sp.q.length) return
  const it = _sp.q.shift()
  _sp.playing = true
  try {
    const url = URL.createObjectURL(new Blob([it.bytes], { type: it.mime }))
    const a = new Audio(url)
    _sp.audio = a; _sp.url = url
    a.onended = () => {
      spClean(); _sp.playing = false
      if (!_sp.q.length && _sp.endCb) { const cb = _sp.endCb; _sp.endCb = null; _sp.errCb = null; cb() }
      else spNext()
    }
    a.onerror = () => {
      spClean(); _sp.playing = false
      if (_sp.errCb) { const cb = _sp.errCb; _sp.endCb = null; _sp.errCb = null; cb() }
      else spNext()
    }
    a.play().catch(() => {
      spClean(); _sp.playing = false
      if (_sp.errCb) { const cb = _sp.errCb; _sp.endCb = null; _sp.errCb = null; cb() }
      else spNext()
    })
  } catch (e) {
    _sp.playing = false
    if (_sp.errCb) { const cb = _sp.errCb; _sp.endCb = null; _sp.errCb = null; cb() }
    else spNext()
  }
}
export function spEnqueue(bytes, mime) { _sp.q.push({ bytes, mime }); spNext() }
export function spStop() {
  _sp.q = []
  const a = _sp.audio
  _sp.audio = null
  if (a) { try { a.onended = null; a.onerror = null; a.pause() } catch (e) {} }
  spClean()
  _sp.playing = false
  _sp.endCb = null; _sp.errCb = null
}
export function spPlaying() { return !!( _sp.audio && !_sp.audio.paused && !_sp.audio.ended) || _sp.playing }
export function spSetCallbacks(endCb, errCb) { _sp.endCb = endCb; _sp.errCb = errCb }

// ============ ① 智谱 GLM-TTS（超拟人·真人级）============
export const GLM_PRESET_VOICES = [
  { id: 'tongtong', name: '彤彤 · 温柔女声（默认）', emoji: '👩' },
  { id: 'streamer', name: '标准女声', emoji: '🎙️' },
  { id: 'streamer_male', name: '标准男声', emoji: '🎙️' },
  { id: 'doushen_teacher_0', name: '教师音色 0', emoji: '👩‍🏫' },
  { id: 'doushen_teacher_1', name: '教师音色 1', emoji: '👩‍🏫' },
  { id: 'doushen_teacher_2', name: '教师音色 2', emoji: '👩‍🏫' },
  { id: 'doushen_teacher_3', name: '教师音色 3', emoji: '👩‍🏫' },
  { id: 'doushen_teacher_4', name: '教师音色 4', emoji: '👩‍🏫' },
  { id: 'douxin', name: '窦老师 · 磁性男声', emoji: '👨‍🏫' },
  { id: 'xiaochen', name: '小陈', emoji: '👨' },
  { id: 'chuichui', name: '锤锤', emoji: '🧸' },
  { id: 'jam', name: 'Jam', emoji: '🎤' },
  { id: 'kazi', name: 'Kazi', emoji: '🎤' },
  { id: 'douji', name: 'Douji', emoji: '🎤' },
  { id: 'luodo', name: 'Luodo', emoji: '🎤' }
]
// 获取当前生效的智谱 TTS 配置；Key 为空时自动复用「图形增强」里的智谱 Key
export function gmCfg() {
  const c = store.cfg.ttsGm || {}
  let key = String(c.key || '').trim()
  if (!key) {
    const fig = store.cfg.fig || {}
    if (fig.key && /bigmodel|zhipu|glm/i.test(String(fig.url || ''))) key = String(fig.key).trim()
  }
  if (!key) return null
  return {
    key,
    url: String(c.url || 'https://open.bigmodel.cn/api/paas/v4/audio/speech').trim(),
    model: String(c.model || 'glm-tts').trim(),
    voice: String(c.voice || 'tongtong').trim(),
    speed: clampSpeed(store.cfg.ttsRate)
  }
}
// 拉取智谱音色列表（需 Key；失败返回 null）
export async function listGmVoices() {
  const cfg = gmCfg()
  if (!cfg) return null
  try {
    const r = await fetch('https://open.bigmodel.cn/api/paas/v4/voice/list', { headers: { Authorization: 'Bearer ' + cfg.key } })
    if (!r.ok) return null
    const d = await r.json()
    const arr = d.voice_list || []
    if (!arr.length) return null
    const nameOf = {}
    GLM_PRESET_VOICES.forEach((v) => { nameOf[v.id] = v.name })
    return arr.map((v) => ({ id: v.voice || v.voice_name, name: nameOf[v.voice_name] || v.voice_name || v.voice, emoji: '🎙️' }))
  } catch (e) {
    return null
  }
}
// 合成一段智谱语音 → 返回 { ok, msg, bytes?, mime? }
export async function glmSynthesize(text, opts = {}) {
  const cfg = gmCfg()
  if (!cfg) return { ok: false, msg: '未配置智谱 Key（可在设置·语音里填写，或一键复用图形增强 Key）' }
  const voice = opts.voice || cfg.voice
  const speed = clampSpeed(opts.speed != null ? opts.speed : cfg.speed)
  const chunks = chunkText(text, Number(opts.chunkSize) || 380)
  if (!chunks.length) return { ok: false, msg: '没有可朗读的内容' }
  const bytesAll = []
  for (const c of chunks) {
    try {
      const r = await fetch(cfg.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.key },
        body: JSON.stringify({ model: cfg.model, input: c, voice, speed, volume: 1.0, response_format: 'wav' })
      })
      if (!r.ok) {
        const e = await r.json().catch(() => ({}))
        return { ok: false, msg: (e.error && (e.error.message || e.error.code)) || 'HTTP ' + r.status }
      }
      const buf = await r.arrayBuffer()
      bytesAll.push(buf)
      if (opts.onChunk) { try { opts.onChunk(buf) } catch (e) {} }
    } catch (e) {
      return { ok: false, msg: e.message || '网络错误' }
    }
  }
  if (!bytesAll.length) return { ok: false, msg: '合成失败' }
  const total = bytesAll.length === 1 ? bytesAll[0] : concatBuffers(bytesAll)
  return { ok: true, bytes: total, mime: 'audio/wav' }
}
function concatBuffers(buffs) {
  const n = buffs.reduce((a, b) => a + b.byteLength, 0)
  const out = new Uint8Array(n)
  let off = 0
  for (const b of buffs) {
    out.set(new Uint8Array(b), off)
    off += b.byteLength
  }
  return out.buffer
}
export function clampSpeed(r) {
  const n = Number(r)
  if (!n) return 1
  return Math.min(2, Math.max(0.5, n))
}

// ============ ② OpenAI 兼容 TTS（CosyVoice2 / 自定义）============
export const OPENAI_PRESET_VOICES = [
  { id: 'default', name: '默认音色（中文自然）', emoji: '🎙️' },
  { id: 'alloy', name: 'Alloy', emoji: '🎧' },
  { id: 'echo', name: 'Echo', emoji: '🎧' },
  { id: 'fable', name: 'Fable', emoji: '🎧' },
  { id: 'onyx', name: 'Onyx', emoji: '🎧' },
  { id: 'nova', name: 'Nova', emoji: '🎧' },
  { id: 'shimmer', name: 'Shimmer', emoji: '🎧' }
]
export function openaiCfg() {
  const c = store.cfg.ttsOpenAI || {}
  const key = String(c.key || '').trim()
  if (!key) return null
  return {
    key,
    url: buildTtsUrl(c.url),
    model: String(c.model || 'FunAudioLLM/CosyVoice2-0.5B').trim(),
    voice: String(c.voice || 'default').trim(),
    speed: clampSpeed(store.cfg.ttsRate)
  }
}
export function buildTtsUrl(base) {
  let b = String(base || 'https://api.siliconflow.cn/v1').trim().replace(/\/+$/, '')
  if (/\/audio\/speech$/.test(b)) return b
  b = b.replace(/\/chat\/completions$/, '')
  return b + '/audio/speech'
}
export async function openaiSynthesize(text, opts = {}) {
  const cfg = openaiCfg()
  if (!cfg) return { ok: false, msg: '未配置 OpenAI 兼容 Key（设置·语音·OpenAI 兼容）' }
  const voice = opts.voice || cfg.voice
  const speed = clampSpeed(opts.speed != null ? opts.speed : cfg.speed)
  const chunks = chunkText(text, Number(opts.chunkSize) || 380)
  if (!chunks.length) return { ok: false, msg: '没有可朗读的内容' }
  const bytesAll = []
  for (const c of chunks) {
    try {
      const r = await fetch(cfg.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.key },
        body: JSON.stringify({ model: cfg.model, input: c, voice, speed, response_format: 'mp3' })
      })
      if (!r.ok) {
        const e = await r.json().catch(() => ({}))
        return { ok: false, msg: (e.error && (e.error.message || e.error.code)) || 'HTTP ' + r.status }
      }
      const buf = await r.arrayBuffer()
      bytesAll.push(buf)
      if (opts.onChunk) { try { opts.onChunk(buf) } catch (e) {} }
    } catch (e) {
      return { ok: false, msg: e.message || '网络错误' }
    }
  }
  if (!bytesAll.length) return { ok: false, msg: '合成失败' }
  return { ok: true, bytes: bytesAll.length === 1 ? bytesAll[0] : concatBuffers(bytesAll), mime: 'audio/mpeg' }
}

// ============ 音色克隆（CosyVoice2 · OpenAI 兼容，如硅基流动）============
// 上传 3-30 秒参考音频 → 克隆出接近该音色的声音 → 返回可直接用于 /audio/speech 的 voice 名
export async function cloneCosyVoice(file, opts = {}) {
  const cfg = openaiCfg()
  const key = String(opts.key || (cfg && cfg.key) || '').trim()
  if (!key) return { ok: false, msg: '未配置 OpenAI 兼容 Key（推荐硅基流动 cloud.siliconflow.cn）' }
  if (!file) return { ok: false, msg: '请选择参考音频' }
  const model = String(opts.model || (cfg && cfg.model) || 'FunAudioLLM/CosyVoice2-0.5B').trim()
  const base = buildTtsUrl(opts.url || (cfg && cfg.url)).replace(/\/audio\/speech$/, '')
  const name = String(opts.name || ('pet_' + Date.now())).trim().slice(0, 30)
  try {
    const form = new FormData()
    form.append('model', model)
    form.append('customName', name)
    form.append('file', file)
    const r = await fetch(base + '/uploads/audio/voice', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key },
      body: form
    })
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      return { ok: false, msg: (d && (d.message || d.error)) || 'HTTP ' + r.status }
    }
    const d = await r.json().catch(() => ({}))
    return { ok: true, name, voice: model + ':' + name, data: d }
  } catch (err) {
    return { ok: false, msg: err.message || '网络错误' }
  }
}

// ============ 克隆前音频预处理：任意格式 → 标准 WAV（≤maxSeconds 秒、去头尾静音、单声道 24kHz）============
// 很多“李星云.mp3”其实是 MP4/AAC 容器，智谱克隆接口只收 mp3/wav，直接传会被拒。
// 这里统一在浏览器里解码（mp3/wav/m4a/aac/ogg/flac…都能解），重编码为 WAV 再上传，一劳永逸。
export function detectAudioFormat(bytes) {
  if (!bytes || bytes.length < 12) return 'unknown'
  const b = new Uint8Array(bytes)
  const ascii = (i, n) => String.fromCharCode.apply(null, b.slice(i, i + n))
  // WAV: RIFF....WAVE
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE') return 'wav'
  // MP4 / M4A: ftyp box
  if (ascii(4, 4) === 'ftyp') return 'm4a'
  // MP3: ID3 tag or 0xFF Ex sync
  if (ascii(0, 3) === 'ID3') return 'mp3'
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return 'mp3'
  // OGG: OggS
  if (ascii(0, 4) === 'OggS') return 'ogg'
  // AAC ADTS: 0xFF 0xF1/0xF9
  if (b[0] === 0xff && (b[1] === 0xf1 || b[1] === 0xf9)) return 'aac'
  // FLAC: fLaC
  if (ascii(0, 4) === 'fLaC') return 'flac'
  return 'unknown'
}
// 线性重采样（纯函数，便于单测）
export function resampleAudio(data, fromRate, toRate) {
  if (!data || !data.length || fromRate === toRate) return data
  const len = Math.max(1, Math.floor((data.length * toRate) / fromRate))
  const out = new Float32Array(len)
  const ratio = fromRate / toRate
  for (let i = 0; i < len; i++) {
    const pos = i * ratio
    const i0 = Math.floor(pos)
    const i1 = Math.min(i0 + 1, data.length - 1)
    const frac = pos - i0
    out[i] = data[i0] * (1 - frac) + data[i1] * frac
  }
  return out
}
// 找第一段明显人声的起始偏移（跳过开头静音，纯函数）
export function speechStartOffset(data, threshold = 0.012) {
  if (!data || !data.length) return 0
  const step = 512
  for (let i = 0; i < data.length; i += step) {
    let peak = 0
    const end = Math.min(i + step, data.length)
    for (let j = i; j < end; j++) { const v = Math.abs(data[j]); if (v > peak) peak = v }
    if (peak > threshold) return i
  }
  return 0
}
// Float32 通道数据 → 16bit PCM WAV（纯函数，便于单测）
export function audioBufferToWavBytes(channelData, sampleRate) {
  const numCh = channelData.length
  const len = channelData[0] ? channelData[0].length : 0
  const bytesPerSample = 2
  const blockAlign = numCh * bytesPerSample
  const dataSize = len * blockAlign
  const ab = new ArrayBuffer(44 + dataSize)
  const v = new DataView(ab)
  const ws = (off, str) => { for (let i = 0; i < str.length; i++) v.setUint8(off + i, str.charCodeAt(i)) }
  ws(0, 'RIFF'); v.setUint32(4, 36 + dataSize, true); ws(8, 'WAVE')
  ws(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true)
  v.setUint16(22, numCh, true); v.setUint32(24, sampleRate, true)
  v.setUint32(28, sampleRate * blockAlign, true); v.setUint16(32, blockAlign, true); v.setUint16(34, 16, true)
  ws(36, 'data'); v.setUint32(40, dataSize, true)
  let off = 44
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      let s = Math.max(-1, Math.min(1, channelData[c][i]))
      v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      off += 2
    }
  }
  return ab
}
// 主入口：读取 File → 解码 → 单声道 24kHz → 去静音 → 裁剪到 maxSeconds → 返回 { file, format, seconds, sliced }
// 失败返回 { error }。纯浏览器能力，不需要任何后端。
export async function prepareCloneAudio(file, opts = {}) {
  try {
    if (!file || !file.arrayBuffer) return { error: '未选择音频文件' }
    const maxSeconds = Math.min(30, Math.max(5, Number(opts.maxSeconds) || 20))
    const targetRate = Number(opts.sampleRate) || 24000
    const buf = await file.arrayBuffer()
    const format = detectAudioFormat(buf)
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return { error: '当前浏览器不支持音频解码，请换 Chrome/Edge' }
    const ctx = new AC()
    let audioBuf
    try {
      audioBuf = await ctx.decodeAudioData(buf.slice(0))
    } catch (e) {
      try { await ctx.close() } catch (_) {}
      return { error: '音频解码失败（' + (e.message || '无法识别该文件') + '）。请确认文件是有效的 mp3/wav/m4a/ogg 音频。' }
    }
    // 下混到单声道 + 重采样到 24kHz
    const src = audioBuf.getChannelData(0)
    const mono = resampleAudio(src, audioBuf.sampleRate, targetRate)
    // 跳过开头静音
    const start = speechStartOffset(mono, 0.012)
    const totalMax = Math.floor(targetRate * maxSeconds)
    const avail = Math.max(1, mono.length - start)
    const take = Math.min(avail, totalMax)
    const sliced = avail > totalMax
    const chan = mono.subarray(start, start + take)
    const wavBytes = audioBufferToWavBytes([chan], targetRate)
    try { await ctx.close() } catch (e) {}
    const blob = new Blob([wavBytes], { type: 'audio/wav' })
    const f = new File([blob], 'ref_voice_' + Date.now() + '.wav', { type: 'audio/wav' })
    return { file: f, format, seconds: +(take / targetRate).toFixed(1), sliced, startTrim: start }
  } catch (e) {
    return { error: e.message || '音频预处理失败' }
  }
}

// ============ 智谱 GLM-TTS-Clone 音色克隆（用现有智谱 Key，3-30 秒参考音频即可）============
export async function cloneZhipuVoice(file, opts = {}) {
  const gm = store.cfg.ttsGm || {}
  const fig = store.cfg.fig || {}
  let key = String(opts.key || gm.key || '').trim()
  if (!key && fig.key && /bigmodel|zhipu|glm/i.test(String(fig.url || ''))) key = String(fig.key).trim()
  if (!key) return { ok: false, msg: '未配置智谱 Key（设置 → 语音 → 智谱 或 图形增强）' }
  if (!file) return { ok: false, msg: '请选择参考音频' }
  const base = String(opts.url || 'https://open.bigmodel.cn/api/paas/v4').trim().replace(/\/+$/, '').replace(/\/audio\/speech$/, '')
  const name = String(opts.name || ('pet_voice_' + Date.now())).trim().slice(0, 30)
  try {
    // 1) 上传音频 → file_id（purpose=voice-clone-input）
    const form = new FormData()
    form.append('purpose', 'voice-clone-input')
    form.append('file', file)
    const up = await fetch(base + '/files', { method: 'POST', headers: { Authorization: 'Bearer ' + key }, body: form })
    if (!up.ok) {
      const d = await up.json().catch(() => ({}))
      return { ok: false, msg: '音频上传失败：' + ((d && (d.message || d.error)) || 'HTTP ' + up.status) }
    }
    const ud = await up.json().catch(() => ({}))
    const fileId = (ud && (ud.id || (ud.data && ud.data.id))) || ''
    if (!fileId) return { ok: false, msg: '音频上传未返回 file_id' }
    // 2) 克隆音色（3 秒参考音频即可；返回音色 ID 供 GLM-TTS 直接合成）
    // 注意：智谱要求 input（试听音频文本）不能为空，缺了会报 1214 错误
    const input = String(opts.input || '你好，我是你的行测智能助教，很高兴认识你，我会一直陪伴你高效备考。').slice(0, 200)
    const body = { model: 'glm-tts-clone', voice_name: name, file_id: fileId, input, request_id: 'pet_' + Date.now() + '_' + Math.floor(Math.random() * 1e6) }
    if (opts.text) body.text = String(opts.text).slice(0, 200)
    const cl = await fetch(base + '/voice/clone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify(body)
    })
    if (!cl.ok) {
      const d = await cl.json().catch(() => ({}))
      return { ok: false, msg: '音色克隆失败：' + ((d && (d.message || d.error)) || 'HTTP ' + cl.status) }
    }
    const cd = await cl.json().catch(() => ({}))
    const d1 = cd && cd.data ? cd.data : cd
    const voiceId = String((cd && (cd.id || cd.voice || cd.voice_id)) || (d1 && (d1.id || d1.voice || d1.voice_id)) || '').trim()
    if (!voiceId) return { ok: false, msg: '克隆未返回音色 ID' }
    return { ok: true, name, voice: voiceId, preview: String((cd && (cd.preview_audio || cd.preview_url)) || (d1 && (d1.preview_audio || d1.preview_url)) || '') }
  } catch (err) {
    return { ok: false, msg: err.message || '网络错误' }
  }
}

// ============ ③ Edge 免费神经音色（微软 Neural；部分网络会被拦截）============
export const EDGE_PRESET_VOICES = [
  { id: 'zh-CN-XiaoxiaoNeural', name: '晓晓 · 温柔女声', emoji: '👩' },
  { id: 'zh-CN-YunxiNeural', name: '云希 · 阳光男声', emoji: '👨' },
  { id: 'zh-CN-YunjianNeural', name: '云健 · 播音男声', emoji: '🎙️' },
  { id: 'zh-CN-XiaoyiNeural', name: '晓伊 · 甜美女声', emoji: '👧' },
  { id: 'zh-CN-XiaomoNeural', name: '晓墨 · 知性女声', emoji: '👩‍💼' },
  { id: 'zh-CN-XiaoshuangNeural', name: '晓双 · 童声', emoji: '🧒' },
  { id: 'zh-CN-YunyangNeural', name: '云扬 · 新闻男声', emoji: '📰' },
  { id: 'zh-CN-XiaohanNeural', name: '晓涵 · 女播音', emoji: '📰' }
]
const EDGE_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4'
const EDGE_GEC_VER = '1-143.0.3650.75'
const EDGE_WSS = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1'
const EDGE_VOICES_URL = 'https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list'
export async function genEdgeSecMsGec() {
  try {
    const windowsEpoch = 116444736000000000n
    const ticks = BigInt(Date.now()) * 10000n + windowsEpoch
    const fiveMin = 300000n * 10000n
    const rounded = (ticks / fiveMin + 1n) * fiveMin
    const payload = rounded.toString() + EDGE_TOKEN + EDGE_GEC_VER
    const data = new TextEncoder().encode(payload)
    const buf = await crypto.subtle.digest('SHA-256', data)
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch (e) {
    return ''
  }
}
function edgeUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = Math.floor(Math.random() * 16)
    const v = ch === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
function edgeSsml(text, voice, rate = 0, pitch = 0) {
  const esc = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
  return `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'><voice name='${voice}'><prosody pitch='${pitch}Hz' rate='${rate}%' volume='+0%'>${esc}</prosody></voice></speak>`
}
// 拉取微软音色列表（HTTPS 接口通常可用；WS 合成可能被网络拦截）
export async function listEdgeVoices() {
  try {
    const r = await fetch(EDGE_VOICES_URL + '?trustedclienttoken=' + EDGE_TOKEN)
    if (!r.ok) return null
    const arr = await r.json()
    if (!Array.isArray(arr)) return null
    return arr
      .filter((v) => String(v.Locale || '').toLowerCase().startsWith('zh'))
      .map((v) => ({ id: v.ShortName, name: v.FriendlyName || v.ShortName, emoji: /male/i.test(v.Gender || '') ? '👨' : '👩' }))
  } catch (e) {
    return null
  }
}
// 合成一段 Edge 语音（WebSocket 二进制分帧）；被拦截时返回 { ok:false }
export function edgeSynthesize(text, opts = {}) {
  return new Promise((resolve) => {
    const voice = opts.voice || 'zh-CN-XiaoxiaoNeural'
    const rate = Math.round(((Number(opts.rate) || 0.98) - 1) * 100)
    const pitch = Math.round(((Number(opts.pitch) || 0.98) - 1) * 100)
    ;(async () => {
      const sec = await genEdgeSecMsGec()
      if (!sec) return resolve({ ok: false, msg: '生成鉴权失败' })
      const connId = edgeUuid()
      const reqId = edgeUuid()
      const url = EDGE_WSS + '?TrustedClientToken=' + EDGE_TOKEN + '&ConnectionId=' + connId + '&Sec-MS-GEC=' + sec + '&Sec-MS-GEC-Version=' + EDGE_GEC_VER
      let ws = null
      const chunks = []
      const timer = setTimeout(() => { try { ws && ws.close() } catch (e) {} resolve({ ok: false, msg: '连接超时' }) }, 20000)
      try { ws = new WebSocket(url) } catch (e) { clearTimeout(timer); return resolve({ ok: false, msg: '浏览器不支持 WebSocket' }) }
      ws.onopen = () => {
        try {
          const cfg = JSON.stringify({ context: { synthesis: { audio: { metadataoptions: { sentenceBoundaryEnabled: 'false', wordBoundaryEnabled: 'true' }, outputFormat: 'audio-24khz-48kbitrate-mono-mp3' } } } })
          ws.send('X-Timestamp:' + new Date().toISOString() + '\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n' + cfg)
          ws.send('X-Timestamp:' + new Date().toISOString() + '\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\nX-RequestId:' + reqId + '\r\n\r\n' + edgeSsml(cleanSpeechText(text), voice, rate, pitch))
          ws.send('X-Timestamp:' + new Date().toISOString() + '\r\nContent-Type:audio/mpeg\r\nPath:audio\r\nX-RequestId:' + reqId + '\r\n\r\n')
        } catch (e) {
          clearTimeout(timer)
          resolve({ ok: false, msg: e.message })
        }
      }
      ws.onmessage = (ev) => {
        try {
          if (typeof ev.data === 'string') return
          ev.data.arrayBuffer().then((ab) => {
            const buf = new Uint8Array(ab)
            if (buf.length < 2) return
            const hLen = (buf[0] << 8) | buf[1]
            const hdr = new TextDecoder().decode(buf.slice(2, 2 + hLen))
            const body = buf.slice(2 + hLen)
            const path = (hdr.match(/Path:(\S+)/) || [])[1]
            if (path === 'audio') {
              chunks.push(body)
              if (opts.onChunk) { try { opts.onChunk(body.buffer) } catch (e) {} }
            } else if (path === 'turn.end') {
              clearTimeout(timer)
              try { ws.close() } catch (e) {}
              const total = chunks.length === 0 ? null : (chunks.length === 1 ? chunks[0].buffer : concatBuffers(chunks.map((c) => c.buffer)))
              resolve(total ? { ok: true, bytes: total, mime: 'audio/mpeg' } : { ok: false, msg: '未收到音频' })
            }
          }).catch(() => {})
        } catch (e) {}
      }
      ws.onerror = () => {
        clearTimeout(timer)
        resolve({ ok: false, msg: 'Edge 服务被网络拦截（常见于国内网络），请改用智谱/OpenAI 引擎' })
      }
      ws.onclose = () => {
        clearTimeout(timer)
        if (!chunks.length) resolve({ ok: false, msg: '连接被关闭' })
      }
    })()
  })
}

// ============ ④ 系统语音（兜底，保留原逻辑）============
export function sysSpeak(text, opts = {}) {
  try {
    const u = new SpeechSynthesisUtterance(cleanSpeechText(text))
    u.lang = 'zh-CN'
    u.rate = Number(opts.rate) || 0.98
    u.pitch = Number(opts.pitch) || 0.98
    if (opts.onEnd) u.onend = opts.onEnd
    if (opts.onError) u.onerror = opts.onError
    window.speechSynthesis.speak(u)
    return true
  } catch (e) {
    return false
  }
}
export function sysStop() {
  try { window.speechSynthesis.cancel() } catch (e) {}
}
export function sysSpeaking() {
  try { return window.speechSynthesis.speaking || window.speechSynthesis.pending } catch (e) { return false }
}

// ============ 统一入口 ============
// speakPro(text, { voice, rate, pitch, speed, onEnd, onError }) —— 按 store.cfg.ttsMode 分发
export async function speakPro(text, opts = {}) {
  stopSpeakPro()
  const mode = store.cfg.ttsMode || 'glm'
  const t = cleanSpeechText(text)
  if (!t) { if (opts.onEnd) opts.onEnd(); return { ok: false, msg: 'empty' } }
  setStatus('speaking', '正在朗读…')
  try {
    if (mode === 'openai') {
      // 流式：分块边到边播，第一块一到就开口
      const r = await openaiSynthesize(t, { voice: opts.voice, speed: opts.speed, chunkSize: 120, onChunk: (buf) => spEnqueue(buf, 'audio/mpeg') })
      return await streamFinish(r, opts)
    }
    if (mode === 'edge') {
      const r = await edgeSynthesize(t, { voice: opts.voice || store.cfg.ttsEdgeVoice, rate: opts.rate, pitch: opts.pitch })
      return finishSpeak(r, opts)
    }
    if (mode === 'sys') {
      const ok = sysSpeak(t, { rate: opts.rate, pitch: opts.pitch, onEnd: opts.onEnd, onError: opts.onError })
      setStatus(ok ? 'done' : 'error', ok ? '✅ 系统语音播放中' : '❌ 系统语音播放失败')
      return { ok }
    }
    // 默认 glm：流式分块播放；失败自动回退系统语音，保证「一定读得出来」
    const r = await glmSynthesize(t, { voice: opts.voice, speed: opts.speed, chunkSize: 120, onChunk: (buf) => spEnqueue(buf, 'audio/wav') })
    if (r.ok) return await streamFinish(r, opts)
    setStatus('error', '❌ ' + r.msg)
    if (opts.onError) opts.onError(r.msg)
    const fallback = sysSpeak(t, { rate: opts.rate, pitch: opts.pitch, onEnd: opts.onEnd, onError: opts.onError })
    setStatus(fallback ? 'done' : 'error', fallback ? '⚠️ 真人引擎失败，已回退系统语音' : '❌ 朗读失败')
    return { ok: fallback, msg: r.msg, fallback: true }
  } catch (e) {
    setStatus('error', '❌ ' + e.message)
    if (opts.onError) opts.onError(e.message)
    const fallback = sysSpeak(t, { rate: opts.rate, pitch: opts.pitch, onEnd: opts.onEnd, onError: opts.onError })
    return { ok: fallback, msg: e.message, fallback: true }
  }
}
// 流式完成：等待队列播完（或播放失败）再回调 onEnd/onError
function streamFinish(r, opts) {
  if (!r.ok) {
    setStatus('error', '❌ ' + r.msg)
    if (opts.onError) opts.onError(r.msg)
    return Promise.resolve(r)
  }
  return new Promise((resolve) => {
    let done = false
    const finish = (ok) => {
      if (done) return
      done = true
      setStatus(ok ? 'done' : 'error', ok ? '✅ 真人音色播放完成' : '❌ 播放失败（浏览器拦截自动播放）')
      if (opts.onEnd) opts.onEnd()
      resolve({ ok })
    }
    spSetCallbacks(() => finish(true), () => finish(false))
  })
}
async function finishSpeak(r, opts) {
  if (!r.ok) {
    setStatus('error', '❌ ' + r.msg)
    if (opts.onError) opts.onError(r.msg)
    return r
  }
  const played = await playBytes(r.bytes, r.mime)
  setStatus(played ? 'done' : 'error', played ? '✅ 真人音色播放完成' : '❌ 播放失败（浏览器拦截自动播放）')
  if (opts.onEnd) opts.onEnd()
  return { ok: played }
}
export function stopSpeakPro() {
  stopPlayback()
  spStop()
  sysStop()
}
export function speakingPro() {
  return playing() || spPlaying() || sysSpeaking()
}

