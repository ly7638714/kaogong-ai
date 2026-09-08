/* global btoa */
// ===== WebDAV 云同步（坚果云/Nextcloud 等通用协议）=====
import { store } from '../store'
import { collectAll } from './dataBackup'

function b64(s) {
  return btoa(unescape(encodeURIComponent(s)))
}

export function wdAuthHeaders(user, pass) {
  const h = { 'Content-Type': 'application/json' }
  if (user || pass) h.Authorization = 'Basic ' + b64(user + ':' + pass)
  return h
}

function stripQueryHash(raw) {
  let s = String(raw || '').trim()
  if (!s) return ''
  const cut = [s.indexOf('#'), s.indexOf('?')].filter((i) => i >= 0).sort((a, b) => a - b)[0]
  if (cut >= 0) s = s.slice(0, cut)
  return s.replace(/\/+$/, '')
}

// 用户可能只填了坚果云根地址 /dav/，也可能填了目录。这里统一补齐成可写的 .json 文件地址。
export function webdavFileUrl(raw) {
  let s = stripQueryHash(raw)
  if (!s) return ''
  if (/\.json$/i.test(s)) return s
  if (/dav\.jianguoyun\.com\/dav\/?$/i.test(s)) return s + '/xingce-ai.json'
  if (s.endsWith('/')) return s + 'xingce-ai.json'
  const u = new URL(s)
  const last = (u.pathname.split('/').filter(Boolean).pop() || '').toLowerCase()
  if (!last.includes('.')) return s + '/xingce-ai.json'
  return s + '.json'
}

// 自动互通使用独立 .sync.json，避免覆盖手动「上传/下载备份」文件。
export function webdavSyncUrl(raw) {
  const base = webdavFileUrl(raw)
  return base.replace(/\.json$/i, '.sync.json')
}

function parentDirOf(url) {
  try {
    const u = new URL(url)
    const parts = u.pathname.split('/').filter(Boolean)
    parts.pop()
    u.pathname = parts.length ? '/' + parts.join('/') : '/'
    u.search = ''
    u.hash = ''
    const out = u.toString().replace(/\/+$/, '')
    return out + (u.pathname === '/' ? '' : '/')
  } catch (e) {
    return ''
  }
}

async function ensureWebdavParent(url, auth) {
  const dir = parentDirOf(url)
  if (!dir) return { ok: true }
  const u = new URL(dir)
  const parts = u.pathname.split('/').filter(Boolean)
  if (!parts.length) return { ok: true }
  const h = { Authorization: auth }
  let built = ''
  for (const p of parts) {
    built += '/' + p
    const mk = await fetch(u.origin + built, { method: 'MKCOL', headers: h })
    if (mk.status === 401 || mk.status === 403) return { ok: false, status: mk.status }
    if (mk.status !== 200 && mk.status !== 201 && mk.status !== 204 && mk.status !== 405 && mk.status !== 301 && mk.status !== 302 && mk.status !== 409) {
      // 目录级 WebDAV 不允许 MKCOL 时不要中断，交给后续 PUT 报真实状态。
      return { ok: true }
    }
  }
  return { ok: true }
}

export function describeWebdavHttp(status, method) {
  const act = method === 'GET' ? '下载' : '上传'
  if (status === 401) return 'WebDAV 账号或应用密码不对（坚果云请用官网「安全选项」里生成的应用密码，不是登录密码）'
  if (status === 403) return 'WebDAV 拒绝了访问（HTTP 403）：请确认填的是自己的账号，且地址在「我的坚果云 / dav」目录下'
  if (status === 404) return act + '遇到 404：云端没有该目录/文件，或目录尚未在坚果云客户端里创建；程序已尝试自动建目录，仍失败请用「🌰 坚果云模板」生成的官方根地址'
  if (status === 409 || status === 412) return 'WebDAV 文件冲突（HTTP ' + status + '）：请稍后再同步，或先用「⬇️ 下载备份」看云端版本'
  if (status === 405) return '当前 WebDAV 服务器不允许该操作（HTTP 405）：请确认地址指向文件而非文件夹'
  return act + '失败 HTTP ' + status
}

async function webdavFetch(url, options) {
  try {
    return await fetch(url, options)
  } catch (e) {
    throw new Error('坚果云/WebDAV 未向浏览器开放跨域（Failed to fetch）。电脑浏览器请改用上方的 Gitee/国内方案，或直接在安卓/iPad/坚果云客户端测试；提示文字会同步显示。', { cause: e })
  }
}

export async function webdavPutFile(url, headers, body) {
  let res = await webdavFetch(url, { method: 'PUT', headers, body })
  if (res.ok) return res
  if (res.status === 404 || res.status === 409) {
    await ensureWebdavParent(url, headers.Authorization || '')
    res = await webdavFetch(url, { method: 'PUT', headers, body })
  }
  if (!res.ok) throw new Error(describeWebdavHttp(res.status, 'PUT'))
  return res
}

export async function webdavGet(url, headers) {
  const res = await webdavFetch(url, { method: 'GET', headers })
  if (res.ok) return res
  if (res.status === 404) return null
  throw new Error(describeWebdavHttp(res.status, 'GET'))
}

export async function webdavUpload() {
  const w = store.cfg.webdav || {}
  const url = webdavFileUrl(w.url)
  if (!url) throw new Error('请先填写 WebDAV 地址')
  // v3.8.178：云同步与「导出备份/文件夹保存」同一套全量数据（设置/对话/错题/知识库/战绩/出题历史…），密钥打码保留结构
  const data = collectAll()
  await webdavPutFile(url, wdAuthHeaders(w.user, w.pass), JSON.stringify(data))
  return data.ts
}

export async function webdavDownload() {
  const w = store.cfg.webdav || {}
  const url = webdavFileUrl(w.url)
  if (!url) throw new Error('请先填写 WebDAV 地址')
  const res = await webdavGet(url, wdAuthHeaders(w.user, w.pass))
  if (!res) throw new Error('下载遇到 404：云端还没有这个备份文件；请先在任一设备点「⬆️ 上传备份」')
  return res.json()
}
