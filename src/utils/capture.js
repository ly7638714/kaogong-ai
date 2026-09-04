// utils/capture.js —— 题目/解析完整截图导出（html-to-image 渲染高清 PNG）
// v3.8.161：截图跟随当前主题（白天/黑夜/自定义配色）与字体/表格/公式/图表样式，不再强制白底深字重渲染
import { toPng } from 'html-to-image'
import * as echarts from 'echarts/core'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent, TitleComponent } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import { renderMd } from './renderMd'
import { showToast } from './toast'

function escHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
// 当前文档是否深色主题（data-theme=dark / prefers-color-scheme 兜底）
echarts.use([BarChart, LineChart, PieChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent, SVGRenderer])
// 离屏统计图：把 ECharts option 用 SSR 渲染成内联 SVG（导出截图时图表完整呈现，不依赖可见页初始化）
// 导出前把内联 <svg> 图形转成 data:image/svg+xml 图片：html-to-image 对离屏克隆内联 svg 不可靠，转成 img 数据图后 PNG 必含图形
function svgToImg(body) {
  if (!body) return
  body.querySelectorAll('svg').forEach((svg) => { // 题干/选项里的图形 svg + SSR 统计图 svg 统一转 data:image
    const out = svg.outerHTML
    if (!out || out.length < 40) return
    try {
      const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(out)
      const img = document.createElement('img')
      img.src = url
      img.alt = '图形'
      img.style.cssText = 'max-width:100%;height:auto;display:block;margin:4px auto;'
      svg.replaceWith(img)
    } catch (e) {}
  })
}
function fillCharts(root) {
  if (!root) return
  root.querySelectorAll('.gen-chart[data-echarts]').forEach((el) => {
    try {
      const option = JSON.parse(el.dataset.echarts || '{}')
      if (!option || typeof option !== 'object' || !option.series || !option.series.length) return
      const w = Math.max(320, el.offsetWidth || 700)
      const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: w, height: Math.max(240, Math.round(w * 0.52)) })
      chart.setOption(option)
      const svg = chart.renderToSVGString()
      chart.dispose()
      if (svg) { const wrap2 = document.createElement('div'); wrap2.innerHTML = svg; el.replaceWith(wrap2) }
    } catch (e) {}
  })
}
function isDarkTheme() {
  try {
    const dt = (document.documentElement && document.documentElement.getAttribute('data-theme')) || (document.body && document.body.getAttribute('data-theme')) || ''
    if (dt) return dt === 'dark'
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
  } catch (e) { return false }
}


// v3.8.170 所见即所得：直接截取界面已渲染的真实节点（题干+选项，含图形/公式/表格与主题样式，媒体/字体已就绪）

// v3.8.182 PDF 截图式渲染：把 md 按“题目/解析截图”同样式渲染成白色高清 PNG dataURL（含图形/表格/公式）
export async function snapshotMd(md, { title = '', sub = '' } = {}) {
  const wrap = document.createElement('div')
  wrap.style.cssText = 'position:fixed;left:0;top:0;z-index:-9999;pointer-events:none;'
  document.body.appendChild(wrap)
  try {
    const host = document.createElement('div')
    host.style.cssText = 'width:800px;background:#ffffff;color:#1f2937;padding:22px 26px;font-family:"Microsoft YaHei","PingFang SC","Noto Sans SC",sans-serif;font-size:14px;line-height:1.8;box-sizing:border-box;'
    host.innerHTML = (title ? '<div style="font-size:19px;font-weight:700;color:#16324f;border-bottom:2px solid #2f6fb3;padding-bottom:8px;margin-bottom:10px">' + escHtml(title) + '</div>' : '') +
      (sub ? '<div style="color:#667;font-size:12px;margin-bottom:6px">' + escHtml(sub) + '</div>' : '')
    const body = document.createElement('div')
    body.className = 'paper-stem cap-md'
    body.style.cssText = 'font-size:14px;word-break:break-word;color:#1f2937;'
    body.innerHTML = renderMd(String(md || ''))
    host.appendChild(body)
    wrap.appendChild(host)
    fillCharts(body)
    svgToImg(body)
    await new Promise((res) => {
      const imgs = Array.from(body.querySelectorAll('img'))
      if (!imgs.length) return res()
      let left = imgs.length
      const done = () => { if (--left <= 0) res() }
      imgs.forEach((im) => { try { if (im.complete && im.naturalWidth) done(); else { im.onload = done; im.onerror = done } } catch (e) { done() } })
    }).catch(() => {})
    try { await document.fonts.ready } catch (e) {}
    body.querySelectorAll('.table-scroll, .gen-svg').forEach((el) => { try { el.style.overflow = 'visible'; el.style.maxWidth = 'none' } catch (e) {} })
    try {
      const needW = Math.max(host.offsetWidth || 800, body.scrollWidth || 0)
      if (needW > (host.offsetWidth || 0)) host.style.width = needW + 'px'
    } catch (e) {}
    return await toPng(host, { pixelRatio: 2, cacheBust: true, backgroundColor: '#ffffff', width: host.offsetWidth, height: host.scrollHeight })
  } finally {
    wrap.remove()
  }
}

