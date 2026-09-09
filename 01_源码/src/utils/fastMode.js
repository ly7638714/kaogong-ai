// fastMode.js —— 快模型出题模式检测（深化·快模式质量门）
// 与 ExamPanel.pickGenC 的路由保持一致：useFigGen(图形快模型) 优先于 fastGenModel 名；
// 两个开关任一生效即视为「快模型出题」（比思考模型快、质量风险更高 → 需要质量门兜底）。
import { store } from '../store'
import { activeCfg } from '../api/client'
import { fastTextOf } from '../api/modelRegistry'

const KEY_FAST = 'xc_fast_gen_model'
const KEY_CHAT_FAST = 'xc_chat_fast_model'
const KEY_FIG = 'xc_use_fig_gen'
function read(k) {
  try {
    return localStorage.getItem(k)
  } catch (e) {
    return null
  }
}
export function isFastGenMode() {
  try {
    const c = activeCfg(false)
    const fgm = String(read(KEY_FAST) || '').trim()
    const useFig = read(KEY_FIG) === '1'
    const autoFast = c && c.key && (fastTextOf(c.prov || '')[0] || {}).id
    return useFig || !!fgm || !!autoFast
  } catch (e) {
    return false
  }
}

// 与单题快练/主页对话快答一致：图形增强里的智谱快模型 > 出题快模型 > 对话快模型 > 文字模型。
// 错题变式、AI 出题等需要“快速生成题”的场景统一走这里，不再各自夹带一套慢路由。
const DEF_URL = {
  ds: 'https://api.deepseek.com/chat/completions',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
  sf: 'https://api.siliconflow.cn/v1/chat/completions',
  openai: 'https://api.openai.com/v1/chat/completions'
}
function withUrl(o) {
  if (!o || o.url) return o
  return { ...o, url: DEF_URL[o.prov] || DEF_URL.ds }
}
export function pickGenCfg() {
  const c = activeCfg(false)
  if (!c || !c.key) return null
  try {
    const fig = store.cfg.fig
    if (read(KEY_FIG) === '1' && fig && fig.key) {
      return withUrl({ prov: fig.prov || 'zhipu', key: fig.key, url: fig.url, model: fig.model || 'glm-4.6-flash' })
    }
    const autoFast = (fastTextOf(c.prov || '')[0] || {}).id || ''
    const fast = String(read(KEY_FAST) || read(KEY_CHAT_FAST) || '').trim() || autoFast
    if (fast) return withUrl({ ...c, model: fast, noThink: true })
  } catch (e) {}
  return withUrl(c)
}
