<script setup>
import { ref, nextTick, computed, onMounted, onUnmounted } from 'vue'
import 'katex/dist/katex.min.css'
import { renderMd } from '../utils/renderMd'
import { parseQuiz } from '../utils/quiz'
function md(t) {
  return renderMd(t)
}
// 用户消息按纯文本展示：转义 HTML，避免 XSS/标签串扰
function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
import { store, saveMsgs, saveWqs } from '../store'
import { activeCfg, supportsVision, buildSys, chatStream, detectBanKuai, buildTaskSys, PLATE_MODE } from '../api'
import { speak, stopSpeak, speaking, startRecog, recogActive } from '../utils/tts'
import { MODE_NAMES } from '../kb'
import { collectChat } from '../utils/chat'
import { showToast } from '../utils/toast'
import ExamSim from './ExamSim.vue'
import { addPoints as petAddPoints } from '../utils/pet'
import PaperImport from './PaperImport.vue'
const toolsCollapsed = ref(false)
try { toolsCollapsed.value = localStorage.getItem('xc_chat_tools') === '1' } catch (e) {}
function toggleTools() { toolsCollapsed.value = !toolsCollapsed.value; try { localStorage.setItem('xc_chat_tools', toolsCollapsed.value ? '1' : '0') } catch (e) {} }
const text = ref(''),
  imgs = ref([]),
  linkShow = ref(false),
  linkUrl = ref(''),
  recogOn = ref(false)
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

