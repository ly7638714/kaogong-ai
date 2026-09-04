/* global btoa */
// ===== WebDAV 云同步（坚果云/Nextcloud 等通用协议）=====
import { store } from '../store'
import { collectAll } from './dataBackup'

function b64(s) {
  return btoa(unescape(encodeURIComponent(s)))
}
function hdrs(user, pass) {
  const h = { 'Content-Type': 'application/json' }
  if (user || pass) h['Authorization'] = 'Basic ' + b64(user + ':' + pass)
  return h
}
export async function webdavUpload() {
  const w = store.cfg.webdav || {}
  if (!w.url || !w.url.trim()) throw new Error('请先填写 WebDAV 地址')
  // v3.8.178：云同步与「导出备份/文件夹保存」同一套全量数据（设置/对话/错题/知识库/战绩/出题历史…），密钥打码保留结构
  const data = collectAll()
  const res = await fetch(w.url.trim(), {
    method: 'PUT',
    headers: hdrs(w.user, w.pass),
    body: JSON.stringify(data)
  })
  if (!res.ok) throw new Error('上传失败 HTTP ' + res.status)
  return data.ts
}
export async function webdavDownload() {
  const w = store.cfg.webdav || {}
  if (!w.url || !w.url.trim()) throw new Error('请先填写 WebDAV 地址')
  const res = await fetch(w.url.trim(), { method: 'GET', headers: hdrs(w.user, w.pass) })
  if (!res.ok) throw new Error('下载失败 HTTP ' + res.status)
  return res.json()
}
