<script setup>
import { ref, nextTick, computed, onMounted, onUnmounted, watch, defineAsyncComponent } from 'vue'
import 'katex/dist/katex.min.css'
import { renderMd } from '../utils/renderMd'
import { USAGE_GUIDE } from '../utils/usageGuide'
import { parseQuiz, extractChoices, looksLikeQuiz } from '../utils/quiz'
import { downloadMdScreenshot } from '../utils/capture'
function md(t) {
  return renderMd(t)
}
// 批次5-P5-2 markdown 渲染缓存：消息内容不可变，首算即缓存（流式 live 消息不入缓存）
const _mdCache = new Map()
function mdC(txt) {
  const key = String(txt || '')
  let h = _mdCache.get(key)
  if (h === undefined) { if (_mdCache.size > 300) _mdCache.clear(); h = md(key); _mdCache.set(key, h) }
  return h
}
function mdCached(m, i) {
  const full = textOf(m)
  const txt = isLong(full) && !(expanded.value && expanded.value[i]) ? full.slice(0, 700) + '…' : full
  if (m._htmlKey !== txt) { m._htmlKey = txt; m._html = md(txt) }
  return m._html
}
// 滚动 rAF 合帧：流式期间避免每帧 scroll 触发重排
let _rafPending = false
function scrollThrottled() {
  if (_rafPending) return
  _rafPending = true
  requestAnimationFrame(() => { _rafPending = false; scroll() })
}
import { store, saveMsgs, saveWqs, saveCfg, saveNotes, addWrong } from '../store'
import { on as evOn, off as evOff } from '../utils/events'
import { activeCfg, supportsVision, buildSys, chatStream, chatOnce, detectBanKuai, buildTaskSys, PLATE_MODE } from '../api'
import { analyzeFigImage, readQuestionFromImage, figCfg } from '../api/figEnhance'
import { speak, stopSpeak, speaking, startRecog, recogActive } from '../utils/tts'
import { MODE_NAMES } from '../kb'
import { collectChat } from '../utils/chat'
import { showToast } from '../utils/toast'
import { navOpen, navBack } from '../utils/nav'
import { buildReview } from '../utils/review'
import ExamPanel from './ExamPanel.vue'
import { addPoints as petAddPoints } from '../utils/pet'

// SolidTrain 依赖 three.js（~556KB），按需异步加载，避免拖慢启动
const SolidTrain = defineAsyncComponent(() => import('./SolidTrain.vue'))
import DataTrain from './DataTrain.vue'
const toolsCollapsed = ref(window.innerWidth <= 640) // 手机端默认收起为「🎯训练」抽屉
const isNarrow = ref(window.innerWidth <= 640)
try { if (localStorage.getItem('xc_chat_tools') !== null) toolsCollapsed.value = localStorage.getItem('xc_chat_tools') === '1' } catch (e) {}
function onToolsResize() {
  const n = window.innerWidth <= 640
  if (n !== isNarrow.value) { isNarrow.value = n; if (n) toolsCollapsed.value = true }
}
function toggleTools() { toolsCollapsed.value = !toolsCollapsed.value; try { localStorage.setItem('xc_chat_tools', toolsCollapsed.value ? '1' : '0') } catch (e) {} }
// 对话使用说明书弹窗
const guideShow = ref(false)
const guideOpen = ref({})
const guideQaOpen = ref({})
function toggleGuideSec(si) { guideOpen.value[si] = !guideOpen.value[si] }
function toggleGuideQa(si, ii) { const k = si + '-' + ii; guideQaOpen.value[k] = !guideQaOpen.value[k] }
const text = ref(''),
  imgs = ref([]),
  linkShow = ref(false),
  linkUrl = ref(''),
  recogOn = ref(false)
const quickMode = ref(localStorage.getItem('xc_quick_mode') === '1') // 🧠深度(思考模型,准) / ⚡快答(快模型,快)
function toggleQuickMode() {
  quickMode.value = !quickMode.value
  try { localStorage.setItem('xc_quick_mode', quickMode.value ? '1' : '0') } catch (e) {}
  showToast(
    quickMode.value
      ? '⚡ 快答已开启：用「对话快模型」秒回（适合简单/熟练题；难题建议切回深度）'
      : '🧠 深度解析已开启：用思考模型更准（适合难题/文字截图题；较慢）',
    'info'
  )
}
const live = ref(null) // 当前流式消息 {role:'ai', text, think, thinkOpen}
const msgsBox = ref(null)
const atBottom = ref(true) // 是否在最新处（用于"回到最新"按钮显隐）
function sumMsgsScroll() {
  const el = msgsBox.value
  if (!el) return
  const near = el.scrollHeight - el.scrollTop - el.clientHeight
  atBottom.value = near < 80
}
function backToLatest() {
  scroll()
}
// 「回到最新」可拖拽定位（记忆位置，避免遮挡其他按钮）
const blPos = ref(null)
try {
  const _p = JSON.parse(localStorage.getItem('xc_bl_pos') || 'null')
  // 防御：保存位置若落在底部输入区附近（可能遮挡按钮），忽略回默认
  if (_p && (_p.left != null || _p.right != null) && !(_p.top != null && _p.top > window.innerHeight - 130)) blPos.value = _p
} catch (e) {}
const blStyle = computed(() => {
  if (!blPos.value) return {}
  return blPos.value.left != null
    ? { left: blPos.value.left + 'px', top: blPos.value.top + 'px', right: 'auto', bottom: 'auto' }
    : { right: blPos.value.right + 'px', bottom: blPos.value.bottom + 'px', left: 'auto', top: 'auto' }
})
// 窗口尺寸变化时按当前视口钳制「回到最新」位置，避免缩窗/旋转后按钮跑到屏幕外
function clampBl() {
  if (!blPos.value) return
  const btn = document.querySelector('.back-latest')
  const w = (btn && btn.offsetWidth) || 90
  const h = (btn && btn.offsetHeight) || 34
  const vw = window.innerWidth
  const vh = window.innerHeight
  if (blPos.value.left != null) {
    blPos.value = {
      left: Math.max(4, Math.min(vw - w - 4, blPos.value.left)),
      top: Math.max(4, Math.min(vh - h - 4, blPos.value.top))
    }
  } else if (blPos.value.right != null) {
    blPos.value = {
      right: Math.max(4, Math.min(vw - w - 4, blPos.value.right)),
      bottom: Math.max(4, Math.min(vh - h - 4, blPos.value.bottom))
    }
  }
}
clampBl()
window.addEventListener('resize', clampBl)
function onBlDown(e) {
  e.preventDefault()
  const btn = e.currentTarget
  const r = btn.getBoundingClientRect()
  const sx = e.clientX, sy = e.clientY
  const ox = sx - r.left, oy = sy - r.top
  let moved = false
  try { btn.setPointerCapture(e.pointerId) } catch (_) {}
  const onMove = (ev) => {
    const x = ev.clientX - ox, y = ev.clientY - oy
    if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 6) moved = true
    const w = r.width || 90, h = r.height || 34
    blPos.value = { left: Math.max(4, Math.min(window.innerWidth - w - 4, x)), top: Math.max(4, Math.min(window.innerHeight - h - 4, y)) }
  }
  const onUp = () => {
    window.removeEventListener('pointermove', onMove, true)
    window.removeEventListener('pointerup', onUp, true)
    try { btn.releasePointerCapture(e.pointerId) } catch (_) {}
    if (blPos.value) { try { localStorage.setItem('xc_bl_pos', JSON.stringify(blPos.value)) } catch (_) {} }
    if (!moved) backToLatest()
  }
  window.addEventListener('pointermove', onMove, true)
  window.addEventListener('pointerup', onUp, true)
}

