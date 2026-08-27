const { spawn } = require('child_process');
const os = require('os'); const path = require('path'); const fs = require('fs');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9811;
const PROFILE = path.join(os.tmpdir(), 'cdp_draft2_' + Date.now());
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
  const evv = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : null };
  const ink = async (tag) => { const n = await evv(`(() => { const c = document.querySelector('.draft-canvas'); if (!c) return -1; const g = c.getContext('2d'); const d = g.getImageData(0,0,c.width,c.height).data; let n=0; for(let i=3;i<d.length;i+=4){ if(d[i]>20) n++ } return n })()`); console.log(tag, 'ink px:', n) };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 700, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://localhost:5173/' }); await sleep(4000);
  const fab = await evv(`(() => { const el = document.querySelector('.gfab'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width/2, y: r.y + r.height/2 } })()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: fab.x, y: fab.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: fab.x, y: fab.y, button: 'left', clickCount: 1 });
  await sleep(700);
  const cv = await evv(`(() => { const el = document.querySelector('.draft-canvas'); const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })()`);
  // 画一笔（mouseMoved 带 buttons:1）
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cv.x + 120, y: cv.y + 120, button: 'left', buttons: 1, clickCount: 1 });
  for (let t = 1; t <= 10; t++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cv.x + 120 + t * 14, y: cv.y + 120 + t * 9, button: 'left', buttons: 1 }); await sleep(25) }
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cv.x + 260, y: cv.y + 210, button: 'left', buttons: 1, clickCount: 1 });
  await sleep(500);
  await ink('after draw');
  // 关闭
  await evv(`document.querySelector('.db-close') && document.querySelector('.db-close').click()`);
  await sleep(500);
  const keys = await evv(`Object.keys(localStorage).filter(k => k.startsWith('draft_'))`);
  console.log('keys:', JSON.stringify(keys));
  // 解析保存的 PNG 是否含笔迹（用 Image 加载到 canvas 检查）
  const savedInk = await evv(`(async () => { const raw = localStorage.getItem('draft_global__p_0'); if (!raw) return -1; const r = JSON.parse(raw); const u = r[r.length-1].url; const img = new Image(); await new Promise((res,rej)=>{ img.onload=res; img.onerror=rej; img.src=u }); const c=document.createElement('canvas'); c.width=img.naturalWidth; c.height=img.naturalHeight; c.getContext('2d').drawImage(img,0,0); const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data; let n=0; for(let i=3;i<d.length;i+=4){ if(d[i]>20) n++ } return n })()`);
  console.log('saved record ink px:', savedInk);
  // 重开
  const fab2 = await evv(`(() => { const el = document.querySelector('.gfab'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width/2, y: r.y + r.height/2 } })()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: fab2.x, y: fab2.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: fab2.x, y: fab2.y, button: 'left', clickCount: 1 });
  await sleep(1200);
  await ink('after reopen');
  ws.close(); chrome.kill(); process.exit(0);
})().catch((e) => { console.log('ERR', e.message); process.exit(1) });
