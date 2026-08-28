// utils/errorLog.js —— 全局异常捕获 + 本地错误日志（P3 质量加固）
// 捕获 window error / unhandledrejection / Vue 渲染错误，写入 localStorage 滚动日志，
// 非入侵地 toast 提示（节流），并可在「设置 → 帮助与关于」查看/清空，方便本地排查。
import { showToast } from './toast'

const MAX_LOG = 50 // 保留最近 50 条，防 localStorage 膨胀
const TOAST_GAP = 5000 // 错误提示节流：5s 内最多弹一次，避免连环报错刷屏
let lastToastAt = 0

export function getErrorLog() {
  try {
    const s = localStorage.getItem('xc_errlog')
    return s ? JSON.parse(s) : []
  } catch (e) {
    return []
  }
}

function saveLog(list) {
  try {
    localStorage.setItem('xc_errlog', JSON.stringify(list.slice(-MAX_LOG)))
  } catch (e) {
    /* 存储满/被禁用时静默丢弃日志，不影响主功能 */
  }
}

export function pushErrorLog(entry) {
  const list = getErrorLog()
  list.push({ t: new Date().toLocaleString(), ...entry })
  saveLog(list)
}

export function clearErrorLog() {
  try {
    localStorage.removeItem('xc_errlog')
  } catch (e) {}
}

function notify() {
  const now = Date.now()
  if (now - lastToastAt > TOAST_GAP) {
    lastToastAt = now
    showToast('⚠️ 运行出错，已记入「设置 → 关于」本地错误日志', 'error')
  }
}

function shortStack(err) {
  if (!err || !err.stack) return ''
  const s = String(err.stack)
  return s.length > 400 ? s.slice(0, 400) + '…' : s
}

// 初始化全局异常捕获（main.js 里 createApp 后调用一次）
export function initErrorHandlers(app) {
  // 1) 运行时未捕获异常（含脚本错误）
  window.addEventListener('error', (ev) => {
    const msg = (ev && ev.message) || '未知运行错误'
    pushErrorLog({ type: 'window.error', msg, src: (ev.filename || '').split('/').pop() || '', stack: shortStack(ev.error) })
    notify()
  })
  // 2) 未处理的 Promise 拒绝（异步链路）
  window.addEventListener('unhandledrejection', (ev) => {
    const r = ev && ev.reason
    const msg = (r && (r.message || String(r))) || '未处理的 Promise 拒绝'
    pushErrorLog({ type: 'unhandledrejection', msg, stack: shortStack(r) })
    notify()
  })
  // 3) Vue 渲染 / 生命周期 / 组件事件错误（全局错误边界）
  if (app) {
    app.config.errorHandler = (err, instance, info) => {
      const msg = (err && err.message) || String(err)
      let comp = ''
      if (instance) {
        const o = instance.$options || {}
        comp = o.name || o.__name || ''
      }
      pushErrorLog({ type: 'vue.' + (info || 'render'), msg, comp, stack: shortStack(err) })
      notify()
      // 不吞错误，控制台保留完整堆栈便于深挖
      console.error('[xc-error]', err, info)
    }
  }
}
