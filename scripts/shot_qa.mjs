// 截图 HTML 各页，用于视觉 QA
import { spawn } from 'child_process'
import os from 'os'
import { join } from 'path'
import { writeFileSync } from 'fs'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9600 + Math.floor(Math.random() * 100)
const PROFILE = join(os.tmpdir(), 'cdp_shot_' + Date.now())
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE, '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore', detached: true })
chrome.unref()
const htmlPath = 'file:///' + 'E:/公务员备考资料/行测/kaogong-review-skill-main/用户复盘导出文件/贵州省考模拟卷/_preview.html'.split('/').map(encodeURIComponent).join('/')
const sleep2 = async () => { for (let i = 0; i < 60; i++) { try { const r = await fetch('http://localhost:' + PORT + '/json/list'); if (r.ok) return } catch (e) {} await sleep(250) } throw new Error('no cdp') }
try {
  await sleep2()
  const list = await (await fetch('http://localhost:' + PORT + '/json/list')).json()
  const tab = list.find((t) => t.type === 'page')
  const ws = new WebSocket(tab.webSocketDebuggerUrl)
  let id = 0; const pend = new Map()
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } }
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pend.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })) })
  await send('Page.enable'); await send('Emulation.setDeviceMetricsOverride', { width: 794, height: 1123, deviceScaleFactor: 1.5, mobile: false })
  await send('Page.navigate', { url: htmlPath })
  await sleep(2800)
  const res = await send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true })
  writeFileSync(join(process.cwd(), '..', '用户复盘导出文件', '贵州省考模拟卷', '_qa.pdf'), Buffer.from(res.result.data, 'base64'))
  // 截第一屏
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(process.cwd(), '..', '用户复盘导出文件', '贵州省考模拟卷', '_qa_page1.png'), Buffer.from(shot.result.data, 'base64'))
  console.log('SHOT OK')
  ws.close()
} finally { try { chrome.kill() } catch (e) {} }
