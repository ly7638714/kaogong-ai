<script setup>
import { ref, computed } from 'vue'
import { store, saveWqs } from '../store'
import { showToast } from '../utils/toast'
import { exportObsidianMd, copyObsidianWrong, exportAnkiCsv } from '../utils/export'
import { activeCfg, chatOnce, supportsVision } from '../api'
import { extractChoices, answerLetter } from '../utils/quiz'
import { ankiAddNote } from '../utils/ankiConnect'
import { addPoints as petAddPoints, buildWrongAnalysis, petAnalyzeCurrent } from '../utils/pet'

const cur = ref(-1),
  show = ref(false)
const rep = ref(false)
const frm = ref({ answer: '', method: '', note: '', sel: [] })
// ===== 卷库：全部历史卷子 + 出题集（查看/重做/导出/删除） =====
const vaultOpen = ref(false)
const qcPapers = ref([])
const qcQuiz = ref([])
function loadVault() {
  try { qcPapers.value = JSON.parse(localStorage.getItem('xc_papers') || '[]') || [] } catch (e) {}
  try { qcQuiz.value = JSON.parse(localStorage.getItem('xc_quiz_col') || '[]') || [] } catch (e) {}
}
loadVault()
function saveVaultPapers() { try { localStorage.setItem('xc_papers', JSON.stringify(qcPapers.value)) } catch (e) {} }
function saveVaultQuiz() { try { localStorage.setItem('xc_quiz_col', JSON.stringify(qcQuiz.value)) } catch (e) {} }
function redoPaper(p) { window.dispatchEvent(new CustomEvent('xc-open-paper-data', { detail: p })) }
function redoQuizCol(c) {
  const p = {
    id: Date.now() + Math.random(), name: '二刷 · ' + c.subject, ts: Date.now(),
    questions: [{ subject: c.subject, difficulty: c.difficulty, variant: c.variant, stem: c.stem, options: (c.options || []).map((o) => ({ ...o })), answer: c.answer, explain: c.explain || '', designer: c.designer || '', picked: null, correct: null, timeout: false, err: false }]
  }
  window.dispatchEvent(new CustomEvent('xc-open-paper-data', { detail: p }))
}
function downloadText(t, n) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([t], { type: 'text/markdown;charset=utf-8' }))
  a.download = n
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}
function qToMd(q, i) {
  const l = ['## 第' + (i + 1) + '题 · ' + (q.subject || '') + (q.variant ? '（' + q.variant + '）' : ''), '', String(q.stem || ''), '']
  ;(q.options || []).forEach((o) => l.push(o.k + '. ' + o.t))
  l.push('', '**正确答案：' + q.answer + '**', '')
  if (q.explain) l.push('**解析：**' + String(q.explain).replace(/^#{1,6}\s*(✅\s*)?(答案解析|解析|答案详解)[^\n]*/gm, '').trim(), '')
  if (q.designer) l.push('🧠 **命题人设计说明：**' + q.designer, '')
  return l.join('\n')
}
function exportPaperMd(p) {
  const l = ['# ' + (p.name || '模拟卷'), '', '总题数：' + (p.questions || []).length + ' · 导出时间：' + new Date().toLocaleString(), '']
  ;(p.questions || []).forEach((q, i) => l.push(qToMd(q, i)))
  downloadText(l.join('\n'), (p.name || '模拟卷') + '.md')
  showToast('已导出 Markdown', 'success')
}
function exportQuizMd() {
  const l = ['# 出题集（' + qcQuiz.value.length + ' 题）', '']
  qcQuiz.value.forEach((c, i) => l.push(qToMd(c, i)))
  downloadText(l.join('\n'), '出题集.md')
  showToast('已导出出题集 Markdown', 'success')
}
function delVaultPaper(i) { qcPapers.value.splice(i, 1); saveVaultPapers() }
function delVaultQuiz(i) { qcQuiz.value.splice(i, 1); saveVaultQuiz() }
// 通用错因（无对应板块预设时兜底）
const GENERIC_REASONS = [
  '知识点遗忘',
  '粗心/看错',
  '题干没读全',
  '时间不够·蒙的',
  '陷阱题·想当然',
  '方法记混/用错'
]
// 各板块贴合题型的预设错因
const SUBJ_REASONS = {
  判断推理: [
    '忽略论点/论据区分',
    '没锁定结论主语',
    '偷换概念没发现',
    '加强/削弱的力度判断失误',
    '搭桥项识别错误',
    '因果倒置陷阱',
    '前提/假设方向搞反',
    '选项夸大或偷换范围',
    '因果无关项当相关项',
    '没区分充分/必要条件',
    '类比不当滥用',
    '绝对化表述没识别',
    '三段论结构错乱',
    '没抓到题干核心结论'
  ],
  言语理解: [
    '主旨句定位偏差',
    '看到原文原话就选(偏离作者意图)',
    '选项无中生有',
    '意图/主旨混为一谈',
    '没抓转折/递进关系词',
    '过度推理',
    '偷换概念(关键词置换)',
    '一叶障目只看细节',
    '没抓文段首尾句',
    '选项绝对化没排除',
    '并列结构漏读一项',
    '指代对象指错',
    '原文片段当成分论点',
    '没区分观点与例子'
  ],
  资料分析: [
    '基期/现期混淆',
    '增长率/增长量用反',
    '看错单位(万亿/亿)',
    '同比/环比搞错',
    '选项精度陷阱',
    '估算误差大',
    '比重/平均数算错',
    '基期比重变化判断错',
    '增长率比较踩坑',
    '混合增长率不会用',
    '增长量比较口诀忘',
    '百分点/百分数混用',
    '材料定位错行/列',
    '计算粗心(进位/小数点)'
  ],
  数量关系: [
    '设未知数不巧妙',
    '整除/奇偶特性没用',
    '没注意单位换算',
    '方程列对算错',
    '和差倍比用反',
    '时间不够主动放弃',
    '排列组合未分类讨论',
    '概率(分步/分类)混',
    '工程问题效率设错',
    '行程相遇/追及公式记混',
    '容斥文氏图画错',
    '特值法没找对设的值',
    '利润/折扣关系混乱',
    '单调区间/最值求错'
  ],
  常识判断: [
    '知识点记忆模糊',
    '犹豫选错(二选一)',
    '时政记忆过期',
    '靠蒙无把握',
    '选项绝对化没排除',
    '朝代/人物对应错',
    '法律条文记忆混',
    '科技常识张冠李戴',
    '地理国情记混',
    '历史事件时间线乱',
    '经济常识概念混淆',
    '天干地支/节气应用错',
    '生活常识想当然',
    '多选漏选/错选'
  ],
  政治理论: [
    '概念混淆(五位一体/四个全面)',
    '表述细节记混',
    '时政关键词记忆不清',
    '理论对应关系错误',
    '新提法/新表述记忆错',
    '核心要义概括不准',
    '重大会议主题/时间记错',
    '政策要点遗漏',
    '指导思想关联错',
    '两步走/远景目标记混',
    '党的领导相关内容选错',
    '常规定语/修饰记混'
  ],
  定义判断: [
    '核心要件漏看',
    '偷换概念(定义外延)',
    '没抓住属概念',
    '选项不符合要件',
    '替换关键词陷阱',
    '包含于 vs 组成混淆',
    '肯定/否定式定义记反',
    '要件限定词漏读(如"直接/主要")',
    '多要件缺一判断错',
    '例子套用不当',
    '选项代入时方向搞反',
    '主体/客体错位'
  ],
  类比推理: [
    '逻辑关系等级判断错(并列/包含)',
    '没找词性一致性',
    '二级辨析不过关',
    '经验常识缺失',
    '包容/组成混淆',
    '交叉/并列混淆',
    '近义/反义混',
    '功能/属性判断错',
    '形容对应错位',
    '种属/组成搞混',
    '一一对应(dedicated)找错',
    '选项对仗/字数没看',
    '因果关系倒置'
  ],
  图形推理: [
    '特征图记忆不全',
    '对称/一笔画判断错',
    '线条数/点数数错',
    '没注意位置/旋转规律',
    '黑白块运算规则漏看',
    '图形叠加/去同存异反应慢',
    '立体展开图折叠错',
    '笔画数没数清',
    '封闭空间数算错',
    '属性(曲直/开闭)忽略',
    '图形重组/拼接判断错',
    '整体与部分关系漏看'
  ]
}
// 当前错题板块的预设错因
function reasonsFor(subject) {
  return SUBJ_REASONS[subject] || GENERIC_REASONS
}
// 筛选状态
const fSubj = ref(''),
  fRev = ref('all'),
  fReason = ref('')
const ALL_SUBJ = [
  '判断推理', '言语理解', '资料分析', '数量关系', '常识判断', '政治理论',
  '定义判断', '类比推理', '图形推理'
]
const subjList = computed(() => {
  // 固定全部板块（含暂未收纳的），确保能查看/筛选各板块错题集
  const s = new Set(ALL_SUBJ)
  store.wqs.forEach((q) => q.subject && s.add(q.subject))
  return [...s]
})
const reasonList = computed(() => {
  const s = new Set()
  store.wqs.forEach((q) => (q.reasons || []).forEach((r) => s.add(r)))
  return [...s].filter(Boolean)
})
const stats = computed(() => {
  const t = store.wqs.length,
    r = store.wqs.filter((q) => q.reviewed).length
  return { t, rev: r, pend: t - r }
})
const shown = computed(() =>
  store.wqs.filter((q) => {
    if (fSubj.value && (q.subject || '未分类') !== fSubj.value) return false
    if (fRev.value === 'rev' && !q.reviewed) return false
    if (fRev.value === 'pend' && q.reviewed) return false
    if (fReason.value && !(q.reasons || []).includes(fReason.value)) return false
    return true
  })
)

function openIdx(i) {
  openRaw(store.wqs.indexOf(shown.value[i]))
} // 用 filter 后索引定位原序错题
// ===== 二刷 / 三刷 / 掌握度（支持直接点选项作答）=====
const redo = ref(false)
const redoResult = ref('') // '' | 'ok' | 'no'
const redoT = ref(0)
const redoPick = ref('')
let redoTimer = null
const redoQ = computed(() => (cur.value >= 0 ? store.wqs[cur.value] : null))
const redoChoices = computed(() => {
  const q = redoQ.value
  return q ? extractChoices(q.question || '') : []
})
const redoAnswer = computed(() => {
  const q = redoQ.value
  return q ? answerLetter(q.answer || '') : ''
})
const redoHasChoice = computed(() => redoChoices.value.length >= 2 && !!redoAnswer.value)
const redoHistory = computed(() => (redoQ.value && redoQ.value.redoHistory) || [])
function openRedo() {
  const q = redoQ.value
  if (!q) return
  show.value = false
  redoResult.value = ''
  redoPick.value = ''
  redoT.value = 0
  redo.value = true
  // 二刷/三刷同样支持萌宠「读题」：只读题干+选项，不念解析（避免剧透答案）
  store.curQ = { plate: q.plate || q.subject, subject: q.subject || q.plate, kind: q.kind || q.variant || '', stem: q.q || q.stem || q.text, options: q.options || [], answer: q.answer || q.ans || q.correct || '', explain: q.explain || q.analysis || '', your: q.your || q.answerUser || '', ok: false }
  store.readCtx = { type: 'redo', title: ((q.redoHistory || []).length ? '三刷' : '二刷') + '·' + (q.plate || q.subject || '行测'), text: buildRedoReadable(q) }
  if (redoTimer) clearInterval(redoTimer)
  redoTimer = setInterval(() => {
    redoT.value++
  }, 1000)
}
function closeRedo() {
  redo.value = false
  if (redoTimer) {
    clearInterval(redoTimer)
    redoTimer = null
  }
}
function fmtT(s) {
  const m = Math.floor(s / 60)
  const ss = s % 60
  return String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0')
}
function applyRedo(q, correct, sec, picked) {
  q.redoHistory = q.redoHistory || []
  q.redoHistory.push({ at: new Date().toLocaleString(), ok: correct, t: sec, pick: picked || '' })
  if (q.redoHistory.length > 10) q.redoHistory = q.redoHistory.slice(-10)
  q.correctStreak = correct ? (q.correctStreak || 0) + 1 : 0
  q.wrongCount = (q.wrongCount || 1) + (correct ? 0 : 1)
  q.lastRedo = new Date().toLocaleString()
  q.lastRedoAt = Date.now()
  q.redoTime = sec
  q.mastery = Math.min(100, (q.correctStreak || 0) * 50)
  if ((q.correctStreak || 0) >= 2) q.digested = true
  else if (!correct) q.digested = false
  saveWqs()
  petAddPoints(2)
}
function submitRedo(correct, picked) {
  const q = redoQ.value
  if (!q || redoResult.value) return
  redoResult.value = correct ? 'ok' : 'no'
  redoPick.value = picked || ''
  if (redoTimer) {
    clearInterval(redoTimer)
    redoTimer = null
  }
  applyRedo(q, correct, redoT.value, picked || '')
  if (!correct) {
    store.curQ = { ...store.curQ, your: picked || '', ok: false }
    petAnalyzeCurrent({ redo: true })
  }
}
function submitByChoice(k) {
  const q = redoQ.value
  if (!q || redoResult.value) return
  const correct = k === redoAnswer.value
  redoResult.value = correct ? 'ok' : 'no'
  redoPick.value = k
  if (redoTimer) {
    clearInterval(redoTimer)
    redoTimer = null
  }
  applyRedo(q, correct, redoT.value, k)
  if (!correct) {
    store.curQ = { ...store.curQ, your: k, ok: false }
    petAnalyzeCurrent({ redo: true })
  }
}
function masteryOf(q) {
  if (!q) return 0
  return q.digested ? 100 : q.mastery || 0
}
function redoFeedback(q) {
  if (!q) return ''
  const hist = q.redoHistory || []
  if (redoResult.value === 'ok') {
    return hist.slice(0, -1).some((h) => !h.ok) ? '上次二刷还错了，这次已纠正，继续保持！' : ''
  }
  return hist.length > 1 ? '😥 再次答错（第 ' + hist.length + ' 次二刷仍错）' : '首次二刷答错'
}
// ===== 错题抽认卡（闪卡轮播）=====
const cardShow = ref(false)
const cardIdx = ref(0)
const cardFlip = ref(false)
const cardQueue = ref([])
function openCards() {
  cardQueue.value = shown.value.slice()
  cardIdx.value = 0
  cardFlip.value = false
  cardShow.value = true
}
function nextCard() {
  cardFlip.value = false
  if (cardIdx.value < cardQueue.value.length - 1) cardIdx.value++
  else cardShow.value = false
}
function cardMark(ok) {
  const q = cardQueue.value[cardIdx.value]
  if (!q) return
  applyRedo(q, ok, 0, '')
  showToast(ok ? '✅ 记住了' : '❌ 没记住（已计错）', ok ? 'success' : 'error')
  nextCard()
}
// ===== 今日优先 5 题 =====
const focusShow = ref(false)
const focusList = ref([])
function todayFocus() {
  const scored = store.wqs.map((q) => {
    const days = q.lastRedoAt ? Math.min(30, Math.floor((Date.now() - q.lastRedoAt) / 86400000)) : 30
    const score = (q.wrongCount || 1) * 3 + days + (q.digested ? -20 : 0) + (q.reviewed ? 0 : 2)
    return { q, score }
  })
  scored.sort((a, b) => b.score - a.score)
  focusList.value = scored.slice(0, 5).map((s) => s.q)
  focusShow.value = true
}
function focusRedo(q) {
  const i = store.wqs.indexOf(q)
  if (i < 0) return
  focusShow.value = false
  cur.value = i
  openRedo()
}

function openRaw(idx) {
  if (idx < 0) return
  cur.value = idx
  show.value = true
  rep.value = false
  const q = store.wqs[idx] || {}
  frm.value = { answer: q.answer || '', method: q.method || '', note: q.note || '', sel: (q.reasons || []).slice() }
  store.curWrongIdx = idx
  store.curQ = { plate: q.plate || q.subject, subject: q.subject || q.plate, kind: q.kind || q.variant || '', stem: q.q || q.stem || q.text, options: q.options || [], answer: q.answer || q.ans || q.correct || '', explain: q.explain || q.analysis || '', your: q.your || q.answerUser || '', ok: false }
  store.readCtx = { type: 'wrong', title: '错题复盘·' + (q.plate || q.subject || '行测'), text: buildWrongReadable(q) }
}
function buildWrongReadable(q) {
  const opts = (q.options || []).map((o, i) => String(i === 0 ? 'A' : String.fromCharCode(64 + i + 1)) + '、' + String(o.t || '').replace(/<[^>]+>/g, ' ')).join('。')
  return ((q.q || q.stem || q.text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() + '。' + opts + '。' + buildWrongAnalysis(q)).slice(0, 1400)
}
// 二刷/三刷朗读用：只读题干+选项，不含解析
function buildRedoReadable(q) {
  const opts = (q.options || []).map((o, i) => String(i === 0 ? 'A' : String.fromCharCode(64 + i + 1)) + '、' + String(o.t || '').replace(/<[^>]+>/g, ' ')).join('。')
  return ((q.q || q.stem || q.text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() + '。' + (opts ? '选项：' + opts + '。' : '')).slice(0, 1200)
}
function toggleReason(r) {
  const i = frm.value.sel.indexOf(r)
  if (i >= 0) {
    frm.value.sel.splice(i, 1)
  } else {
    frm.value.sel.push(r)
  }
}
// 用户自定义错因（持久化到 localStorage，跨板块复用）
const userReasons = ref([])
const customReason = ref('')
try {
  const saved = JSON.parse(localStorage.getItem('xc_wq_reasons') || '[]')
  if (Array.isArray(saved)) userReasons.value = saved
} catch (e) {}
function persistReasons() {
  try {
    localStorage.setItem('xc_wq_reasons', JSON.stringify(userReasons.value))
  } catch (e) {}
}
// 当前错题板块可选的错因：板块预设 + 用户自定义合集
const curReasons = computed(() => {
  const q = cur.value >= 0 ? store.wqs[cur.value] : null
  const base = q ? reasonsFor(q.subject) : GENERIC_REASONS
  // 预设 + 用户自定义 + 当前已勾选(含 AI 返回的错因)，确保都能在 chips 显示/选择
  return [...new Set([...base, ...userReasons.value, ...frm.value.sel])]
})
function addCustomReason() {
  const r = customReason.value.trim()
  if (!r) {
    showToast('请输入错因内容', 'info')
    return
  }
  if (!userReasons.value.includes(r)) {
    userReasons.value.push(r)
    persistReasons()
  }
  if (!frm.value.sel.includes(r)) frm.value.sel.push(r)
  customReason.value = ''
}
function save() {
  if (cur.value < 0) return
  const q = store.wqs[cur.value]
  q.answer = frm.value.answer.trim()
  q.method = frm.value.method.trim()
  q.note = frm.value.note.trim()
  q.reasons = frm.value.sel
  q.reviewed = !!(q.answer || q.method || q.note)
  q.reviewedAt = Date.now()
  saveWqs()
  showToast('✅ 已保存复盘', 'success')
}
function del() {
  if (cur.value < 0) return
  if (!confirm('确定删除这道错题？')) return
  store.wqs.splice(cur.value, 1)
  saveWqs()
  cur.value = -1
  show.value = false
  showToast('已删除错题', 'info')
}
async function ankiPush() {
  const q = store.wqs[cur.value]
  if (!q) return
  try {
    const front = (q.question || '').slice(0, 1000)
    const back = ['答案：' + (q.answer || '未填'), q.method ? '秒杀：' + q.method : '', q.note ? '笔记：' + q.note : ''].filter(Boolean).join('\n')
    const id = await ankiAddNote(front, back, q.subject)
    showToast('✅ 已推到 Anki 卡组「行测AI」（id ' + id + '）', 'success')
  } catch (e) {
    showToast('❌ ' + e.message + '（需 Anki 打开并安装 AnkiConnect 插件）', 'error')
  }
}

defineEmits(['export', 'txt', 'exportMd'])
// 原题截图放大预览
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
  const a = document.createElement('a')
  a.href = src
  a.download = '错题原图_' + Date.now() + '.png'
  document.body.appendChild(a)
  a.click()
  a.remove()
  showToast('已保存原图', 'success')
}
// 查看原对话：切到对话页并定位该消息
function gotoChat() {
  const q = store.wqs[cur.value]
  store.tab = 'chat'
  show.value = false
  if (q && q.msgIdx != null) {
    window.dispatchEvent(new CustomEvent('xc-goto-msg', { detail: q.msgIdx }))
  }
}
// 让小助手引导归纳错因
const aiBusy = ref(false)
function origCtx() {
  const q = store.wqs[cur.value]
  if (!q) return null
  // 优先用原对话消息（含原始图片 dataURL）；无原消息时回退存错题的图
  const m = q.msgIdx != null && store.msgs[q.msgIdx] ? store.msgs[q.msgIdx] : null
  const c = (m && m.content) || {}
  const imgs = (c && c.imgs) || []
  const text = typeof c === 'string' ? c : (c && c.text) || q.question || ''
  return { text, imgs: imgs.length ? imgs.slice() : (q.imgs || []), hasMsg: !!m }
}
async function askAiReasons() {
  const q = store.wqs[cur.value]
  if (!q) return
  if (aiBusy.value) return
  const ctx = origCtx()
  const rawImgs = ctx.imgs || []
  const c = activeCfg(rawImgs.length > 0)
  if (!c || !c.key) {
    showToast('请先在设置配置模型 API Key', 'error')
    return
  }
  const withImg = rawImgs.length > 0 && supportsVision(c)
  aiBusy.value = true
  try {
    // 找对应 AI 回答作上下文
    let aiReply = ''
    if (q.msgIdx != null) {
      for (let i = q.msgIdx + 1; i < store.msgs.length; i++) {
        if (store.msgs[i].role === 'assistant') {
          const c2 = store.msgs[i].content
          aiReply = typeof c2 === 'string' ? c2 : (c2 && c2.text) || ''
          break
        }
      }
    }
    const sys = `你是行测资深讲师，帮助考生复盘错题、归纳成因。你要结合提供的题干、原题图片与我的解答过程，给出准确的错因归纳。`
    const userContent = `我在复盘一道错题，请你帮我引导归纳错误原因，并**按以下 JSON 输出**（严格只输出 JSON，不要多余文字）：
{
  "answer": "如果题干能看出正确答案就填（如 D、主旨句等），看不出填空字符串",
  "reasons": ["错因1", "错因2"],  // 从 读懂题目/读题/选项比较/方法/计算/粗心/时间 等角度归纳，最多3条
  "method": "一句话秒杀/下次看到这类题先想什么",
  "note": "简要的解析与下次提醒"
}
板块：${q.subject || '未分类'}
我的提问：${ctx.text || ''}
AI 当时的解答：${aiReply || '（无）'}`
    let messages
    if (withImg) {
      messages = [{
        role: 'user',
        content: [{ type: 'text', text: sys + '\n' + userContent }, ...ctx.imgs.map((u) => ({ type: 'image_url', image_url: { url: u } }))]
      }]
    } else {
      messages = [{ role: 'user', content: (sys + '\n' + userContent) + (rawImgs.length ? '\n（提示：我未提供原图，请基于题干文字判断，并提醒我如需更精准可重新存错题）' : '') }]
    }
    const reply = await chatOnce(c, messages, 900)
    // 解析结构化结果：先整体 parse，失败则抠出第一个 {...} JSON 对象
    let obj = null
    if (reply) {
      function tryParse(s) {
        try {
          return JSON.parse(s.trim())
        } catch (e) {
          return null
        }
      }
      obj = tryParse(reply.replace(/```json|```/g, ''))
      if (!obj) {
        const m = reply.match(/\{[\s\S]*\}/)
        if (m) obj = tryParse(m[0])
      }
      if (!obj) {
        // 最后兜底：逐字段从文本提取
        obj = parseByField(reply)
      }
    }
    if (obj) {
      fillStruct(obj)
      showToast('已智能填入：答案/错因/秒杀/笔记', 'success')
    } else if (reply) {
      frm.value.note = (frm.value.note ? frm.value.note + '\n\n' : '') + '🤖 小助手引导（可编辑）：\n' + reply
      showToast('已写入复盘笔记', 'success')
    } else {
      showToast('AI 暂无返回，请重试', 'info')
    }
  } catch (e) {
    showToast('调用失败：' + e.message, 'error')
  } finally {
    aiBusy.value = false
  }
}
// 智能分字段回填
function fillStruct(o) {
  if (o.answer && !frm.value.answer) frm.value.answer = String(o.answer)
  if (Array.isArray(o.reasons)) {
    o.reasons.forEach((r) => {
      if (!r) return
      const v = String(r).trim()
      if (!v) return
      if (!frm.value.sel.includes(v)) frm.value.sel.push(v)
      if (!userReasons.value.includes(v)) {
        userReasons.value.push(v)
        persistReasons()
      }
    })
  }
  if (o.method && !frm.value.method) frm.value.method = String(o.method)
  if (o.note) frm.value.note = (frm.value.note ? frm.value.note + '\n\n' : '') + String(o.note)
}
// 文本兜底解析：从 AI 自由文本里尽量抠出 answer/reasons/method/note
function parseByField(txt) {
  const out = { answer: '', reasons: [], method: '', note: '' }
  const lines = String(txt || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
  for (const line of lines) {
    if (/^答案[:：]/.test(line)) out.answer = line.replace(/^答案[:：]/, '').trim()
    else if (/^秒杀|^方法|^下次提醒[:：]/.test(line)) out.method = line.replace(/^(秒杀|方法|下次提醒)[:：]/, '').trim()
    else if (/^错因[:：]/.test(line)) {
      const seg = line.replace(/^错因[:：]/, '')
      seg.split(/[、,，;；]/).forEach((x) => x.trim() && out.reasons.push(x.trim()))
    } else if (/^note[:：]|^笔记[:：]/.test(line)) out.note += line + '\n'
  }
  return out.answer || out.reasons.length || out.method || out.note ? out : null
}
</script>
<template>
  <div class="page on">
    <div class="page-inner">
      <div style="display: flex; gap: 6px; margin-bottom: 12px; flex-wrap: wrap">
        <button class="btn btn-pri" @click="$emit('export')">📤 导出(Word/PDF/AI)</button>
        <button class="btn btn-gh" @click="$emit('exportMd')">⬇️ 导出 Markdown</button>
        <button class="btn btn-gh" @click="exportObsidianMd()">🗃️ Obsidian(.md)</button>
        <button class="btn btn-gh" @click="exportAnkiCsv()">🃏 Anki/CSV</button>
        <button class="btn btn-gh" @click="$emit('txt')">TXT</button>
      </div>

      <!-- 卷库：全部历史卷子 + 出题集（查看/重做/导出/删除） -->
      <div class="ep-block vault">
        <div class="ep-block-hd ep-fold-hd" @click="vaultOpen = !vaultOpen">
          <span>📚 卷库（历史卷子 {{ qcPapers.length }} · 出题集 {{ qcQuiz.length }}）</span><span class="ep-fold-ic">{{ vaultOpen ? '▾ 收起' : '▸ 展开' }}</span>
        </div>
        <div v-if="vaultOpen">
          <div class="vault-sec">🗂️ 历史卷子（全部保留 · 可查看/重做/导出）</div>
          <div v-if="!qcPapers.length" class="empty"><div class="empty-i">🗂️</div><div class="empty-t">暂无卷子</div><div class="empty-d">在「模拟组卷」出的卷子会自动存入这里</div></div>
          <div v-else class="ep-list-scroll">
            <div v-for="(p, i) in qcPapers" :key="p.id" class="ep-paper">
              <button class="ep-paper-btn" :title="p.name + ' · ' + (p.questions||[]).length + ' 题'" @click="redoPaper(p)">{{ p.name }} · {{ (p.questions||[]).length }} 题 · {{ new Date(p.ts).toLocaleString() }}</button>
              <button class="btn btn-gh" style="padding: 2px 8px; font-size: 11px" @click="exportPaperMd(p)">⬇ 导出</button>
              <button class="ep-x" @click="delVaultPaper(i)">×</button>
            </div>
          </div>
          <div class="vault-sec">📚 出题集（全部保留 · 可二刷/导出）</div>
          <div v-if="!qcQuiz.length" class="empty"><div class="empty-i">📚</div><div class="empty-t">暂无出题</div><div class="empty-d">「单题快练」出的题会自动收纳到这里</div></div>
          <div v-else class="ep-list-scroll">
            <div v-for="(c, i) in qcQuiz" :key="c.id" class="ep-paper">
              <span class="qc-status" :class="c.lastOk === true ? 'ok' : c.lastOk === false ? 'no' : ''">{{ c.lastOk === true ? '✓' : c.lastOk === false ? '✗' : '•' }}</span>
              <button class="ep-paper-btn" :title="'【' + c.subject + (c.variant ? '·' + c.variant : '') + '】' + c.stem.slice(0, 80)" @click="redoQuizCol(c)">{{ c.subject }}{{ c.variant ? '·' + c.variant : '' }} · {{ c.stem.slice(0, 24) }}…（错{{ c.wrongCount }}）</button>
              <button class="ep-x" @click="delVaultQuiz(i)">×</button>
            </div>
          </div>
          <button class="btn btn-gh" style="margin-top: 8px" @click="exportQuizMd()">⬇ 导出全部出题集（Markdown）</button>
        </div>
      </div>

      <!-- 统计条 -->
      <div class="wq-stats">
        <div class="ws2">
          <span class="ws2-n">{{ stats.t }}</span>
          <span class="ws2-l">共错题</span>
        </div>
        <div class="ws2">
          <span class="ws2-n g">{{ stats.rev }}</span>
          <span class="ws2-l">已复盘</span>
        </div>
        <div class="ws2">
          <span class="ws2-n a">{{ stats.pend }}</span>
          <span class="ws2-l">待复盘</span>
        </div>
      </div>

      <!-- 筛选 -->
      <div class="wq-filters">
        <select v-model="fSubj">
          <option value="">全部板块</option>
          <option v-for="s in subjList" :key="s" :value="s">{{ s }}</option>
        </select>
        <select v-model="fRev">
          <option value="all">全部状态</option>
          <option value="rev">✅ 已复盘</option>
          <option value="pend">⏳ 待复盘</option>
        </select>
        <select v-model="fReason">
          <option value="">全部错因</option>
          <option v-for="r in reasonList" :key="r" :value="r">{{ r }}</option>
        </select>
        <button
          class="btn btn-gh"
          style="padding: 6px 12px"
          @click="fSubj = ''; fRev = 'all'; fReason = ''"
        >
          重置
        </button>
        <button class="btn btn-pri" style="padding: 6px 12px" @click="todayFocus()">🎯 今日优先 5 题</button>
        <button class="btn btn-gh" style="padding: 6px 12px" @click="openCards()">🎴 抽认卡</button>
      </div>

      <div class="wl">
        <div v-if="!store.wqs.length" class="empty">
          <div class="empty-i">📋</div>
          <div class="empty-t">暂无错题记录</div>
          <div class="empty-d">做题时点 AI 回复下的「📌 存错题」即可收纳</div>
        </div>
        <div v-else-if="!shown.length" class="empty">
          <div class="empty-i">🔍</div>
          <div class="empty-t">没有符合筛选的错题</div>
          <div class="empty-d">试试调整筛选条件</div>
        </div>
        <div v-for="(q, i) in shown" :key="q.id" class="wi" @click="openIdx(i)">
          <div class="wi-top">
            <span class="ws">{{ q.subject || '未分类' }}</span>
            <span class="rv" :class="{ ok: q.reviewed }">{{ q.reviewed ? '✅ 已复盘' : '⏳ 待复盘' }}</span>
            <span class="ms" :class="{ dig: q.digested }">{{ q.digested ? '✅ 已消化' : '掌握 ' + masteryOf(q) + '%' }}</span>
          </div>
          <div v-if="(q.imgs || []).length" class="wq-thumb">
            <img :src="q.imgs[0]" alt="原题截图" />
          </div>
          <div class="wq">{{ q.question }}</div>
          <div v-if="q.reasons && q.reasons.length" class="wr">
            <span v-for="r in q.reasons" :key="r">{{ r }}</span>
          </div>
          <div class="wt">
            {{ q.time }} · {{ q.answer ? '答案 ' + q.answer : '未填答案' }}
            <span v-if="q.method" class="wtm">⚡ {{ q.method }}</span>
            <span v-if="q.wrongCount && q.wrongCount > 1" class="wtm">错 {{ q.wrongCount }} 次</span>
            <button class="redo-mini" @click.stop="cur = store.wqs.indexOf(q); openRedo()">✍️ 二刷</button>
          </div>
        </div>
      </div>
    </div>

    <div class="ov" :class="{ show }" @click.self="show = false">
      <div class="pnl">
        <h3>📋 错题详情</h3>
        <template v-if="cur >= 0 && store.wqs[cur]">
          <div class="pnl-sub">
            {{ store.wqs[cur].subject || '未分类' }}
            <span class="wq-goto" @click.self.stop="gotoChat()">↩ 查看原对话</span>
            <span class="wq-goto" @click.self.stop="copyObsidianWrong(store.wqs[cur])">📋 复制 Obsidian</span>
            <span class="wq-goto" @click.self.stop="ankiPush()">🃏 推到 Anki</span>
          </div>
          <!-- 原题截图 -->
          <div v-if="(store.wqs[cur].imgs || []).length" class="wq-imgs">
            <img
              v-for="(im, j) in store.wqs[cur].imgs"
              :key="j"
              class="wq-img"
              :src="im"
              alt="原题截图"
              @click="viewImg(im)"
            />
          </div>
          <div class="pnl-q">{{ store.wqs[cur].question }}</div>

          <div class="rev-head" @click="rep = !rep">
            ✍️ {{ rep ? '收起' : '开始结构化复盘' }}
            <button type="button" class="ai-btn" :disabled="aiBusy" @click.stop="askAiReasons()">
              {{ aiBusy ? '🤖 分析中…' : '🤖 让小助手归纳错因' }}
            </button>
            <span style="float: right">{{ rep ? '▲' : '▼' }}</span>
          </div>
          <div v-if="rep" class="rev-body">
            <div class="fld">
              <label>正确答案</label>
              <input v-model="frm.answer" placeholder="如：D / 乙 / 主旨句…" />
            </div>
            <div class="fld">
              <label>错因（按 {{ store.wqs[cur].subject || '板块' }} 预设 · 可多选）</label>
              <div class="chips">
                <span
                  v-for="r in curReasons"
                  :key="r"
                  class="chip"
                  :class="{ on: frm.sel.includes(r) }"
                  @click="toggleReason(r)"
                >
                  {{ r }}
                </span>
              </div>
              <div class="custom-reason">
                <input
                  v-model="customReason"
                  placeholder="自定义错因，如：选项偷换概念 / 陷阱…"
                  @keydown.enter.prevent="addCustomReason()"
                />
                <button type="button" class="btn btn-gh" @click="addCustomReason()">➕ 添加</button>
              </div>
            </div>
            <div class="fld">
              <label>⚡ 秒杀规律（一句话）</label>
              <input v-model="frm.method" placeholder="下次看到这类题先想…" />
            </div>
            <div class="fld">
              <label>📝 个人笔记/解析</label>
              <textarea v-model="frm.note" rows="3" placeholder="记录命题人坑点、同类题联想…"></textarea>
            </div>
            <div class="pnl-btns"><button class="btn btn-pri" @click="save()">💾 保存复盘</button></div>
          </div>
          <div v-if="!rep && (store.wqs[cur].answer || store.wqs[cur].method || store.wqs[cur].note)" class="rev-view">
            <div class="rv-item">✅ 答案：{{ store.wqs[cur].answer }}</div>
            <div class="rv-item">⚡ 秒杀：{{ store.wqs[cur].method }}</div>
            <div class="rv-item">📝 {{ store.wqs[cur].note }}</div>
          </div>

</template>
        <div class="pnl-btns">
          <button class="btn btn-gh" @click="show = false">关闭</button>
          <button class="btn btn-gh" @click="del()">🗑 删除</button>
        </div>
      </div>
    </div>
  </div>
  <!-- 原题截图全屏预览 -->
  <div v-if="imgView" class="img-view" @click.self="closeImg()">
    <img :src="imgView" class="iv-img" />
    <div class="iv-bar">
      <button type="button" class="iv-btn" @click.stop.prevent="downloadImg()">💾 保存原图</button>
      <button type="button" class="iv-btn iv-close" @click.stop.prevent="closeImg()">✕ 关闭</button>
    </div>
  </div>
  <!-- 二刷重做（支持直接点选项作答） -->
  <div v-if="redo && cur >= 0 && store.wqs[cur]" class="ov redo-ov show">
    <div class="pnl redo-pnl">
      <h3>✍️ {{ (redoQ.redoHistory || []).length ? '三刷' : '二刷' }}重做 <span class="redo-timer">⏱ {{ fmtT(redoT) }}</span></h3>
      <div class="redo-subj">{{ store.wqs[cur].subject || '未分类' }}</div>
      <div class="redo-q">{{ store.wqs[cur].question }}</div>
      <div v-if="(store.wqs[cur].imgs || []).length" class="wq-imgs">
        <img v-for="(im, j) in store.wqs[cur].imgs" :key="j" class="wq-img" :src="im" />
      </div>
      <div v-if="!redoResult" class="redo-ask">
        <div class="redo-hint">{{ redoHasChoice ? '直接点击选项提交作答' : '先不看答案自己再解一遍（计时中）' }}</div>
        <div v-if="redoHasChoice" class="quiz-opts">
          <button
            v-for="o in redoChoices"
            :key="o.k"
            class="quiz-opt"
            :class="{ picked: redoPick === o.k, right: redoPick === o.k && o.k === redoAnswer, wrong: redoPick === o.k && o.k !== redoAnswer }"
            @click="submitByChoice(o.k)"
          >
            <span class="qk">{{ o.k }}</span><span class="qt">{{ o.t }}</span>
          </button>
        </div>
        <div v-else class="redo-btns">
          <button class="btn btn-pri" @click="submitRedo(true)">✅ 我答对了</button>
          <button class="btn btn-gh" @click="submitRedo(false)">❌ 还是错了</button>
        </div>
      </div>
      <div v-else class="redo-result" :class="redoResult">
        <div class="rr-t">{{ redoResult === 'ok' ? '🎉 这次答对了！' : '😥 这次答错了' }}</div>
        <div v-if="redoHasChoice" class="rr-line">
          你选了 {{ redoPick }} · 正确答案 {{ redoAnswer }}
          <span class="rr-badge" :class="redoResult">{{ redoResult === 'ok' ? '✓ 正确' : '✗ 错误' }}</span>
        </div>
        <div v-if="redoFeedback(store.wqs[cur])" class="rr-fb" :class="redoResult">{{ redoFeedback(store.wqs[cur]) }}</div>
        <div class="rr-line">正确答案：{{ store.wqs[cur].answer || '（未填）' }}</div>
        <div v-if="store.wqs[cur].method" class="rr-line">⚡ 秒杀：{{ store.wqs[cur].method }}</div>
        <div class="rr-line">当前掌握 {{ masteryOf(store.wqs[cur]) }}% · 连续答对 {{ store.wqs[cur].correctStreak || 0 }} 次 · 累计错 {{ store.wqs[cur].wrongCount || 1 }} 次</div>
        <div v-if="redoHistory.length" class="rr-hist">
          历次二刷：
          <span v-for="(h, i) in redoHistory" :key="i" class="rr-h" :class="h.ok ? 'ok' : 'no'">{{ h.ok ? '✓' : '✗' }}</span>
          （{{ redoHistory.filter((h) => h.ok).length }} 对 {{ redoHistory.filter((h) => !h.ok).length }} 错）
        </div>
        <div v-if="store.wqs[cur].digested" class="rr-dig">✅ 已连续答对 2 次，标记为「已消化」</div>
      </div>
      <div class="pnl-btns">
        <button class="btn btn-gh" @click="closeRedo()">关闭</button>
        <button v-if="redoResult" class="btn btn-gh" @click="show = true; closeRedo()">📝 去复盘</button>
      </div>
    </div>
  </div>
  <!-- 今日优先 5 题 -->
  <div v-if="focusShow" class="ov show" @click.self="focusShow = false">
    <div class="pnl">
      <h3>🎯 今日优先复习（按 错次×3 + 久未二刷 + 未复盘 排序）</h3>
      <div v-if="!focusList.length" class="empty-t">暂无错题</div>
      <div v-for="(q, i) in focusList" :key="q.id" class="focus-item">
        <span class="fi-idx">{{ i + 1 }}</span>
        <div class="fi-body">
          <div class="fi-subj">{{ q.subject || '未分类' }} · 错 {{ q.wrongCount || 1 }} 次 · 掌握 {{ masteryOf(q) }}%</div>
          <div class="fi-q">{{ q.question }}</div>
        </div>
        <button class="btn btn-gh" @click="focusRedo(q)">✍️ 二刷</button>
      </div>
    </div>
  </div>

  <!-- 错题抽认卡（闪卡轮播） -->
  <div v-if="cardShow" class="ov show" @click.self="cardShow = false">
    <div class="pnl card-pnl">
      <h3>🎴 错题抽认卡 <span class="card-prog">{{ cardIdx + 1 }} / {{ cardQueue.length }}</span></h3>
      <template v-if="cardQueue[cardIdx]">
        <div class="card-front">
          <div class="redo-subj">{{ cardQueue[cardIdx].subject || '未分类' }}</div>
          <div class="redo-q">{{ cardQueue[cardIdx].question }}</div>
          <div v-if="(cardQueue[cardIdx].imgs || []).length" class="wq-imgs">
            <img v-for="(im, j) in cardQueue[cardIdx].imgs" :key="j" class="wq-img" :src="im" />
          </div>
        </div>
        <div v-if="cardFlip" class="card-back">
          <div class="rr-line">✅ 答案：{{ cardQueue[cardIdx].answer || '未填' }}</div>
          <div v-if="cardQueue[cardIdx].method" class="rr-line">⚡ 秒杀：{{ cardQueue[cardIdx].method }}</div>
          <div v-if="(cardQueue[cardIdx].reasons || []).length" class="rr-line">🔍 错因：{{ cardQueue[cardIdx].reasons.join('、') }}</div>
          <div v-if="cardQueue[cardIdx].note" class="rr-line">📝 笔记：{{ cardQueue[cardIdx].note }}</div>
        </div>
      </template>
      <div class="pnl-btns">
        <button class="btn btn-gh" @click="cardShow = false">关闭</button>
        <button v-if="!cardFlip" class="btn btn-pri" @click="cardFlip = true">👁 翻答案</button>
        <template v-if="cardFlip">
          <button class="btn btn-gh" @click="cardMark(false)">❌ 没记住</button>
          <button class="btn btn-pri" @click="cardMark(true)">✅ 记住了</button>
        </template>
      </div>
    </div>
  </div>
</template>