function addMsg(m) {
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
    // 按问题数限时：1 问=1 分钟（问号数估，至少 1）
    startStopwatch(countQuestions(t) * 60)
  }
  if (m.role === 'assistant') {
    stopStopwatch()
    // 归属板块：基于最近一次用户提问识别（与消息头/存错题同源）
    m.bk = detectBanKuai(lastAskText) || ''
    // 完整回复才弹用时统计；停止/失败/无耗时则不弹
    if (!m.err && !m.stopped && runSec.value > 0) {
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
    const r = new FileReader()
    r.onload = (e) => {
      imgs.value.push(e.target.result)
    }
    r.readAsDataURL(f)
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
      rd.onload = (e) => {
        imgs.value.push(e.target.result)
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
  const c = activeCfg(hasImg)
  if (!c || !c.key) {
    store.busy = false
    showToast('请先在设置配置 ' + (hasImg ? '视觉' : '文字') + ' 模型 API Key', 'error')
    return
  }
  if (hasImg && !supportsVision(c)) {
    store.busy = false
    showToast(
      '当前「' +
        store.cfg.vision.model +
        '」不是可识图模型/未配置视觉Key。请到 ⚙️设置→视觉模型 选用可识图模型并填 Key；或删掉图片改用文字描述。',
      'error'
    )
    return
  }
  const userMsg = { role: 'user', content: hasImg ? { text: txt, imgs: imgs.value.slice() } : txt }
  addMsg(userMsg) // 经 addMsg 统一处理（含考场倒计时启动/保存/滚动）
  text.value = ''
  imgs.value = []
  scroll()
  // 综合模式(mode=all)默认只发通用 SYS(约7k字)，不带专项方法论，专业题回复易泛化。
  // 此处按题目板块用 detectBanKuai 命中对应专项 KB 追加注入，让模型拿到该板块名师方法论，提升针对性。
  let sys = buildSys()
  if (store.mode === 'all' && store.cfg.kb !== false) {
    const bm = detectBanKuai(txt)
    if (bm) {
      sys = buildSys(PLATE_MODE[bm] || '')
    }
  }
  // 质量优先：历史尽量完整保留（不激进省 token），保障「解决具体提问」不缺上文。
  // 仅做兜底防爆：跳过空/失败消息、图片按视觉能力保留；回答过长才截断、历史总量过大才丢更早。
  const visOk = supportsVision(c)
  const _AICAP = 4000 // 单条 assistant 回答最多发送字符（回复要点集中在开头，安全裁剪超长尾部）
  const _HIS = 20 // 最多 20 条
  const _BUDGET = 35000 // 历史总字符预算，超出才丢更早（默认对话量远达不到）
  const history = []
  let cum = 0
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
        } else if (m.content && (m.content.text || '').trim()) {
          const parts = [{ type: 'text', text: m.content.text }]
          if (visOk && Array.isArray(m.content.imgs)) {
            for (const u of m.content.imgs) if (u) parts.push({ type: 'image_url', image_url: { url: u } })
          }
          item = { role: m.role, content: parts }
        }
      }
    } catch (e) {}
    if (!item) continue
    const clen = typeof item.content === 'string' ? item.content.length : 600
    if (cum + clen > _BUDGET && history.length > 0) break
    cum += clen
    history.unshift(item)
  }
  live.value = { text: '', think: '', thinkOpen: false }
  scroll()
  try {
    const full = await chatStream([{ role: 'system', content: sys }, ...history], c, (d) => {
      if (d.type === 'think') {
        live.value.think = d.think
      } else {
        live.value.text = d.text
      }
      scroll()
    }, abortCtrl.signal)
    live.value = null
    addMsg({ role: 'assistant', content: full })
    if (store.cfg.ttsOn) autoSpeak(full)
  } catch (e) {
    live.value = null
    if (e.name === 'AbortError') {
      addMsg({ role: 'assistant', content: live.value && live.value.text ? live.value.text : '⏹ 已停止生成。', stopped: true })
    } else {
      addMsg({ role: 'assistant', content: '❌ 请求失败：' + e.message, err: true, retryKey: Date.now() })
    }
  }
  abortCtrl = null
  store.busy = false
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
  m.quiz.correct = k === m.quiz.answer
  saveMsgs()
  if (m.quiz.correct) showToast('✅ 回答正确，看解析巩固', 'success')
  else showToast('❌ 选错了，正确答案是 ' + m.quiz.answer, 'error')
}
function saveQuizWrong(m) {
  if (!m || !m.quiz) return
  const qz = m.quiz
  const stem = qz.stem
  const subject = detectBanKuai(stem) || m.bk || '判断推理'
  store.wqs.unshift({
    id: Date.now(),
    subject,
    question: stem + '\n\n' + qz.options.map((o) => o.k + '. ' + o.t).join('\n'),
    answer: '正确答案 ' + qz.answer + (qz.picked ? '（我选了' + qz.picked + '）' : ''),
    reasons: qz.picked && !qz.correct ? ['选择题作答失误'] : [],
    time: new Date().toLocaleString(),
    at: Date.now(),
    wrongCount: 1,
    correctStreak: 0,
    mastery: 0,
    digested: false
  })
  saveWqs()
  showToast('✅ 已存入错题本（' + subject + '）', 'success')
}
function textOf(m) {
  return typeof m.content === 'string' ? m.content : (m.content && m.content.text) || ''
}
// 存错题板块选择器
const bkShow = ref(false)
const examShow = ref(false) // 整卷模拟
const paperShow = ref(false) // 真题组卷
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
  store.wqs.unshift({
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
  showToast('✅ 已存入错题本（板块：' + bkPick.value + '）', 'success')
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
      String(opts.prev || getLastUserText()).slice(0, 600)
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
        scroll()
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
  train('quiz', { plate: w.plate, mode: w.mode })
}
function autoSpeak(t) {
  if (store.cfg.ttsOn !== false && t)
    speak(String(t).replace(/[#*`>|_]/g, ''), {
      scene: store.cfg.ttsScene,
      rate: store.cfg.ttsRate,
      pitch: store.cfg.ttsPitch
    })
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
  const tb = c.querySelector('.think-box')
  if (tb) tb.remove()
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
const modes = Object.keys(MODE_NAMES)
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
  { ic: '🔢', t: '数量关系', s: '四层金字塔', bg: 'r', mode: 'shuliang', q: '工程问题设最小公倍数的秒杀法' }
]
function askQuick(c) {
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
onMounted(() => window.addEventListener('xc-ask', onAsk))
onMounted(() => window.addEventListener('xc-open-exam', () => (examShow.value = true)))
onMounted(() => window.addEventListener('xc-open-paper', () => (paperShow.value = true)))
onUnmounted(() => window.removeEventListener('xc-ask', onAsk))

onMounted(() => window.addEventListener('xc-goto-msg', onGotoMsg))
onUnmounted(() => window.removeEventListener('xc-goto-msg', onGotoMsg))

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
  const msg = ev.currentTarget.closest('.msg')
  if (!msg) return
  const text = msg.innerText || ''
  await copyRaw(text)
  flashBtn(ev.currentTarget)
}
function onDocClick(ev) {
  const btn = ev.target.closest && ev.target.closest('.code-copy')
  if (btn) copyCode(btn)
}
onMounted(() => document.addEventListener('click', onDocClick))
onUnmounted(() => document.removeEventListener('click', onDocClick))
defineEmits(['export-review'])
</script>
<template>
  <div class="page on" style="display: flex; flex-direction: column; height: 100%">
    <div class="page-inner" style="display: flex; flex-direction: column; flex: 1; min-height: 0">
      <div class="chat-tools">
        <div class="chat-tools-hd">
          <span class="cth-t">🛠️ 训练工具</span>
          <button class="cth-btn" @click="toggleTools()">{{ toolsCollapsed ? '▾ 展开' : '▴ 收起' }}</button>
        </div>
        <div v-show="!toolsCollapsed" class="chat-tools-bd">
          <div class="mode-row">
            <button v-for="m in modes" :key="m" class="mode-chip" :class="{ on: store.mode === m }" @click="setMode(m)">
              {{ MODE_NAMES[m] }}
            </button>
          </div>
          <div class="train-bar">
        <span class="tb-l">🎯 智能训练</span>
        <select v-model="trainPlate" class="tb-sel">
          <option v-for="p in plates" :key="p" :value="p">{{ p }}</option>
        </select>
        <button class="btn btn-gh tb-btn" @click="train('quiz', { plate: trainPlate, mode: PLATE_MODE[trainPlate] })">
          🎲 模拟出题
        </button>
        <button class="btn btn-gh tb-btn" title="整卷限时模拟考试：AI 组卷、自动批改、错题入库" @click="examShow = true">📝 整卷模拟</button>
        <button class="btn btn-gh tb-btn" title="上传真题截图→AI识别组卷→作答批改" @click="paperShow = true">📥 真题组卷</button>
        <button class="btn btn-gh tb-btn" @click="train('diag')">📊 学习诊断</button>
            <button class="btn btn-pri tb-btn pulse" title="针对错题最多的薄弱板块一键出题" @click="trainWeak()">🎯 攻克薄弱</button>
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
          <div class="hero-motto">💡 {{ motto }}</div>
        </div>
        <template v-for="(m, i) in store.msgs" :key="i">
          <div class="msg" :class="[m.role === 'user' ? 'me' : 'ai', { hl: i === hlIdx }]" :data-i="i">
            <div v-if="m.role === 'user'">
              <template v-if="typeof m.content === 'string'"><div v-html="esc(m.content)"></div>
</template>
              <template v-else>
                <div class="msg-imgs">
                  <img v-for="(im, j) in m.content.imgs" :key="j" class="msg-img" :src="im" @click="viewImg(im)" />
                </div>
                <div v-html="esc(m.content.text)"></div>
</template>
              <div class="msg-actions me-actions">
                <button @click="resendMsg(i)">↻ 重发</button>
                <button @click="copyMsg($event)">📋 复制</button>
              </div>
            </div>
            <template v-else>
              <div class="ans-tag">
                <span v-if="m.bk" class="at-plate">📐 {{ m.bk }}</span>
                <span class="at-mark">✍️ AI 批改</span>
                <span v-if="m.answerTime" class="at-time">{{ m.answerTime }}</span>
              </div>
              <template v-if="m.quiz">
                <div class="quiz-stem" v-html="md(m.quiz.stem)"></div>
                <div class="quiz-opts">
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
                    <span class="qk">{{ o.k }}</span><span class="qt">{{ o.t }}</span>
                  </button>
                </div>
                <div v-if="m.quiz.picked" class="quiz-result" :class="m.quiz.correct ? 'ok' : 'no'">
                  {{ m.quiz.correct ? '✅ 回答正确！' : '❌ 回答错误，正确答案是 ' + m.quiz.answer }}
                </div>
                <div v-if="m.quiz.picked && m.quiz.explain" class="quiz-explain" v-html="md(m.quiz.explain)"></div>
                <div v-if="m.quiz.picked" class="quiz-acts">
                  <button class="btn btn-gh" @click="saveQuizWrong(m)">📌 存错题本</button>
                </div>
</template>
              <div v-else v-html="md(m.content)"></div>
              <div class="msg-actions">
                <button v-if="m.err" class="retry-btn" @click="retryLast()">↻ 重试</button>
                <button v-if="!m.err" @click="saveWrong()">📌 存错题</button>
                <button v-if="!m.err" @click="train('variant', { prev: getLastUserText() })">🔁 出变式题</button>
                <button v-if="!m.err" @click="$emit('export-review')">📄 导出复盘</button>
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
        <!-- 回到最新：向上滚动后显示 -->
        <button v-show="!atBottom" class="back-latest" @click="backToLatest()">
          ▼ 回到最新
        </button>
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
          <button class="ib-btn" :style="{ color: recogOn ? 'var(--red)' : '' }" @click="toggleMic()">🎤</button>
          <button class="ib-btn" @click="linkShow = !linkShow">🔗</button>
          <label class="ib-btn" style="display: flex; align-items: center; justify-content: center; cursor: pointer">
            📷
            <input type="file" accept="image/*" style="display: none" @change="pickImage" />
          </label>
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
  <!-- 图片全屏预览 -->
  <div v-if="imgView" class="img-view" @click.self="closeImg()">
    <img :src="imgView" class="iv-img" @click.stop />
    <div class="iv-bar">
      <button type="button" class="iv-btn" @click.stop.prevent="downloadImg()">💾 保存原图</button>
      <button type="button" class="iv-btn iv-close" @click.stop.prevent="closeImg()">✕ 关闭</button>
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
  <ExamSim v-if="examShow" @close="examShow = false" />
  <PaperImport v-if="paperShow" @close="paperShow = false" />
</template>
