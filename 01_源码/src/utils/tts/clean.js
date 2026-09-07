// tts/clean.js —— 文本清洗纯函数（批次6B拆分：自 ttsEngine.js 纯移动，未改动）
// 供 ttsEngine.js 回导出，调用方无需修改 import
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
  const cleaned = stripSpeechNoise(String(text || ''))
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
    .split(/\r?\n/)
    .map((line) => String(line || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  // 多行文本保留“行=一次自然停顿”的听感：换行本身就是语境边界，AI 回复常在这里不写标点
  const lines = cleaned.length > 1 ? cleaned.map(ensureSpeechBoundary) : cleaned
  return symbolsToChinese(lines.join(' ').trim())
}

const SPEECH_BOUNDARY_END = /[。！？!?…；;]$/
const SPEECH_KEEP_PUNCT = /[：:，,、]$/
const SPEECH_CONTINUE = /(?:就是|就是说|意思是|说明|比如|例如|如|如下|以下|包括|分为|还有)$/
function ensureSpeechBoundary(line) {
  const l = String(line || '').trim()
  if (!l) return l
  if (SPEECH_BOUNDARY_END.test(l) || SPEECH_KEEP_PUNCT.test(l)) return l
  // 结尾像“继续展开”的句子用逗号给短停顿，其余补句号给完整停顿
  return l + (SPEECH_CONTINUE.test(l) ? '，' : '。')
}

// 分块之间的停顿时长：文本先补过边界标点，这里据此调度真实静音，避免“无标点连读”
export function speechPauseMs(text) {
  const t = String(text || '').trim()
  if (/[。！？…]$/.test(t)) return 240
  if (/[；;]$/.test(t)) return 170
  if (/[，,：:]$/.test(t)) return 120
  return 90
}

// 朗读去噪：按行去掉系统/功能提示横幅，只保留真正要听的内容
const SPEECH_NOISE_RE = /^(?:【|\[)?\s*(?:温馨提示|提示|说明|注意|免责声明|官方说法|官方口径|使用说明|以上说明|未匹配到已蒸馏方法)(?:\]|】)?\s*[：:]?\s*/i
export function stripSpeechNoise(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => {
      let l = String(line || '').trim()
      // 去掉 > 块引用前缀（如 > 📚 提示：…）
      while (/^\s*>\s*/.test(l)) l = l.replace(/^\s*>\s*/, '').trim()
      // 去掉行首的功能 emoji（📚/💡/⚠️/🔍 等），保留后面的正文
      const em = l.match(/^(\s*[📚💡⚠️🔍🔎📌📢🗣🧠📝🎯⏱💰🌐✅❌⚡]+\s*)+(.*)$/)
      if (em) l = (em[2] || '').trim()
      // 命中提示/说明类系统横幅 → 整行丢弃
      if (SPEECH_NOISE_RE.test(l)) return ''
      return l
    })
    .filter(Boolean)
    .join('\n')
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
    return m.map((s, i) => {
      let seg = String(s || '').trim()
      if (!seg) return ''
      if (!SPEECH_BOUNDARY_END.test(seg) && i < m.length - 1) seg += '，'
      return seg
    }).filter(Boolean)
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
