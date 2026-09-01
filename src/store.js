import { reactive } from 'vue'
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
  ttsGm: { key: '', url: 'https://open.bigmodel.cn/api/paas/v4/audio/speech', model: 'glm-tts', voice: 'tongtong' },
  ttsOpenAI: { key: '', url: 'https://api.siliconflow.cn/v1', model: 'FunAudioLLM/CosyVoice2-0.5B', voice: 'default' },
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
  szTo: ''
})
export const store = reactive({ cfg: D(), mode: 'all', msgs: [], wqs: [], myMem: [], notes: [], tab: 'chat', busy: false, readCtx: null, curQ: null, uiCtx: { panel: null }, pendingAsk: '', pendingFocus: false })
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
  const chk = isCompleteWrong(wq, opts)
  if (!chk.ok) {
    try { showToast('🚫 ' + chk.reason, 'error') } catch (e) {}
    return { ok: false, reason: chk.reason }
  }
  const key = normWrongQ(wq)
  const dup = key ? store.wqs.find((x) => normWrongQ(x) === key) : null
  if (dup) {
    dup.wrongCount = (dup.wrongCount || 1) + 1
    dup.time = new Date().toLocaleString()
    if (wq.your && !dup.your) dup.your = wq.your
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

