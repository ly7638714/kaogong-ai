// utils/capture.js —— 题目/解析完整截图导出（html-to-image 渲染高清 PNG）
import { toPng } from 'html-to-image'
import { renderMd } from './renderMd'
import { showToast } from './toast'

function escHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// 把 markdown 内容渲染成白底高清截图并下载（完整题目/完整解析通用）
export async function downloadMdScreenshot({ title, md, sub, name }) {
  // 外层压底容器固定在 0,0（用户不可见）；截图节点本身 position:static，避免 html-to-image 克隆离屏定位导致空白
  const wrap = document.createElement('div')
  wrap.style.cssText = 'position:fixed;left:0;top:0;z-index:-9999;pointer-events:none;'
  document.body.appendChild(wrap)
  const host = document.createElement('div')
  host.style.cssText = 'width:860px;background:#ffffff;color:#1f2937;padding:26px 30px;font-family:"Microsoft YaHei","PingFang SC","Noto Sans SC",sans-serif;font-size:14.5px;line-height:1.85;box-sizing:border-box;'
  host.innerHTML =
    '<div style="border-bottom:3px solid #2f6fb3;padding-bottom:12px;margin-bottom:14px">' +
    '<div style="font-size:22px;font-weight:700;color:#16324f">' + escHtml(title) + '</div>' +
    (sub ? '<div style="color:#667;font-size:12px;margin-top:4px">' + escHtml(sub) + '</div>' : '') +
    '</div>' +
    '<div style="font-size:14.5px;word-break:break-word">' + renderMd(String(md || '')) + '</div>'
  wrap.appendChild(host)
  try {
    const dataUrl = await toPng(host, {
      pixelRatio: 2,
      cacheBust: true,
      backgroundColor: '#ffffff',
      width: host.offsetWidth,
      height: host.scrollHeight
    })
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = (name || title || '截图') + '.png'
    a.click()
    showToast('✅ 已导出截图：' + (name || title || '截图') + '.png', 'success')
  } catch (e) {
    showToast('截图导出失败：' + e.message, 'error')
  } finally {
    wrap.remove()
  }
}
