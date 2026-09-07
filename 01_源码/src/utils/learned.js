// 学习印记：记录用户"学过"的知识卡（点开查看 / 一键问 AI 即点亮）
// 持久化 localStorage，模块级缓存 + 全局事件广播（知识图谱监听后实时点亮对应星球）
const KEY = 'xc_learned_cards'
const EVENT = 'xc-learned'

let cache = null

function load() {
  try {
    const arr = JSON.parse(localStorage.getItem(KEY) || '[]')
    return new Set(Array.isArray(arr) ? arr : [])
  } catch (e) {
    return new Set()
  }
}
function get() {
  if (!cache) cache = load()
  return cache
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify([...get()])) } catch (e) {}
}
/** 当前已学习卡 id 集合（只读） */
export function learnedSet() {
  return get()
}
/** 是否已学过某卡 */
export function isLearned(id) {
  return get().has(id)
}
/** 标记某卡已学习（去重；返回 true 表示首次点亮） */
export function markLearned(id) {
  if (!id) return false
  const s = get()
  if (s.has(id)) return false
  s.add(id)
  save()
  window.dispatchEvent(new CustomEvent(EVENT, { detail: id }))
  return true
}
/** 一键清空学习印记 */
export function clearLearned() {
  cache = new Set()
  try { localStorage.removeItem(KEY) } catch (e) {}
  window.dispatchEvent(new CustomEvent(EVENT))
}
