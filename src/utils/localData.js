/* global indexedDB */
import { store } from '../store'
import { stripSecrets } from './stripSecrets'

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
export async function pickDataFolder() {
  if (!window.showDirectoryPicker) throw new Error('当前浏览器不支持选择文件夹，请用 Chrome/Edge 桌面版，或改用「下载备份」')
  dirHandle = await window.showDirectoryPicker()
  dirName = dirHandle.name
  saveHandle(dirHandle)
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
  await getDir()
  return dirName
}
export async function saveAllDataToFolder() {
  const h = await getDir()
  if (!h) throw new Error('请先「选择保存文件夹」')
  const data = {
    app: '行测名师AI小助理',
    ts: Date.now(),
    // 批次3补课：本地文件夹备份同样剔除 API Key / 密码（与 WebDAV/导出JSON 三路一致）
    cfg: stripSecrets(store.cfg),
    msgs: store.msgs,
    wqs: store.wqs,
    myMem: store.myMem,
    notes: store.notes
  }
  const write = async (name, content, type) => {
    const fh = await h.getFileHandle(name, { create: true })
    const w = await fh.createWritable()
    await w.write(new Blob([content], { type }))
    await w.close()
  }
  await write('行测AI数据备份.json', JSON.stringify(data, null, 2), 'application/json')
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
