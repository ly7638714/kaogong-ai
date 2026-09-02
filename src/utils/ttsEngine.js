// ttsEngine.js —— 真人级 TTS 引擎（去掉「AI 味」的核心）
// 四引擎统一分发：智谱 GLM-TTS（超拟人·真人级，默认） / OpenAI 兼容（CosyVoice2） / Edge 免费神经音色 / 系统语音（兜底）
// 外部（tts.js / App.vue）只依赖 speakPro / stopSpeakPro / speakingPro 与语音列表接口，改造时不影响调用方。
/* global Audio, crypto, FormData, File, atob */
import { reactive } from 'vue'
import { store } from '../store'
import { recordCost, getTtsPrice, getCloneFee, beginCost, getBudget, todaySpend } from './costTrack'
import { showToast } from './toast'
import { ttsCacheKey, ttsCacheGet, ttsCacheSet } from './ttsCache'
import { cleanSpeechText, chunkForTts } from './tts/clean'
import { smoothWavBytes } from './tts/wav'
// 批次6B拆分：纯函数移至 tts/ 子模块，此处回导出保持既有 import 路径兼容
export { symbolsToChinese, cleanSpeechText, chunkText, chunkForTts } from './tts/clean'
export { smoothWavBytes } from './tts/wav'

// ============ 引擎元信息 ============
// free=true 表示完全免费、无需任何 Key；其余为真人级付费引擎（按字符计费，新用户通常有免费额度）
export const TTS_ENGINES = [
  { id: 'glm', name: '🎙️ 智谱 GLM-TTS', tag: '超拟人·真人级（推荐）', free: false, desc: '新一代语音大模型，情绪/语气随内容起伏，几乎听不出合成感；用你已有的智谱 Key 即可（open.bigmodel.cn 注册有免费额度）。单价约 ¥0.02/次。' },
  { id: 'dash', name: '🍊 阿里百炼 Qwen3-TTS', tag: '廉价真人·实测可用', free: false, desc: '官方 ¥0.8/万字符（≈0.08 元/千字），中文自然、支持自然语言"自定义音色"；用通义 DashScope Key 即可（bailian.console.aliyun.com 新用户有试用额度）。' },
  { id: 'openai', name: '🎨 OpenAI 兼容', tag: 'CosyVoice2 等', free: false, desc: '任意 OpenAI 兼容 TTS 接口（如硅基流动 CosyVoice2、本地 vLLM），支持上传音频克隆你的专属音色；需自备对应 Key/服务地址。' },
  { id: 'edge', name: '🚀 Edge 免费神经', tag: '微软 Neural · 免费', free: true, desc: '完全免费、无需任何 Key！微软神经网络音色（含晓晓/云扬等 200+ 种），音质够用；缺点是部分网络会拦截微软服务器，此时会自动回退系统语音。' },
  { id: 'sys', name: '🧠 系统语音', tag: '本机兜底 · 免费', free: true, desc: '浏览器/系统自带语音，完全免费、无需联网；机械感较强，一般作为真人引擎不可用时的最后兜底。' }
]

// ============ 全局朗读状态（设置页可见，便于用户感知是否在播/是否失败）============
export const ttsStatus = reactive({ state: 'idle', msg: '', at: 0 })
function setStatus(state, msg) {
  ttsStatus.state = state
  ttsStatus.msg = msg || ''
  ttsStatus.at = Date.now()
}

