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
        vision: Object.assign(D().vision, d.vision || {})
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
      if (typeof v === 'string' && v.length > 200000 && v.startsWith('data:image')) {
        return '[大图已压缩存储]'
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
