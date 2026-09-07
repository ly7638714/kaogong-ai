/* global atob, plus */
// downloadOut.js —— 统一“导出/截图”出口（v3.8.214）
// 目标：手机端（HBuilderX/5+App）不再只能靠 a.click 下载（WebView 常无反应/无路径提示）；
//   ① 图片：原生优先存系统相册（+提示路径）并可拉起系统分享；
//   ② 文本/备份：原生写进 Download/行测AI导出/ 并提示完整路径；
//   ③ 桌面浏览器：优先系统“另存为”对话框（showSaveFilePicker），兜底 a.click。
// MobileApp-DeepDev 深度适配：宿主探测统一收口到 utils/platform.js（5+/自建宿主可切换）
import { isPlusHost, scanFile, isNativeHost } from './platform'
import { exportDone } from './exportFeedback'
function hasNative() { return isPlusHost() }
function withTimeout(p, ms, msg) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(msg || '系统未响应（写入超时）')), ms))])
}
function dataUrlToBlob(dataUrl) {
  const [head, body] = String(dataUrl || '').split(',')
  const m = /^data:([^;]*);base64/.exec(head)
  const b64 = (body || '')
  const bin = atob(b64)
  const u8 = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i)
  return new Blob([u8], { type: m ? m[1] : 'image/png' })
}
function nativeWriteBytes(path, blob) {
  return new Promise((resolve, reject) => {
    plus.io.resolveLocalFileSystemURL('_downloads/', (root) => {
      root.getFile(path, { create: true }, (fe) => {
        fe.createWriter((w) => {
          w.onwrite = () => resolve()
          w.onerror = (e) => reject(new Error((e && e.message) || 'write error'))
          const reader = new FileReader()
          reader.onload = () => w.write(reader.result)
          reader.onerror = () => reject(new Error('read error'))
          reader.readAsArrayBuffer(blob)
        }, (e) => reject(new Error((e && e.message) || 'writer error')))
      }, (e) => reject(new Error((e && e.message) || 'file error')))
    }, (e) => reject(new Error((e && e.message) || 'downloads error')))
  })
}
function toAbs(path) {
  try { return plus.io.convertLocalFileSystemURL(path) } catch (e) { return path }
}
// 图片保存：原生→系统相册/分享；桌面→另存为对话框；兜底 a.click
export async function saveImage(dataUrl, filename) {
  const name = String(filename || '截图').replace(/\.png$/i, '') + '.png'
  if (isNativeHost()) {
    // 方案乙：原生宿主走 MediaStore 公共相册（无需存储权限，国产 ROM 通用）
    try {
      const r = JSON.parse(window.xcnative.saveImage(dataUrl, name) || '{}')
      if (r.ok) {
        try { exportDone({ kind: 'image', title: '🖼 截图已保存', name: r.name || name, where: '系统相册「行测AI导出」', uri: r.uri, mime: 'image/png' }) } catch (e) {}
      } else { try { if (window.showToast) window.showToast('保存失败：' + (r.error || '未知'), 'error') } catch (e) {} }
      return { ok: !!r.ok, path: r.where || '', album: r.ok }
    } catch (e) {
      try { if (window.showToast) window.showToast('保存失败：' + e.message, 'error') } catch (_) {}
      return { ok: false, error: e.message }
    }
  }
  if (hasNative()) {
    try {
      const rel = '_downloads/行测AI导出/' + name
      await withTimeout(nativeWriteBytes(rel, dataUrlToBlob(dataUrl)), 10000)
      const abs = toAbs(rel)
      try { scanFile(abs) } catch (e) {}
      let savedGallery = false
      try {
        if (plus.gallery && plus.gallery.save) {
          await withTimeout(new Promise((res) => plus.gallery.save(abs, () => res(true), () => res(false))), 8000)
          savedGallery = true
        }
      } catch (e) {}
      if (typeof window !== 'undefined' && window.showToast) {
        try { window.showToast(savedGallery ? '✅ 已存入系统相册（打开相册即可查看/发送）' : '⚠️ 相册导入未成功，文件位于应用目录（可用系统分享另存）', savedGallery ? 'success' : 'info') } catch (e) {}
      }
      return { ok: true, path: abs, album: savedGallery }
    } catch (e) {
      try { if (window.showToast) window.showToast('保存失败：' + e.message, 'error') } catch (_) {}
      return { ok: false, error: e.message }
    }
  }
  // 桌面：系统另存为
  try {
    if (window.showSaveFilePicker) {
      const handle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'PNG 图片', accept: { 'image/png': ['.png'] } }] })
      const w = await handle.createWritable()
      await w.write(dataUrlToBlob(dataUrl))
      await w.close()
      try { if (window.showToast) window.showToast('✅ 已保存到：' + name, 'success') } catch (e) {}
      return { ok: true, path: name }
    }
  } catch (e) {
    try { if (window.showToast) window.showToast('已取消保存', 'info') } catch (_) {}
    return { ok: false, canceled: true }
  }
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = name
  a.click()
  return { ok: true, fallback: true }
}
// 文本保存：原生写 Download/行测AI导出；桌面走另存为；兜底 a.click
export async function saveText(filename, text) {
  const name = String(filename || '导出.txt')
  if (isNativeHost()) {
    try {
      const r = JSON.parse(window.xcnative.saveText(name, text) || '{}')
      if (r.ok) {
        try { exportDone({ kind: 'file', title: '📄 文件已导出', name: r.name || name, where: r.where || 'Download/行测AI导出', uri: r.uri, mime: 'text/plain' }) } catch (e) {}
      } else { try { if (window.showToast) window.showToast('保存失败：' + (r.error || '未知'), 'error') } catch (e) {} }
      return { ok: !!r.ok, path: r.where || '' }
    } catch (e) {
      try { if (window.showToast) window.showToast('保存失败：' + e.message, 'error') } catch (_) {}
      return { ok: false, error: e.message }
    }
  }
  if (hasNative()) {
    try {
      const rel = '_downloads/行测AI导出/' + name
      await withTimeout(new Promise((resolve, reject) => {
        plus.io.resolveLocalFileSystemURL('_downloads/', (root) => {
          root.getDirectory('行测AI导出', { create: true }, (dir) => {
            dir.getFile(name, { create: true }, (fe) => {
              fe.createWriter((w) => {
                w.onwrite = () => resolve()
                w.onerror = () => reject(new Error('写入失败'))
                w.write(text)
              }, () => reject(new Error('writer error')))
            }, () => reject(new Error('file error')))
          }, () => reject(new Error('dir error')))
        }, () => reject(new Error('downloads error')))
      }), 10000)
      const abs = toAbs(rel)
      try { scanFile(abs) } catch (e) {}
      try { if (window.showToast) window.showToast('✅ 已生成备份文件（手机若找不到：到「设置→数据」用「📤 分享备份/导出」另存到微信/网盘）', 'success') } catch (e) {}
      return { ok: true, path: abs }
    } catch (e) {
      try { if (window.showToast) window.showToast('保存失败：' + e.message, 'error') } catch (_) {}
      return { ok: false, error: e.message }
    }
  }
  try {
    if (window.showSaveFilePicker) {
      const handle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: '文本', accept: { 'text/plain': ['.txt', '.md'] } }] })
      const w = await handle.createWritable()
      await w.write(text)
      await w.close()
      try { if (window.showToast) window.showToast('✅ 已保存：' + name, 'success') } catch (e) {}
      return { ok: true, path: name }
    }
  } catch (e) {
    try { if (window.showToast) window.showToast('已取消保存', 'info') } catch (_) {}
    return { ok: false, canceled: true }
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  return { ok: true, fallback: true }
}
export default { saveImage, saveText }