// 选择题结构化：识别 AI 出题 → 对话页可点选项作答（新增消息与历史消息水合共用）
function buildQuizFromMsg(m) {
  if (!m || m.role !== 'assistant' || typeof m.content !== 'string' || m.err || m.stopped || m.quiz) return
  if (!looksLikeQuiz(m.content)) return
  const quiz = parseQuiz(m.content)
  if (quiz) { m.quiz = quiz; return }
  // 出题练习模式：AI 只给题干+选项（不给答案，让用户先选）→ 生成"选后 AI 判题"卡片
  const opts = extractChoices(m.content)
  if (opts.length >= 2) {
    const lines = String(m.content).split('\n')
    const lineRe = /^\s*[*_`]*\s*([A-D])[.、．:：]/
    const first = lines.findIndex((l) => lineRe.test(l))
    let stem = first >= 0 ? lines.slice(0, first).join('\n').trim() : String(m.content).replace(/\s[A-D][.、．:：].*$/s, '').trim()
    if (stem) m.quiz = { stem, options: opts, answer: '', needAi: true }
  }
}
// 历史消息水合：从本地恢复的旧消息（早期版本或当时未成功解析）也补建可点作答卡片
function hydrateQuizCards() {
  let changed = false
  store.msgs.forEach((m) => {
    if (m.role === 'assistant' && typeof m.content === 'string' && !m.err && !m.stopped) {
      if (m.quiz) {
        // 清理历史误判：早期把「讲解/解析长文」误建成卡片的，水合时移除
        if (!looksLikeQuiz(m.content)) {
          delete m.quiz
          changed = true
        }
      } else {
        const before = m.quiz
        buildQuizFromMsg(m)
        if (m.quiz && m.quiz !== before) changed = true
      }
    }
  })
  if (changed) { try { saveMsgs() } catch (e) {} }
}
function addMsg(m) {
  // 批次5-P5-5 稳定消息 key（重发/删除不丢定位）
  if (!m.id) m.id = (m.t || Date.now()) + '_' + Math.random().toString(36).slice(2, 7)
  // 记录作答用时：AI 回复与最近一次用户提问之间的耗时
  if (m.role === 'assistant' && lastAskAt) {
    const sec = Math.round((Date.now() - lastAskAt) / 1000)
    m.answerTime = sec >= 60 ? `${Math.floor(sec / 60)}分${sec % 60}秒` : `${sec}秒`
    m.answerSec = sec
  }
  if (m.role === 'user') {
    lastAskAt = Date.now()
    m.answerTime = undefined
    const t = typeof m.content === 'string' ? m.content : (m.content && m.content.text) || ''
    lastAskText = t
    // 考场计时：开启后按问数限时（1 问=1 分钟）；默认关闭，避免每问弹提示打扰
    if (store.cfg.examMode) startStopwatch(countQuestions(t) * 60)
  }
  if (m.role === 'assistant') {
    stopStopwatch()
    // 归属板块：基于最近一次用户提问识别（与消息头/存错题同源）
    // 出题意图 / 学习诊断 提问跳过板块识别，避免「出一题图形…」「学习诊断」等请求被误标为图形推理并触发补画
    const _askT = String(lastAskText || '')
    const _isQuizAsk = /(出一|来一|能不能出|给我出|出个|出几道|出题|让我(做|选|答)|做(一|几)道|练习|直接选|有选项|来道|出道)/.test(_askT) || /学习诊断|诊断/.test(_askT)
    m.bk = _isQuizAsk ? '' : (detectBanKuai(_askT) || '')
    // 考场计时开启时才弹用时统计（默认关闭避免打扰）；停止/失败/无耗时则不弹
    if (store.cfg.examMode && !m.err && !m.stopped && runSec.value > 0) {
      const t0 = assessTime()
      if (t0.over > 0) {
        showToast(`⏱ 用时 ${fmtSec(t0.used)} · 超时 ${t0.over} 秒（限 ${fmtSec(t0.limit)}）`, 'error')
      } else {
        showToast(`✅ 本题用时 ${fmtSec(t0.used)}，未超时（限 ${fmtSec(t0.limit)}）`, 'success')
      }
    }
  }
  store.msgs.push(m)
  if (!m.t) m.t = Date.now()
  if (m.role === 'assistant' && !m.err) petAddPoints(1)
  // 选择题结构化：识别 AI 出题 → 对话页可点选项作答
  if (m.role === 'assistant' && typeof m.content === 'string' && !m.err && !m.stopped && !m.quiz) {
    const quiz = parseQuiz(m.content)
    if (quiz) m.quiz = quiz
    else {
      // 出题练习模式：AI 只给题干+选项（不给答案，让用户先选）→ 生成"选后 AI 判题"卡片
      const opts = extractChoices(m.content)
      if (opts.length >= 2) {
        const lines = String(m.content).split('\n')
        const lineRe = /^\s*([A-D])[.、．:：]/
        const first = lines.findIndex((l) => lineRe.test(l))
        let stem = first >= 0 ? lines.slice(0, first).join('\n').trim() : String(m.content).replace(/\s[A-D][.、．:：].*$/s, '').trim()
        if (stem) m.quiz = { stem, options: opts, answer: '', needAi: true }
      }
    }
  }
  // 对话里 AI 出的选择题也支持萌宠「读题」
  if (m.role === 'assistant' && m.quiz) {
    const qz = m.quiz
    const opts = (qz.options || []).map((o, i) => String(i === 0 ? 'A' : String.fromCharCode(64 + i + 1)) + '、' + String(o.t || o || '').replace(/<[^>]+>/g, ' ')).join('。')
    store.readCtx = { type: 'chat', title: '对话出题·' + (detectBanKuai(String(qz.stem || '')) || '综合'), text: (String(qz.stem || '').replace(/<[^>]+>/g, ' ').trim() + '。' + (opts ? '选项：' + opts + '。' : '')).slice(0, 1200) }
    store.curQ = { plate: detectBanKuai(String(qz.stem || '')) || '综合', kind: '对话出题', stem: qz.stem, options: qz.options || [], answer: qz.answer || '', explain: qz.explain || '' }
  }
  saveMsgs()
  scroll()
}
// 最近一次用户提问文本（用于板块归属）
let lastAskText = ''
let lastAskAt = null
// 考场倒计时：按问题数限时（1 问=1 分钟），回复完成弹统计
const left = ref(60)
const runSec = ref(0) // 实际已走秒数（供耗时统计）
let limitSec = 60 // 本次限时（秒）
const limitShow = ref(60) // 模板显示的限时（秒）
let stopTimer = null
// 估算问题中的问数（按问号，至少 1）
function countQuestions(txt) {
  const t = String(txt || '')
  const m = (t.match(/[?？]/g) || []).length
  return Math.max(1, m)
}
function startStopwatch(limit) {
  limitSec = Math.max(1, limit || 60)
  limitShow.value = limitSec
  left.value = limitSec
  runSec.value = 0
  if (stopTimer) clearInterval(stopTimer)
  stopTimer = setInterval(() => {
    runSec.value++
    left.value = Math.max(0, left.value - 1)
    if (left.value <= 0 && stopTimer) {
      clearInterval(stopTimer)
      stopTimer = null
    }
  }, 1000)
}
function stopStopwatch() {
  if (stopTimer) {
    clearInterval(stopTimer)
    stopTimer = null
  }
}
// 评估本题用时：返回是否超时与超时秒数
function assessTime() {
  const used = runSec.value
  const over = Math.max(0, used - limitSec)
  return { used, limit: limitSec, over, ok: over === 0 }
}
function fmtSec(s) {
  const m = Math.floor(s / 60)
  const ss = s % 60
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}
async function scroll() {
  await nextTick()
  if (msgsBox.value) msgsBox.value.scrollTop = msgsBox.value.scrollHeight
}
async function pickImage(ev) {
  const files = ev.target.files || []
  for (const f of files) {
    if (!f.type.startsWith('image/')) continue
    const raw = await new Promise((res) => {
      const r = new FileReader()
      r.onload = () => res(r.result)
      r.onerror = () => res(null)
      r.readAsDataURL(f)
    })
    if (!raw) continue
    // 入列前压缩：既控 localStorage 体积（避免大图被 saveMsgs 清理导致历史丢失），也减小 API 载荷
    imgs.value.push(await compressImage(raw, 1000, 0.78))
  }
  ev.target.value = ''
}
function addImageUrl() {
  const u = linkUrl.value.trim()
  if (!u) {
    showToast('请粘贴图片链接', 'info')
    return
  }
  fetch(u)
    .then((r) => {
      if (!r.ok) throw new Error('HTTP ' + r.status)
      return r.blob()
    })
    .then((b) => {
      if (!b.type.startsWith('image/')) {
        showToast('该链接不是图片', 'error')
        return
      }
      const rd = new FileReader()
      rd.onload = async (e) => {
        imgs.value.push(await compressImage(e.target.result, 1000, 0.78))
        linkShow.value = false
        linkUrl.value = ''
      }
      rd.readAsDataURL(b)
    })
    .catch((e) => showToast('加载图片失败：' + e.message, 'error'))
}
function rmImg(i) {
  imgs.value.splice(i, 1)
}
let abortCtrl = null
function stopGenerate() {
  if (abortCtrl) {
    try {
      abortCtrl.abort()
    } catch (e) {}
  }
}
async function send() {
  if (store.busy) return
  store.busy = true
  abortCtrl = new AbortController()
  const txt = text.value.trim()
  if (!txt && !imgs.value.length) {
    store.busy = false
    return
  }
  const hasImg = imgs.value.length > 0
  const imgData = hasImg ? imgs.value[0] : ''
  const c = activeCfg(hasImg)
  if (!c || !c.key) {
    store.busy = false
    showToast('请先在设置配置模型 API Key（文字模型用于作答；发图时会智能识别：纯文字图走文字模型，含图形图走视觉模型或图形增强读图）', 'error')
    return
  }
  // 智能识图路由：图片永远接收，不拒收
  // ① 主视觉模型可识图（智谱/通义/OpenAI）→ 直接发图给它看；
  // ② 主视觉不能识图（如 DeepSeek 纯文本）→ 用「图形增强」视觉模型读图（区分纯文字/含图形）→ 文字模型作答；
  // ③ 两者都没有 → 仍接收图片，注入系统提示让模型礼貌引导，而非假装看到或拒收。
  let figRead = null
  if (hasImg && !supportsVision(c)) {
    const fc = figCfg()
    if (fc) {
      try {
        showToast('🖼 正在用图形增强模型读取图片…', 'info')
        figRead = await readQuestionFromImage(imgData, txt)
      } catch (e) {
        figRead = null
      }
      if (figRead && figRead.ok) {
        showToast(figRead.type === 'graph' ? '📐 图片含图形，已读取文字部分（图形题建议配视觉模型更准）' : '📄 图片为纯文字，已读取', 'success')
      }
    }
  }
  const userMsg = { role: 'user', content: hasImg ? { text: txt, imgs: imgs.value.slice() } : txt }
  if (figRead && figRead.ok) {
    userMsg._curImgRead = (figRead.text || txt) + (figRead.fig ? '\n【图形特征】' + figRead.fig : '')
    userMsg._imgType = figRead.type || 'text'
  }
  // 出题意图检测：用户要求「出题/让我做/直接选」→ 让 AI 输出带完整选项与【正确答案】标记的可点作答题目
  userMsg._askQuiz = /(出一|来一|能不能出|给我出|出个|出几道|出题|让我(做|选|答)|做(一|几)道|练习|练(一|几)题|直接选|有选项|来道|出道)/.test(txt)
  pushRecent(txt)
  addMsg(userMsg) // 经 addMsg 统一处理（含考场倒计时启动/保存/滚动）
  text.value = ''
  imgs.value = []
  scroll()
  // 截图完整题目 → 先整理成可作答卡片，询问「直接讲解 / 先做一遍」，不直接解析
  if (hasImg && figRead && figRead.ok) {
    let imgQuiz = parseQuiz(figRead.text || '')
    if (!imgQuiz) { const io = extractChoices(figRead.text || ''); if (io.length >= 2) imgQuiz = { stem: String(figRead.text || '').replace(/\s[A-D][.、．:：].*$/s, '').trim(), options: io, answer: '', needAi: true } }
    const wantDo = !txt.trim() || /整理|做一遍|先做|让我(做|选|答)|直接选|出题|作答/.test(txt)
    if (imgQuiz && wantDo) {
      store.msgs.push({ role: 'assistant', content: '📋 **已整理题目**（来自你的截图）：\n\n' + (figRead.text || '') + '\n\n你可以在下方题目卡片直接点选项作答（✍️ 先做一遍）；或点「📖 直接讲解」让我解析。作答后点「💬 发到对话深挖」可继续追问。', quiz: imgQuiz, orgCard: true, orgImg: (userMsg.content && userMsg.content.imgs) ? userMsg.content.imgs.slice() : [], t: Date.now() })
      saveMsgs()
      store.busy = false
      scroll()
      return
    }
  }
  await runChat()
}
// ===== 发起对话（含智能识图路由与失败降级重试） =====
async function runChat() {
  const lastMsg = store.msgs[store.msgs.length - 1]
  const curIsImg = !!(lastMsg && lastMsg.role === 'user' && lastMsg.content && lastMsg.content.imgs && lastMsg.content.imgs.length)
  const curFigRead = lastMsg && lastMsg._curImgRead
  const curTxt = lastMsg ? (typeof lastMsg.content === 'string' ? lastMsg.content : (lastMsg.content && lastMsg.content.text) || '') : ''
  const sentImgs = curIsImg ? lastMsg.content.imgs.slice() : []
  // 🚀 对话快模型（非思考模型秒回）：留空=跟随文字模型（思考模型慢）
  let replyC = activeCfg(curIsImg)
  let chatFast = ''
  let needImgRead = false
  try {
    chatFast = String(localStorage.getItem('xc_chat_fast_model') || localStorage.getItem('xc_fast_gen_model') || '').trim()
    if (chatFast && quickMode.value) {
      const fastC = { ...replyC, model: chatFast }
      const fv = supportsVision(fastC)
      if (!curIsImg || !fv) {
        replyC = fastC
        if (curIsImg && !fv && figCfg()) needImgRead = true
      }
    }
  } catch (e) {}
  // 图片 + 快模型不能识图 → 用图形增强模型预读图片内容（快模型据此作答）
  if (needImgRead && lastMsg && !lastMsg._curImgRead) {
    try {
      showToast('🚀 快模型不识别图片，正在用图形增强读图…', 'info')
      const fr = await readQuestionFromImage(lastMsg.content.imgs[0], curTxt)
      if (fr && fr.ok) {
        lastMsg._curImgRead = (fr.text || curTxt) + (fr.fig ? '\n【图形特征】' + fr.fig : '')
        lastMsg._imgType = fr.type || 'graph'
      }
      else replyC = activeCfg(curIsImg) // 读图失败回退主模型（慢但能看图）
    } catch (e) { replyC = activeCfg(curIsImg) }
  }
  let sys = buildSys(undefined, curTxt)
  if (lastMsg && lastMsg._askQuiz) {
    sys += '\n【用户要求出题练习】请按用户要求出一道完整的行测题：题干 + 完整 A/B/C/D 四个选项（每个选项单独一行）。**不要输出答案和解析**，让用户先选择；用户选完后系统会再让你判题讲解。'
  }
  if (curFigRead) {
    sys += '\n【重要·图片已读取，直接作答】用户刚发了一张图片，图片数据已由专业 OCR 完整提取为文字（见用户消息中【图片内容】标记），数据准确可信。请【直接据此作答】：不要讨论自己能否看图、是否纯文本模型、OCR 是否完整，不要复述提取过程，不要自我怀疑——直接给出答案与解析即可；若确有数据缺失，再请用户补充。'
  } else if (curIsImg && !supportsVision(replyC)) {
    sys += '\n【重要】用户发了一张图片，但当前模型看不到图片内容。请礼貌地请用户用文字描述题目/图形关键信息，或提示到设置配置视觉模型；不要假装看到了图片。'
  }
  // 行测快答节奏：仅快答模式（深度解析模式保持完整推理与质量）
  if (quickMode.value) {
    sys += '\n【行测快答节奏】这是行测考试题：先直接给出答案，再用简明 2-5 句讲清关键思路（图推先点规律再分步）；控制篇幅、勿长篇大论、勿反复自我怀疑。'
  }
  if (store.mode === 'all' && store.cfg.kb !== false) {
    const bm = detectBanKuai(curTxt)
    if (bm) {
      sys = buildSys(PLATE_MODE[bm] || '', curTxt)
    }
  }
  // 质量优先：历史尽量完整保留（不激进省 token），保障「解决具体提问」不缺上文。
  const visOk = supportsVision(replyC)
  const _AICAP = 4000 // 单条 assistant 回答最多发送字符
  const _HIS = 20 // 最多 20 条
  const _BUDGET = 35000 // 历史总字符预算，超出才丢更早
  const history = []
  let cum = 0
  // 批次5-P5-2 历史图片瘦身：仅最近一轮用户消息发 image_url，更早轮次用 OCR 文本/占位
  let imgSent = false
  for (let i = store.msgs.length - 1; i >= 0 && history.length < _HIS; i--) {
    const m = store.msgs[i]
    let item = null
    try {
      if (m.role === 'assistant') {
        const t = typeof m.content === 'string' ? m.content.trim() : ''
        if (!t || /^[❌⚠️⏳🔄🎯✍️]+/.test(t)) continue
        item = { role: m.role, content: t.slice(0, _AICAP) }
      } else {
        if (typeof m.content === 'string') {
          if (!(m.content || '').trim()) continue
          item = { role: m.role, content: m.content }
        } else if (m.content && ((m.content.text || '').trim() || (m.content.imgs && m.content.imgs.length))) {
          const parts = []
          if (m._curImgRead) {
            parts.push({ type: 'text', text: '【图片内容】' + m._curImgRead })
          } else if ((m.content.text || '').trim()) {
            parts.push({ type: 'text', text: m.content.text })
            // 仅最新一条用户消息携带图片（更早轮次跳过，避免 payload 随历史图数翻倍）
            if (visOk && Array.isArray(m.content.imgs) && !imgSent) {
              for (const u of m.content.imgs) {
                if (u && /^(data:image|https?:\/\/)/i.test(String(u))) parts.push({ type: 'image_url', image_url: { url: u } })
              }
              imgSent = true
            }
          } else {
            parts.push({ type: 'text', text: '[用户发送了一张图片]' })
          }
          item = { role: m.role, content: parts }
        }
      }
    } catch (e) {}
    if (!item) continue
    const clen = typeof item.content === 'string' ? item.content.length : 800
    if (cum + clen > _BUDGET && history.length > 0) break
    cum += clen
    history.unshift(item)
  }
  live.value = { text: '', think: '', thinkOpen: false }
  scroll()
  try {
    const full = await chatStream([{ role: 'system', content: sys }, ...history], replyC, (d) => {
      if (d.type === 'think') {
        live.value.think = d.think
      } else {
        live.value.text = d.text
      }
      scrollThrottled()
    }, abortCtrl.signal)
    live.value = null
    // 高效复盘指引：模型已按 SYS 输出则以模型为准；缺失时按板块本地复盘库兜底
    const review = buildReview(full, detectBanKuai(curTxt), curTxt)
    const finalContent = review ? full + '\n\n' + review : full
    addMsg({ role: 'assistant', content: finalContent })
    // 图形理解增强（可选·独立模型）：仅当图片含图形/表格时才自动复刻（避免对文字截图/纯文字题浪费 token）；其余情况用户可手动点「🖼 图形增强」
    if (sentImgs.length && shouldFigEnhance(curTxt, lastMsg && lastMsg._imgType)) {
      const lastAi = store.msgs[store.msgs.length - 1]
      maybeFigEnhance(lastAi, sentImgs, curTxt)
    }
    // 图推解析保障：若回复没画出标注 SVG，单独请求「只画一张标注图」补上
    const lastAi2 = store.msgs[store.msgs.length - 1]
    const hasRealSvg = lastAi2 && typeof lastAi2.content === 'string' && /```svg[\s\S]*?```|<svg[\s\S]*?<\/svg>/.test(lastAi2.content)
    const _isTutu = /图形推理|图推|九宫格|空间重构|截面|三视图|展开图|平面拼合/.test(curTxt)
    if (!hasRealSvg && _isTutu && detectBanKuai(curTxt) === '图形推理' && !curIsImg) {
      drawTutuAnno(lastAi2, curTxt)
    }
    if (store.cfg.ttsOn) autoSpeak(finalContent)
  } catch (e) {
    live.value = null
    if (e.name === 'AbortError') {
      addMsg({ role: 'assistant', content: live.value && live.value.text ? live.value.text : '⏹ 已停止生成。', stopped: true })
    } else if (curIsImg && !curFigRead && figCfg()) {
      // 视觉请求失败（如接口拒收图片）→ 自动用图形增强模型读图后重试一次
      try {
        showToast('视觉模型请求失败，正在用图形增强模型读图重试…', 'info')
        const fr = await readQuestionFromImage(lastMsg.content.imgs[0], curTxt)
        if (fr && fr.ok) {
          lastMsg._curImgRead = (fr.text || curTxt) + (fr.fig ? '\n【图形特征】' + fr.fig : '')
          return runChat()
        }
      } catch (_) {}
      addMsg({ role: 'assistant', content: '❌ 图片请求失败：' + e.message + '（可到设置→图形增强配免费视觉模型自动读图，或视觉模型换智谱 GLM-5V / 通义 Qwen-VL）', err: true, retryKey: Date.now() })
    } else {
      addMsg({ role: 'assistant', content: '❌ 请求失败：' + e.message, err: true, retryKey: Date.now() })
    }
  }
  abortCtrl = null
  store.busy = false
}
// 图形增强是否应自动复刻：仅当图片含图形/表格（或提问文字带图相关词）才触发，避免对文字截图/纯文字题浪费 token
function shouldFigEnhance(q, imgType) {
  if (imgType === 'graph') return true
  if (!q) return false
  // 资料分析截图（哪怕纯文字材料）也要复刻+标注数据位置：材料就是"题"，必须可视化
  if (detectBanKuai(String(q)) === '资料分析') return true
  if (imgType === 'text') return false
  return /图形|图推|几何|表格|图表|柱状|折线|饼图|对称|展开图|立体|坐标|示意图|方格|宫格|一笔画/.test(q)
}
// 图推解析「补画标注图」：主回复没带 SVG 时，单独请求模型只输出一张带标注的原图
async function drawTutuAnno(msg, q) {
  let c = activeCfg(false)
  if (!c || !c.key || !msg) return
  // 优先用「出题快模型」（非思考模型，画图不容易被思考过程截断）
  try {
    const fgm = String(localStorage.getItem('xc_fast_gen_model') || localStorage.getItem('xc_chat_fast_model') || '').trim()
    if (fgm) c = { ...c, model: fgm }
  } catch (e) {}
  showToast('📐 正在补画标注图…', 'info')
  try {
    const sys = '你是公考图形推理绘图助手。只负责画图，不解释。'
    const ask =
      '请针对下面这道图形推理题，只输出【一个】```svg 代码块：重绘题干原图，并在原图上直接标注规律（辅助线/箭头/高亮框/虚线对称轴/圈出变化元素，用不同颜色区分），让规律一眼可见。' +
      'SVG 必须带 viewBox、元素坐标在界内、图形与题目一致；除这个 SVG 代码块外，不要输出任何文字、标题、解释、前后缀。题目：' +
      String(q).slice(0, 300)
    const reply = await chatOnce(c, [{ role: 'system', content: sys }, { role: 'user', content: ask }], 3000, 90000)
    const m = String(reply || '').match(/```svg\s*\n?([\s\S]*?)```|<svg[\s\S]*?<\/svg>/)
    const svg = m ? (m[1] || m[0]).trim() : ''
    if (svg && svg.includes('<svg')) {
      addMsg({ role: 'assistant', content: '📐 原图标注（重绘+标注，辅助看懂规律）：\n\n```svg\n' + svg + '\n```' })
      showToast('✅ 已补画标注图', 'success')
    } else {
      showToast('⚠️ 标注图生成失败（模型未输出有效 SVG；可在出卷参数填「出题快模型」如 deepseek-chat 提速画图）', 'error')
    }
  } catch (e) {
    showToast('⚠️ 标注图生成失败：' + e.message, 'error')
  }
}

// ===== 图形理解增强（可选）：独立开源视觉模型复刻原图 =====
const figView = ref(null)
function figZoom(f) {
  if (f && f.svg) figView.value = f
}
function closeFigZoom() { figView.value = null }
// 保存复刻图：SVG → PNG（canvas 光栅化，白底），失败回退下载 .svg
function figSave(f) {
  if (!f || !f.svg) return
  try {
    const raw = String(f.svg).trim()
    const xml = new globalThis.XMLSerializer().serializeToString(new globalThis.DOMParser().parseFromString(raw, 'image/svg+xml'))
    const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    let w = 900, h = 600
    const vb = raw.match(/viewBox\s*=\s*["']([\d.-]+)[\s,]+([\d.-]+)[\s,]+([\d.-]+)[\s,]+([\d.-]+)["']/)
    if (vb) { w = Math.round(Number(vb[3])); h = Math.round(Number(vb[4])) }
    const img = new Image()
    img.onload = () => {
      try {
        const cv = document.createElement('canvas')
        cv.width = w; cv.height = h
        const ctx = cv.getContext('2d')
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h)
        ctx.drawImage(img, 0, 0, w, h)
        cv.toBlob((b) => {
          if (b) downloadBlob(b, '复刻图.png')
          else downloadBlob(blob, '复刻图.svg')
          URL.revokeObjectURL(url)
        }, 'image/png')
      } catch (e) { downloadBlob(blob, '复刻图.svg'); URL.revokeObjectURL(url) }
    }
    img.onerror = () => { downloadBlob(blob, '复刻图.svg'); URL.revokeObjectURL(url) }
    img.src = url
  } catch (e) { showToast('保存失败：' + e.message, 'error') }
}
function downloadBlob(b, name) {
  const u = URL.createObjectURL(b)
  const a = document.createElement('a')
  a.href = u; a.download = name
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { a.remove(); URL.revokeObjectURL(u) }, 500)
}
async function maybeFigEnhance(msg, imgs, q) {
  const c = figCfg()
  if (!c || !imgs || !imgs.length) return
  const raw = imgs[0]
  if (!raw || !String(raw).startsWith('data:image')) return
  msg.figBusy = true
  scroll()
  try {
    const small = await compressImage(raw, 900, 0.75)
    const res = await analyzeFigImage(small, q, detectBanKuai(String(q)))
    if (res && res.ok) {
      msg.fig = { ok: true, type: res.type, summary: res.summary, rule: res.rule || '', tips: res.tips, svg: res.svg }
    } else {
      msg.fig = { ok: false, err: (res && res.err) || '模型未返回可复刻的图形（可能该截图无需画图）' }
    }
  } catch (e) {
    msg.fig = { ok: false, err: (e && e.message) || '未知错误' }
  }
  msg.figBusy = false
  saveMsgs()
  scroll()
}
// 手动/重试图形增强：找到该回复前面最近一条带图提问的图片
function findPrevUserImg(m) {
  const idx = store.msgs.indexOf(m)
  for (let i = idx - 1; i >= 0; i--) {
    const u = store.msgs[i]
    if (u.role !== 'user') continue
    const imgs = u.content && Array.isArray(u.content.imgs) ? u.content.imgs : []
    const valid = imgs.find(x => x && String(x).startsWith('data:image'))
    return valid || null
  }
  return null
}
function prevHasImg(m) {
  return !!findPrevUserImg(m)
}
async function retryFigEnhance(m) {
  if (m.figBusy) return
  const img = findPrevUserImg(m)
  if (!img) { showToast('没有找到对应的题目图片，无法复刻', 'error'); return }
  m.fig = null
  m.figBusy = true
  scroll()
  try {
    const small = await compressImage(img, 900, 0.75)
    const res = await analyzeFigImage(small, textOf(m))
    m.fig = res && res.ok ? { ok: true, type: res.type, summary: res.summary, rule: res.rule || '', tips: res.tips, svg: res.svg } : { ok: false, err: (res && res.err) || '模型未返回可复刻的图形' }
  } catch (e) {
    m.fig = { ok: false, err: (e && e.message) || '未知错误' }
  }
  m.figBusy = false
  saveMsgs()
  scroll()
}

function retryLast() {
  const last = store.msgs[store.msgs.length - 1]
  if (!last || !last.err) return
  let idx = store.msgs.length - 2
  for (; idx >= 0; idx--) {
    if (store.msgs[idx].role === 'user') {
      break
    }
  }
  if (idx < 0) {
    showToast('找不到可重试的提问', 'info')
    return
  }
  const u = store.msgs[idx]
  store.msgs.splice(store.msgs.length - 1, 1)
  saveMsgs()
  const txt = typeof u.content === 'string' ? u.content : (u.content && u.content.text) || ''
  const imgs = u.content && Array.isArray(u.content.imgs) ? u.content.imgs : []
  text.value = txt
  imgs.value = imgs.slice()
  scroll()
  send()
}
function resendMsg(i) {
  const u = store.msgs[i]
  if (!u || u.role !== 'user') return
  const txt = typeof u.content === 'string' ? u.content : (u.content && u.content.text) || ''
  const imgs = u.content && Array.isArray(u.content.imgs) ? u.content.imgs : []
  text.value = txt
  imgs.value = imgs.slice()
  scroll()
  send()
}
function saveWrong() {
  const n = store.msgs.length
  if (n < 2) {
    showToast('请先完成一次问答', 'info')
    return
  }
  // 取最后一轮：最后一条用户消息 + 对应 AI 消息板块
  let uIdx = -1
  for (let i = n - 1; i >= 0; i--) {
    if (store.msgs[i].role === 'user') {
      uIdx = i
      break
    }
  }
  if (uIdx < 0) {
    showToast('找不到提问', 'info')
    return
  }
  const u = store.msgs[uIdx]
  const aiMsg = store.msgs.find((m, idx) => m.role === 'assistant' && idx > uIdx)
  const bk = (aiMsg && aiMsg.bk) || detectBanKuai(lastAskText) || '判断推理'
  // 保存该轮提问的图片（原题截图）与原消息索引（可跳回原对话）
  const imgs =
    u.content && u.content.imgs && u.content.imgs.length ? u.content.imgs.slice() : []
  bkPick.value = bk
  bkOrigin.value = { q: textOf(u), imgs, msgIdx: uIdx }
  bkShow.value = true
}
// ===== 选择题作答：点选选项 → 判对错 + 可存错题本 =====
function pickQuiz(m, k) {
  if (!m || !m.quiz || m.quiz.picked) return
  m.quiz.picked = k
  if (!m.quiz.answer) { m.quiz.correct = null; quizAiCheck(m); return }
  m.quiz.correct = k === m.quiz.answer
  const qz = m.quiz
  const opts = (qz.options || []).map((o, i) => String(i === 0 ? 'A' : String.fromCharCode(64 + i + 1)) + '、' + String(o.t || o || '').replace(/<[^>]+>/g, ' ')).join('。')
  store.readCtx = { type: 'chat', title: '对话出题·' + (detectBanKuai(String(qz.stem || '')) || '综合'), text: (String(qz.stem || '').replace(/<[^>]+>/g, ' ').trim() + '。' + (opts ? '选项：' + opts + '。' : '') + '你的答案：' + String(k) + '；正确答案：' + String(qz.answer || '') + '。' + (qz.explain ? '解析：' + String(qz.explain).replace(/<[^>]+>/g, ' ').trim() : '')).slice(0, 1400) }
  store.curQ = { plate: detectBanKuai(String(qz.stem || '')) || '综合', kind: '对话出题', stem: qz.stem, options: qz.options || [], answer: qz.answer || '', explain: qz.explain || '', your: k, ok: qz.correct }
  saveMsgs()
  if (m.quiz.correct === null) { showToast('⏳ 已提交，正在让 AI 判题…', 'info'); return }
  if (m.quiz.correct) showToast('✅ 回答正确，看解析巩固', 'success')
  else showToast('❌ 选错了，正确答案是 ' + m.quiz.answer, 'error')
}
// 无答案出题卡：用户选后调 AI 判对错 + 补解析（"先选，选完弹解析"）
async function quizAiCheck(m) {
  if (!m || !m.quiz || m.quiz.checking) return
  const c = activeCfg(false)
  if (!c || !c.key) { showToast('请先在设置配置模型 API Key', 'error'); return }
  m.quiz.checking = true
  try {
    const qz = m.quiz
    const sys = '你是行测老师。请批改下面这道选择题：先给结论（对/错），再给完整解析（考点 + 正确思路 + 干扰项为什么错）。'
    const prompt = '题目：' + qz.stem + '\n' + (qz.options || []).map((o) => o.k + '. ' + o.t).join('\n') + '\n用户选择：' + qz.picked + '\n\n请严格按 JSON 输出，不要多余文字：{"answer":"正确选项字母(A-D)","verdict":"right|wrong","explain":"完整解析"}'
    const reply = await chatOnce(c, [{ role: 'user', content: sys + '\n' + prompt }], 800, 30000)
    // 答案抽取：① JSON 优先；② 多种自然语言格式兜底（正确选项是X/答案：X/选X/选项X）
    let ans = ''
    const rt = String(reply || '').trim()
    try { const j = JSON.parse(rt.match(/\{[\s\S]*\}/)?.[0] || 'null'); if (j && /^[A-D]$/i.test(String(j.answer || ''))) ans = String(j.answer).toUpperCase() } catch (e) {}
    if (!ans) {
      const m2 = rt.match(/(?:正确选项|正确答案|答案|选|选择|选项)\s*[:：是]?\s*([A-D])\b/i) || rt.match(/\b([A-D])\s*(?:项)?\s*(?:正确|对)/i)
      if (m2) ans = m2[1].toUpperCase()
    }
    qz.answer = ans
    qz.correct = ans ? qz.picked === ans : false
    qz.checkFailed = !ans
    qz.aiChecked = !!ans
    qz.explain = (qz.explain ? qz.explain + '\n\n' : '') + '🤖 判题：' + rt
    qz.checking = false
    saveMsgs()
    if (qz.correct) showToast('✅ 回答正确！(AI 已按解析核验)', 'success')
    else if (ans) showToast('❌ 答错了，正确答案是 ' + ans + '(AI 已按解析核验)', 'error')
    else showToast('⚠️ 未取回答案，不显示猜测字母，请人工核对', 'error')
  } catch (e) {
    m.quiz.checking = false
    showToast('AI 判题失败：' + (e && e.message), 'error')
  }
}
function saveQuizWrong(m) {
  if (!m || !m.quiz) return
  const qz = m.quiz
  const stem = qz.stem
  const subject = detectBanKuai(stem) || m.bk || '判断推理'
  addWrong({
    id: Date.now(),
    subject,
    question: stem + '\n\n' + qz.options.map((o) => o.k + '. ' + o.t).join('\n'),
    answer: qz.answer ? '正确答案 ' + qz.answer : '',
    your: qz.picked || '',
    reasons: qz.picked && !qz.correct ? ['选择题作答失误'] : [],
    time: new Date().toLocaleString(),
    at: Date.now(),
    wrongCount: 1,
    correctStreak: 0,
    mastery: 0,
    digested: false
  }, { allowNoAnswer: true })
  saveWqs()
}
// ===== ⛶ 全屏做题：对话出题卡片可弹出卷面化做题窗口（轻量即时判题，同一 m.quiz 对象状态自动同步） =====
const quizFull = ref(null)
function quizFullShow(m) {
  if (!m || !m.quiz) return
  quizFull.value = m
}
function quizFullClose() { quizFull.value = null }
function quizFullDeep(m) {
  if (!m || !m.quiz) return
  quizFullClose()
  quizDeep(m)
}
function quizPlate(m) {
  const qz = m && m.quiz
  if (!qz) return ''
  return detectBanKuai(String(qz.stem || '')) || m.bk || ''
}
function quizHasSvg(m) {
  const qz = m && m.quiz
  return !!(qz && Array.isArray(qz.options) && qz.options.some((o) => /<svg/i.test(String(o.t || ''))))
}
// 答错后「加入错题集？(加入/忽略)」确认条
function quizWrongAdd(m) {
  if (!m || !m.quiz) return
  m.quiz.wrongPrompted = true
  saveQuizWrong(m)
}
function quizWrongIgnore(m) {
  if (!m || !m.quiz) return
  m.quiz.wrongPrompted = true
  saveMsgs()
}
// 对话出题卡：完整题目 / 完整解析 截图导出
function capQuizShot(m, kind) {
  if (!m || !m.quiz) return
  const qz = m.quiz
  const stem = String(qz.stem || '')
  const opts = (qz.options || []).map((o) => o.k + '. ' + (o.t || '')).join('\n\n')
  const sub = (m.bk || '') + ' · 对话出题'
  if (kind === 'q') {
    downloadMdScreenshot({ title: '行测 · 题目截图', sub, md: stem + (opts ? '\n\n' + opts : ''), name: '对话题目截图' })
  } else {
    const parts = []
    if (qz.picked) parts.push('**我的答案：**' + qz.picked)
    if (qz.answer) parts.push('**正确答案：**' + qz.answer + (qz.correct != null ? (qz.correct ? '（✅ 正确）' : '（❌ 错误）') : ''))
    if (qz.explain) parts.push(qz.explain)
    downloadMdScreenshot({ title: '行测 · 题目解析', sub, md: parts.join('\n\n') || '（暂无解析）', name: '对话题目解析' })
  }
}
// 截图题按钮化：📖 直接讲解（带原图重发，确保 AI 看得到题目）/ ✍️ 先做一遍（定位卡片）
function quizExplainNow(m) {
  const org = (m && m.orgImg && m.orgImg.length) ? m.orgImg.slice() : []
  if (org.length) imgs.value = org
  const cardTxt = m && typeof m.content === 'string' ? String(m.content).replace(/[#*`>|_]/g, '').replace(/\n+/g, ' ').slice(0, 500) : ''
  text.value = cardTxt ? '请直接讲解这道题（题目内容已整理如下）：\n' + cardTxt : '直接讲解'
  scroll()
  send()
}
function quizScrollTo() {
  scroll()
  showToast('👆 在上方题目卡片直接点选项作答，做完自动判题+解析', 'info')
}
function textOf(m) {
  return typeof m.content === 'string' ? m.content : (m.content && m.content.text) || ''
}
// 把聊天里的题目卡片发回对话，用名师方法深度讲解（结合用户作答情况）
function quizDeep(m) {
  if (!m || !m.quiz) return
  const qz = m.quiz
  const t =
    '请用名师方法深度讲解这道题' +
    (qz.picked ? '（我选了 ' + qz.picked + (qz.correct ? '，答对了' : '，答错了') + '）' : '') +
    '：\n' + qz.stem + '\n' + qz.options.map((o) => o.k + '. ' + o.t).join('\n') +
    '\n正确答案：' + qz.answer +
    (qz.explain ? '\n原解析：' + qz.explain : '')
  text.value = t
  scroll()
  send()
}
// 存错题板块选择器
const bkShow = ref(false)
const examShow = ref(false) // 统一：模拟组卷
const examPanelSrc = ref('ai') // ai=AI出题 / import=导入 / wrong=错题
const examOffline = ref(false) // 离线练习：打开单题快练并默认启用本地生成器
const examPaperData = ref(null) // 外部传入待重做/查看的卷子
function openExam(src) {
  examPanelSrc.value = src || 'ai'
  examShow.value = true
  store.examOpen = true
  store.uiCtx.panel = 'exam'
  navOpen({ id: 'exam', label: src === 'single' ? '单题快练' : (src === 'import' ? '导入组卷' : src === 'wrong' ? '错题组卷' : '模拟组卷') })
}
function closeExam() {
  examShow.value = false
  store.examOpen = false
  store.uiCtx.panel = null
  examPaperData.value = null
  navBack()
}
function openPaperData(paper) {
  examPaperData.value = paper || null
  examPanelSrc.value = 'ai'
  examShow.value = true
  store.examOpen = true
  navOpen({ id: 'exam', label: (paper && paper.name) ? paper.name : '模拟组卷' })
}
function openSolid() {
  solidShow.value = true
  store.uiCtx.panel = 'solid'
  navOpen({ id: 'solid', label: '立体图推' })
}
function closeSolid() {
  solidShow.value = false
  store.uiCtx.panel = null
  navBack()
}
function openDataTrain() {
  dtShow.value = true
  store.uiCtx.panel = 'data'
  navOpen({ id: 'data', label: '资料速算' })
}
function closeDataTrain() {
  dtShow.value = false
  store.uiCtx.panel = null
  navBack()
}
function onNavBack(e) {
  const ids = (e && e.detail) || []
  if (ids.includes('exam')) { examShow.value = false; store.examOpen = false; store.uiCtx.panel = null }
  if (ids.includes('solid')) { solidShow.value = false; store.uiCtx.panel = null }
  if (ids.includes('data')) { dtShow.value = false; store.uiCtx.panel = null }
}
const solidShow = ref(false) // 立体图推训练
const dtShow = ref(false) // 资料分析四层能力训练
const bkPick = ref('判断推理')
const bkOrigin = ref({ q: '', imgs: [], msgIdx: -1 })
const BK_OPTIONS = [
  '判断推理', '言语理解', '资料分析', '数量关系', '常识判断', '政治理论',
  '定义判断', '类比推理', '图形推理'
]
// 压缩图片：存错题时用缩略图控制 localStorage 体积（最长边 max 像素）
function compressImage(dataUrl, max = 760, quality = 0.72) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      let { width, height } = img
      if (width > height && width > max) {
        height = Math.round((height * max) / width)
        width = max
      } else if (height > max) {
        width = Math.round((width * max) / height)
        height = max
      }
      const c = document.createElement('canvas')
      c.width = width
      c.height = height
      const g = c.getContext('2d')
      g.drawImage(img, 0, 0, width, height)
      try {
        resolve(c.toDataURL('image/jpeg', quality))
      } catch (e) {
        resolve(dataUrl)
      }
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}
async function confirmSaveWrong() {
  // 压缩原题截图后存入错题本（避免 localStorage 超限）
  const raw = bkOrigin.value.imgs || []
  const imgs = []
  for (const it of raw) imgs.push(it.startsWith('data:') ? await compressImage(it) : it)
  const q = (bkOrigin.value.q || '').slice(0, 220)
  addWrong({
    id: Date.now(),
    subject: bkPick.value,
    question: q,
    imgs,
    msgIdx: bkOrigin.value.msgIdx,
    reasons: [],
    time: new Date().toLocaleString(),
    at: Date.now(),
    wrongCount: 1,
    correctStreak: 0,
    mastery: 0,
    digested: false
  })
  saveWqs()
  bkShow.value = false
}
function getLastUserText() {
  const c = collectChat()
  let x = null
  for (let i = c.length - 1; i >= 0; i--) {
    if (c[i].role === 'user') {
      x = c[i].text
      break
    }
  }
  return x || ''
}
// 找"最近一轮 AI 出题消息"（含 A/B/C/D 选项），作为变式题的完整原题上下文。
// 修复：此前取 getLastUserText()，用户在选择题点选后最后一条用户消息只是选项字母（如"C"），
// 导致变式题发给 AI 的是残缺文本、无法出题。
function getLastQuizText() {
  const quizRe = /^\s*[A-D][.、．:：]/m
  for (let i = store.msgs.length - 1; i >= 0; i--) {
    const m = store.msgs[i]
    if (!m || m.role !== 'assistant' || m.err || m.stopped || m.live) continue
    const t = textOf(m)
    if (!t) continue
    const hasOptions = (m.quiz && Array.isArray(m.quiz.options) && m.quiz.options.length >= 2) || quizRe.test(t)
    if (hasOptions) return t.slice(0, 1600)
  }
  return ''
}
const trainPlate = ref('判断推理')
const plates = Object.keys(PLATE_MODE)
const modeHint = {
  all: '输入题目或问题，或直接提问某个知识点',
  luoji: '请教一道论证/形式逻辑题，我用薛睿五步法给你讲',
  yanyu: '把文段粘贴进来，三师帮你找准主旨',
  tutu: '上传图推截图，我按薛睿24诀帮你找规律',
  ziliao: '粘贴资料材料+问题，我帮你列公式并速算',
  shuliang: '发一道数量题，我教你可秒杀的思路',
  zhengzhi: '问政治理论考点，小黑口诀帮你记',
  changshi: '问一道常识题，我给你考点和蒙题思路',
  leibi: '发一个类比题，用三步定位法帮你拆',
  dingyi: '发一道定义判断，我按五要件帮你核对'
}
const inputPh = computed(() => modeHint[store.mode] || '输入题目或问题… (可语音/传图)')
const dStat = computed(() => ({
  q: store.msgs.filter((m) => m.role === 'user').length,
  w: store.wqs.length,
  r: store.wqs.filter((v) => v.reviewed).length
}))
const motos = [
  '日拱一卒，功不唐捐',
  '把错题当补药，吃一颗涨一分',
  '你不是不会，只是还差一次次复盘',
  '稳定发挥 = 会的都对、错的不再错',
  '今日刷题，明日上岸',
  '方法对了，努力才有价值'
]
const motto = ref(motos[Math.floor(Math.random() * motos.length)])
function collectStat() {
  const bc = {}
  collectChat().forEach((m) => {
    if (m.role !== 'user') return
    const t = m.text || ''
    if (!t) return
    const bk = detectBanKuai(t) || '综合'
    bc[bk] = bc[bk] + 1 || 1
  })
  const wqBy = {},
    rs = {}
  ;(store.wqs || []).forEach((q) => {
    wqBy[q.subject || '未分类'] = wqBy[q.subject || '未分类'] + 1 || 1
    ;(q.reasons || []).forEach((r) => (rs[r] = rs[r] + 1 || 1))
  })
  return (
    '各板块提问次数：' +
    Object.entries(bc)
      .map(([k, v]) => k + ' ' + v + '次')
      .join('、') +
    '\n各板块错题数：' +
    Object.entries(wqBy)
      .map(([k, v]) => k + ' ' + v + '题')
      .join('、') +
    '\n错因分布：' +
    Object.entries(rs)
      .map(([k, v]) => k + '×' + v)
      .join('、') +
    '\n已复盘/总错题：' +
    store.wqs.filter((q) => q.reviewed).length +
    '/' +
    store.wqs.length
  )
}
async function train(kind, opts = {}) {
  const c = activeCfg(false)
  if (!c || !c.key) {
    showToast('请先在设置配置文字模型 API Key', 'error')
    return
  }
  if (store.busy) return
  const sys = buildTaskSys(kind, opts)
  let userText
  if (kind === 'quiz') userText = '请为【' + (opts.plate || '所选板块') + '】出一道仿真模拟题。'
  else if (kind === 'variant') {
    userText =
      '请针对我刚才问的那道题，出一道【考点题型完全相同、题干素材全新】的变式检验题。原题：' +
      String(opts.prev || getLastQuizText() || getLastUserText()).slice(0, 1500)
  } else if (kind === 'diag') {
    userText = '我的学习数据如下，请诊断：\n' + collectStat()
  } else return
  const userMsg = { role: 'user', content: userText }
  addMsg(userMsg) // 经 addMsg 统一处理（含考场倒计时启动）
  live.value = { text: '', think: '', thinkOpen: false }
  store.busy = true
  abortCtrl = new AbortController()
  scroll()
  try {
    const full = await chatStream(
      [
        { role: 'system', content: sys },
        { role: 'user', content: userText }
      ],
      c,
      (d) => {
        if (d.type === 'think') {
          live.value.think = d.think
        } else {
          live.value.text = d.text
        }
        scrollThrottled()
      },
      abortCtrl.signal
    )
    live.value = null
    addMsg({ role: 'assistant', content: full })
    if (store.cfg.ttsOn) autoSpeak(full)
  } catch (e) {
    live.value = null
    if (e.name === 'AbortError') {
      addMsg({ role: 'assistant', content: '⏹ 已停止生成。', stopped: true })
    } else {
      addMsg({ role: 'assistant', content: '❌ 生成失败：' + e.message })
    }
  }
  abortCtrl = null
  store.busy = false
}
// 找出薄弱板块：错题最多的分类
function findWeakPlate() {
  const cnt = {}
  store.wqs.forEach((q) => {
    const k = detectBanKuai(q.subject || '')
    if (k) cnt[k] = (cnt[k] || 0) + 1
  })
  let best = null
  for (const k in cnt) if (cnt[k] > 0 && (!best || cnt[k] > best.n)) best = { k, n: cnt[k] }
  return best ? { plate: best.k, count: best.n, mode: PLATE_MODE[best.k] } : null
}
function trainWeak() {
  const w = findWeakPlate()
  if (!w) {
    showToast('暂无错题，先做一些题吧', 'info')
    return
  }
  showToast('正在针对薄弱板块「' + w.plate + '」出题…', 'info')
  train('quiz', { plate: w.plate, mode: w.mode, difficulty: 'mid' })
}
function autoSpeak(t) {
  if (store.cfg.ttsOn !== false && t)
    speak(String(t).replace(/[#*`>|_]/g, ''), {
      scene: store.cfg.ttsScene,
      rate: store.cfg.ttsRate,
      pitch: store.cfg.ttsPitch
    })
}
function toggleTts() {
  store.cfg.ttsOn = store.cfg.ttsOn === false
  saveCfg()
  if (store.cfg.ttsOn === false) stopSpeak()
  showToast(store.cfg.ttsOn ? '🔊 自动朗读已开启' : '🔇 自动朗读已关闭', 'info')
}
function toggleSpeak(ev) {
  const btn = ev.currentTarget
  const msg = btn.closest('.msg')
  if (!msg) return
  if (speaking()) {
    stopSpeak()
    btn.textContent = '🔊 朗读'
    return
  }
  const c = msg.cloneNode(true)
  // 只朗读「回复正文」：移除功能按钮行 / 元信息标签（AI批改·时间·板块）/ 折叠按钮 / 图形头部与加载失败提示 / 思考过程
  ;['.msg-actions', '.ans-tag', '.fold-btn', '.fig-hd', '.fig-busy', '.fig-fail', '.quiz-acts', '.think-box', '.code-copy'].forEach((sel) => {
    c.querySelectorAll(sel).forEach((el) => el.remove())
  })
  speak(c.innerText || '', {
    scene: store.cfg.ttsScene,
    rate: store.cfg.ttsRate,
    pitch: store.cfg.ttsPitch,
    onEnd: () => {
      btn.textContent = '🔊 朗读'
    }
  })
  btn.textContent = '🔇 停止'
}
function toggleMic() {
  const ok = startRecog((t) => {
    text.value += t
    scroll()
  })
  if (!ok) {
    showToast('当前浏览器不支持语音输入（请用Chrome/Edge）', 'error')
    return
  }
  recogOn.value = recogActive()
}
const modeOpen = ref(false)
// 模式分组（用于顶部紧凑选择器）
const MODE_GROUPS = [
  { k: 'all', t: '🌟 综合模式', items: ['all'] },
  { k: 'pd', t: '🧠 判断推理', items: ['luoji', 'leibi', 'dingyi', 'tutu'] },
  { k: 'yy', t: '📖 言语理解', items: ['zhanggong', 'yanyu'] },
  { k: 'zl', t: '📈 资料 / 数量', items: ['ziliao', 'shuliang'] },
  { k: 'cs', t: '🏛️ 常识 / 政治', items: ['zhengzhi', 'changshi'] }
]
function modeIcon(m) {
  return String(MODE_NAMES[m] || '🧭').split(/[\s·]/)[0] || '🧭'
}
function modeName(m) {
  // 去掉名称前的 emoji，图标单独展示，避免重复
  return String(MODE_NAMES[m] || m).replace(/^\S+\s*/, '')
}
function setMode(m) {
  store.mode = m
  localStorage.setItem('xc_mode', m)
}
const quickCards = [
  { ic: '🧠', t: '逻辑判断', s: '薛睿五步法', bg: 'a', mode: 'luoji', q: '讲解论点削弱/支持的五步分析和拆桥论证' },
  { ic: '📖', t: '言语理解', s: '三师片段', bg: 'g', mode: 'yanyu', q: '分析这段文字的意图（附上题干即可）' },
  { ic: '🔷', t: '图形推理', s: '图推 24 诀', bg: 'b', mode: 'tutu', q: '这道图推题怎么找规律（上传图片）' },
  { ic: '📊', t: '资料分析', s: '四大神器', bg: 'y', mode: 'ziliao', q: '基期比重公式是什么，何时用' },
  { ic: '🏛️', t: '政治理论', s: '小黑口诀', bg: 'p', mode: 'zhengzhi', q: '新思想五大新发展理念和口诀' },
  { ic: '🔢', t: '数量关系', s: '四层金字塔', bg: 'r', mode: 'shuliang', q: '工程问题设最小公倍数的秒杀法' },
  { ic: '🧊', t: '立体图推', s: '空间重构训练', bg: 'c', mode: 'luoji', q: '空间重构/立体图形的三视图怎么快速判断？请讲方法' },
  { ic: '✍️', t: '出题考我', s: '打开单题快练', bg: 'g', act: 'single' },
  { ic: '🎯', t: '考点总结', s: '高频考点', bg: 'y', mode: 'all', q: '行测判断推理模块有哪些高频考点？请按考频排序总结' },
  { ic: '⚡', t: '秒杀技巧', s: '快解套路', bg: 'b', mode: 'all', q: '资料分析有哪些秒杀速算技巧？举例说明' },
  { ic: '📝', t: '错题诊断', s: '错因分析', bg: 'p', mode: 'all', q: '请分析我最近的错题，指出共性错因和改进方法' }
]
// 立体图推 → 发到主对话继续深挖
function onSolidQuestion(q) {
  const t = String(q || '').trim()
  if (!t) return
  text.value = t
  scroll()
  send()
}
// ===== 提问历史（最近提问，点击快速重发）=====
const recentQs = ref([])
try { recentQs.value = JSON.parse(localStorage.getItem('xc_recent_qs') || '[]') || [] } catch (e) {}
function pushRecent(t) {
  const k = String(t || '').trim()
  if (!k || k.length < 4) return
  recentQs.value = [k, ...recentQs.value.filter((x) => x !== k)].slice(0, 8)
  try { localStorage.setItem('xc_recent_qs', JSON.stringify(recentQs.value)) } catch (e) {}
}
function useRecent(t) {
  text.value = t
  scroll()
  send()
}
// ===== 草稿自动保存 =====
let draftTimer = null
watch(text, (v) => {
  if (draftTimer) clearTimeout(draftTimer)
  draftTimer = setTimeout(() => {
    try { localStorage.setItem('xc_chat_draft', String(v || '')) } catch (e) {}
  }, 600)
})
function restoreDraft() {
  try {
    const d = localStorage.getItem('xc_chat_draft')
    if (d && !text.value) { text.value = d; localStorage.removeItem('xc_chat_draft') }
  } catch (e) {}
}
// ===== 回复反馈 / 追问 / 收藏 =====
function toggleFb(m, v) {
  if (!m) return
  m.fb = m.fb === v ? '' : v
  saveMsgs()
  showToast(m.fb ? (v === 1 ? '👍 已标记有用' : '👎 已标记待改进') : '已取消标记', 'info')
}
function followUp(m) {
  const t = m && m.content ? (typeof m.content === 'string' ? m.content : (m.content && m.content.text) || '') : ''
  const brief = String(t).replace(/[#*`>|_]/g, '').slice(0, 200)
  text.value = '请基于你刚才的讲解（' + brief + '…）继续深入：'
  scroll()
  const tb = document.querySelector('.input-bar textarea')
  if (tb) tb.focus()
}
function collectMsg(m) {
  const t = m && m.content ? (typeof m.content === 'string' ? m.content : (m.content && m.content.text) || '') : ''
  if (!t) { showToast('没有可收藏的内容', 'info'); return }
  const title = String(t).replace(/[#*`>|_]/g, '').slice(0, 24) + '…'
  store.notes.unshift({ title: '📌 ' + title, body: t, t: new Date().toLocaleString() })
  saveNotes()
  showToast('✅ 已收藏到我的笔记', 'success')
}
// 长回复折叠
const expanded = ref({})
function toggleExpand(i) { expanded.value[i] = !expanded.value[i] }
// 板块归属修正：点击消息板块标签 → 弹出九板块选择 → 回写 m.bk（历史消息与统计归属同步修正）
function fixPlate(m, _ev) {
  m.bkEditing = !m.bkEditing
  saveMsgs()
}
function applyPlate(m, bp) {
  m.bk = bp
  m.bkEditing = false
  saveMsgs()
  showToast('📐 板块归属已修正为「' + bp + '」，统计同步更新', 'success')
}
function isLong(t) { return String(t || '').length > 700 }
function askQuick(c) {
  if (c.act === 'single') {
    // 出题考我：统一进「单题快练」面板，板块/子题型/难度/组量都在那里选（与组卷设置一致，不重复）
    openExam('single')
    return
  }
  store.mode = c.mode
  text.value = c.q
  scroll()
  const tb = document.querySelector('.input-bar textarea')
  if (tb) tb.focus()
}
// 图片预览：全屏遮罩 + 可下载原图
const imgView = ref(null)
function viewImg(src) {
  imgView.value = src
}
function closeImg() {
  imgView.value = null
}
// ===== 回复内 SVG 图 / ECharts 图表 统一灯箱（放大 / 保存 / 关闭）=====
const svgBox = ref(null) // { type:'svg'|'chart', html }
function openSvgBox(type, html) {
  if (!html) return
  svgBox.value = { type, html }
}
function closeSvgBox() { svgBox.value = null }
function saveSvgBox() {
  const b = svgBox.value
  if (!b) return
  if (b.type === 'svg') {
    figSave({ svg: b.html }) // 复用复刻图保存：SVG→PNG
  } else {
    // ECharts 图表：用 echarts 实例导出 PNG
    try {
      const el = document.querySelector('.gen-chart[data-echarts]')
      const inst = el && window.echarts ? window.echarts.getInstanceByDom(el) : null
      if (inst && inst.getDataURL) {
        const a = document.createElement('a')
        a.href = inst.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' })
        a.download = '统计图.png'
        document.body.appendChild(a); a.click(); a.remove()
        return
      }
    } catch (e) {}
    showToast('该图表暂不支持保存（可截图保存）', 'info')
  }
}
// 点击消息里的 SVG / ECharts → 打开灯箱（内容为 v-html，用事件委托）
function onMsgFigClick(ev) {
  const svg = ev.target && ev.target.closest ? ev.target.closest('.gen-svg svg') : null
  const chart = ev.target && ev.target.closest ? ev.target.closest('.gen-chart') : null
  if (svg) { openSvgBox('svg', svg.outerHTML); return }
  if (chart && chart.getAttribute('data-echarts')) { openSvgBox('chart', chart.outerHTML) }
}
function downloadImg() {
  const src = imgView.value
  if (!src) return
  try {
    if (src.startsWith('data:')) {
      const a = document.createElement('a')
      a.href = src
      a.download = '题目图片_' + Date.now() + '.png'
      document.body.appendChild(a)
      a.click()
      a.remove()
      showToast('✅ 已开始下载原图', 'success')
    } else {
      fetch(src)
        .then((r) => {
          if (!r.ok) throw new Error('HTTP ' + r.status)
          return r.blob()
        })
        .then((blob) => {
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = '题目图片_' + Date.now() + '.png'
          document.body.appendChild(a)
          a.click()
          a.remove()
          URL.revokeObjectURL(url)
          showToast('✅ 已下载/打开原图', 'success')
        })
        .catch(() => {
          // 下载受限时改用新窗口打开
          window.open(src, '_blank')
        })
    }
  } catch (e) {
    showToast('下载失败：' + e.message, 'error')
  }
}
function onAsk(e) {
  text.value = e.detail || ''
  scroll()
}
// 定位到某条消息（从错题跳回原对话）
const hlIdx = ref(-1)
let hlTimer = null
function onGotoMsg(e) {
  const idx = Number(e.detail)
  if (idx < 0 || idx >= store.msgs.length) return
  hlIdx.value = idx
  if (hlTimer) clearTimeout(hlTimer)
  setTimeout(() => {
    hlTimer = null
    const el = msgsBox.value && msgsBox.value.querySelector('.msg[data-i="' + idx + '"]')
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('hl')
      setTimeout(() => el.classList.remove('hl'), 2000)
    }
  }, 120)
}
// ===== 消息文字选区工具栏：选中后弹出 复制/全选/复制全文 =====
const selBar = ref({ show: false, x: 0, y: 0, msgIdx: -1 })
let selTimer = null
function updateSelBar() {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || !sel.toString().trim()) { selBar.value.show = false; return }
  const node = sel.anchorNode
  // 兼容 anchor 是文本节点或元素节点两种情况
  const msgEl =
    node && node.nodeType === 1
      ? node.closest('.msg')
      : node && node.parentElement
        ? node.parentElement.closest('.msg')
        : null
  if (!msgEl) { selBar.value.show = false; return }
  const r = sel.getRangeAt(0).getBoundingClientRect()
  selBar.value = { show: true, x: Math.max(60, Math.min(window.innerWidth - 60, r.left + r.width / 2)), y: Math.max(90, r.top - 8), msgIdx: Number(msgEl.dataset.i) }
}
function onDocMouseUp() { if (selTimer) clearTimeout(selTimer); selTimer = setTimeout(updateSelBar, 10) }
function onSelChange() { if (selTimer) clearTimeout(selTimer); selTimer = setTimeout(updateSelBar, 80) }
function hideSelBar() { selBar.value.show = false }
function selMsg() {
  return store.msgs[selBar.value.msgIdx] || null
}
async function copySelected() {
  const t = window.getSelection() ? window.getSelection().toString() : ''
  if (!t) return
  try { await navigator.clipboard.writeText(t); showToast('✅ 已复制选中内容', 'success') } catch (e) { showToast('复制失败：' + e.message, 'error') }
  hideSelBar()
}
function selectAllMsg() {
  const m = selMsg()
  if (!m) return
  const el = msgsBox.value && msgsBox.value.querySelector('.msg[data-i="' + selBar.value.msgIdx + '"]')
  if (!el) return
  const range = document.createRange()
  range.selectNodeContents(el)
  const sel = window.getSelection()
  sel.removeAllRanges()
  sel.addRange(range)
  selBar.value = { show: true, x: selBar.value.x, y: selBar.value.y, msgIdx: selBar.value.msgIdx }
}
async function copyFullMsg() {
  const m = selMsg()
  if (!m) return
  try { await navigator.clipboard.writeText(textOf(m)); showToast('✅ 已复制整条消息', 'success') } catch (e) { showToast('复制失败：' + e.message, 'error') }
  hideSelBar()
}

// ===== 知识库/看板/复盘 → 对话页 联动：pendingAsk 预填输入框（可见可改，一键发送） =====
// 之前是 onMounted 里 onAsk 自动发送：但页面用 .pg.on 切换、ChatPage 常驻挂载，onMounted 不再触发，
// 导致点「问 AI」跳回来输入框空白、用户还要重新写。改为 watch 预填 + 聚焦，用户点发送即问。
function fillPendingAsk() {
  if (!store.pendingAsk) return
  const t = String(store.pendingAsk)
  store.pendingAsk = ''
  if (!t) return
  text.value = t
  scroll()
  nextTick(() => {
    const tb = document.querySelector('.input-bar textarea')
    if (tb) tb.focus()
  })
  showToast('📋 已按该知识卡预填提问，可直接发送（也可先修改）', 'info')
}
watch(() => store.pendingAsk, fillPendingAsk)

onMounted(() => {
  restoreDraft(); hydrateQuizCards()
  evOn('xc-ask', onAsk)
  fillPendingAsk() // 启动兜底：若挂载前已设置 pendingAsk 也预填
})
onMounted(() => document.addEventListener('click', onMsgFigClick))
onUnmounted(() => document.removeEventListener('click', onMsgFigClick))
function onOpenExam() { openExam('ai') }
function onOpenPaperData(e) { openPaperData(e && e.detail) }
function onModePickOutside(e) { if (modeOpen.value && !(e.target && e.target.closest && e.target.closest('.mode-pick'))) modeOpen.value = false }
function onOpenPaper() { openExam('import') }
onMounted(() => {
  evOn('xc-open-exam', onOpenExam)
  evOn('xc-open-paper-data', onOpenPaperData)
  document.addEventListener('click', onModePickOutside)
  evOn('xc-open-paper', onOpenPaper)
})
onUnmounted(() => evOff('xc-ask', onAsk))
onUnmounted(() => {
  window.removeEventListener('resize', clampBl)
  evOff('xc-open-exam', onOpenExam)
  evOff('xc-open-paper-data', onOpenPaperData)
  document.removeEventListener('click', onModePickOutside)
  evOff('xc-open-paper', onOpenPaper)
})
onMounted(() => window.addEventListener('app:nav-back', onNavBack))
onUnmounted(() => window.removeEventListener('app:nav-back', onNavBack))
onMounted(() => document.addEventListener('mouseup', onDocMouseUp))
onMounted(() => document.addEventListener('selectionchange', onSelChange))
onUnmounted(() => document.removeEventListener('mouseup', onDocMouseUp))
onUnmounted(() => document.removeEventListener('selectionchange', onSelChange))

onMounted(() => evOn('xc-goto-msg', onGotoMsg))
onUnmounted(() => evOff('xc-goto-msg', onGotoMsg))

// ===== 代码块复制（事件委托）=====
async function copyRaw(text) {
  try {
    await navigator.clipboard.writeText(text)
  } catch (e) {
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    ta.remove()
  }
}
function flashBtn(btn, doneText = '✅ 已复制') {
  const old = btn.textContent
  btn.textContent = doneText
  btn.classList.add('done')
  setTimeout(() => {
    btn.textContent = old
    btn.classList.remove('done')
  }, 1500)
}
async function copyCode(btn) {
  const wrap = btn.closest('.code-wrap')
  if (!wrap) return
  const pre = wrap.querySelector('pre')
  if (!pre) return
  const text = pre.innerText || ''
  await copyRaw(text)
  flashBtn(btn)
}
async function copyMsg(ev) {
  const btn = ev.currentTarget
  const msg = btn && btn.closest('.msg')
  const text = msg.innerText || ''
  await copyRaw(text)
  flashBtn(btn)
}
function onDocClick(ev) {
  const btn = ev.target.closest && ev.target.closest('.code-copy')
  if (btn) copyCode(btn)
}
onMounted(() => document.addEventListener('click', onDocClick))
onMounted(() => window.addEventListener('resize', onToolsResize))
onUnmounted(() => document.removeEventListener('click', onDocClick))
onUnmounted(() => window.removeEventListener('resize', onToolsResize))
defineEmits(['export-review'])
</script>
<template>
  <div class="page on" style="display: flex; flex-direction: column; height: 100%">
    <div class="page-inner" style="display: flex; flex-direction: column; flex: 1; min-height: 0">
      <div class="chat-tools">
        <div class="chat-tools-hd">
          <span class="cth-t">{{ isNarrow ? '🎯 训练' : '🛠️ 训练工具' }}</span>
          <button class="cth-btn" @click="toggleTools()">{{ toolsCollapsed ? '▾ 展开' : '▴ 收起' }}</button>
        </div>
        <div v-if="!toolsCollapsed && isNarrow" class="chat-tools-ov" @click="toggleTools()"></div>
        <div v-show="!toolsCollapsed" class="chat-tools-bd">
          <div class="mode-pick">
            <button class="mode-pick-btn" :title="'当前模式：' + MODE_NAMES[store.mode] + '，点击切换专项模式'" @click.stop="modeOpen = !modeOpen">
              <span class="mp-ic">{{ modeIcon(store.mode) }}</span>
              <span class="mp-name">{{ modeName(store.mode) }}</span>
              <span class="mp-arrow">{{ modeOpen ? '▴' : '▾' }}</span>
            </button>
            <div v-if="modeOpen" class="mode-pop" @click.self="modeOpen = false">
              <div v-for="g in MODE_GROUPS" :key="g.k" class="mp-group">
                <div class="mp-group-t">{{ g.t }}</div>
                <div class="mp-group-items">
                  <button v-for="m in g.items" :key="m" class="mp-item" :class="{ on: store.mode === m }" @click="setMode(m); modeOpen = false">
                    <span class="mp-item-ic">{{ modeIcon(m) }}</span>
                    <span class="mp-item-t">{{ modeName(m) }}</span>
                    <span v-if="store.mode === m" class="mp-check">✓</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div class="train-bar">
        <span class="tb-l">🎯 智能训练</span>
        <select v-model="trainPlate" class="tb-sel" title="当前智能训练/出题板块">
          <option v-for="p in plates" :key="p" :value="p">{{ p }}</option>
        </select>
        <button class="btn btn-gh tb-btn" title="单题快练（原模拟出题）：选板块随机出1题，即时批改·可再来一题·错题入库" @click="openExam('single')">⚡ 单题快练</button>
        <button class="btn btn-gh tb-btn" title="📴 离线练习：无 Key / 断网也能做。图推/数量/政治/资料 用本地确定性生成器（零额度、唯一解质检）出题，随做随批" @click="examOffline = true; openExam('single')">📴 离线练习</button>
        <button class="btn btn-pri tb-btn" title="🌅 每日晨练包：资料速算5 + 常识速测5 + 错题未复盘二刷5，一键15题组合卷" @click="openExam('morning')">🌅 晨练包</button>
        <button class="btn btn-gh tb-btn" title="统一考场：国考/省考卷面模板·AI智能出题·导入材料识别·错题组卷·限时作答批改" @click="openExam('ai')">📝 模拟组卷</button>
        
        <button class="btn btn-gh tb-btn" @click="train('diag')">📊 学习诊断</button>
            <button
              class="btn tb-btn"
              :class="store.cfg.examMode ? 'btn-pri' : 'btn-gh'"
              title="考场计时：开启后每次提问按问数限时（1 问=1 分钟），AI 回复后统计用时；关闭则不打扰"
              @click="store.cfg.examMode = !store.cfg.examMode; saveCfg()"
            >{{ store.cfg.examMode ? '⏱ 计时开' : '⏱ 计时关' }}</button>
            <button class="btn btn-gh tb-btn" title="立体图推训练：3D旋转查看 + 三视图/展开图/切面/补缺 + AI出题" @click="openSolid()">🧊 立体图推</button>
            <button class="btn btn-gh tb-btn" title="资料分析四层能力训练：判题型→找数据→选公式→速算估算（LY四层能力，本地零额度）" @click="openDataTrain()">📊 资料速算</button>
            <button class="btn btn-pri tb-btn pulse" title="针对错题最多的薄弱板块一键出题" @click="trainWeak()">🎯 攻克薄弱</button>
            <button class="btn btn-gh tb-btn" title="对话功能使用说明书：如何按板块/场景高效提问" @click="guideShow = true">📖 使用说明书</button>
          </div>
        </div>
      </div>
      <div id="msgs" ref="msgsBox" class="msgs" style="flex: 1; overflow-y: auto" @scroll="sumMsgsScroll">
        <div v-if="!store.msgs.length && !live" class="hero">
          <div class="hero-badge">六大板块 · 名师方法论 · 命题人视角</div>
          <h2><span>行测智能助教</span></h2>
          <p>文字题走 DeepSeek · 图表公式走视觉模型 · 给你名师级的做题思路与错题复盘</p>
          <div class="hero-stats">
            <div class="hs">
              <div class="hs-n">{{ dStat.q }}</div>
              <div class="hs-l">累计提问</div>
            </div>
            <div class="hs">
              <div class="hs-n">{{ dStat.w }}</div>
              <div class="hs-l">已收错题</div>
            </div>
            <div class="hs">
              <div class="hs-n g">{{ dStat.r }}</div>
              <div class="hs-l">已复盘</div>
            </div>
          </div>
          <div class="hero-grid">
            <div v-for="c in quickCards" :key="c.t" class="hero-card" @click="askQuick(c)">
              <div :class="'hero-ic b-' + c.bg">{{ c.ic }}</div>
              <div>
                <div class="hero-t">{{ c.t }}</div>
                <div class="hero-s">{{ c.s }}</div>
              </div>
            </div>
          </div>
          <div v-if="recentQs.length" class="hero-recents">
            <div class="hr-t">🕘 最近提问</div>
            <div class="hr-list">
              <button v-for="(rq, ri) in recentQs" :key="ri" class="hr-chip" @click="useRecent(rq)">{{ rq.slice(0, 26) }}</button>
            </div>
          </div>
          <div class="hero-motto">💡 {{ motto }}</div>
        </div>
        <template v-for="(m, i) in store.msgs" :key="m.id">
          <div class="msg" :class="[m.role === 'user' ? 'me' : 'ai', { hl: i === hlIdx }]" :data-i="i">
            <div v-if="m.role === 'user'">
              <template v-if="typeof m.content === 'string'"><div v-html="md(m.content)"></div>
</template>
              <template v-else>
                <div class="msg-imgs">
                  <template v-for="(im, j) in m.content.imgs" :key="j">
                    <img v-if="im" class="msg-img" :src="im" @click="viewImg(im)" />
                  </template>
                </div>
                <div v-html="md(m.content.text)"></div>
</template>
              <div class="msg-actions me-actions">
                <button @click="resendMsg(i)">↻ 重发</button>
                <button @click="copyMsg($event)">📋 复制</button>
              </div>
            </div>
            <template v-else>
              <div class="ans-tag">
                <span v-if="m.bk" class="at-plate" style="cursor:pointer" title="点击修正板块归属（同时修正统计）" @click.stop="fixPlate(m, $event)">📐 {{ m.bk }} ✏️</span>
                <div v-if="m.bkEditing" class="bk-fix" style="position:absolute;z-index:30;background:var(--card);border:1px solid rgba(255,255,255,.15);border-radius:10px;padding:8px;display:flex;gap:6px;flex-wrap:wrap;max-width:320px">
                  <button v-for="bp in BK_OPTIONS" :key="'bk' + bp" class="fp-b" :class="{ on: m.bk === bp }" style="padding:2px 8px;font-size:12px" @click.stop="applyPlate(m, bp)">{{ bp }}</button>
                </div>
                <span class="at-mark">✍️ AI 批改</span>
                <span v-if="m.answerTime" class="at-time">{{ m.answerTime }}</span>
              </div>
              <template v-if="m.quiz">
                <div v-if="quizPlate(m)" class="quiz-hd">
                  <span class="quiz-plate">📐 {{ quizPlate(m) }}</span>
                  <span v-if="m.quiz.needAi" class="quiz-tag">先选后判</span>
                  <span v-if="m.orgCard" class="quiz-tag src">截图整理</span>
                </div>
                <div class="quiz-stem" v-html="mdC(m.quiz.stem)"></div>
                <div class="quiz-opts" :class="{ 'has-svg': quizHasSvg(m) }">
                  <button
                    v-for="o in m.quiz.options"
                    :key="o.k"
                    class="quiz-opt"
                    :class="{
                      picked: m.quiz.picked === o.k,
                      right: m.quiz.picked && o.k === m.quiz.answer,
                      wrong: m.quiz.picked && o.k === m.quiz.picked && o.k !== m.quiz.answer
                    }"
                    :disabled="!!m.quiz.picked"
                    @click="pickQuiz(m, o.k)"
                  >
                    <span class="qk">{{ o.k }}</span><span class="qt" v-html="mdC(o.t)"></span>
                  </button>
                </div>
                <div v-if="!m.quiz.picked" class="quiz-guide">
                  <span class="qg-t">🧩 直接点选项作答，选完自动判题+解析</span>
                  <button class="btn btn-gh" @click="quizFullShow(m)">⛶ 全屏做题</button>
                  <button class="btn btn-gh" @click="quizDeep(m)">💬 发到对话深挖</button>
                  <button class="btn btn-gh" @click="capQuizShot(m, 'q')">📸 题目截图</button>
                </div>
                <div v-if="m.orgCard && !m.quiz.picked" class="quiz-org-acts">
                  <button class="btn btn-pri" @click="quizExplainNow(m)">📖 直接讲解</button>
                  <button class="btn btn-gh" @click="quizScrollTo(m)">✍️ 先做一遍</button>
                </div>
                <div v-if="m.quiz.picked" class="quiz-result" :class="m.quiz.checking ? 'pending' : (m.quiz.correct ? 'ok' : 'no')">
                  <template v-if="m.quiz.checking">⏳ AI 判题中…</template>
                  <template v-else-if="m.quiz.correct === null">已提交，等待 AI 判题…</template>
                  <template v-else>{{ m.quiz.correct ? '✅ 回答正确！' : (m.quiz.answer ? '❌ 回答错误，正确答案是 ' + m.quiz.answer : '❌ 回答错误（待人工核对）') }} <span v-if="m.quiz.aiChecked" class="quiz-ai-badge">🤖 已按解析核验</span><span v-else-if="m.quiz.checkFailed" class="quiz-ai-badge warn">⚠️ 未取回答案</span></template>
                </div>
                <div v-if="m.quiz.picked && m.quiz.correct === false && !m.quiz.checking && !m.quiz.wrongPrompted" class="quiz-wrong-bar">
                  <span class="qw-t">📌 这道题做错了，加入错题集？</span>
                  <button class="btn btn-pri qw-yes" @click="quizWrongAdd(m)">加入</button>
                  <button class="btn btn-gh" @click="quizWrongIgnore(m)">忽略</button>
                </div>
                <div v-if="m.quiz.picked && m.quiz.explain && !m.quiz.checking" class="quiz-explain" v-html="mdC(m.quiz.explain)"></div>
                <div v-if="m.quiz.picked && !m.quiz.checking" class="quiz-acts">
                  <button class="btn btn-gh" @click="quizDeep(m)">💬 发到对话深挖</button>
                  <button class="btn btn-gh" @click="saveQuizWrong(m)">📌 存错题本</button>
                  <button class="btn btn-gh" @click="quizFullShow(m)">⛶ 全屏做题</button>
                  <button class="btn btn-gh" @click="capQuizShot(m, 'e')">📸 解析截图</button>
                </div>
              </template>
              <div v-else>
                <div v-html="mdCached(m, i)"></div>
                <button v-if="isLong(textOf(m))" class="fold-btn" @click="toggleExpand(i)">
                  {{ expanded[i] ? '🔼 收起全文' : '🔽 展开全文（' + textOf(m).length + ' 字）' }}
                </button>
                <div v-if="m.figBusy" class="fig-busy"><span class="fig-spin"></span>🖼 图形增强：正在用独立模型把截图复刻成图…</div>
                <div v-if="m.fig && m.fig.ok" class="fig-card">
                  <div class="fig-hd">
                    <span>🖼 AI 图形复刻 · {{ m.fig.type }}</span>
                    <div style="display:flex;gap:6px;align-items:center">
                    <button class="btn btn-gh" @click="figZoom(m.fig)">⛶ 放大</button>
                    <button class="btn btn-gh" @click="figSave(m.fig)">💾 保存</button>
                    <button class="btn btn-gh" title="收起这张复刻图" @click="m.figHide = !m.figHide">{{ m.figHide ? '🔽 展开' : '🔼 收起' }}</button>
                  </div>
                  </div>
                  <div v-show="!m.figHide" class="fig-svg" @click="figZoom(m.fig)" v-html="m.fig.svg"></div>
                  <div v-if="m.fig.summary" class="fig-summary">📝 {{ m.fig.summary }}</div>
                  <div v-if="m.fig.rule" class="fig-rule">📐 规律：{{ m.fig.rule }}</div>
                  <div v-if="m.fig.tips" class="fig-tips">💡 {{ m.fig.tips }}</div>
                </div>
                <div v-if="m.fig && m.fig.ok === false" class="fig-fail">
                  <div>🖼 图形增强未生成图像（不影响本题解答）——可能该截图无需画图，或模型未返回有效图形。{{ m.fig.err ? '（' + m.fig.err + '）' : '' }}</div>
                  <button class="btn btn-gh" :disabled="m.figBusy" @click="retryFigEnhance(m)">🔄 重试复刻</button>
                </div>
              </div>
              <div class="msg-actions">
                <button v-if="m.err" class="retry-btn" @click="retryLast()">↻ 重试</button>
                <button v-if="!m.err && prevHasImg(m) && figCfg()" :disabled="m.figBusy" :title="'用独立模型把题目截图复刻成图'" @click="retryFigEnhance(m)">🖼 {{ m.fig && m.fig.ok ? '重绘' : '图形增强' }}</button>
                <button v-if="!m.err" @click="saveWrong()">📌 存错题</button>
                <button v-if="!m.err" @click="train('variant', { prev: getLastQuizText() })">🔁 变式题</button>
                <button v-if="!m.err" @click="$emit('export-review')">📄 复盘</button>
                <button title="基于这条回复继续追问" @click="followUp(m)">💬 追问</button>
                <button title="收藏到我的笔记" @click="collectMsg(m)">📌 收藏</button>
                <button :class="{ 'fb-on': m.fb === 1 }" title="这条回复对你有用" @click="toggleFb(m, 1)">👍</button>
                <button :class="{ 'fb-on': m.fb === -1 }" title="这条回复需改进" @click="toggleFb(m, -1)">👎</button>
                <button @click="copyMsg($event)">📋 复制</button>
                <button @click="toggleSpeak($event)">🔊 朗读</button>
              </div>
</template>
          </div>
</template>
        <div v-if="live" class="msg ai live-cursor">
          <div v-if="live.think" class="think-box" :class="{ open: live.thinkOpen }">
            <div class="tb-head" @click="live.thinkOpen = !live.thinkOpen">
              💭 {{ live.thinkOpen ? '正在思考…（实时推理）' : '思考过程（点击展开）' }}
            </div>
            <div class="tb-body">{{ live.think }}</div>
          </div>
          <template v-if="live.text">
            <div v-html="md(live.text)"></div>
            <span class="type-cursor" aria-hidden="true"></span>
</template>
          <div v-else class="ai-skels">
            <div class="skel-typing"><span class="skel-dot"></span><span class="skel-dot"></span><span class="skel-dot"></span> 正在回复…</div>
            <span class="skel" style="width: 70%; height: 14px"></span>
            <span class="skel" style="width: 88%; height: 14px"></span>
            <span class="skel" style="width: 55%; height: 14px"></span>
          </div>
        </div>
        <!-- 回到最新：全局悬浮按钮（Teleport 到 body，脱离滚动容器），点击回最新、可拖到页面任意位置并记忆 -->
        <Teleport to="body">
          <button v-if="store.tab === 'chat'" v-show="!atBottom" class="back-latest" :style="blStyle" @pointerdown="onBlDown">▼ 回到最新</button>
        </Teleport>
      </div>
      <div v-if="imgs.length" class="img-strip">
        <div v-for="(im, i) in imgs" :key="i" class="img-thumb">
          <img :src="im" @click="viewImg(im)" />
          <button class="x" @click="rmImg(i)">×</button>
        </div>
      </div>
      <div v-if="linkShow" style="padding: 0 14px 6px">
        <input
          v-model="linkUrl"
          placeholder="粘贴图片链接，如 https://.../题目.png"
          style="
            flex: 1;
            padding: 8px 12px;
            border-radius: 14px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            background: var(--card);
            color: var(--text);
            font-size: 13px;
          "
        />
        <button class="btn btn-pri" style="margin-top: 6px" @click="addImageUrl()">添加该图片</button>
      </div>
      <div v-if="recentQs.length" class="recent-bar">
        <span class="rb-t">🕘</span>
        <div class="rb-list">
          <button v-for="(rq, ri) in recentQs.slice(0, 6)" :key="ri" class="rb-chip" :title="rq" @click="useRecent(rq)">{{ rq.slice(0, 18) }}</button>
        </div>
        <button class="rb-clear" title="清空提问历史" @click="recentQs = []; try{localStorage.removeItem('xc_recent_qs')}catch(e){}">✕</button>
      </div>
      <div class="input-bar">
        <div v-if="store.busy" class="stopwatch" :class="{ warn: left === 0 }">
          <span class="sw-ic">⏱</span>
          <span class="sw-num hud-num">{{ fmtSec(left) }}</span>
          <span class="sw-lbl">{{ left === 0 ? '超时' : '限 ' + fmtSec(limitShow) }}</span>
        </div>
        <div class="e-dock">
          <textarea
            v-model="text"
            rows="1"
            :placeholder="inputPh"
            @keydown.enter.exact.prevent="send()"
          ></textarea>
          <div class="dock-btns">
          <button class="ib-btn" :class="{ on: store.cfg.ttsOn !== false }" :title="(store.cfg.ttsOn !== false ? '自动朗读已开启，点击关闭' : '自动朗读已关闭，点击开启')" @click="toggleTts()">{{ store.cfg.ttsOn !== false ? '🔊' : '🔇' }}</button>
          <button class="ib-btn" :style="{ color: recogOn ? 'var(--red)' : '' }" @click="toggleMic()">🎤</button>
          <button class="ib-btn" @click="linkShow = !linkShow">🔗</button>
          <button
            class="ib-btn qm"
            :class="{ on: quickMode }"
            :title="quickMode ? '⚡快答：用快模型秒回（简单/熟练题）；点击切回🧠深度' : '🧠深度：用思考模型更准（难题/文字截图题）；点击切到⚡快答'"
            @click="toggleQuickMode()"
          >{{ quickMode ? '⚡ 快答' : '🧠 深度' }}</button>
          <label class="ib-btn" style="display: flex; align-items: center; justify-content: center; cursor: pointer">
            📷
            <input type="file" accept="image/*" style="display: none" @change="pickImage" />
          </label>
          </div>
          <button
            v-if="store.busy"
            class="ib-send stop"
            title="停止生成"
            @click="stopGenerate()"
          >⏹</button>
          <button v-else class="ib-send" @click="send()">➤</button>
        </div>
      </div>
    </div>
  </div>
  <!-- 对话使用说明书弹窗 -->
  <div v-if="guideShow" class="ov show guide-ov" @click.self="guideShow = false">
    <div class="pnl guide-pnl">
      <div class="pnl-top">
        <button class="pnl-top-b" @click="guideShow = false">← 返回</button>
        <span class="pnl-top-t">📖 对话使用说明书</span>
      </div>
      <div class="guide-body">
        <p class="guide-intro">想让人工智能回复「更准更快」，关键在于<strong>给全信息 + 说清诉求</strong>。下面按板块/场景给你提问示范，点开即看。</p>
        <div v-for="(sec, si) in USAGE_GUIDE" :key="si" class="guide-sec">
          <div class="guide-sec-hd" @click="toggleGuideSec(si)">{{ sec.t }} <span class="guide-arr">{{ guideOpen[si] ? '▾' : '▸' }}</span></div>
          <div v-show="guideOpen[si]" class="guide-sec-bd">
            <div v-for="(it, ii) in sec.items" :key="ii" class="guide-qa">
              <div class="guide-q" @click="toggleGuideQa(si, ii)">❓ {{ it.q }} <span class="guide-arr">{{ guideQaOpen[si + '-' + ii] ? '▴' : '▾' }}</span></div>
              <div v-show="guideQaOpen[si + '-' + ii]" class="guide-a">💡 {{ it.a }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- 消息文字选区工具栏 -->
  <div v-if="selBar.show" class="sel-bar" :style="{ left: selBar.x + 'px', top: selBar.y + 'px' }" @mousedown.prevent>
    <button @click="copySelected()">📋 复制选中</button>
    <button @click="selectAllMsg()">全选本消息</button>
    <button @click="copyFullMsg()">复制全文</button>
  </div>

  <!-- 图片全屏预览 -->
  <div v-if="imgView" class="img-view" @click.self="closeImg()">
    <img :src="imgView" class="iv-img" @click.stop />
    <div class="iv-bar">
      <button type="button" class="iv-btn" @click.stop.prevent="downloadImg()">💾 保存原图</button>
      <button type="button" class="iv-btn iv-close" @click.stop.prevent="closeImg()">✕ 关闭</button>
    </div>
  </div>

  <!-- 回复内 SVG / ECharts 统一灯箱 -->
  <div v-if="svgBox" class="img-view" @click.self="closeSvgBox()">
    <div v-if="svgBox.type === 'svg'" class="iv-body fig-zoom" v-html="svgBox.html"></div>
    <div v-else class="iv-body fig-zoom">
      <div v-html="svgBox.html"></div>
    </div>
    <div class="iv-bar">
      <button type="button" class="iv-btn" @click.stop.prevent="saveSvgBox()">💾 保存图片</button>
      <button type="button" class="iv-btn iv-close" @click.stop.prevent="closeSvgBox()">✕ 关闭</button>
    </div>
  </div>

  <!-- 图形增强放大弹窗 -->
  <div v-if="figView" class="img-view" @click.self="closeFigZoom()">
    <div class="iv-body fig-zoom" v-html="figView.svg"></div>
    <div class="iv-bar">
      <button type="button" class="iv-btn" @click.stop.prevent="figSave(figView)">💾 保存图片</button>
      <button type="button" class="iv-btn iv-close" @click.stop.prevent="closeFigZoom()">✕ 关闭</button>
    </div>
  </div>

  <!-- 存错题板块选择器 -->
  <div v-if="bkShow" class="img-view bk-sheet">
    <div class="bk-sheet-card">
      <div class="bk-title">📥 加入错题本</div>
      <div class="bk-sub">请确认所属板块（可修正自动识别）：</div>
      <div class="bk-options">
        <button
          v-for="b in BK_OPTIONS"
          :key="b"
          class="bk-opt"
          :class="{ on: bkPick === b }"
          @click="bkPick = b"
        >{{ b }}</button>
      </div>
      <div class="bk-acts">
        <button class="btn btn-gh" @click="bkShow = false">取消</button>
        <button class="btn btn-pri" @click="confirmSaveWrong()">✓ 确认存入</button>
      </div>
    </div>
  </div>
  <!-- ⛶ 全屏做题：对话出题卡片卷面化做题窗口（轻量即时判题） -->
  <Teleport to="body">
    <div v-if="quizFull" class="ov show quiz-full-ov" @click.self="quizFullClose()">
      <div class="pnl quiz-full-pnl">
        <div class="quiz-full-hd">
          <span class="qf-title">⛶ 全屏做题<span v-if="quizPlate(quizFull)"> · {{ quizPlate(quizFull) }}</span><span v-if="quizFull.quiz && quizFull.quiz.needAi" class="quiz-tag">先选后判</span></span>
          <button class="btn btn-gh" @click="quizFullClose()">✕ 关闭</button>
        </div>
        <div class="quiz-full-body">
          <div class="quiz-stem" v-html="mdC(quizFull.quiz.stem)"></div>
          <div class="quiz-opts" :class="{ 'has-svg': quizHasSvg(quizFull) }">
            <button
              v-for="o in quizFull.quiz.options"
              :key="o.k"
              class="quiz-opt quiz-full-opt"
              :class="{
                picked: quizFull.quiz.picked === o.k,
                right: quizFull.quiz.picked && o.k === quizFull.quiz.answer,
                wrong: quizFull.quiz.picked && o.k === quizFull.quiz.picked && o.k !== quizFull.quiz.answer
              }"
              :disabled="!!quizFull.quiz.picked"
              @click="pickQuiz(quizFull, o.k)"
            >
              <span class="qk">{{ o.k }}</span><span class="qt" v-html="mdC(o.t)"></span>
            </button>
          </div>
          <div v-if="quizFull.quiz.picked" class="quiz-result" :class="quizFull.quiz.checking ? 'pending' : (quizFull.quiz.correct ? 'ok' : 'no')">
            <template v-if="quizFull.quiz.checking">⏳ AI 判题中…</template>
            <template v-else-if="quizFull.quiz.correct === null">已提交，等待 AI 判题…</template>
            <template v-else>{{ quizFull.quiz.correct ? '✅ 回答正确！' : (quizFull.quiz.answer ? '❌ 回答错误，正确答案是 ' + quizFull.quiz.answer : '❌ 回答错误（待人工核对）') }} <span v-if="quizFull.quiz.aiChecked" class="quiz-ai-badge">🤖 已按解析核验</span><span v-else-if="quizFull.quiz.checkFailed" class="quiz-ai-badge warn">⚠️ 未取回答案</span></template>
          </div>
          <div v-if="quizFull.quiz.picked && quizFull.quiz.correct === false && !quizFull.quiz.checking && !quizFull.quiz.wrongPrompted" class="quiz-wrong-bar">
            <span class="qw-t">📌 这道题做错了，加入错题集？</span>
            <button class="btn btn-pri qw-yes" @click="quizWrongAdd(quizFull)">加入</button>
            <button class="btn btn-gh" @click="quizWrongIgnore(quizFull)">忽略</button>
          </div>
          <div v-if="quizFull.quiz.picked && quizFull.quiz.explain && !quizFull.quiz.checking" class="quiz-explain" v-html="md(quizFull.quiz.explain)"></div>
          <div v-if="quizFull.quiz.picked && !quizFull.quiz.checking" class="quiz-acts">
            <button class="btn btn-gh" @click="quizFullDeep(quizFull)">💬 发到对话深挖</button>
            <button class="btn btn-gh" @click="saveQuizWrong(quizFull)">📌 存错题本</button>
            <button class="btn btn-pri" @click="quizFullClose()">✕ 关闭</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
  <ExamPanel v-if="examShow" :initial-src="examPanelSrc" :initial-paper="examPaperData" :initial-local="examOffline" @close="closeExam" />
  
  <SolidTrain v-if="solidShow" @close="closeSolid" @send-question="onSolidQuestion" />
  <DataTrain v-if="dtShow" @close="closeDataTrain" @send-question="onSolidQuestion" />
</template>
