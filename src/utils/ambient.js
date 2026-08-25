// ===== 考场氛围音（Web Audio 轻量合成，无需音频文件） =====
// 提供：轻白噪音底噪（房间空调声）+ 偶尔翻卷/按键的提示音
let ctx = null
let noiseGain = null
let running = false

let noiseSrc = null
// 翻卷/按键音
function blip(type) {
  if (!ctx || !running) return
  const t = ctx.currentTime
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  const freq = type === 'flip' ? 480 : type === 'click' ? 900 : 700
  osc.type = type === 'flip' ? 'triangle' : 'sine'
  osc.frequency.value = freq
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(0.08, t + 0.004)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08)
  osc.connect(g)
  g.connect(ctx.destination)
  osc.start(t)
  osc.stop(t + 0.1)
}

function ensureCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

export function startAmbient() {
  const c = ensureCtx()
  if (!c || running) return
  running = true
  // 全频段白噪声（房间底噪）
  const len = c.sampleRate * 2
  const buf = c.createBuffer(1, len, c.sampleRate)
  const data = buf.getChannelData(0)
  let last = 0
  for (let i = 0; i < len; i++) {
    // 简单"粉噪声"近似：低通
    const white = Math.random() * 2 - 1
    last = last * 0.96 + white * 0.04
    data[i] = last * 0.5
  }
  noiseSrc = c.createBufferSource()
  noiseSrc.buffer = buf
  noiseSrc.loop = true
  const filter = c.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 900
  noiseGain = c.createGain()
  noiseGain.gain.value = 0.035 // 很轻
  noiseSrc.connect(filter)
  filter.connect(noiseGain)
  noiseGain.connect(c.destination)
  noiseSrc.start()
  // 每 60s 一声轻柔翻卷提示
  ambientTimer = window.setInterval(() => {
    if (Math.random() < 0.4) blip('flip')
  }, 60000)
}

export function stopAmbient() {
  if (!running) return
  running = false
  if (ambientTimer) {
    clearInterval(ambientTimer)
    ambientTimer = null
  }
  if (noiseSrc) {
    try {
      noiseSrc.stop()
    } catch (e) {}
    noiseSrc.disconnect()
    noiseSrc = null
  }
  if (noiseGain) {
    noiseGain.disconnect()
    noiseGain = null
  }
}

export function isAmbientOn() {
  return running
}

export function clickTick() {
  blip('click')
}
let ambientTimer = null