export async function downloadLiveScreenshot(el, { title, sub, name }) {
  if (!el || !el.cloneNode) return false
  const wrap = document.createElement('div')
  wrap.style.cssText = 'position:fixed;left:0;top:0;z-index:-9999;pointer-events:none;'
  document.body.appendChild(wrap)
  try {
    const dark = isDarkTheme()
    const surface = dark ? 'var(--surface, #10141f)' : 'var(--surface, #ffffff)'
    const text = dark ? 'var(--text, #e8ecf4)' : 'var(--text, #1f2937)'
    const text3 = dark ? 'var(--text3, #8fa3b8)' : 'var(--text3, #667)'
    const accent = 'var(--accent, #2f6fb3)'
    const host = document.createElement('div')
    host.style.cssText = 'width:' + (el.offsetWidth || 860) + 'px;background:' + surface + ';color:' + text + ';padding:26px 30px;font-family:"Microsoft YaHei","PingFang SC","Noto Sans SC",sans-serif;font-size:14.5px;line-height:1.85;box-sizing:border-box;'
    host.innerHTML =
      '<div style="border-bottom:3px solid ' + accent + ';padding-bottom:12px;margin-bottom:14px">' +
      '<div style="font-size:22px;font-weight:700;color:' + text + '">' + escHtml(title) + '</div>' +
      (sub ? '<div style="color:' + text3 + ';font-size:12px;margin-top:4px">' + escHtml(sub) + '</div>' : '') +
      '</div>'
    const copy = el.cloneNode(true)
    copy.style.cssText = 'font-size:14.5px;line-height:1.85;word-break:break-word;color:' + text + ';'
    host.appendChild(copy)
    wrap.appendChild(host)
    try { await document.fonts.ready } catch (e) {}
    await new Promise((res) => {
      const imgs = Array.from(copy.querySelectorAll('img'))
      if (!imgs.length) return res()
      let left = imgs.length
      const done = () => { if (--left <= 0) res() }
      imgs.forEach((im) => { try { if (im.complete && im.naturalWidth) done(); else { im.onload = done; im.onerror = done } } catch (e) { done() } })
    }).catch(() => {})
    copy.querySelectorAll('.table-scroll, .gen-svg').forEach((x) => { try { x.style.overflow = 'visible'; x.style.maxWidth = 'none' } catch (e) {} })
    try {
      const needW = Math.max(host.offsetWidth || 860, copy.scrollWidth || 0)
      if (needW > (host.offsetWidth || 0)) host.style.width = needW + 'px'
    } catch (e) {}
    let bg = 'transparent'
    try { bg = (host.ownerDocument && host.ownerDocument.defaultView && host.ownerDocument.defaultView.getComputedStyle(host).backgroundColor) || bg } catch (e) {}
    if (!bg || bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)') bg = dark ? '#10141f' : '#ffffff'
    const dataUrl = await toPng(host, { pixelRatio: 2, cacheBust: true, backgroundColor: bg, width: host.offsetWidth, height: host.scrollHeight })
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = (name || title || '截图') + '.png'
    a.click()
    showToast('✅ 已导出截图：' + (name || title || '截图') + '.png', 'success')
    return true
  } catch (e) {
    showToast('界面截图失败，改用内容导出：' + e.message, 'info')
    return false
  } finally {
    wrap.remove()
  }
}
// 把 markdown 内容按【当前主题】渲染成高清截图并下载（完整题目/完整解析通用）
// 主题=跟随应用：表格边框/表头、svg 图、公式、文字颜色均与界面一致；theme='light' 可强制白底（默认 auto）
export async function downloadMdScreenshot({ title, md, sub, name, theme }) {
  const dark = theme ? theme === 'dark' : isDarkTheme()
  const wrap = document.createElement('div')
  wrap.style.cssText = 'position:fixed;left:0;top:0;z-index:-9999;pointer-events:none;'
  document.body.appendChild(wrap)
  const host = document.createElement('div')
  // 背景/文字用应用 CSS 变量（深色主题下截图同样深底浅字，和所见一致）
  const surface = dark ? 'var(--surface, #10141f)' : 'var(--surface, #ffffff)'
  const text = dark ? 'var(--text, #e8ecf4)' : 'var(--text, #1f2937)'
  const text3 = dark ? 'var(--text3, #8fa3b8)' : 'var(--text3, #667)'
  const accent = 'var(--accent, #2f6fb3)'
  host.style.cssText = 'width:860px;background:' + surface + ';color:' + text + ';padding:26px 30px;font-family:"Microsoft YaHei","PingFang SC","Noto Sans SC",sans-serif;font-size:14.5px;line-height:1.85;box-sizing:border-box;'
  host.innerHTML =
    '<div style="border-bottom:3px solid ' + accent + ';padding-bottom:12px;margin-bottom:14px">' +
    '<div style="font-size:22px;font-weight:700;color:' + text + '">' + escHtml(title) + '</div>' +
    (sub ? '<div style="color:' + text3 + ';font-size:12px;margin-top:4px">' + escHtml(sub) + '</div>' : '') +
    '</div>'
  const body = document.createElement('div')
  body.className = 'paper-stem cap-md' // 复用题干容器样式：表格边框/表头、svg 自适应等与界面一致
  body.style.cssText = 'font-size:14.5px;word-break:break-word;color:' + text + ';'
  body.innerHTML = renderMd(String(md || ''))
  host.appendChild(body)
  fillCharts(body) // 统计图 SSR → 内联 SVG，导出时可见
  svgToImg(body) // 图形 svg → data:image 内嵌，确保导出必含图
  // v3.8.169 等媒体/字体就绪再测量：data:image、svg、图片 decode 完成 + 字体加载后，scrollHeight/scrollWidth 才准确，避免“只截到图卡为止”
  await new Promise((resolve) => {
    const imgs = Array.from(body.querySelectorAll('img'))
    if (!imgs.length) return resolve()
    let left = imgs.length
    const done = () => { if (--left <= 0) resolve() }
    imgs.forEach((im) => {
      try { if (im.complete && im.naturalWidth) done(); else { im.onload = done; im.onerror = done } } catch (e) { done() }
    })
  }).catch(() => {})
  try { await document.fonts.ready } catch (e) {}
  // v3.8.168 完整不裁切：横向内容（宽表格/大图）允许撑宽，禁止滚动条裁切；纵向按全部内容高度
  body.querySelectorAll('.table-scroll, .gen-svg').forEach((el) => { try { el.style.overflow = 'visible'; el.style.maxWidth = 'none' } catch (e) {} })
  try {
    const needW = Math.max(host.offsetWidth || 860, body.scrollWidth || 0)
    if (needW > (host.offsetWidth || 0)) host.style.width = needW + 'px'
  } catch (e) {}
  wrap.appendChild(host)
  let bg = 'transparent'
  try { bg = (host.ownerDocument && host.ownerDocument.defaultView && host.ownerDocument.defaultView.getComputedStyle(host).backgroundColor) || bg } catch (e) {}
  if (!bg || bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)') bg = dark ? '#10141f' : '#ffffff'
  try {
    const dataUrl = await toPng(host, {
      pixelRatio: 2,
      cacheBust: true,
      backgroundColor: bg,
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