export async function slideSynthesize(chunks, worker, onChunk, W = 4) {
  const results = []
  let nextReq = 0
  let nextEmit = 0
  let inFlight = 0
  let firstErr = ''
  let resolveDone
  const done = new Promise((r) => { resolveDone = r })
  const bytesAll = []
  const emit = () => {
    while (results[nextEmit] !== undefined) {
      const buf = results[nextEmit++]
      if (buf) {
        bytesAll.push(buf)
        if (onChunk) { try { onChunk(buf) } catch (e) {} }
      }
    }
  }
  const pump = () => {
    while (inFlight < W && nextReq < chunks.length) {
      const idx = nextReq++
      inFlight++
      Promise.resolve()
        .then(() => worker(chunks[idx]))
        .then((buf) => { results[idx] = buf })
        .catch((e) => { if (!firstErr) firstErr = e.message || '网络错误'; results[idx] = null })
        .finally(() => { inFlight--; emit(); pump(); if (inFlight === 0 && nextReq >= chunks.length) resolveDone() })
    }
  }
  pump()
  await done
  return { bytesAll, firstErr }
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
      // 单段播放（试音/回退）也走 WAV 平滑：去掉 GLM 开头的提示音“嘟嘟”，保证所有入口一致
      const data = /wav/i.test(mime || '') ? smoothWavBytes(bytes) : bytes
      const blob = new Blob([data], { type: mime || 'audio/mpeg' })
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

// ============ WAV 平滑：正确解析块 + 去开头纯音(嘟嘟)/静音 + 淡入淡出 ============
// 智谱 GLM-TTS 的 WAV 结构特殊：data 块前有 AIGC/LIST 元数据块（data 块标记是 AIGC 不是 data），
// 且每段音频开头都有“嘟嘟 叮叮”纯音提示音。这里统一：①按块解析出真正的 data；②去掉开头纯音与静音；
// ③去掉结尾静音；④淡入淡出；⑤重建为标准 WAV（丢弃元数据）。
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
export function spEnqueue(bytes, mime) { _sp.q.push({ bytes: /wav/i.test(mime) ? smoothWavBytes(bytes) : bytes, mime }); spNext() }
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

// ============ 无缝流式播放器（Web Audio 精确调度，采样点级无缝，零卡顿）============
// 旧播放器每个分块单独建 Audio 元素，块间切换有加载/启动空隙 → 感觉卡顿。
// 这里把每个分块解码成 AudioBuffer，按 ctx.currentTime 时间轴首尾精确衔接播放，像真人说话一样无缝隙。
let _gap = { ctx: null, started: false, nextAt: 0, queue: [], active: 0, stopping: false, endCb: null, errCb: null, fallback: false, token: 0 }
// 解码串行链：decodeAudioData 是异步的，多个分块若并发解码会乱序完成，
// 导致「后一块先开播、前一块解码完又叠加上来」（上一句没读完就响下一句）。
// 用 promise 链把「解码+调度」严格串行化，保证永远按分块顺序无缝衔接。
let _gapChain = Promise.resolve()
function gapCtx() {
  if (_gap.ctx) return _gap.ctx
  try {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) { _gap.fallback = true; return null }
    _gap.ctx = new AC()
  } catch (e) { _gap.fallback = true; return null }
  return _gap.ctx
}
export function gapAvailable() {
  return !!(window.AudioContext || window.webkitAudioContext)
}
// 在用户手势内同步创建/恢复 AudioContext（保证 gapless 能出声；异步创建会被浏览器挂起为 suspended）
export function gapEnsure() {
  const ctx = gapCtx()
  if (ctx && ctx.state === 'suspended') { try { ctx.resume().catch(() => {}) } catch (e) {} }
  return ctx
}
// 首次用户手势（点击/触摸）预创建 AudioContext，之后所有朗读（含自动朗读）都能无缝出声
export function gapInitOnGesture() {
  if (typeof window === 'undefined') return
  const kick = () => {
    gapEnsure()
    try { window.removeEventListener('pointerdown', kick); window.removeEventListener('keydown', kick) } catch (e) {}
  }
  try { window.addEventListener('pointerdown', kick, { once: true }); window.addEventListener('keydown', kick, { once: true }) } catch (e) {}
}
function gapBytes(buf) {
  if (buf instanceof ArrayBuffer) return buf
  if (ArrayBuffer.isView(buf)) return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  return buf
}
// 入队：立即并行解码（不等上一块播完），调度仍严格串行 → 后续块提前就绪，块间断流更少、首句更快
export function gaplessEnqueue(bytes, mime) {
  const token = _gap.token
  const dec = gapDecode(bytes, mime)
  _gapChain = _gapChain.then(async () => {
    if (token !== _gap.token || _gap.stopping) return // 已停止/新一轮朗读 → 丢弃残留分块，防止叠音
    const audioBuf = await dec
    if (token !== _gap.token || _gap.stopping) return
    gapStart(audioBuf)
  }).catch(() => {})
  return _gapChain
}
// 解码（并行）：WAV 先平滑去开头提示音/静音；Web Audio 不可用/自动播放被拦/解码失败 → null（跳过该块不中断）
async function gapDecode(bytes, mime) {
  try {
    const ctx = gapCtx()
    if (!ctx || _gap.fallback) { _gap.fallback = true; return null }
    if (ctx.state === 'suspended') { try { await ctx.resume() } catch (e) {} }
    if (ctx.state !== 'running') { _gap.fallback = true; return null }
    const data = /wav/i.test(mime || '') ? smoothWavBytes(bytes) : bytes
    return await ctx.decodeAudioData(gapBytes(data).slice(0))
  } catch (e) {
    return null
  }
}
// 调度（串行）：按 AudioContext 时间轴首尾精确衔接，像真人说话一样无缝隙
function gapStart(audioBuf) {
  if (!audioBuf || _gap.stopping) return
  const ctx = _gap.ctx
  if (!ctx || _gap.fallback) return
  try {
    _gap.queue.push(audioBuf)
    _gap.active++
    if (!_gap.started) {
      _gap.started = true
      _gap.nextAt = ctx.currentTime + 0.015
    }
    const src = ctx.createBufferSource()
    src.buffer = audioBuf
    src.connect(ctx.destination)
    src.start(_gap.nextAt)
    _gap.nextAt += audioBuf.duration
    src.onended = () => {
      _gap.active--
      if (_gap.active <= 0) _gap.queue = []
      if (_gap.active <= 0 && _gap.endCb && !_gap.stopping) {
        const cb = _gap.endCb; _gap.endCb = null; _gap.errCb = null
        cb()
      }
    }
  } catch (e) {
    _gap.active = Math.max(0, _gap.active - 1)
  }
}
export function gaplessStop() {
  _gap.token++
  _gapChain = Promise.resolve()
  _gap.stopping = true
  try { if (_gap.ctx) _gap.ctx.close().catch(() => {}) } catch (e) {}
  _gap.ctx = null
  _gap.started = false
  _gap.nextAt = 0
  _gap.queue = []
  _gap.active = 0
  _gap.endCb = null
  _gap.errCb = null
  _gap.stopping = false
  _gap.fallback = false
}
export function gaplessPlaying() {
  return !!(_gap.ctx && _gap.ctx.state === 'running' && _gap.active > 0)
}
export function gaplessSetCallbacks(endCb, errCb) { _gap.endCb = endCb; _gap.errCb = errCb }

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
// 克隆音色内置显示名（智谱账号不支持改名，这里把克隆音色在应用内统一显示为中文名，直接内置、无需用户二次设置）
const CLONE_VOICE_DISPLAY = {
  'lixingyun_v_1787930497537': '李星云',
  'a6d7ba90-7cd6-5ef6-9f37-d259112f8be1': '李星云',
  '姬如雪声线_mtdxfni0': '姬如雪',
  '18a24e59-6e8c-57bd-aeb8-6584c7a7ada2': '姬如雪',
  'zhangruonan_mtdytfmo': '章若楠',
  '83eac18d-fd6a-531b-9a71-67b0e6d340ee': '章若楠'
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
    return arr.map((v) => ({
      id: v.voice || v.voice_name,
      name: nameOf[v.voice_name] || CLONE_VOICE_DISPLAY[v.voice_name] || CLONE_VOICE_DISPLAY[v.voice] || v.voice_name || v.voice,
      emoji: '🎙️'
    }))
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
  const chunks = chunkForTts(text, Number(opts.chunkSize) || 380, Number(opts.firstChunkSize) || 0)
  if (!chunks.length) return { ok: false, msg: '没有可朗读的内容' }
  try { beginCost({ feature: 'tts', provider: 'glm', model: cfg.model || 'glm-tts', kind: 'audio' }) } catch (e) {}
  // 滑动窗口预取：第一块立即发出（开口更快），最多 3 个请求在途（更稳、衔接更顺）
  const { bytesAll, firstErr } = await slideSynthesize(
    chunks,
    async (c) => {
      const r = await fetch(cfg.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.key },
        body: JSON.stringify({ model: cfg.model, input: c, voice, speed, volume: 1.0, response_format: 'wav' })
      })
      if (!r.ok) {
        const e = await r.json().catch(() => ({}))
        throw new Error((e.error && (e.error.message || e.error.code)) || 'HTTP ' + r.status)
      }
      return await r.arrayBuffer()
    },
    opts.onChunk
  )
  if (!bytesAll.length) return { ok: false, msg: firstErr || '合成失败' }
  const total = bytesAll.length === 1 ? bytesAll[0] : concatBuffers(bytesAll)
  const chars = chunks.join('').length
  try {
    recordCost({ feature: 'tts', provider: 'glm', model: cfg.model || 'glm-tts', cost: Math.round((chars / 1000) * getTtsPrice('glm') * 100000) / 100000, note: chars + ' 字' })
  } catch (e) {}
  ttsAddForEngine(chars)
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
  const chunks = chunkForTts(text, Number(opts.chunkSize) || 380, Number(opts.firstChunkSize) || 0)
  if (!chunks.length) return { ok: false, msg: '没有可朗读的内容' }
  // 滑动窗口预取：第一块立即发出（开口更快），最多 3 个请求在途（更稳、衔接更顺）
  const { bytesAll, firstErr } = await slideSynthesize(
    chunks,
    async (c) => {
      const r = await fetch(cfg.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.key },
        body: JSON.stringify({ model: cfg.model, input: c, voice, speed, response_format: 'mp3' })
      })
      if (!r.ok) {
        const e = await r.json().catch(() => ({}))
        throw new Error((e.error && (e.error.message || e.error.code)) || 'HTTP ' + r.status)
      }
      return await r.arrayBuffer()
    },
    opts.onChunk
  )
  if (!bytesAll.length) return { ok: false, msg: firstErr || '合成失败' }
  const chars = chunks.join('').length
  ttsAddForEngine(chars)
  return { ok: true, bytes: bytesAll.length === 1 ? bytesAll[0] : concatBuffers(bytesAll), mime: 'audio/mpeg' }
}

