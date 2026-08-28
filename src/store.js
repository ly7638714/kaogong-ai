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
  ttsMode: 'glm', // 真人朗读引擎：glm=智谱超拟人 / openai=OpenAI兼容CosyVoice / edge=Edge免费神经 / sys=系统语音
  ttsGm: { key: '', url: 'https://open.bigmodel.cn/api/paas/v4/audio/speech', model: 'glm-tts', voice: 'tongtong' },
  ttsOpenAI: { key: '', url: 'https://api.siliconflow.cn/v1', model: 'FunAudioLLM/CosyVoice2-0.5B', voice: 'default' },
  ttsEdgeVoice: 'zh-CN-XiaoxiaoNeural',
  petVoice: true, // 萌宠语音朗读总开关（配合真人 TTS 引擎）
  petSkin: 'lixingyun', // 萌宠角色皮肤：lixingyun=李星云 / xueshen=薛神 / custom=自定义人物
  skinImgs: {}, // 每个角色皮肤的自定义形象（用户上传的动漫图片，dataURL）
  skinVoices: {}, // 每个角色皮肤绑定的大模型克隆声线 { skinId: { engine, voice, name, model } }
  petCustom: { name: '自定义人物', persona: '你是一位由用户自定义的角色，性格按用户设定，热情可靠，像朋友一样陪伴用户备考。' }, // 自定义人物：名字 / 人设
  customSkins: [], // 用户新增的自定义角色列表 [{ id:'custom2', name, persona }]
  globalVoice: null, // 全局音色快照（语音设置里的音色；切换非克隆角色时恢复，保证全局音色=萌宠音色一致）
  petImg: '', // 全局自定义形象（未分皮肤时生效）
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
export const store = reactive({ cfg: D(), mode: 'all', msgs: [], wqs: [], myMem: [], notes: [], tab: 'chat', busy: false, readCtx: null, curQ: null })
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


