/* global plus */
// nativeSave.js —— HBuilderX(5+App) 原生目录写入：把全量备份自动存到手机 Download（绕开网页“选文件夹”限制）
import { collectText } from './dataBackup'

export function detectNative() {
  try { return !!(window.plus && plus.io && plus.os) } catch (e) { return false }
}
export function nativeRootName() {
  try { return plus.io.convertLocalFileSystemURL('_downloads') } catch (e) { return '' }
}
export function nativeWriteFile(name, text) {
  return new Promise((resolve, reject) => {
    if (!detectNative()) return reject(new Error('非原生环境'))
    plus.io.resolveLocalFileSystemURL('_downloads/', (root) => {
      root.getFile(name, { create: true }, (fe) => {
        fe.createWriter((writer) => {
          writer.onwrite = () => resolve()
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
