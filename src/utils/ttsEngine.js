// ttsEngine.js —— 真人级 TTS 引擎（去掉「AI 味」的核心）
// 四引擎统一分发：智谱 GLM-TTS（超拟人·真人级，默认） / OpenAI 兼容（CosyVoice2） / Edge 免费神经音色 / 系统语音（兜底）
// 外部（tts.js / App.vue）只依赖 speakPro / stopSpeakPro / speakingPro 与语音列表接口，改造时不影响调用方。
/* global Audio, crypto, FormData, File */
import { reactive } from 'vue'
import { store } from '../store'
import { recordCost, getTtsPrice, getCloneFee, beginCost } from './costTrack'

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
// 符号智能朗读：把箭头/数学符号/斜杠等按语境转成中文，避免读成“代码/英文”（去 AI 味关键一步）
export function symbolsToChinese(text) {
  let t = String(text || '')
  // 先处理带数字的复合符号（避免与后面简单替换冲突）
  t = t.replace(/(\d+(?:\.\d+)?)%/g, '百分之$1')
  t = t.replace(/(\d+(?:\.\d+)?)\s*[~～]\s*(\d+(?:\.\d+)?)/g, '$1到$2')
  t = t.replace(/(\d+(?:\.\d+)?)\s*[-－]\s*(\d+(?:\.\d+)?)/g, '$1到$2')
  // 斜杠：数字/单位 → 每（公里/小时）；其余 → 或
  t = t.replace(/([\u4e00-\u9fa5A-Za-z]+)\/([\u4e00-\u9fa5A-Za-z]+)/g, (m, a, b) => {
    const unit = /^(公里|千米|米|厘米|毫米|小时|分钟|秒|天|月|年|次|人|个|元|克|千克|升|毫升|度|Hz|hz|km|m|s|h|min|day|月|年|次|人|元)$/i
    return (unit.test(a) && unit.test(b)) ? a + '每' + b : a + '或' + b
  })
  t = t.replace(/(\d+)\/(\d+)/g, (m, a, b) => a + '分之' + b)
  // 数学符号
  const MAP = {
    '→': '推出', '⇒': '推出', '⟹': '推出', '⟶': '推出', '➜': '推出',
    '←': '得到', '⇐': '得到', '⟵': '得到',
    '↔': '相互推出', '⇔': '等价于', '⟺': '等价于',
    '≤': '小于等于', '≥': '大于等于', '≠': '不等于', '≈': '约等于', '≡': '恒等于',
    '×': '乘', '÷': '除以', '±': '正负', '∓': '负正', '∞': '无穷大',
    '√': '根号', 'π': '派', 'Σ': '求和', '∑': '求和', '△': '三角形', '∠': '角',
    '°': '度', '‰': '千分之', 'µ': '微',
    '＝': '等于', '=': '等于', '＋': '加', '+': '加', '－': '减', '−': '减',
    '&': '和', '＠': '艾特', '@': '艾特', '％': '百分之',
    '^': '次方', '·': '、', '•': '、',
    'Ⅰ': '一', 'Ⅱ': '二', 'Ⅲ': '三', 'Ⅳ': '四', 'Ⅴ': '五',
    '（': '（', '）': '）'
  }
  for (const k of Object.keys(MAP)) {
    if (t.includes(k)) t = t.split(k).join(MAP[k])
  }
  // 单独的 %（未被数字替换）→ 百分号
  t = t.replace(/%/g, '百分号')
  // 清理重复空格
  return t.replace(/\s{2,}/g, ' ').trim()
}
export function cleanSpeechText(text) {
  return symbolsToChinese(String(text || '')
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
    .trim())
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

// 分块朗读：首块更小（让第一段音频更快返回、开口更快），其余块保持 maxLen
export function chunkForTts(text, maxLen, firstLen) {
  let chunks = chunkText(text, maxLen)
  if (chunks.length > 1 && firstLen > 0 && chunks[0].length > firstLen) {
    const first = chunks[0]
    let cut = -1
    // 尽量在句号/逗号等自然停顿附近切，避免把话从中间掐断
    for (let i = Math.min(first.length, firstLen); i > Math.max(6, firstLen - 24); i--) {
      if ('。！？!?；;，,、'.includes(first[i])) { cut = i + 1; break }
    }
    if (cut < 0) cut = Math.min(first.length, firstLen)
    const head = first.slice(0, cut)
    const rest = first.slice(cut)
    chunks = [head, ...(chunkText(rest, maxLen) || []).filter(Boolean), ...chunks.slice(1)]
  }
  return chunks
}
// 滑动窗口顺序合成：最多 W 个请求在途（避免一次性打满全部请求被限流、个别慢导致停顿），
// 结果严格按分块顺序 onChunk 投递（gapless 播放器依赖顺序），第一块立即发出 → 开口更快、衔接更顺
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
export function smoothWavBytes(input) {
  try {
    const u8 = input instanceof Uint8Array ? input : new Uint8Array(input)
    if (u8.length < 64) return input
    const ascii = (o, n) => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(u8[o + i]); return s }
    if (ascii(0, 4) !== 'RIFF' || ascii(8, 4) !== 'WAVE') return input
    // 逐块解析，找到 data 块（跳过 AIGC/LIST 等元数据）
    let dataOff = -1, dataLen = 0, rate = 0, ch = 1, bits = 16
    let i = 12
    while (i + 8 <= u8.length) {
      const cid = ascii(i, 4)
      const size = u8[i + 4] | (u8[i + 5] << 8) | (u8[i + 6] << 16) | (u8[i + 7] << 24)
      if (cid === 'fmt ') {
        // fmt 数据区从 i+8 起：声道数 data+2、采样率 data+4、位深 data+14
        ch = u8[i + 10] | (u8[i + 11] << 8)
        rate = u8[i + 12] | (u8[i + 13] << 8) | (u8[i + 14] << 16) | (u8[i + 15] << 24)
        bits = u8[i + 22] | (u8[i + 23] << 8)
        i += 8 + size + (size & 1)
      } else if (cid === 'data') {
        dataOff = i + 8; dataLen = size
        break
      } else {
        i += 8 + size + (size & 1)
      }
      if (i >= u8.length) break
    }
    if (dataOff < 0 || dataLen < 8) return input
    if (dataOff + dataLen > u8.length) return input
    const bytesPer = bits / 8
    if (bytesPer < 1 || !ch || !rate) return input
    const blockAlign = ch * bytesPer
    const frames = Math.floor(dataLen / blockAlign)
    if (frames < 32) return input
    const read = (fi, ci) => {
      const o = dataOff + fi * blockAlign + ci * bytesPer
      if (bytesPer === 2) { const v = u8[o] | (u8[o + 1] << 8); return v >= 0x8000 ? v - 0x10000 : v }
      const v = u8[o] | (u8[o + 1] << 8) | (u8[o + 2] << 16) | (u8[o + 3] << 24)
      return v >= 0x80000000 ? v - 0x100000000 : v
    }
    // 每 10ms 窗口的 RMS 与过零率
    const winSize = Math.max(1, Math.floor(rate / 100))
    const winInfo = (w) => {
      const s0 = w * winSize, s1 = Math.min(s0 + winSize, frames)
      let rms = 0, zc = 0
      for (let f = s0; f < s1; f++) {
        let peak = 0
        for (let c = 0; c < ch; c++) { const v = Math.abs(read(f, c)); if (v > peak) peak = v }
        rms += peak * peak
        if (f > s0) { const a = read(f - 1, 0), b = read(f, 0); if ((a < 0) !== (b < 0)) zc++ }
      }
      const n = s1 - s0
      return { rms: Math.sqrt(rms / n), zcr: zc / n }
    }
    const rmsThresh = Math.max(90, 0.012 * 32767)
    const zcrTone = 0.055
    const maxWin = Math.floor(rate * 4 / winSize) // 最多扫 4s 的开头提示音/静音（智谱 GLM 开头提示音可达 ~2s）
    // 开头：跳过 静音 或 纯音(嘟嘟) —— 直到遇到语音样（高过零率）
    let start = 0
    for (let w = 0; w < maxWin && w < Math.ceil(frames / winSize); w++) {
      const info = winInfo(w)
      if (info.rms < rmsThresh) { start = w * winSize + winSize; continue } // 静音
      if (info.zcr < zcrTone) { start = w * winSize + winSize; continue } // 纯音（嘟嘟/叮叮）
      break // 语音开始
    }
    // 结尾：去掉末尾静音（最多 500ms）
    let end = frames
    const endWin = Math.min(Math.ceil(frames / winSize), Math.floor(rate * 0.5 / winSize))
    for (let w = Math.ceil(frames / winSize) - 1; w >= Math.ceil(frames / winSize) - endWin; w--) {
      if (w < 0) break
      const info = winInfo(w)
      if (info.rms < rmsThresh) { end = w * winSize; continue }
      break
    }
    if (end - start < 32) return input
    const newFrames = end - start
    const newDataLen = newFrames * blockAlign
    // 重建标准 WAV（丢弃 AIGC/LIST 元数据，浏览器播放更稳）
    const ab = new ArrayBuffer(44 + newDataLen)
    const out = new Uint8Array(ab)
    const ws = (o, s) => { for (let k = 0; k < s.length; k++) out[o + k] = s.charCodeAt(k) }
    ws(0, 'RIFF'); ws(8, 'WAVE'); ws(12, 'fmt '); ws(36, 'data')
    const dv = new DataView(ab)
    dv.setUint32(4, 36 + newDataLen, true)
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, ch, true)
    dv.setUint32(24, rate, true); dv.setUint32(28, rate * blockAlign, true)
    dv.setUint16(32, blockAlign, true); dv.setUint16(34, bits, true)
    dv.setUint32(40, newDataLen, true)
    const fadeFrames = Math.max(1, Math.floor(rate * 0.006))
    for (let fi = 0; fi < newFrames; fi++) {
      let f = 1
      if (fi < fadeFrames) f = fi / fadeFrames
      else if (fi > newFrames - fadeFrames - 1) f = (newFrames - 1 - fi) / fadeFrames
      const o = 44 + fi * blockAlign
      for (let c = 0; c < ch; c++) {
        const v = read(start + fi, c)
        const nv = Math.round(v * Math.max(0, Math.min(1, f)))
        if (bytesPer === 2) { out[o + c * 2] = nv & 0xff; out[o + c * 2 + 1] = (nv >> 8) & 0xff }
        else { out[o + c * 4] = nv & 0xff; out[o + c * 4 + 1] = (nv >> 8) & 0xff; out[o + c * 4 + 2] = (nv >> 16) & 0xff; out[o + c * 4 + 3] = (nv >> 24) & 0xff }
      }
    }
    return ab
  } catch (e) {
    return input
  }
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
  try {
    const chars = chunks.join('').length
    recordCost({ feature: 'tts', provider: 'glm', model: cfg.model || 'glm-tts', cost: Math.round((chars / 1000) * getTtsPrice() * 100000) / 100000, note: chars + ' 字' })
  } catch (e) {}
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

// ============ 统一入口 ============
// speakPro(text, { voice, rate, pitch, speed, onEnd, onError }) —— 按 store.cfg.ttsMode 分发
export async function speakPro(text, opts = {}) {
  stopSpeakPro()
  gapEnsure() // 在调用栈内同步建好 AudioContext（若由点击触发，可保证 running 可出声）
  gapInitOnGesture()
  const mode = store.cfg.ttsMode || 'glm'
  const t = cleanSpeechText(text)
  if (!t) { if (opts.onEnd) opts.onEnd(); return { ok: false, msg: 'empty' } }
  setStatus('speaking', '正在朗读…')
  try {
    if (mode === 'openai') {
      // 流式：分块边到边播，第一块一到就开口
      const r = await openaiSynthesize(t, { voice: opts.voice, speed: opts.speed, chunkSize: 84, firstChunkSize: 26, onChunk: (buf) => gaplessEnqueue(buf, 'audio/mpeg') })
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


