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
    '=>': '推出', '->': '推出', '<-': '得到', '<=': '小于等于', '>=': '大于等于', '!=': '不等于', '~=': '约等于',
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

// 公式转口语：不把公式丢掉。先保留公式内容，再翻译常见 LaTeX/数学写法。
function latexToSpeech(text) {
  let t = String(text || '')
  t = t.replace(/\$\$([\s\S]*?)\$\$/g, ' $1 ')
  t = t.replace(/\$([^$]+)\$/g, ' $1 ')
  t = t.replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, '$1除以$2')
  t = t.replace(/\\dfrac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, '$1除以$2')
  t = t.replace(/\\tfrac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, '$1除以$2')
  t = t.replace(/\\sqrt\s*\[3\]\s*\{([^{}]+)\}/g, '三次根号$1')
  t = t.replace(/\\sqrt\s*\{([^{}]+)\}/g, '根号$1')
  t = t.replace(/\\text\s*\{([^{}]+)\}/g, '$1')
  t = t.replace(/\\mathrm\s*\{([^{}]+)\}/g, '$1')
  t = t.replace(/\\(?:left|right|limits|,|;|!|\s)/g, ' ')
  t = t.replace(/\\times|\\cdot/g, '乘')
  t = t.replace(/\\div/g, '除以')
  t = t.replace(/\\pm/g, '正负')
  t = t.replace(/\\mp/g, '负正')
  t = t.replace(/\\le(?:q|s)?\b/g, '小于等于')
  t = t.replace(/\\ge(?:q|s)?\b/g, '大于等于')
  t = t.replace(/\\ne(?:q)?\b/g, '不等于')
  t = t.replace(/\\approx/g, '约等于')
  t = t.replace(/\\equiv/g, '恒等于')
  t = t.replace(/\\to|\\rightarrow|\\Rightarrow/g, '推出')
  t = t.replace(/\\leftarrow|\\Leftarrow/g, '得到')
  t = t.replace(/\\infty/g, '无穷大')
  t = t.replace(/\\pi/g, '派')
  t = t.replace(/\\alpha/g, '阿尔法')
  t = t.replace(/\\beta/g, '贝塔')
  t = t.replace(/\\Delta/g, '变化量')
  t = t.replace(/\^\{?2\}?/g, '的平方')
  t = t.replace(/\^\{?3\}?/g, '的立方')
  t = t.replace(/\^\{?([^{}\s]+)\}?/g, '的$1次方')
  t = t.replace(/[{}]/g, ' ')
  t = t.replace(/\\[A-Za-z]+/g, ' ')
  return t
}
export function cleanSpeechText(text) {
  const cleaned = stripSpeechNoise(latexToSpeech(String(text || '')))
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/~~~[\s\S]*?~~~/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\${1,2}/g, ' ')
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
  // 分块音频本身已有自然收尾；调度层只补极短呼吸感，避免把独立 TTS 分块听成一句一顿。
  if (/[。！？…]$/.test(t)) return 45
  if (/[；;]$/.test(t)) return 25
  if (/[，,：:]$/.test(t)) return 15
  return 10
}

// 朗读去噪：按行去掉系统/功能提示横幅，只保留真正要听的内容
const SPEECH_NOISE_RE = /^(?:【|\[)?\s*(?:温馨提示|提示|说明|注意|免责声明|官方说法|官方口径|使用说明|以上说明|未匹配到已蒸馏方法|依据卡|知识卡|参考卡|引用卡|资料卡|命中卡|命中知识卡|提示卡|方法卡|教材依据|组卷来源|材料来源|数据来源|资料来源|卡片来源|来源|出处)(?:\]|】)?\s*[：:]?\s*/i
// 纯元信息行（题号进度 / 篇号 / 训练声明）：整行丢弃，既不朗读也不产生朗读费用
const SPEECH_META_RE = /^(?:第\s*[0-9０-９]+\s*[/／]\s*[0-9０-９]+\s*题|当前第\s*[0-9０-９]+\s*篇|同一篇供\s*[0-9０-９]+\s*问|(?:本材料|本数据|以上材料|以上数据)为(?:训练)?模拟(?:数据|材料)|非官方(?:实际)?公布值|仅供(?:学习|训练|参考|演示))/
export function stripSpeechNoise(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => {
      let l = String(line || '').trim()
      // 去掉 > 块引用前缀（如 > 📚 提示：…）
      while (/^\s*>\s*/.test(l)) l = l.replace(/^\s*>\s*/, '').trim()
      // 行首的任意 emoji / 装饰符号（📊 📚 ⚠️ ① 等）先统一剥掉，
      // 否则「📊 组卷来源：…」这类元信息会因为前缀图标而躲过下面的整行过滤
      l = l.replace(/^[\s\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2460}-\u{24FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{2000}-\u{206F}]+/u, '').trim()
      // 命中提示/说明类系统横幅、或纯元信息行 → 整行丢弃
      if (SPEECH_NOISE_RE.test(l) || SPEECH_META_RE.test(l)) return ''
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

// 在 want 附近找自然停顿（句号/逗号等）切一刀，避免把话从中间掐断
function naturalCut(str, want) {
  for (let i = Math.min(str.length, want); i > Math.max(6, want - 24); i--) {
    if ('。！？!?；;，,、'.includes(str[i])) return i + 1
  }
  return Math.min(str.length, want)
}

// 分块朗读 · 渐进式分块（progressive chunking）：
//   第 1 块 firstLen（最小 → 最快开口）；
//   第 2 块约 maxLen/3（关键：让「第 1 块的播放时长」能覆盖「第 2 块的合成耗时」）；
//   第 3 块起用全长 maxLen（此时已积累足够播放缓冲）。
// 为什么必须这样分：真实引擎合成速度约 15 字/秒，而播放速度约 5 字/秒（详见实测）。
// 若第 2 块直接用全长（240 字≈16s 合成），而第 1 块只有 ~9s 播放，就会在开头两块之间
// 出现约 5 秒空白（真实用户实测：第 1 块 4.4s→12.0s，第 2 块却要到 17.0s 才排上）。
// 渐进式分块后，第 2 块合成只要 ~5s，早于第 1 块播完，空档即被消除。
export function chunkForTts(text, maxLen, firstLen) {
  const chunks = chunkText(text, maxLen)
  if (chunks.length <= 1 || !(firstLen > 0)) return chunks
  const targets = [firstLen, Math.max(firstLen + 1, Math.round(maxLen / 3))]
  const out = []
  let pending = chunks[0]
  for (let k = 0; k < targets.length && pending && pending.length > targets[k]; k++) {
    const cut = naturalCut(pending, targets[k])
    out.push(pending.slice(0, cut))
    pending = pending.slice(cut)
  }
  if (pending) out.push(pending)
  return out.concat(chunks.slice(1))
}
// 滑动窗口顺序合成：最多 W 个请求在途（避免一次性打满全部请求被限流、个别慢导致停顿），
// 结果严格按分块顺序 onChunk 投递（gapless 播放器依赖顺序），第一块立即发出 → 开口更快、衔接更顺
