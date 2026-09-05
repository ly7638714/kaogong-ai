/* global atob */
// downloadOut.js —— 统一“导出/截图”出口（v3.8.214）
// 目标：手机端（HBuilderX/5+App）不再只能靠 a.click 下载（WebView 常无反应/无路径提示）；
//   ① 图片：原生优先存系统相册（+提示路径）并可拉起系统分享；
//   ② 文本/备份：原生写进 Download/行测AI导出/ 并提示完整路径；
//   ③ 桌面浏览器：优先系统“另存为”对话框（showSaveFilePicker），兜底 a.click。
/* global plus */
function hasNative() {
  try { return !!(window.plus && plus.io && plus.os) } catch (e) { return false }
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
  if (hasNative()) {
    try {
      const rel = '_downloads/行测AI导出/' + name
      await nativeWriteBytes(rel, dataUrlToBlob(dataUrl))
      const abs = toAbs(rel)
      let savedGallery = false
      try {
        if (plus.gallery && plus.gallery.save) {
          await new Promise((res) => plus.gallery.save(abs, () => res(true), () => res(false)))
          savedGallery = true
        }
      } catch (e) {}
      if (typeof window !== 'undefined' && window.showToast) {
        try { window.showToast('✅ 已保存' + (savedGallery ? '到系统相册' : '到 Download/行测AI导出') + '：' + abs, 'success') } catch (e) {}
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
  if (hasNative()) {
    try {
      const rel = '_downloads/行测AI导出/' + name
      await new Promise((resolve, reject) => {
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
      })
      const abs = toAbs(rel)
      try { if (window.showToast) window.showToast('✅ 已保存：' + abs, 'success') } catch (e) {}
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
