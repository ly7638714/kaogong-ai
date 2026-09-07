// fastMode.js —— 快模型出题模式检测（深化·快模式质量门）
// 与 ExamPanel.pickGenC 的路由保持一致：useFigGen(图形快模型) 优先于 fastGenModel 名；
// 两个开关任一生效即视为「快模型出题」（比思考模型快、质量风险更高 → 需要质量门兜底）。
const KEY_FAST = 'xc_fast_gen_model'
const KEY_FIG = 'xc_use_fig_gen'
function read(k) { try { return localStorage.getItem(k) } catch (e) { return null } }
export function isFastGenMode() {
  try {
    const fgm = String(read(KEY_FAST) || '').trim()
    const useFig = read(KEY_FIG) === '1'
    return useFig || !!fgm
  } catch (e) { return false }
}