// ============ ③ 阿里百炼 TTS（Qwen3-TTS·廉价真人，v3.8.91 实测可用）============
// 端点与模型已用真实 Key 实测（2026-09-02）：qwen3-tts-instruct-flash 官方价 ¥0.8/万字符。
// 原生 DashScope multimodal-generation 端点（OpenAI 兼容 /audio/speech 当前返回 404，不用）。
// 官方音色清单（阿里云百炼《Qwen-TTS 音色列表》，2026-09-02 抓取核实）。
// models: 该音色在哪些非实时模型系列可用 —— 'instruct'=qwen3-tts-instruct-flash 系列，'flash'=qwen3-tts-flash 系列。
// 用户选的模型含 instruct 时仅显示 instruct 音色；含 flash 时显示全部 flash 音色（含方言/外语）。
export const DASH_PRESET_VOICES = [
  { id: '', name: '（留空=官方默认）', emoji: '🎙️', models: ['instruct', 'flash'] },
  { id: 'Cherry', name: '芊悦 · 阳光亲切小姐姐（女）', emoji: '👩', models: ['instruct', 'flash'] },
  { id: 'Serena', name: '苏瑶 · 温柔小姐姐（女）', emoji: '👩', models: ['instruct', 'flash'] },
  { id: 'Ethan', name: '晨煦 · 阳光温暖男声（带北方口音）', emoji: '👨', models: ['instruct', 'flash'] },
  { id: 'Chelsie', name: '千雪 · 二次元虚拟女友（女）', emoji: '🎀', models: ['instruct', 'flash'] },
  { id: 'Momo', name: '茉兔 · 撒娇搞怪逗你开心（女）', emoji: '🐰', models: ['instruct', 'flash'] },
  { id: 'Vivian', name: '十三 · 拽拽可爱小暴躁（女）', emoji: '😼', models: ['instruct', 'flash'] },
  { id: 'Moon', name: '月白 · 率性帅气（男）', emoji: '🧑', models: ['instruct', 'flash'] },
  { id: 'Maia', name: '四月 · 知性与温柔碰撞（女）', emoji: '🌷', models: ['instruct', 'flash'] },
  { id: 'Kai', name: '凯 · 耳朵的一场 SPA（男）', emoji: '🎧', models: ['instruct', 'flash'] },
  { id: 'Nofish', name: '不吃鱼 · 不会翘舌音的设计师（男）', emoji: '🎨', models: ['instruct', 'flash'] },
  { id: 'Bella', name: '萌宝 · 小萝莉（女）', emoji: '🧒', models: ['instruct', 'flash'] },
  { id: 'Eldric Sage', name: '沧明子 · 沉稳睿智老者（男）', emoji: '🧓', models: ['instruct', 'flash'] },
  { id: 'Mia', name: '乖小妹 · 温顺乖巧（女）', emoji: '🐱', models: ['instruct', 'flash'] },
  { id: 'Mochi', name: '沙小弥 · 聪明伶俐小大人（男）', emoji: '🧒', models: ['instruct', 'flash'] },
  { id: 'Bellona', name: '燕铮莺 · 声音洪亮御姐（女）', emoji: '🔥', models: ['instruct', 'flash'] },
  { id: 'Vincent', name: '田叔 · 沙哑烟嗓江湖豪情（男）', emoji: '🥃', models: ['instruct', 'flash'] },
  { id: 'Bunny', name: '萌小姬 · 萌属性小萝莉（女）', emoji: '🐰', models: ['instruct', 'flash'] },
  { id: 'Neil', name: '阿闻 · 专业新闻主持人字正腔圆（男）', emoji: '🎙️', models: ['instruct', 'flash'] },
  { id: 'Elias', name: '墨讲师 · 学科严谨会叙事（女）', emoji: '👩‍🏫', models: ['instruct', 'flash'] },
  { id: 'Arthur', name: '徐大爷 · 质朴嗓音老者（男）', emoji: '🧓', models: ['instruct', 'flash'] },
  { id: 'Nini', name: '邻家妹妹 · 软黏甜妹（女）', emoji: '🍡', models: ['instruct', 'flash'] },
  { id: 'Seren', name: '小婉 · 温和舒缓助眠（女）', emoji: '🌙', models: ['instruct', 'flash'] },
  { id: 'Pip', name: '顽屁小孩 · 调皮童真（男）', emoji: '🧒', models: ['instruct', 'flash'] },
  { id: 'Stella', name: '少女阿月 · 迷糊少女（女）', emoji: '🌟', models: ['instruct', 'flash'] },
  // ——— 以下仅 qwen3-tts-flash 系列支持（含方言/外语）———
  { id: 'Jennifer', name: '詹妮弗 · 电影质感美语女声（女·外语）', emoji: '🎬', models: ['flash'] },
  { id: 'Ryan', name: '甜茶 · 戏感炸裂（男·外语）', emoji: '🎭', models: ['flash'] },
  { id: 'Katerina', name: '卡捷琳娜 · 御姐韵律（女·外语）', emoji: '💃', models: ['flash'] },
  { id: 'Aiden', name: '艾登 · 美语大男孩（男·外语）', emoji: '🍳', models: ['flash'] },
  { id: 'Bodega', name: '博德加 · 热情西班牙大叔（男·外语）', emoji: '🇪🇸', models: ['flash'] },
  { id: 'Sonrisa', name: '索尼莎 · 热情拉美大姐（女·外语）', emoji: '🌮', models: ['flash'] },
  { id: 'Alek', name: '阿列克 · 战斗民族冷与暖（男·外语）', emoji: '🇷🇺', models: ['flash'] },
  { id: 'Dolce', name: '多尔切 · 慵懒意大利大叔（男·外语）', emoji: '🇮🇹', models: ['flash'] },
  { id: 'Sohee', name: '素熙 · 韩国欧尼（女·外语）', emoji: '🇰🇷', models: ['flash'] },
  { id: 'Ono Anna', name: '小野杏 · 鬼灵精怪青梅（女·外语）', emoji: '🇯🇵', models: ['flash'] },
  { id: 'Lenn', name: '莱恩 · 德国青年（男·外语）', emoji: '🇩🇪', models: ['flash'] },
  { id: 'Emilien', name: '埃米尔安 · 法国大哥哥（男·外语）', emoji: '🇫🇷', models: ['flash'] },
  { id: 'Andre', name: '安德雷 · 磁性沉稳男（男·外语）', emoji: '🎙️', models: ['flash'] },
  { id: 'Radio Gol', name: '拉迪奥·戈尔 · 足球诗人（男·外语）', emoji: '⚽', models: ['flash'] },
  { id: 'Jada', name: '阿珍 · 风风火火沪上阿姐（女）', emoji: '🥟', models: ['flash'] },
  { id: 'Dylan', name: '晓东 · 北京胡同少年（男）', emoji: '🏮', models: ['flash'] },
  { id: 'Li', name: '老李 · 耐心南京瑜伽老师（男）', emoji: '🧘', models: ['flash'] },
  { id: 'Marcus', name: '秦川 · 老陕（男）', emoji: '🍜', models: ['flash'] },
  { id: 'Roy', name: '阿杰 · 诙谐闽南哥仔（男）', emoji: '🍵', models: ['flash'] },
  { id: 'Peter', name: '李彼得 · 天津相声捧哏（男）', emoji: '🥠', models: ['flash'] },
  { id: 'Sunny', name: '晴儿 · 甜到心里的川妹子（女）', emoji: '🌶️', models: ['flash'] },
  { id: 'Eric', name: '程川 · 跳脱市井成都男（男）', emoji: '🐼', models: ['flash'] },
  { id: 'Rocky', name: '阿强 · 幽默粤语阿强（男）', emoji: '🍊', models: ['flash'] },
  { id: 'Kiki', name: '阿清 · 甜美港妹闺蜜（女）', emoji: '🍡', models: ['flash'] }
]
export function dashVoicesForModel(model) {
  const m = String(model || 'qwen3-tts-instruct-flash').toLowerCase()
  const mk = m.includes('instruct') ? 'instruct' : (m.includes('flash') ? 'flash' : 'instruct')
  return DASH_PRESET_VOICES.filter((v) => (v.models || ['instruct', 'flash']).includes(mk))
}
// 百炼 TTS 模型列表（按发布时间 最新→旧 排序；数据来自阿里云百炼官方模型页 2026-09-02 核实）
export const DASH_MODELS = [
  { id: 'qwen3-tts-instruct-flash', pub: '2026-01', note: '指令式·支持自然语言自定义音色（推荐）' },
  { id: 'qwen3-tts-flash', pub: '2025-11', note: '含方言/外语音色（如 Dylan/Kiki 等）' },
  { id: 'qwen-tts', pub: '2025-05', note: '旧版稳定模型' }
]
export function dashCfg() {
  const c = store.cfg.ttsDash || {}
  let key = String(c.key || '').trim()
  if (!key) {
    // 复用图形增强 / 视觉里的通义 DashScope Key（同平台）
    const fig = store.cfg.fig || {}
    const vis = store.cfg.vision || {}
    if (String(fig.url || '').includes('dashscope.aliyuncs.com')) key = String(fig.key || '').trim()
    else if (String(vis.url || '').includes('dashscope.aliyuncs.com')) key = String(vis.key || '').trim()
  }
  if (!key) return null
  return {
    key,
    url: String(c.url || 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation').trim(),
    model: String(c.model || 'qwen3-tts-instruct-flash').trim(),
    voice: String(c.voice || '').trim(),
    speed: clampSpeed(store.cfg.ttsRate)
  }
}
// 合成一段百炼语音 → { ok, msg, bytes?, mime? }（mp3）
export async function dashSynthesize(text, opts = {}) {
  const cfg = dashCfg()
  if (!cfg) return { ok: false, msg: '未配置通义 DashScope Key（可在 设置·语音·阿里百炼 填写，或复用图形增强/视觉里的通义 Key）' }
  const voice = opts.voice != null ? opts.voice : cfg.voice
  // 自定义音色（自然语言指令式，实测可用）：当传入 voiceCustom 时优先用 voice_design，
  // 不再固定某预设音色，实现「自定义 + 多角色」而不依赖本账号未开通的 qwen3-tts-vc/vd 模型。
  const voiceCustom = String((opts.voiceCustom != null ? opts.voiceCustom : cfg.voiceCustom) || '').trim()
  const useCustom = voiceCustom && cfg.model.includes('instruct')
  const chunks = chunkForTts(text, Number(opts.chunkSize) || 380, Number(opts.firstChunkSize) || 0)
  if (!chunks.length) return { ok: false, msg: '没有可朗读的内容' }
  try { beginCost({ feature: 'tts', provider: 'dash', model: cfg.model, kind: 'audio' }) } catch (e) {}
  const { bytesAll, firstErr } = await slideSynthesize(
    chunks,
    async (c) => {
      const body = { model: cfg.model, input: { text: c }, parameters: { format: 'mp3' } }
      if (useCustom) body.parameters.voice_design = voiceCustom
      else if (voice) body.input.voice = voice
      const r = await fetch(cfg.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.key },
        body: JSON.stringify(body)
      })
      if (!r.ok) {
        const e = await r.json().catch(() => ({}))
        throw new Error((e.message) || 'HTTP ' + r.status)
      }
      const d = await r.json()
      const out = d.output && d.output.audio
      if (!out) throw new Error('未返回音频')
      if (out.data) return base64ToBytes(out.data)
      if (out.url) {
        const ar = await fetch(out.url)
        if (!ar.ok) throw new Error('音频下载失败 ' + ar.status)
        return await ar.arrayBuffer()
      }
      throw new Error('音频字段缺失')
    },
    opts.onChunk
  )
  if (!bytesAll.length) return { ok: false, msg: firstErr || '合成失败' }
  const chars = chunks.join('').length
  try {
    recordCost({ feature: 'tts', provider: 'dash', model: cfg.model, cost: Math.round((chars / 1000) * getTtsPrice('dash') * 100000) / 100000, note: chars + ' 字' })
  } catch (e) {}
  ttsAddForEngine(chars)
  return { ok: true, bytes: bytesAll.length === 1 ? bytesAll[0] : concatBuffers(bytesAll), mime: 'audio/mpeg' }
}
function base64ToBytes(b64) {
  const bin = atob(String(b64 || ''))
  const u = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i)
  return u.buffer
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
      const em = errMsg(d)
      return { ok: false, msg: em || 'HTTP ' + r.status }
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

