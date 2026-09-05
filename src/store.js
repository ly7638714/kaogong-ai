import { reactive } from 'vue'
import { canonicalType } from './data/solveSteps' // v3.8.192 题型 canonical 归一
import { canonicalSubjectOf } from './utils/wrongTaxonomy' // v3.8.212 板块/细分/题型 写入统一
import { showToast } from './utils/toast'
import { safeSet, KEYS, migrate } from './utils/storage'
import { extractChoices, answerLetter } from './utils/quiz'
const D = () => ({
  text: { prov: 'ds', key: '', url: 'https://api.deepseek.com/chat/completions', model: 'deepseek-v4-flash' },
  vision: {
    prov: 'ds',
    key: '',
    url: 'https://api.deepseek.com/chat/completions',
    model: 'deepseek-v4-flash-vision-exp'
  },
  sys: '',
  kb: true,
  strm: true,
  tts: true,
  ttsOn: false, // 自动朗读默认关（省 token：智谱真人 TTS 按次收费；需要时点输入栏 🔊 或设置开启）
  ttsScene: 'natural',
  ttsVoice: '',
  ttsRate: 0.98,
  ttsPitch: null,
  ttsMode: 'edge', // 真人朗读引擎默认 edge=Edge免费神经语音（免key）；glm=智谱超拟人(收费) / openai=OpenAI兼容CosyVoice / sys=系统语音(完全免费本地)
  ttsGuard: true, // 真人朗读「省钱护栏」（v3.8.90）：真人引擎每日免费字符额度用完自动退回免费 Edge；Edge/系统语音永不被拦
  ttsDayCap: 20000, // 真人引擎每日免费字符额度（约 3-4 千字中文量级；超出自动退回 Edge）
  ttsGm: { key: '', url: 'https://open.bigmodel.cn/api/paas/v4/audio/speech', model: 'glm-tts', voice: 'tongtong' },
  ttsOpenAI: { key: '', url: 'https://api.siliconflow.cn/v1', model: 'FunAudioLLM/CosyVoice2-0.5B', voice: 'default' },
  // 阿里百炼 TTS（v3.8.91，真实实测 qwen3-tts-instruct-flash 可用；¥0.8/万字符级）
  ttsDash: { key: '', url: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation', model: 'qwen3-tts-instruct-flash', voice: 'Cherry', voiceCustom: '', customVoices: [] },
  ttsEdgeVoice: 'zh-CN-XiaoxiaoNeural',
  voiceCustom: { hidden: {}, names: {} }, // 音色市场自定义：隐藏/重命名已有音色
  petVoice: true, // 萌宠语音朗读总开关（配合真人 TTS 引擎）
  petSkin: 'lixingyun', // 萌宠角色皮肤：xueshen=薛神 / zhangruonan=章若楠 / lixingyun=李星云 / jiruxue=姬如雪 / custom=自定义人物
  skinImgs: {}, // 每个角色皮肤的自定义形象（用户上传的动漫图片，dataURL）
  skinVoices: {}, // 每个角色皮肤绑定的大模型克隆声线 { skinId: { engine, voice, name, model } }
  petCustom: { name: '自定义人物', persona: '你是一位由用户自定义的角色，性格按用户设定，热情可靠，像朋友一样陪伴用户备考。' }, // 自定义人物：名字 / 人设
  customSkins: [], // 用户新增的自定义角色列表 [{ id:'custom2', name, persona }]
  globalVoice: null, // 全局音色快照（语音设置里的音色；切换非克隆角色时恢复，保证全局音色=萌宠音色一致）
  petImg: '', // 全局自定义形象（未分皮肤时生效）
  examMode: false, // 考场计时：开启后按问数限时并统计用时
  fontSize: 14.5,
  fontFamily: 'default', // 全局字体：default=微软雅黑 / song=宋体 / hei=黑体 / kai=楷体 / fang=仿宋 / yuan=幼圆
  kgFx: 0.6, // 知识图谱光效强度：0=关闭(不晃眼/省电) / 0.5=柔和 / 1=全开；默认柔和防白天光污染
  examDate: '2026-11-29',
  // ===== 多考试倒计时（v3.8.69 新增）：国考为内置不可删，其余自定义；互不冲突，各自独立倒计时 =====
  exams: [
    { id: 'gk', name: '国考', date: '2026-11-29', color: '#ff5c7c', builtin: true }
  ],
  activeExamId: 'gk',
  // ===== 萌宠对话记忆库（v3.8.75 新增）：对话模式下自动记录问答，供"批量加错题"指令检索 =====
  petChatLog: [],
  // ===== 提问助手（v3.8.76 新增）：输入区实时识别板块/题型/意图并引导补全 =====
  askAssist: true, // 总开关：false 时输入区助手条完全不渲染、不分析（回归到改动前行为）
  pendingPlate: '', // 用户点选确认的板块（一次性：runChat 消费后清空），优先级高于自动识别
  answerDepth: 'detail', // 回答深度：detail=详讲 / brief=简答 / flash=只秒杀
  obsidian: true,
  eyeMode: 'normal',
  hl: false,
  bgMode: 'default',
  bgSolid: 'deep',
  bgImg: '',
  bgBlur: 12,
  bgAuto: false,
  themeMode: 'default',
  goalScore: 70, // 行测目标分数（100 制，用于综合评估）
  strictGen: true, // 出题严格质检：生成后二次验证唯一解/恰一正确（更稳，略慢）
  fastAutoQC: true,
  deepPlan: false,
  propStyle: 'standard', // 命题质感：standard=标准 / strong=强陷阱(贴近真题卷面) / gentle=入门友好(干扰平实) // 深度命题两段式（先设计坑点再成题，文字题质感更强；每题 +1 次短请求，略慢，默认关） // 快模型质量门（默认开）：走「出题快模型/图形快模型」时即使关闭 strictGen 也保留一次 AI 复核兜底；追极限速度可关
  // 图形理解增强（可选 · 独立开源视觉模型，不影响文字/视觉主模型）
  fig: {
    on: false,
    prov: 'sf',
    key: '',
    url: 'https://api.siliconflow.cn/v1/chat/completions',
    model: 'Qwen/Qwen2.5-VL-7B-Instruct'
  },
  webdav: { url: '', user: '', pass: '' },
  szFrom: '2025-10',
  szTo: '',
  // ===== 界面自定义（v3.8.80 新增）：主界面板块/细分功能入口显隐开关（仅隐藏，不删除功能）=====
  uiHidden: {},
  // ===== 模型注册表用户自增（v3.8.84 新增）：{ text:{ ds:[{id,label,pub?}], ... }, vision:{...}, fig:{...} } 与新上市模型的兜底 =====
  customModels: {},
  // ===== 语音阅读·讲稿改写 LLM（v3.8.88 新增·可选）：朗读前先把原文改写成口语化讲稿再交给 TTS；未配置时退回直接朗读原文 =====
  rd: {
    on: false, // 总开关：默认关，打开并配好 Key 才走"改写后朗读"
    prov: 'ds',
    key: '',
    url: 'https://api.deepseek.com/chat/completions',
    model: 'deepseek-v4-flash'
  }
})
export const store = reactive({ cfg: D(), mode: 'all', msgs: [], wqs: [], myMem: [], notes: [], tab: 'chat', busy: false, readCtx: null, curQ: null, uiCtx: { panel: null, examMgr: false }, pendingAsk: '', pendingOpenPaper: null, pendingFocus: false })
export function load() {
  try {
    const s = localStorage.getItem('xc_cfg')
    if (s) {
      const d = JSON.parse(s)
      store.cfg = Object.assign(D(), d, {
        text: Object.assign(D().text, d.text || {}),
        vision: Object.assign(D().vision, d.vision || {}),
        fig: Object.assign(D().fig, d.fig || {}),
        ttsGm: Object.assign(D().ttsGm, d.ttsGm || {}),
        ttsOpenAI: Object.assign(D().ttsOpenAI, d.ttsOpenAI || {})
      })
    }
  } catch (e) {}
  // v3.8.68 省钱默认迁移（仅一次，之后尊重用户手动设置）：
  // 朗读引擎 glm(智谱收费) → edge(微软免费神经语音)；自动朗读默认关（关=不耗 TTS 费用）
  try {
    if (localStorage.getItem('xc_tts_migrated') !== '1') {
      if (!store.cfg.ttsMode || store.cfg.ttsMode === 'glm') store.cfg.ttsMode = 'edge'
      store.cfg.ttsOn = false
      localStorage.setItem('xc_tts_migrated', '1')
    }
  } catch (e) {}
  // v3.7.1+ 清理：删除已从智谱账号移除的旧克隆声线绑定（用户要求只保留四个内置角色声线）
  try {
    const DELETED_VOICES = new Set([
      'a7e0ac3c-685b-58a0-8508-1b4b2e574a1e', // 自定义声线_mtdwsmwq
      '1b284f8d-aa42-5d21-979a-f8b958e497dd', // 自定义声线_mtdwd09f
      '62f427ab-cc29-554e-b094-b99d389b851e', // fullflow_1787978090100
      '748035cc-23c4-5f7f-a305-68a5bdd6d191', // test_repro_1787978048912
      '0d7c7263-9237-5365-97ce-c5b06142b8b5', // 自定义2声线
      'd4320d29-9625-5833-88d6-fd18bb0e62e0' // 自定义声线
    ])
    const sv = store.cfg.skinVoices || {}
    for (const k of Object.keys(sv)) {
      const v = sv[k]
      if (v && (DELETED_VOICES.has(v.voice) || DELETED_VOICES.has(v.name))) delete sv[k]
    }
    const BUILTIN_NAMES = new Set(['薛神', '章若楠', '李星云', '姬如雪'])
    store.cfg.customSkins = (store.cfg.customSkins || []).filter((s) => !s || !BUILTIN_NAMES.has(s.name || ''))
    const keepSkins = new Set(['xueshen', 'zhangruonan', 'lixingyun', 'jiruxue', 'custom'])
    ;(store.cfg.customSkins || []).forEach((s) => { if (s && s.id) keepSkins.add(s.id) })
    for (const k of Object.keys(sv)) if (!keepSkins.has(k)) delete sv[k]
    store.cfg.skinVoices = sv
    store.cfg.customSkins = (store.cfg.customSkins || []).filter((s) => {
      if (!s) return false
      const v = s.voice || {}
      return !DELETED_VOICES.has(s.voice || '') && !DELETED_VOICES.has(v.voice) && !BUILTIN_NAMES.has(s.name || '')
    })
  } catch (e) {}
  try {
    const m = localStorage.getItem('xc_msgs')
    // 批次6-6A 版本迁移：先过统一迁移层再载入（首个真实迁移后续按 MIGRATIONS 追加）
    const migrated = migrate(KEYS.MSGS, 1)
    if (migrated != null) store.msgs = Array.isArray(migrated) ? migrated.slice(-200) : []
    else if (m) { try { store.msgs = JSON.parse(m).slice(-200) } catch (e) {} }
  } catch (e) {}
  try {
    const w = localStorage.getItem('xc_wqs')
    if (w) store.wqs = JSON.parse(w)
    // v3.8.212 一次性迁移：存量错题 subject 统一为 canonical（细分小板块或大板块全称）
    if (Array.isArray(store.wqs) && store.wqs.length && localStorage.getItem('xc_wq_subj_v1') !== '1') {
      let changed = false
      store.wqs.forEach((q) => {
        if (!q || !(q.subject || q.plate)) return
        const ns = canonicalSubjectOf(q)
        if (ns && ns !== q.subject) { q.subject = ns; changed = true }
      })
      if (changed) saveWqs()
      localStorage.setItem('xc_wq_subj_v1', '1')
    }
  } catch (e) {}
  try {
    const mo = localStorage.getItem('xc_mode')
    if (mo) store.mode = mo
  } catch (e) {}
  try {
    const mm = localStorage.getItem('xc_my_mem')
    if (mm) store.myMem = JSON.parse(mm)
  } catch (e) {}
  try {
    const nn = localStorage.getItem('xc_notes')
    if (nn) store.notes = JSON.parse(nn)
  } catch (e) {}
  // ===== 多考试倒计时迁移（v3.8.69）：旧版只有单一 examDate → 升级为 exams 数组 =====
  try {
    if (!Array.isArray(store.cfg.exams) || !store.cfg.exams.length) {
      // 旧用户：把原 examDate 作为内置国考；新用户：D() 已带默认国考
      const legacy = store.cfg.examDate || '2026-11-29'
      store.cfg.exams = [{ id: 'gk', name: '国考', date: legacy, color: '#ff5c7c', builtin: true }]
    }
    // 清理脏数据：确保每条考试有合法字段
    store.cfg.exams = store.cfg.exams.map((e) => ({
      id: e.id || 'c_' + Date.now() + Math.random().toString(36).slice(2, 6),
      name: (e.name || '未命名考试').trim() || '未命名考试',
      date: e.date || '2026-11-29',
      color: e.color || '#5cc8ff',
      builtin: !!e.builtin
    }))
    // 激活考试必须存在，否则回退到第一条
    if (!store.cfg.exams.find((e) => e.id === store.cfg.activeExamId)) {
      store.cfg.activeExamId = store.cfg.exams[0].id
    }
    // 让 examDate 镜像当前激活考试，兼容旧读取点/外部引用
    const act = store.cfg.exams.find((e) => e.id === store.cfg.activeExamId) || store.cfg.exams[0]
    store.cfg.examDate = act.date
    saveCfg()
  } catch (e) {}
  // ===== 萌宠对话记忆库迁移（v3.8.75）：确保字段存在（旧用户升级） =====
  try {
    if (!Array.isArray(store.cfg.petChatLog)) store.cfg.petChatLog = []
  } catch (e) {}
}
export const saveCfg = () => { safeSet(KEYS.CFG, store.cfg) }
export const saveMsgs = () => {
  try {
    // 压缩过大的图片 dataURL，避免 localStorage 超限导致历史丢失（用户用图提问截图常很大）
    const slim = JSON.stringify(store.msgs.slice(-200), (k, v) => {
      // 超大图直接置空（避免占位符字符串被当成图片 URL 发到 API 报 Unsupported image_url format）
      if (typeof v === 'string' && v.length > 800000 && v.startsWith('data:image')) {
        return ''
      }
      // 批次5-P5-2 渲染缓存字段不入持久化（_html/_htmlKey 为运行时缓存，重启后重建）
      if (k === '_html' || k === '_htmlKey' || k === '_bk') {
        return undefined
      }
      return v
    })
    // 写盘走统一持久化层：保留 slim 裁剪（超大图/渲染缓存字段剔除），QuotaExceeded 由 safeSet 降级
    safeSet(KEYS.MSGS, JSON.parse(slim))
  } catch (e) {}
}
// ===== 错题查重与去重：完全相同的题只存一道 =====
// ===== 错题完整性校验：非完整题目/对话回复消息不允许导入 =====
export function isCompleteWrong(wq, extra = {}) {
  const q = String(wq.question || wq.q || wq.stem || '').replace(/<[^>]+>/g, ' ').trim()
  const ans = String(wq.answer || wq.ans || wq.correct || '').trim()
  const letter = answerLetter(ans) || (/^[A-D]$/i.test(ans) ? ans.toUpperCase() : '')
  const opts = extractChoices(q)
  const hasImg = !!(wq.imgs && wq.imgs.length)
  if (q.length < 15) return { ok: false, reason: '内容过短，不是一道完整题目（可能误选了回复消息）' }
  // 聊天导出的错题（chatWrong）：题干+选项完整且带错因说明即放行（答案可能需复盘补填）
  if (extra.chatWrong && opts.length && (Array.isArray(wq.reasons) ? wq.reasons.length : (wq.reason || wq.note))) {
    return { ok: true }
  }
  // 无选项、无答案、无截图 → 典型的对话回复/非题目内容
  if (!opts.length && !letter && !hasImg) return { ok: false, reason: '这是对话回复/非题目内容，无法存入错题集' }
  // 无截图且无答案标记 → 无法确认是完整题目（对话出题卡 allowNoAnswer：题干+选项完整即视为完整题，答案可在复盘补填）
  if (!hasImg && !letter && !extra.allowNoAnswer) return { ok: false, reason: '缺少正确答案标记，无法确认是完整题目' }
  return { ok: true }
}
// 题干归一化（去 HTML/空白），作为"完全相同"的判定键
function normWrongQ(x) {
  return String(x.question || x.q || x.stem || '').replace(/<[^>]+>/g, '').replace(/\s+/g, '').trim()
}
// 添加错题（唯一规则）：完全相同的题干只存一道；重复时累计错误次数、更新存入时间，不新增条目
export function addWrong(wq, opts = {}) {
  try { const st = String((wq && (wq.subject || wq.plate)) || ''); const t0 = String((wq && (wq.sub || wq.variant)) || '').trim(); if (t0) { const c = canonicalType(st, t0); if (c) wq.sub = c } } catch (e) {} // v3.8.192 题型 canonical 归一
  try { if (wq && (wq.subject || wq.plate)) { const ns = canonicalSubjectOf(wq); if (ns) wq.subject = ns } } catch (e) {} // v3.8.212 subject 写入统一（细分小板块或大板块全称）
  const chk = isCompleteWrong(wq, opts)
  if (!chk.ok) {
    try { showToast('🚫 ' + chk.reason, 'error') } catch (e) {}
    return { ok: false, reason: chk.reason }
  }
  // 完整性护栏（v3.8.167）：图形推理题必须有可渲染图形（题干/选项含 svg、md 图片或原题截图任一即可），杜绝“只有占位符”的残缺错题入库
  if (wq && wq.subject === '图形推理') {
    const rawTxt = String(wq.question || wq.q || wq.stem || '')
    const hasFig = /<svg|```svg|!\[|<img|\[ECHARTS\]/.test(rawTxt) || !!((wq.imgs || []).length)
    if (!hasFig) {
      const reason = '图形推理题未包含图形（题干无 svg/图片、也无原题截图），为保证完整已拦截；请回原题重存或携带截图'
      try { showToast('🚫 ' + reason, 'error') } catch (e) {}
      return { ok: false, reason }
    }
  }
  const key = normWrongQ(wq)
  const dup = key ? store.wqs.find((x) => normWrongQ(x) === key) : null
  if (dup) {
    dup.wrongCount = (dup.wrongCount || 1) + 1
    dup.time = new Date().toLocaleString()
    if (wq.your && !dup.your) dup.your = wq.your
    if (wq.designer && !dup.designer) dup.designer = wq.designer // 命题人设计说明补全（重复入库时也带上）
    if (wq.explain && !dup.explain) dup.explain = wq.explain
    saveWqs()
    try { showToast('⚠️ 该题已在错题集，已累计错误次数，未重复添加', 'info') } catch (e) {}
    return { ok: true, dup: true, item: dup }
  }
  store.wqs.unshift(wq)
  saveWqs()
  if (!opts.silent) { try { showToast('✅ 已存入错题本', 'success') } catch (e) {} }
  return { ok: true, dup: false, item: wq }
}
// 一键去重：完全相同的题只保留最先（最新）的一道，返回删除条数
export function dedupeWrongs() {
  const seen = new Map()
  const remove = []
  store.wqs.forEach((x, i) => {
    const k = normWrongQ(x)
    if (!k) return
    if (seen.has(k)) remove.push(i)
    else seen.set(k, i)
  })
  if (!remove.length) return 0
  for (let i = remove.length - 1; i >= 0; i--) store.wqs.splice(remove[i], 1)
  saveWqs()
  return remove.length
}

export const saveWqs = () => { safeSet(KEYS.WQS, store.wqs) }
export const saveMyMem = () => { safeSet(KEYS.MY_MEM, store.myMem) }
export const saveNotes = () => { safeSet(KEYS.NOTES, store.notes) }

// ===== 多考试倒计时：管理方法（v3.8.69） =====
// 取当前激活考试对象（兜底返回第一条 / null）
export function getActiveExam() {
  const list = store.cfg.exams || []
  if (!list.length) return null
  return list.find((e) => e.id === store.cfg.activeExamId) || list[0]
}
// 切换激活考试并同步 examDate 镜像
export function setActiveExam(id) {
  if (!store.cfg.exams.find((e) => e.id === id)) return
  store.cfg.activeExamId = id
  const act = getActiveExam()
  if (act) store.cfg.examDate = act.date
  saveCfg()
}
// 新增自定义考试（国考等内置不可在此新增；返回新对象）
export function addExam({ name, date, color }) {
  const list = store.cfg.exams || (store.cfg.exams = [])
  const ex = {
    id: 'c_' + Date.now() + Math.random().toString(36).slice(2, 6),
    name: (name || '').trim() || '未命名考试',
    date: date || '2026-11-29',
    color: color || '#5cc8ff',
    builtin: false
  }
  list.push(ex)
  saveCfg()
  return ex
}
// 更新某考试字段（名称/日期/颜色）；若更新的是激活考试则同步 examDate 镜像
export function updateExam(id, patch) {
  const ex = store.cfg.exams.find((e) => e.id === id)
  if (!ex) return
  Object.assign(ex, patch)
  if (id === store.cfg.activeExamId) store.cfg.examDate = ex.date
  saveCfg()
}
// 删除自定义考试（内置国考不可删）；若删的是激活项则回退到第一条
export function removeExam(id) {
  const list = store.cfg.exams
  const ex = list.find((e) => e.id === id)
  if (!ex || ex.builtin) return false
  store.cfg.exams = list.filter((e) => e.id !== id)
  if (store.cfg.activeExamId === id) {
    store.cfg.activeExamId = store.cfg.exams[0] ? store.cfg.exams[0].id : ''
    const act = getActiveExam()
    if (act) store.cfg.examDate = act.date
  }
  saveCfg()
  return true
}

// ===== 萌宠对话记忆库（v3.8.75）：对话模式下自动记录问答，供"批量加错题"指令检索 =====
function todayStr(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
// 压缩文本：去 HTML/多空白并截断，控制记忆库体积（localStorage 限额）
function petCap(s, n = 1000) {
  s = String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return s.length > n ? s.slice(0, n) + '…' : s
}
const PET_LOG_CAP = 500 // 记忆库上限，超出丢弃最早记录
// 记录一条问答：q=用户提问，a=萌宠回复；meta={refId,bk,quiz}
export function recordPetChat(q, a, meta = {}) {
  try {
    const log = store.cfg.petChatLog || (store.cfg.petChatLog = [])
    // 同一消息（refId 相同）不重复记录（防止重渲染/重存导致重复）
    const last = log[log.length - 1]
    if (meta.refId && last && last.refId === meta.refId) return
    log.push({
      date: todayStr(),
      ts: Date.now(),
      q: petCap(q, 1200),
      a: petCap(typeof a === 'string' ? a : (a && a.text) || '', 1200),
      refId: meta.refId || null,
      bk: meta.bk || '',
      wrong: false,
      reason: '',
      quiz: null
    })
    if (log.length > PET_LOG_CAP) log.splice(0, log.length - PET_LOG_CAP)
    saveCfg()
  } catch (e) {}
}
// 标记某条对话为"错题"（结合作答错误原因）：按 refId 找到对应记录并填充结构化题目
export function markPetChatWrong(refId, info = {}) {
  try {
    const log = store.cfg.petChatLog || (store.cfg.petChatLog = [])
    let e = refId ? log.find((x) => x.refId === refId) : null
    if (!e) {
      // 兜底：没找到对应问答则新追加一条错题记录，保证不漏
      e = { date: todayStr(), ts: Date.now(), q: petCap(info.ask || '', 1200), a: '', refId: refId || null, bk: info.bk || '', wrong: false, reason: '', quiz: null }
      log.push(e)
    }
    e.wrong = true
    e.reason = info.reason || ''
    e.bk = info.bk || e.bk || ''
    e.quiz = {
      stem: String(info.stem || ''),
      options: Array.isArray(info.options) ? info.options.map((o) => ({ k: o.k, t: String(o.t || '').replace(/<[^>]+>/g, ' ').slice(0, 300) })) : [],
      answer: info.answer || '',
      picked: info.picked || '',
      correct: info.correct,
      explain: String(info.explain || '').replace(/<[^>]+>/g, ' ').slice(0, 800)
    }
    if (log.length > PET_LOG_CAP) log.splice(0, log.length - PET_LOG_CAP)
    saveCfg()
    return e
  } catch (e) {}
}
// 取"今天"的全部对话记录
export function getTodaysPetChat() {
  try {
    const t = todayStr()
    return (store.cfg.petChatLog || []).filter((x) => x.date === t)
  } catch (e) { return [] }
}

