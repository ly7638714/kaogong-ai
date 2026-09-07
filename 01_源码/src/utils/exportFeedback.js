// exportFeedback.js —— 导出/保存后的“应用内交互反馈弹层”（方案乙原生宿主）
// 统一体验：告诉用户文件/图片保存在哪，并可一键调起系统其它 APP 打开或分享。
import { isNativeHost } from './platform'

let _el = null
function close() { if (_el) { try { _el.remove() } catch (e) {}; _el = null } }

function action(label, fn, cls) {
  const b = document.createElement('button')
  b.type = 'button'
  b.textContent = label
  b.className = 'xcef-btn' + (cls ? ' ' + cls : '')
  b.style.cssText = 'flex:1;padding:10px 6px;border:none;border-radius:12px;font-size:14px;cursor:pointer;' + (cls === 'pri' ? 'background:linear-gradient(135deg,#22d3ee,#2f6fb3);color:#04121f;font-weight:600;' : 'background:rgba(255,255,255,0.10);color:#dbeafe;')
  b.onclick = (ev) => { ev.stopPropagation(); try { fn && fn() } catch (e) {}; close() }
  return b
}

/**
 * opt: { kind:'image'|'file', title, name, where, uri, mime }
 * 弹层动作（原生宿主）：打开 / 分享 → 调起系统其它 APP；非宿主只展示信息与关闭。
*/
export function exportDone(opt) {
  close()
  const o = opt || {}
  const el = document.createElement('div')
  el.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(2,8,18,0.55);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);padding:24px;font-family:inherit'
  const box = document.createElement('div')
  box.style.cssText = 'width:min(92vw,380px);max-height:82vh;overflow:auto;background:#0d1a2a;border:1px solid rgba(34,211,238,0.25);border-radius:20px;padding:20px 18px 14px;color:#eaf7ff;box-shadow:0 18px 60px rgba(0,0,0,0.5)'
  const kindTxt = o.kind === 'image' ? '🖼 截图/图片已保存' : '📄 文件已导出'
  const title = document.createElement('div')
  title.textContent = o.title || kindTxt
  title.style.cssText = 'font-size:16px;font-weight:700;margin-bottom:8px'
  const nameEl = document.createElement('div')
  nameEl.textContent = o.name ? '文件：' + o.name : ''
  nameEl.style.cssText = 'font-size:13px;color:#9fd7ec;word-break:break-all;margin-bottom:6px'
  const note = document.createElement('div')
  note.textContent = o.note || (o.kind === 'image' ? '已存入系统相册专辑「行测AI导出」，请打开相册查看。' : '已保存到 ' + (o.where || 'Download/行测AI导出') + '，可用文件管理/下载查看。')
  note.style.cssText = 'font-size:13px;line-height:1.7;color:#c3d6e8;margin-bottom:14px;background:rgba(34,211,238,0.08);border-radius:10px;padding:10px 12px'
  box.appendChild(title)
  if (o.name) box.appendChild(nameEl)
  box.appendChild(note)
  const row = document.createElement('div')
  row.style.cssText = 'display:flex;gap:8px;margin-top:4px'
  const host = isNativeHost() && window.xcnative
  if (host && o.uri) {
    row.appendChild(action('📂 用其它APP打开', () => { try { window.xcnative.openUri(o.uri, o.mime || 'application/octet-stream') } catch (e) {} }, 'pri'))
  }
  if (host && o.uri) {
    row.appendChild(action('📤 分享到', () => { try { window.xcnative.shareUri(o.uri, o.mime || 'application/octet-stream', o.name || '') } catch (e) {} }))
  }
  row.appendChild(action('好的', close))
  box.appendChild(row)
  el.appendChild(box)
  el.onclick = (ev) => { if (ev.target === el) close() }
  document.body.appendChild(el)
  _el = el
  return el
}

export default exportDone
