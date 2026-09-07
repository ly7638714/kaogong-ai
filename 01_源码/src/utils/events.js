// events.js —— 事件总线（批次6-6A）：保留 window CustomEvent 行为，统一 on/off/emit + 生命周期自动清理
import { onMounted, onUnmounted } from 'vue'

export function on(name, fn) {
  window.addEventListener(name, fn)
  return () => window.removeEventListener(name, fn)
}
export function off(name, fn) {
  window.removeEventListener(name, fn)
}
export function emit(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail }))
}
// 注册并在组件卸载时自动清理（必须在 setup 中调用）
export function bindEvent(name, fn) {
  onMounted(() => on(name, fn))
  onUnmounted(() => off(name, fn))
}