// 智谱 GLM-ASR：把参考音频转成文字（克隆时传给 text，避免克隆音色“复读参考音频开头内容”）
async function zhipuAsr(file, key) {
  try {
    const bytes = await file.arrayBuffer()
    const form = new FormData()
    form.append('file', new Blob([bytes], { type: file.type || 'audio/wav' }), 'ref_voice.wav')
    form.append('model', 'glm-asr')
    form.append('language', 'zh')
    const r = await fetch('https://open.bigmodel.cn/api/paas/v4/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key },
      body: form
    })
    if (!r.ok) return ''
    const d = await r.json().catch(() => ({}))
    return ((d.segments || []).map((s) => s.text).join('') || '').trim()
  } catch (e) {
    return ''
  }
}

// 统一解析各家 API 错误（兼容 {error:{message,code}} / {error:'...'} / {message:'...'}）
function errMsg(d) {
  if (!d) return ''
  if (d.error && typeof d.error === 'object') return d.error.message || d.error.code || ''
  if (typeof d.error === 'string') return d.error
  return d.message || ''
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
    try { beginCost({ feature: 'clone', provider: 'glm', model: 'glm-tts-clone', kind: 'audio' }) } catch (e) {}
    // 1) 上传音频（purpose=voice-clone-input）与参考音频文字转写【并行】执行，上传不会被转写拖住
    let text = String(opts.text || '').trim()
    const form = new FormData()
    form.append('purpose', 'voice-clone-input')
    form.append('file', file)
    const upPromise = fetch(base + '/files', { method: 'POST', headers: { Authorization: 'Bearer ' + key }, body: form })
    const asrPromise = text ? Promise.resolve(text) : zhipuAsr(file, key)
    let up = await upPromise
    // 上传失败自动重试 1 次（网络抖动）
    if (!up.ok) {
      const form2 = new FormData()
      form2.append('purpose', 'voice-clone-input')
      form2.append('file', file)
      await new Promise((r) => setTimeout(r, 1200))
      up = await fetch(base + '/files', { method: 'POST', headers: { Authorization: 'Bearer ' + key }, body: form2 }).catch(() => null)
    }
    const asrText = await asrPromise
    if (text || asrText) text = String(asrText || text || '').trim()
    if (!up || !up.ok) {
      const d = up ? await up.json().catch(() => ({})) : {}
      const em = errMsg(d)
      return { ok: false, msg: '音频上传失败（已重试 1 次）：' + (em || (up ? 'HTTP ' + up.status : '网络错误')) + '。请检查网络与 API Key，或换 CosyVoice2 后端重试。' }
    }
    const ud = await up.json().catch(() => ({}))
    const fileId = (ud && (ud.id || (ud.data && ud.data.id))) || ''
    if (!fileId) return { ok: false, msg: '音频上传未返回 file_id' }
    // 2) 克隆音色（3 秒参考音频即可；返回音色 ID 供 GLM-TTS 直接合成）
    // 注意：智谱要求 input（试听音频文本）不能为空，缺了会报 1214 错误
    const input = String(opts.input || '你好，我是你的行测智能助教，很高兴认识你，我会一直陪伴你高效备考。').slice(0, 200)
    // text = 参考音频的文字转录（已在并行阶段得到），避免克隆音色“复读参考音频开头内容（英文提示语等）”
    // voice_name 必须唯一：智谱拒绝重名（报 1214 音色名称已存在），这里加时间戳后缀保证不冲突（显示名仍用 name）
    const voiceName = name + '_' + Date.now().toString(36)
    const body = { model: 'glm-tts-clone', voice_name: voiceName, file_id: fileId, input, request_id: 'pet_' + Date.now() + '_' + Math.floor(Math.random() * 1e6) }
    if (text) body.text = String(text).slice(0, 200)
    const cl = await fetch(base + '/voice/clone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify(body)
    })
    if (!cl.ok) {
      const d = await cl.json().catch(() => ({}))
      const em = errMsg(d)
      return { ok: false, msg: '音色克隆失败：' + (em || 'HTTP ' + cl.status) }
    }
    const cd = await cl.json().catch(() => ({}))
    const d1 = cd && cd.data ? cd.data : cd
    const voiceId = String((cd && (cd.id || cd.voice || cd.voice_id)) || (d1 && (d1.id || d1.voice || d1.voice_id)) || '').trim()
    if (!voiceId) return { ok: false, msg: '克隆未返回音色 ID' }
    try { recordCost({ feature: 'clone', provider: 'glm', model: 'glm-tts-clone', cost: getCloneFee(), note: '音色克隆：' + name }) } catch (e) {}
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

