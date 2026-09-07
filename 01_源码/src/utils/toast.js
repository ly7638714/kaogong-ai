// 轻量全局 toast：向 #toast 元素推消息并自动显隐（无第三方依赖）
// 支持类型 success / error / info，可叠加计数与排队。
let _timer = null
let _queue = []
let _toastEl = null

function ensureEl() {
  if (!_toastEl) _toastEl = document.getElementById('toast')
  if (!_toastEl) throw new Error('缺少 #toast 容器，请在 App 模板中保留 <div class="toast" id="toast">')
  return _toastEl
}

function render() {
  if (!_queue.length) return
  const el = ensureEl()
  const cur = _queue[0]
  el.textContent = cur
  el.className = 'toast show ' + curType // 保留透传的最近类型
  clearTimeout(_timer)
  _timer = setTimeout(() => {
    el.className = 'toast'
    setTimeout(() => {
      _queue.shift()
      render()
    }, 300)
  }, 2200)
}

let curType = ''

/** 弹出 toast。type：'success' | 'error' | 'info'（默认 info） */
export function showToast(msg, type = 'info') {
  const t = String(msg || '')
  if (!t) return
  _queue.push(t)
  curType = type
  render()
}

// 便捷别名
export const toast = (msg, type) => showToast(msg, type)
export const toastSuccess = (msg) => showToast(msg, 'success')
export const toastError = (msg) => showToast(msg, 'error')
export const toastInfo = (msg) => showToast(msg, 'info')
