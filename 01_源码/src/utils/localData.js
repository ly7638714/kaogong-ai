/* global indexedDB */
import { store } from '../store'
import { collectText } from './dataBackup'
import { isNativeHost, nativePickFolder, nativeWriteFolderText } from './platform' // 方案乙：SAF 选文件夹走原生宿主

let dirHandle = null
let dirName = ''
function saveHandle(h) {
  try {
    const req = indexedDB.open('xc_data', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('kv')
    req.onsuccess = () => {
      const db = req.result
      const tx = db.transaction('kv', 'readwrite')
      tx.objectStore('kv').put(h, 'dirHandle')
      tx.oncomplete = () => db.close()
    }
  } catch (e) {}
}
// 原生宿主(方案乙)：SAF 目录记忆
let nativeTree = ''
let nativeTreeName = ''
function loadNativeTarget() {
  try { nativeTree = localStorage.getItem('xc_native_tree') || ''; nativeTreeName = localStorage.getItem('xc_native_tree_name') || '' } catch (e) {}
}
function saveNativeTarget(uri, name) {
  nativeTree = uri; nativeTreeName = name
  try { localStorage.setItem('xc_native_tree', uri); localStorage.setItem('xc_native_tree_name', name) } catch (e) {}
}
loadNativeTarget()

export async function pickDataFolder() {
  if (isNativeHost()) {
    const r = await nativePickFolder()
    if (!r || !r.ok) throw new Error((r && r.error) || '未选择文件夹')
    saveNativeTarget(r.treeUri, r.name)
    dirName = r.name
    startAutoFolderBackup()
    return r.name
  }
  if (!window.showDirectoryPicker) throw new Error('当前环境不支持“选文件夹”（请用 Chrome/Edge 桌面浏览器，或改用 📦导出全部数据/WebDAV 云同步）')
  try {
    dirHandle = await window.showDirectoryPicker()
  } catch (e) {
    const m = String((e && e.message) || e || '')
    if (/abort/i.test(m)) throw new Error('选择被取消或浏览器拦截（user aborted）。若一点开就自动关闭，请改用 📦导出全部数据 或 Chrome/Edge 桌面版重试', { cause: e })
    throw new Error('文件夹选择失败：' + (m || '未知原因'), { cause: e })
  }
  dirName = dirHandle.name
  saveHandle(dirHandle)
  startAutoFolderBackup()
  return dirName
}
async function getDir() {
  if (dirHandle) return dirHandle
  try {
    const req = indexedDB.open('xc_data', 1)
    const db = await new Promise((res, rej) => {
      req.onsuccess = () => res(req.result)
      req.onerror = () => rej(req.error)
    })
    const tx = db.transaction('kv', 'readonly')
    const h = await new Promise((res, rej) => {
      const r = tx.objectStore('kv').get('dirHandle')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    db.close()
    dirHandle = h || null
    dirName = dirHandle ? dirHandle.name : ''
    return dirHandle
  } catch (e) {
    return null
  }
}
export async function getFolderName() {
  if (isNativeHost()) { loadNativeTarget(); return nativeTree ? nativeTreeName : '' }
  await getDir()
  return dirName
}
export async function saveAllDataToFolder() {
  if (isNativeHost()) {
    loadNativeTarget()
    if (!nativeTree) throw new Error('请先「选择保存文件夹」')
    return nativeSaveAll()
  }
  const h = await getDir()
  if (!h) throw new Error('请先「选择保存文件夹」')
  const write = async (name, content, type) => {
    const fh = await h.getFileHandle(name, { create: true })
    const w = await fh.createWritable()
    await w.write(new Blob([content], { type }))
    await w.close()
  }
  await write('行测AI数据备份.json', collectText(), 'application/json') // v3.8.178 全量（设置/对话/错题/知识库/战绩/出题历史等，密钥打码）
  // 附带错题 Markdown
  const wqMd = ['# 行测错题集', ''].concat(
    store.wqs.map((q, i) => `${i + 1}. 【${q.subject || '未分类'}】${q.question || ''}\n   答案：${q.answer || '未填'}\n   错因：${(q.reasons || []).join('、') || '—'}`)
  ).join('\n')
  await write('行测错题集.md', wqMd, 'text/markdown')
  // 附带知识库 Markdown
  const kbMd = ['# 行测知识库积累', ''].concat(
    store.myMem.map((m) => `【${m.type || '其他'}】${m.text}`)
  ).join('\n')
  await write('行测知识库积累.md', kbMd, 'text/markdown')
  return dirName || h.name
}

// v3.8.179 自动备份：选过一次文件夹后，每 45 秒把全量数据静默写入该文件夹（错题/设置/对话等）+ 附带 Markdown
let _autoTimer = null
export function startAutoFolderBackup() {
  if (_autoTimer) return
  _autoTimer = setInterval(async () => {
    try { await saveAllDataToFolder() } catch (e) {}
  }, 45000)
}
// 原生宿主：向 SAF 目录写三件套
async function nativeSaveAll() {
  const wqMd = ['# 行测错题集', ''].concat(store.wqs.map((q, i) => i + '. 【' + (q.subject || '未分类') + '】' + (q.question || '') + ' 答案：' + (q.answer || '未填') + ' 错因：' + (q.reasons || []).join('、') + '')).join('')
  const kbMd = ['# 行测知识库积累', ''].concat(store.myMem.map((m) => '【' + (m.type || '其他') + '】' + m.text)).join('')
  const files = [['行测AI数据备份.json', collectText()], ['行测错题集.md', wqMd], ['行测知识库积累.md', kbMd]]
  for (const [n, c] of files) { const r = await nativeWriteFolderText(nativeTree, n, c); if (!r.ok) throw new Error('写入失败：' + (r.error || n)) }
  return nativeTreeName || nativeTree
}

// 下次启动自动恢复（此前已授权并保存过文件夹句柄）
setTimeout(() => {
  if (isNativeHost()) { loadNativeTarget(); if (nativeTree) startAutoFolderBackup(); return }
  getDir().then((h) => { if (h) startAutoFolderBackup() }).catch(() => {})
}, 1600)