// ============ 真人朗读·省钱护栏（v3.8.90 语音系统重构）============
// 目标：真人感不丢、普通用户也不怕超支 ——
//   · 真人引擎(glm/openai)按「每日免费字符额度 ttsDayCap」记账（本地），用完后自动退回免费 Edge 朗读；
//   · 若用户另外设置了「今日 AI 预算(getBudget)」，真人朗读还会按单价估算提前截止，绝不超支；
//   · Edge/系统语音永不拦截（本来就免费）。开关 store.cfg.ttsGuard（默认开）可关。
const TTS_LEDGER_KEY = 'xc_tts_chars'
function ttsDayStr() {
  try { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate() } catch (e) { return '' }
}
// 今日真人朗读累计字符数（供设置页展示 / 额度判断）
export function ttsCharsToday() {
  try {
    const raw = JSON.parse(localStorage.getItem(TTS_LEDGER_KEY) || '{}')
    const d = ttsDayStr()
    return raw && raw.d === d ? Number(raw.c) || 0 : 0
  } catch (e) { return 0 }
}
function ttsAddChars(n) {
  if (!(n > 0)) return
  try {
    const raw = JSON.parse(localStorage.getItem(TTS_LEDGER_KEY) || '{}')
    const d = ttsDayStr()
    const c = (raw && raw.d === d ? Number(raw.c) || 0 : 0) + Math.round(n)
    localStorage.setItem(TTS_LEDGER_KEY, JSON.stringify({ d, c }))
  } catch (e) {}
}
let _guardToastAt = 0
// 真人引擎是否应被本次朗读挡住（需退回 Edge）
function paidTtsBlocked(textChars) {
  const cfg = store.cfg || {}
  if (cfg.ttsGuard === false) return false
  const cap = Number(cfg.ttsDayCap)
  if (cap > 0 && ttsCharsToday() + textChars > cap) return true
  const b = getBudget()
  if (b > 0) {
    const est = ((ttsCharsToday() + textChars) / 1000) * (getTtsPrice() || 0.002)
    if (todaySpend() + est >= b) return true
  }
  return false
}
function guardToastOnce() {
  const now = Date.now()
  if (now - _guardToastAt < 60000) return
  _guardToastAt = now
  const cap = Number((store.cfg || {}).ttsDayCap) || 20000
  showToast('💰 今日真人朗读已达额度上限（约 ' + cap + ' 字），已自动改用免费 Edge 朗读；可在 设置→语音 调整', 'info')
}
function ttsAddForEngine(chars) { ttsAddChars(chars) }

