/* global File */
// dataBackup.js —— 统一“全量数据备份”（设置/对话/错题/知识库/战绩/出题历史/记忆库…一切 xc_* 键）
// 供三路共用：📦导出JSON / 保存到本地文件夹 / WebDAV 云同步；导入时密钥打码字段保留本机现值
import { stripSecrets } from './stripSecrets'

export function collectAll() {
  const data = {}
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith('xc_')) {
      try {
        let val = localStorage.getItem(k)
        // 配置里的 API Key / WebDAV 密码等敏感字段 → 打码（***），结构保留、密钥不落盘
        if (k === 'xc_cfg') {
          try { val = JSON.stringify(stripSecrets(JSON.parse(val || '{}'))) } catch (e) {}
        }
        data[k] = val
      } catch (e) {}
    }
  }
  return { app: 'xingce', v: 2, t: Date.now(), data }
}

export function collectText() {
  return JSON.stringify(collectAll(), null, 2)
}

export function downloadBackup(name) {
  const blob = new Blob([collectText()], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  const d = new Date()
  a.download = name || '行测助手-全部数据备份-' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + '.json'
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}

// 恢复备份：全量写回 xc_* 键；cfg 里打码(***)的密钥字段保留本机现有值
// 手机端：调用系统“保存/分享”把备份存到你选的任意位置（无需预先选文件夹）
export async function shareBackup(name) {
  if (typeof navigator === 'undefined' || !navigator.canShare) return false
  const blob = new Blob([collectText()], { type: 'application/json' })
  const f = new File([blob], name || '行测助手-全部数据备份.json', { type: 'application/json' })
  try {
    if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [f] })) {
      await navigator.share({ files: [f], title: '行测助教 · 数据备份' })
      return true
    }
  } catch (e) { /* 用户取消分享视为放弃 */ }
  return false
}

export function restoreAll(obj) {
  let items = null
  if (obj && obj.data && (obj.v === 2 || obj.app === 'xingce')) items = obj.data
  else if (obj && typeof obj === 'object') items = obj // 兼容旧格式
  if (!items || typeof items !== 'object') throw new Error('备份文件格式不对')
  let prevCfg = {}
  try { prevCfg = JSON.parse(localStorage.getItem('xc_cfg') || '{}') } catch (e) {}
  let n = 0
  for (const k in items) {
    if (!String(k).startsWith('xc_')) continue
    let v = items[k]
    if (k === 'xc_cfg') {
      try {
        const cur = JSON.parse(String(v))
        for (const f in cur) {
          if (cur[f] === '***' && prevCfg[f] !== undefined) cur[f] = prevCfg[f]
          else if (cur[f] === '***') delete cur[f]
        }
        v = JSON.stringify(cur)
      } catch (e) {}
    }
    try { localStorage.setItem(k, v); n++ } catch (e) {}
  }
  return n
}
