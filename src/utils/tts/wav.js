// tts/wav.js —— WAV 平滑纯函数（批次6B拆分：自 ttsEngine.js 纯移动，未改动）
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