// ============ 统一入口 ============
// speakPro(text, { voice, rate, pitch, speed, onEnd, onError }) —— 按 store.cfg.ttsMode 分发
export async function speakPro(text, opts = {}) {
  stopSpeakPro()
  gapEnsure() // 在调用栈内同步建好 AudioContext（若由点击触发，可保证 running 可出声）
  gapInitOnGesture()
  const mode0 = store.cfg.ttsMode || 'glm'
  let mode = mode0
  const t = cleanSpeechText(text)
  if (!t) { if (opts.onEnd) opts.onEnd(); return { ok: false, msg: 'empty' } }
  // 省钱护栏：真人引擎超额度 → 自动退回免费 Edge（Edge/系统永不被拦）
  if ((mode === 'glm' || mode === 'openai' || mode === 'dash') && paidTtsBlocked(t.length)) {
    guardToastOnce()
    mode = 'edge'
  }
  setStatus('speaking', '正在朗读…')
  try {
    if (mode === 'openai') {
      // 流式：分块边到边播，第一块一到就开口
      const r = await openaiSynthesize(t, { voice: opts.voice, speed: opts.speed, chunkSize: 84, firstChunkSize: 26, onChunk: (buf) => gaplessEnqueue(buf, 'audio/mpeg') })
      return await streamFinish(r, opts)
    }
    if (mode === 'dash') {
      // 阿里百炼 Qwen3-TTS：同流式分块，第一块一到就开口（mpeg）
      const r = await dashSynthesize(t, { voice: opts.voice, speed: opts.speed, chunkSize: 84, firstChunkSize: 26, onChunk: (buf) => gaplessEnqueue(buf, 'audio/mpeg') })
      return await streamFinish(r, opts)
    }
    if (mode === 'edge') {
      // 音频缓存：同一文本+音色+语速只合成一次，命中直接播放（Edge 免费，缓存省网络+避免重复解析；glm 用户若切回，缓存同样省次）
      const ck = ttsCacheKey('edge', opts.voice || store.cfg.ttsEdgeVoice, opts.rate, opts.pitch, t)
      const hit = await ttsCacheGet(ck)
      if (hit && hit.bytes) {
        const played = await playBytes(hit.bytes, hit.mime)
        setStatus(played ? 'done' : 'error', played ? '🔁 已从缓存播放（未重复合成）' : '❌ 播放失败（浏览器拦截自动播放）')
        if (played && opts.onEnd) opts.onEnd()
        return { ok: played, cached: true }
      }
      const r = await edgeSynthesize(t, { voice: opts.voice || store.cfg.ttsEdgeVoice, rate: opts.rate, pitch: opts.pitch })
      if (r.ok && r.bytes) ttsCacheSet(ck, r.bytes, r.mime)
      return finishSpeak(r, opts)
    }
    if (mode === 'sys') {
      const ok = sysSpeak(t, { rate: opts.rate, pitch: opts.pitch, onEnd: opts.onEnd, onError: opts.onError })
      setStatus(ok ? 'done' : 'error', ok ? '✅ 系统语音播放中' : '❌ 系统语音播放失败')
      return { ok }
    }
    // 默认 glm：流式分块播放；失败自动回退系统语音，保证「一定读得出来」
    const r = await glmSynthesize(t, { voice: opts.voice, speed: opts.speed, chunkSize: 84, firstChunkSize: 26, onChunk: (buf) => gaplessEnqueue(buf, 'audio/wav') })
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
    // 同时挂 Web Audio 与旧分块播放器的收尾回调：实际由“真正出声的那套”触发（done 防重入）
    if (gapAvailable()) gaplessSetCallbacks(() => finish(true), () => finish(false))
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
  gaplessStop()
  sysStop()
}
export function speakingPro() {
  return playing() || spPlaying() || gaplessPlaying() || sysSpeaking()
}


