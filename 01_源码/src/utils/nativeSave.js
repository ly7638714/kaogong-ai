/* global plus */
// nativeSave.js —— HBuilderX(5+App) 原生目录写入：把全量备份自动存到手机 Download（绕开网页“选文件夹”限制）
// MobileApp-DeepDev 深度适配：宿主探测/根目录统一收口到 utils/platform.js（5+/自建宿主可切换）
import { isPlusHost, downloadsAbsRoot, scanFile, isNativeHost } from './platform'
import { collectText } from './dataBackup'

export function detectNative() { return isPlusHost() || isNativeHost() }
export function nativeRootName() {
  if (isNativeHost()) return 'Download/行测AI导出' // 自建宿主：MediaStore 公共下载目录（文件管理可见）
  return downloadsAbsRoot()
}
export function nativeWriteFile(name, text) {
  return new Promise((resolve, reject) => {
    if (isNativeHost()) {
      try {
        const r = JSON.parse(window.xcnative.saveText(String(name || '备份.json'), String(text)) || '{}')
        if (r.ok) return resolve(r.where || '')
        return reject(new Error('写入失败：' + (r.error || '未知')))
      } catch (e) { return reject(new Error('写入失败：' + (e.message || e))) }
    }
    if (!detectNative()) return reject(new Error('非原生环境'))
    plus.io.resolveLocalFileSystemURL('_downloads/', (root) => {
      root.getFile(name, { create: true }, (fe) => {
        fe.createWriter((writer) => {
          writer.onwrite = () => { try { scanFile(downloadsAbsRoot() + '/' + name) } catch (e) {}; resolve() }
          writer.onerror = (e) => reject(new Error('写入失败：' + ((e && e.message) || e)))
          writer.write(text)
        }, (e) => reject(new Error('创建写入器失败：' + ((e && e.message) || e))))
      }, (e) => reject(new Error('创建文件失败：' + ((e && e.message) || e))))
    }, (e) => reject(new Error('无法访问 Download：' + ((e && e.message) || e))))
  })
}
export function nativeBackupPath() {
  const base = nativeRootName()
  return base ? base + '/行测AI备份.json' : ''
}
let _nt = null
export function startNativeAutoBackup(ms) {
  if (!detectNative() || _nt) return
  const doWrite = () => {
    nativeWriteFile('行测AI备份.json', collectText()).catch(() => {})
  }
  doWrite()
  _nt = setInterval(doWrite, Math.max(20000, ms || 45000))
  return true
}
export function stopNativeAutoBackup() {
  if (_nt) { clearInterval(_nt); _nt = null }
}
