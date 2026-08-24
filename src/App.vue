<script setup>
import { ref, computed } from 'vue'
import { store, saveCfg, saveWqs, saveMsgs, saveMyMem } from './store'
import { speak, SCENES } from './utils/tts'
import { activeCfg, supportsVision, chatOnce, PLATE_MODE } from './api'
import ChatPage from './components/ChatPage.vue'
import KbPage from './components/KbPage.vue'
import StatsPage from './components/StatsPage.vue'
import WrongPage from './components/WrongPage.vue'
import CockpitPage from './components/CockpitPage.vue'
import FloatPanel from './components/FloatPanel.vue'
import { doExport, exportWrongTxt, exportDataMd, exportWrongMd } from './utils/export'
const tabs=[{k:'ck',t:'🚀 看板'},{k:'chat',t:'💬 对话'},{k:'kb',t:'📚 知识库'},{k:'stat',t:'📊 统计'},{k:'wq',t:'📋 错题'}]
const initialTab = store.tab && tabs.some(t=>t.k===store.tab) ? store.tab : 'ck'
store.tab = initialTab
const theme=ref(localStorage.getItem('xc_theme')==='light'?'light':'dark')
document.body.setAttribute('data-theme',theme.value)
function doTheme(){theme.value=theme.value==='light'?'dark':'light';document.body.setAttribute('data-theme',theme.value);localStorage.setItem('xc_theme',theme.value)}
// 多强调色主题
const ACCS=['sea','emerald','amber','rose','violet']
const accent=ref(localStorage.getItem('xc_accent')||'sea')
document.body.setAttribute('data-accent',accent.value)
function setAccent(a){ accent.value=a; document.body.setAttribute('data-accent',a); localStorage.setItem('xc_accent',a) }
// ===== 顶栏全局搜索 =====
const sq=ref('')
const searchDrop=ref(false)
const searchResults=computed(()=>{
  const k=String(sq.value||'').trim().toLowerCase(); if(!k)return {wq:[],msg:[],plate:[]}
  const wq=store.wqs.filter(q=>{ const t=(q.question||'')+' '+(q.answer||'')+' '+(q.subject||''); return t.toLowerCase().includes(k) }).slice(0,8)
  const msg=store.msgs.filter(m=>{ const t=String((m.content&&m.content.text)||m.content||''); return t.toLowerCase().includes(k) }).slice(0,5)
  const plate=Object.keys(PLATE_MODE).filter(p=>p.includes(k)||k.includes(p))
  return {wq,msg,plate}
})
function goWq(i){ const q=store.wqs[i]; if(q){ store.tab='wq'; } sq.value=''; searchDrop.value=false }
function goPlate(p){ const m=PLATE_MODE[p]; store.mode=m; localStorage.setItem('xc_mode',m); store.tab='chat'; sq.value=''; searchDrop.value=false }
function focusDrop(){ searchDrop.value=true }
const expType=ref('chat')
const expShow=ref(false)
const expBusy=ref(false)
const setShow=ref(false)
const stStat=ref('检测中...')
const stDot=ref('')
async function testConn(){const t=await testOne(store.cfg.text);const v=await testOne(store.cfg.vision);const ts=t.ok===true?'文字✅':(t.ok===false?'文字❌':'文字未配置');const vs=v.ok===true?'视觉✅':(v.ok===false?'视觉❌':'视觉未配置');stStat.value=ts+' '+vs;stDot.value=(t.ok===false||v.ok===false)?'':' ok';return ts+' '+vs}
async function testOne(c){if(!c||!c.key)return {ok:null};try{const r=await fetch(c.url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+c.key},body:JSON.stringify({model:c.model,messages:[{role:'user',content:'你好'}],max_tokens:8,stream:false})});if(r.ok)return {ok:true};const e=await r.json().catch(()=>({}));return {ok:false,msg:e.error?.message||r.status}}catch(e){return {ok:false,msg:e.message}}}
function openExp(t){expType.value=t;expShow.value=true}
async function runExport(fmt,polish){expShow.value=false;expBusy.value=true;try{if(fmt==='md'){ exportDataMd(expType.value) } else { await doExport(expType.value,fmt,polish) }}finally{expBusy.value=false}}
function openSet(){setShow.value=true;setTimeout(testConn,100)}
function saveSet(){saveCfg();setShow.value=false;testConn()}

