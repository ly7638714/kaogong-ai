import { reactive } from 'vue'
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
  ttsOn: true,
  ttsScene: 'natural',
  ttsVoice: '',
  ttsRate: 0.98,
  ttsPitch: null,
  examMode: false, // 考场计时：开启后按问数限时并统计用时
  fontSize: 14.5,
  examDate: '2026-11-29',
  obsidian: true,
  eyeMode: 'normal',
  hl: false,
  bgMode: 'default',
  bgSolid: 'deep',
  bgImg: '',
  bgBlur: 12,
  bgAuto: false,
  view3d: false,
  themeMode: 'default',
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
export const store = reactive({ cfg: D(), mode: 'all', msgs: [], wqs: [], myMem: [], notes: [], tab: 'chat', busy: false })
export function load() {
  try {
    const s = localStorage.getItem('xc_cfg')
    if (s) {
      const d = JSON.parse(s)
      store.cfg = Object.assign(D(), d, {
        text: Object.assign(D().text, d.text || {}),
        vision: Object.assign(D().vision, d.vision || {}),
        fig: Object.assign(D().fig, d.fig || {})
      })
    }
  } catch (e) {}
  try {
    const m = localStorage.getItem('xc_msgs')
    if (m) store.msgs = JSON.parse(m).slice(-200)
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
export const saveCfg = () => {
  try {
    localStorage.setItem('xc_cfg', JSON.stringify(store.cfg))
  } catch (e) {}
}
export const saveMsgs = () => {
  try {
    // 压缩过大的图片 dataURL，避免 localStorage 超限导致历史丢失（用户用图提问截图常很大）
    const slim = JSON.stringify(store.msgs.slice(-200), (k, v) => {
      // 超大图直接置空（避免占位符字符串被当成图片 URL 发到 API 报 Unsupported image_url format）
      if (typeof v === 'string' && v.length > 800000 && v.startsWith('data:image')) {
        return ''
      }
      return v
    })
    try {
      localStorage.setItem('xc_msgs', slim)
    } catch (e) {
      // 仍超限：退化为仅存最近明文消息（去图）
      const plainOnly = store.msgs
        .slice(-30)
        .map((m) => {
          const c = m && m.content
          return {
            role: m.role,
            content: typeof c === 'string' ? c : (c && c.text) || '',
            answerTime: m.answerTime,
            answerSec: m.answerSec,
            bk: m.bk
          }
        })
      localStorage.setItem('xc_msgs', JSON.stringify(plainOnly))
    }
  } catch (e) {}
}
export const saveWqs = () => {
  try {
    localStorage.setItem('xc_wqs', JSON.stringify(store.wqs))
  } catch (e) {}
}
export const saveMyMem = () => {
  try {
    localStorage.setItem('xc_my_mem', JSON.stringify(store.myMem))
  } catch (e) {}
}
export const saveNotes = () => {
  try {
    localStorage.setItem('xc_notes', JSON.stringify(store.notes))
  } catch (e) {}
}
