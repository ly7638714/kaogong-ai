const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9810;
const PROFILE = path.join(os.tmpdir(), 'cdp_draft_' + Date.now());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE, '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore', detached: true });
  chrome.unref();
  for (let i = 0; i < 60; i++) { try { const r = await fetch('http://localhost:' + PORT + '/json/list'); if (r.ok) break } catch (e) {} await sleep(250) }
  const list = await (await fetch('http://localhost:' + PORT + '/json/list')).json();
  const tab = list.find((t) => t.type === 'page');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } };
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej });
  const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pend.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })) });
  const evalv = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.result && r.result.result ? r.result.result.value : r.result };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 700, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://localhost:5173/' });
  await sleep(4000);
  // 1) 找全局随手记球并点击
  const fab = await evalv(`(() => { const el = document.querySelector('.gfab'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width/2, y: r.y + r.height/2 } })()`);
  console.log('fab pos:', JSON.stringify(fab));
  if (!fab) { console.log('NO GFAB'); process.exit(1) }
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: fab.x, y: fab.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: fab.x, y: fab.y, button: 'left', clickCount: 1 });
  await sleep(600);
  const ov = await evalv(`!!document.querySelector('.draft-ov')`);
  console.log('draft opened:', ov);
  // 2) 在画布上画几笔
  const cv = await evalv(`(() => { const el = document.querySelector('.draft-canvas'); const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })()`);
  console.log('canvas rect:', JSON.stringify(cv));
  const strokes = [ [[100,100],[220,160]], [[250,120],[140,260]] ];
  for (const [a, b] of strokes) {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cv.x + a[0], y: cv.y + a[1], button: 'left', clickCount: 1 });
    for (let t = 1; t <= 8; t++) {
      const x = cv.x + a[0] + (b[0] - a[0]) * t / 8, y = cv.y + a[1] + (b[1] - a[1]) * t / 8;
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left' });
      await sleep(20);
    }
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cv.x + b[0], y: cv.y + b[1], button: 'left', clickCount: 1 });
    await sleep(200);
  }
  await sleep(400);
  // 3) 检查 localStorage
  const keys = await evalv(`Object.keys(localStorage).filter(k => k.startsWith('draft_'))`);
  console.log('draft keys:', JSON.stringify(keys));
  for (const k of keys) { const v = await evalv(`localStorage.getItem(${JSON.stringify(k)})`); console.log(' ', k, '=', String(v).slice(0, 120)) }
  // 4) 截图（打开状态，画完）
  await sleep(300);
  const shot1 = await send('Page.captureScreenshot', { format: 'png' });
  require('fs').writeFileSync(path.join(process.cwd(), '..', '用户复盘导出文件', 'draft_debug_1.png'), Buffer.from(shot1.result.data, 'base64'));
  // 5) 关闭
  const close = await evalv(`(() => { const b = document.querySelector('.db-close'); if (!b) return false; b.click(); return true })()`);
  console.log('closed:', close);
  await sleep(500);
  // 6) 重开
  const fab2 = await evalv(`(() => { const el = document.querySelector('.gfab'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width/2, y: r.y + r.height/2 } })()`);
  if (fab2) {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: fab2.x, y: fab2.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: fab2.x, y: fab2.y, button: 'left', clickCount: 1 });
    await sleep(900);
    const ov2 = await evalv(`!!document.querySelector('.draft-ov')`);
    console.log('reopened:', ov2);
    // 检查画布是否有非空像素（笔迹）
    const hasInk = await evalv(`(() => { const c = document.querySelector('.draft-canvas'); if (!c) return null; const g = c.getContext('2d'); const d = g.getImageData(0,0,c.width,c.height).data; let n=0; for(let i=3;i<d.length;i+=4){ if(d[i]>20) n++ } return n })()`);
    console.log('reopen canvas ink pixels (alpha>20):', hasInk);
    const shot2 = await send('Page.captureScreenshot', { format: 'png' });
    require('fs').writeFileSync(path.join(process.cwd(), '..', '用户复盘导出文件', 'draft_debug_2.png'), Buffer.from(shot2.result.data, 'base64'));
  }
  ws.close(); chrome.kill(); process.exit(0);
})().catch((e) => { console.log('ERR', e.message); process.exit(1) });
