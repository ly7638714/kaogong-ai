// utils/nav.js —— 全局返回栈
// 面板/浮层打开时入栈并 pushState；浏览器返回键或应用内「返回上一层」统一走栈，
// 回到上一层级（面板所在页），不再"莫名跳回主界面"。
import { reactive } from 'vue'

export const nav = reactive({ stack: [] })

// 打开一层（面板/浮层）：入栈 + pushState（深度写入 history.state）
export function navOpen(meta) {
  nav.stack.push(meta)
  try {
    window.history.pushState({ __appNav: nav.stack.length }, '')
  } catch (e) {}
}

// 应用内「返回上一层」：弹出栈顶并触发浏览器返回（popstate 会再次同步，栈已弹不会重复）
// 返回被弹出的条目（调用方据此关闭对应面板）；栈空返回 null
export function navBack() {
  if (!nav.stack.length) return null
  const e = nav.stack.pop()
  try {
    if (window.history.state && window.history.state.__appNav) window.history.back()
  } catch (err) {}
  return e
}

// popstate 触发时：把栈裁剪到历史深度，返回被关掉的条目 id 列表（供事件派发关闭面板）
export function syncNavFromHistory() {
  const depth = (window.history.state && window.history.state.__appNav) || 0
  if (nav.stack.length <= depth) return []
  const removed = nav.stack.slice(depth)
  nav.stack.length = depth
  return removed.map((x) => x.id)
}