// ===== 外观 & 数据管理（设置页增强）=====
const fs=ref(store.cfg.fontSize||14.5)
function applyFs(){ document.documentElement.style.setProperty('--chat-fs', fs.value+'px'); document.body.style.fontSize=fs.value+'px'; }
applyFs()
function setFs(){ store.cfg.fontSize=fs.value; saveCfg(); applyFs() }
function backupData(){
 const data={ cfg:store.cfg, msgs:store.msgs, wqs:store.wqs, mode:store.mode }
 const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'})
 const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='行测AI-数据备份.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),4000)
}
function importData(ev){
 const f=ev.target.files&&ev.target.files[0]; if(!f)return
 const rd=new FileReader(); rd.onload=()=>{ try{ const d=JSON.parse(rd.result); if(d.cfg)store.cfg=Object.assign(store.cfg,d.cfg); if(Array.isArray(d.msgs))store.msgs=d.msgs.slice(-200); if(Array.isArray(d.wqs))store.wqs=d.wqs; if(d.mode)store.mode=d.mode; saveCfg(); saveMsgs(); saveWqs(); alert('✅ 已导入备份'); testConn() }catch(e){ alert('❌ 备份文件无效') } }; rd.readAsText(f); ev.target.value=''
}
function clearWrong(){ if(!store.wqs.length){alert('没有错题');return} if(!confirm('确定清空全部错题？'))return; store.wqs=[]; saveWqs(); alert('已清空错题') }
function clearChat(){ if(!store.msgs.length){alert('没有对话');return} if(!confirm('确定清空全部对话记录？'))return; store.msgs=[]; saveMsgs(); alert('已清空对话') }
function ttsTest(){ speak('你好，我是你的行测智能助教。接下来这道题，我来帮你讲透。', {scene:store.cfg.ttsScene, rate:store.cfg.ttsRate, pitch:store.cfg.ttsPitch}) }
// 我的常识/时政记忆库
const memType=ref('常识'), memText=ref('')
function addMem(){ const t=memText.value.trim(); if(!t){ alert('请输入内容'); return } store.myMem.push({type:memType.value, text:t, t:new Date().toLocaleString()}); saveMyMem(); memText.value='' }
function delMem(i){ store.myMem.splice(i,1); saveMyMem() }
function resetAll(){ if(!confirm('确认清空所有本地数据（设置/错题/对话）？此操作不可恢复'))return; localStorage.clear(); location.reload() }
// 提供商预设：切换提供商自动填 url/model（含 DeepSeek 视觉模型，OpenAI 兼容格式）
function fillProv(kind){
  const ps={
    ds:{url:'https://api.deepseek.com/chat/completions', model:'deepseek-v4-flash'},
    zhipu:{url:'https://open.bigmodel.cn/api/paas/v4/chat/completions', model:'glm-5v-turbo'},
    openai:{url:'https://api.openai.com/v1/chat/completions', model:'gpt-4o'},
    qwen:{url:'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model:'qwen-vl-max'},
    custom:{url:'', model:''}
  }
  const p=store.cfg[kind].prov, pre=ps[p]||ps.custom
  if(kind==='vision' && p==='ds'){ store.cfg[kind].url='https://api.deepseek.com/chat/completions'; store.cfg[kind].model='deepseek-v4-flash-vision-exp'; return }
  store.cfg[kind].url=pre.url; store.cfg[kind].model=pre.model
}
// DeepSeek 视觉预设（识图、图推题）——深seek 官方多模态 deepseek-v4-flash-vision-exp
function useDsVision(){ store.cfg.vision.prov='ds'; store.cfg.vision.url='https://api.deepseek.com/chat/completions'; store.cfg.vision.model='deepseek-v4-flash-vision-exp' }
</script>
<template>
<div class="app">
<header class="topbar">
<div class="brand"><span class="brand-logo">🧠</span><div class="brand-txt"><div class="brand-name">行测<b>智能助教</b></div><div class="brand-sub">六大板块 · 名师方法论</div></div></div>
<div class="srch">
  <input v-model="sq" @focus="focusDrop()" @blur="setTimeout(()=>searchDrop=false,120)" placeholder="🔍 搜错题 / 对话 / 板块…" class="srch-in">
  <div v-if="searchDrop && sq.trim()" class="srch-drop">
    <template v-if="searchResults.plate.length"><div class="sd-sec">板块</div><div class="sd-it" v-for="p in searchResults.plate" :key="p" @mousedown.prevent="goPlate(p)">🏛️ {{ p }}</div></template>
    <template v-if="searchResults.wq.length"><div class="sd-sec">错题</div><div class="sd-it" v-for="q in searchResults.wq" :key="q.id" @mousedown.prevent="goWq(store.wqs.indexOf(q))">📋 {{ (q.subject||'') }} · {{ String(q.question).slice(0,36) }}</div></template>
    <template v-if="searchResults.msg.length"><div class="sd-sec">对话</div><div class="sd-it" v-for="(m,i) in searchResults.msg" :key="i" @mousedown.prevent="store.tab='chat';sq='';searchDrop=false">💬 {{ String((m.content&&m.content.text)||m.content||'').slice(0,36) }}</div></template>
    <div v-if="!searchResults.plate.length && !searchResults.wq.length && !searchResults.msg.length" class="sd-empty">无匹配结果</div>
  </div>
</div>
<div style="display:flex;align-items:center;gap:6px">
<div class="status-pill"><div class="dot" :class="stDot"></div><span>{{ stStat }}</span></div>
<button class="btn" style="padding:4px 12px;font-size:13px" @click="openExp('chat')">📤 导出</button>
<button class="btn" style="padding:4px 12px;font-size:13px" @click="openSet()">⚙️ 设置</button>
<button class="btn" style="padding:4px 12px;font-size:13px" @click="doTheme()">{{ theme==='light'?'🌙':'☀️' }}</button>
</div></header>
<nav class="tabs"><button v-for="t in tabs" :key="t.k" class="tab" :class="{on:store.tab===t.k}" @click="store.tab=t.k">{{ t.t }}</button></nav>
<ChatPage v-show="store.tab==='chat'" @export-review="openExp('review')" />
<KbPage v-show="store.tab==='kb'" />
<StatsPage v-show="store.tab==='stat'" />
<WrongPage v-show="store.tab==='wq'" @export="openExp('wrong')" @txt="exportWrongTxt()" @exportMd="exportWrongMd()" />
<CockpitPage v-show="store.tab==='ck'" />
<!-- 设置弹窗 -->
<div class="ov" :class="{show:setShow}" @click.self="setShow=false"><div class="pnl"><h3>⚙️ API 设置（文字/视觉 双模型）</h3>
<div class="sec-t">💬 文字模型（纯文字题 · 推荐 DeepSeek）</div>
<div class="fld"><label>提供商</label><select v-model="store.cfg.text.prov" @change="fillProv('text')"><option value="ds">DeepSeek (纯文本·便宜)</option><option value="zhipu">智谱 GLM-4.6V (视觉)</option><option value="openai">OpenAI GPT-4o (视觉)</option><option value="qwen">通义 Qwen-VL (视觉)</option><option value="custom">自定义 API</option></select></div>
<div class="fld"><label>API Key</label><input v-model="store.cfg.text.key" placeholder="sk-..." type="text"></div>
<div class="fld"><label>API 地址</label><input v-model="store.cfg.text.url"></div>
<div class="fld"><label>模型名称</label><input v-model="store.cfg.text.model"></div>
<div class="sec-t">👁️ 视觉模型（图片/截图题 · 默认 DeepSeek 视觉，可选智谱 GLM-5V）</div>
<div class="vis-tip">📌 <b>截图/图片题必须配此模型才能看图</b>（图推图形、资料表格、数学公式）。启用步骤：①提供商选「DeepSeek（推荐，用同一个 Key）」或「智谱」②粘贴你的 Key ③点下方「保存并测试」。若未配置，发图时会提示改用文字描述。</div>
<div class="fld"><label>提供商</label><select v-model="store.cfg.vision.prov" @change="fillProv('vision')"><option value="ds">DeepSeek (视觉·deepseek-v4-flash-vision-exp·推荐)</option><option value="zhipu">智谱 GLM-5V (视觉·glm-5v-turbo)</option><option value="openai">OpenAI GPT-4o (视觉)</option><option value="qwen">通义 Qwen-VL (视觉)</option><option value="custom">自定义 API</option></select></div>
<div class="fld"><label>API Key</label><input v-model="store.cfg.vision.key" type="text" placeholder="粘贴视觉模型的 Key（DeepSeek 用 DeepSeek Key）"></div>
<div class="fld"><label>API 地址</label><input v-model="store.cfg.vision.url"></div>
<div class="fld"><label>模型名称</label><input v-model="store.cfg.vision.model"></div>
<div class="fld"><label>自定义 System Prompt（留空用内置知识库）</label><textarea v-model="store.cfg.sys" rows="3"></textarea></div>
<div class="fld"><label><input type="checkbox" v-model="store.cfg.kb"> 启用内置知识库增强</label></div>
<div class="fld"><label><input type="checkbox" v-model="store.cfg.strm"> 流式输出</label></div>
<div class="fld"><label><input type="checkbox" v-model="store.cfg.ttsOn"> 🔊 自动朗读 AI 回复</label></div>
<div class="sec-t">🗣️ 语音 · 场景音色</div>
<div class="fld"><label>朗读音色</label>
<select v-model="store.cfg.ttsScene" @change="saveCfg()"><option v-for="s in SCENES" :key="s.id" :value="s.id">{{ s.name }}</option></select>
<div style="font-size:11px;color:var(--text3);margin-top:4px">自动匹配最贴近的系统语音；如需更明显的角色感，可配合下方语速/音调。</div></div>
<div class="fld"><label>语速：{{ (store.cfg.ttsRate*100).toFixed(0) }}%</label><input type="range" min="0.5" max="1.5" step="0.05" v-model.number="store.cfg.ttsRate" @change="saveCfg()" style="width:100%"></div>
<div class="fld"><label>角色代入感（音调）：{{ store.cfg.ttsPitch==null?'默认':store.cfg.ttsPitch.toFixed(2) }}</label>
<input type="range" min="0.5" max="1.6" step="0.05" v-model.number="store.cfg.ttsPitch" @change="saveCfg()" style="width:100%">
<button class="btn btn-gh" style="margin-top:6px;font-size:12px" @click="store.cfg.ttsPitch=null;saveCfg()">重置音调</button></div>
<div class="exp-choices" style="grid-template-columns:1fr 1fr"><button class="btn btn-gh" @click="ttsTest()">▶️ 试听音色</button><button class="btn btn-gh" @click="speak('感谢收听，我们继续练习吧。',{scene:store.cfg.ttsScene,rate:store.cfg.ttsRate,pitch:store.cfg.ttsPitch})">⏹ 换句试听</button></div>
<div class="sec-t">🎨 外观</div>
<div class="fld"><label>强调色</label><div class="sw-row"><span class="sw sw-sea" :class="{on:accent==='sea'}" @click="setAccent('sea')" title="静海蓝"></span><span class="sw sw-emerald" :class="{on:accent==='emerald'}" @click="setAccent('emerald')" title="翡翠绿"></span><span class="sw sw-amber" :class="{on:accent==='amber'}" @click="setAccent('amber')" title="琥珀金"></span><span class="sw sw-rose" :class="{on:accent==='rose'}" @click="setAccent('rose')" title="玫瑰红"></span><span class="sw sw-violet" :class="{on:accent==='violet'}" @click="setAccent('violet')" title="紫罗兰"></span></div></div>
<div class="fld"><label>聊天字号</label><div class="fs-ctl"><button class="btn btn-gh" @click="fs=Math.max(12,fs-1);setFs()">A−</button><span class="fs-val">{{ fs }}px</span><button class="btn btn-gh" @click="fs=Math.min(20,fs+1);setFs()">A+</button><button class="btn btn-gh" @click="fs=14.5;setFs()">重置</button></div></div>
<div class="fld"><label>主题（顶栏 ☀️/🌙 也可切换）</label><button class="btn btn-gh" @click="doTheme()">{{ theme==='light'?'🌙 切到深色':'☀️ 切到浅色' }}</button></div>
<div class="sec-t">📅 备考冲刺</div>
<div class="fld"><label>笔试目标日期（驾驶舱显示倒计时）</label><input type="date" v-model="store.cfg.examDate" @change="saveCfg()"><div style="font-size:11px;color:var(--text3);margin-top:4px">按 e.g. 2026-11-29 设置国考笔试日，🚀看板会实时倒计时。</div></div>
<div class="sec-t">💾 数据管理</div>
<div class="exp-choices"><button class="btn btn-gh" @click="backupData()">⬇️ 导出备份(JSON)</button><label class="btn btn-gh" style="text-align:center;margin:0;cursor:pointer">⬆️ 导入备份<input type="file" accept=".json" style="display:none" @change="importData"></label></div>
<div class="exp-choices"><button class="btn btn-gh" @click="clearWrong()">🧹 清空错题</button><button class="btn btn-gh" @click="clearChat()">🧹 清空对话</button><button class="btn btn-gh" style="color:var(--red)" @click="resetAll()">⚠️ 重置全部</button></div>
<div class="sec-t">🧠 我的常识 / 时政记忆库</div>
<div class="fld"><label>新增条目</label><div class="mem-row"><select v-model="memType" style="flex:0 0 84px"><option>常识</option><option>时政</option></select><input v-model="memText" placeholder="如：2026中央经济工作会议首次提出…" @keydown.enter="addMem()" style="flex:1"></div><button class="btn btn-pri" style="margin-top:6px;font-size:12px;padding:6px 14px" @click="addMem()">➕ 添加</button></div>
<div class="fld" v-if="store.myMem.length"><label>我的条目（点击悬浮窗也会随机出现）</label>
  <div class="mem-it" v-for="(x,i) in store.myMem" :key="i"><span class="mem-tag">{{ x.type }}</span><span class="mem-txt">{{ x.text }}</span><button class="mem-del" @click="delMem(i)">✕</button></div>
</div>
<div class="sec-t">📰 时政时间范围</div>
<div class="fld"><label>起始月份（默认 2025-10 起）</label><input type="month" v-model="store.cfg.szFrom" @change="saveCfg()"></div>
<div class="fld"><label>截止月份（留空 = 动态到今天）</label><input type="month" v-model="store.cfg.szTo" @change="saveCfg()"><div style="font-size:11px;color:var(--text3);margin-top:4px">悬浮窗时政只推送该时间范围内的国内/贵州事件。</div></div>
<div class="sec-t">ℹ️ 模型说明</div>
<div style="font-size:12px;color:var(--text3);line-height:1.7">文字题（纯文字）走「文字模型」，默认 DeepSeek deepseek-v4-flash（便宜、中文好）；带图/公式题走「视觉模型」，默认 DeepSeek deepseek-v4-flash-vision-exp（能看图、识别公式符号），也可在设置里换智谱 GLM-5V。截图提问需配置并勾选视觉模型。</div>
<div class="pnl-btns"><button class="btn btn-gh" @click="setShow=false">取消</button><button class="btn btn-pri" @click="saveSet()">保存并测试</button></div>
</div></div>
<!-- 导出弹窗 -->
<div class="ov" :class="{show:expShow}" @click.self="expShow=false"><div class="pnl"><h3>📤 导出</h3>
<div class="fld"><label>内容：{{ {chat:'💬 对话记录',wrong:'📋 错题集',review:'📖 单题复盘'}[expType] }}</label></div>
<div class="sec-t">✨ 让 AI 整理后导出（推荐：梳理考点/错因/秒杀规律）</div>
<div class="exp-choices"><button class="btn btn-pri" @click="runExport('docx',true)">AI整理 → Word</button><button class="btn btn-gh" @click="runExport('pdf',true)">AI整理 → PDF</button></div>
<div class="sec-t">📄 直接导出（原样）</div>
<div class="exp-choices"><button class="btn btn-gh" @click="runExport('docx',false)">直接 → Word</button><button class="btn btn-gh" @click="runExport('pdf',false)">直接 → PDF</button><button class="btn btn-gh" @click="runExport('md',false)">直接 → Markdown</button></div>
<div class="pnl-btns"><button class="btn btn-gh" @click="expShow=false">取消</button></div>
</div></div>
<div class="toast" id="toast" ref="toastEl"></div>
<FloatPanel />
</div>
</template>