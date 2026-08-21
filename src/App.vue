<script setup>
import { ref, computed } from 'vue'
import { store, saveCfg, saveWqs } from './store'
import { activeCfg, supportsVision, chatOnce } from './api'
import ChatPage from './components/ChatPage.vue'
import KbPage from './components/KbPage.vue'
import StatsPage from './components/StatsPage.vue'
import WrongPage from './components/WrongPage.vue'
import { doExport, exportWrongTxt } from './utils/export'
const tabs=[{k:'chat',t:'💬 对话'},{k:'kb',t:'📚 知识库'},{k:'stat',t:'📊 统计'},{k:'wq',t:'📋 错题'}]
const theme=ref(localStorage.getItem('xc_theme')==='light'?'light':'dark')
document.body.setAttribute('data-theme',theme.value)
function doTheme(){theme.value=theme.value==='light'?'dark':'light';document.body.setAttribute('data-theme',theme.value);localStorage.setItem('xc_theme',theme.value)}
const expType=ref('chat')
const expShow=ref(false)
const expBusy=ref(false)
const setShow=ref(false)
const stStat=ref('检测中...')
const stDot=ref('')
async function testConn(){const t=await testOne(store.cfg.text);const v=await testOne(store.cfg.vision);const ts=t.ok===true?'文字✅':(t.ok===false?'文字❌':'文字未配置');const vs=v.ok===true?'视觉✅':(v.ok===false?'视觉❌':'视觉未配置');stStat.value=ts+' '+vs;stDot.value=(t.ok===false||v.ok===false)?'':' ok';return ts+' '+vs}
async function testOne(c){if(!c||!c.key)return {ok:null};try{const r=await fetch(c.url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+c.key},body:JSON.stringify({model:c.model,messages:[{role:'user',content:'你好'}],max_tokens:8,stream:false})});if(r.ok)return {ok:true};const e=await r.json().catch(()=>({}));return {ok:false,msg:e.error?.message||r.status}}catch(e){return {ok:false,msg:e.message}}}
function openExp(t){expType.value=t;expShow.value=true}
async function runExport(fmt,polish){expShow.value=false;expBusy.value=true;try{await doExport(expType.value,fmt,polish)}finally{expBusy.value=false}}
function openSet(){setShow.value=true;setTimeout(testConn,100)}
function saveSet(){saveCfg();setShow.value=false;testConn()}
</script>
<template>
<div class="app">
<header class="topbar"><h1>🧠 行测<b>AI 问答</b></h1><div style="display:flex;align-items:center;gap:6px">
<div class="status-pill"><div class="dot" :class="stDot"></div><span>{{ stStat }}</span></div>
<button class="btn" style="padding:4px 12px;font-size:13px" @click="openExp('chat')">📤 导出</button>
<button class="btn" style="padding:4px 12px;font-size:13px" @click="openSet()">⚙️ 设置</button>
<button class="btn" style="padding:4px 12px;font-size:13px" @click="doTheme()">{{ theme==='light'?'🌙':'☀️' }}</button>
</div></header>
<nav class="tabs"><button v-for="t in tabs" :key="t.k" class="tab" :class="{on:store.tab===t.k}" @click="store.tab=t.k">{{ t.t }}</button></nav>
<ChatPage v-show="store.tab==='chat'" @export-review="openExp('review')" />
<KbPage v-show="store.tab==='kb'" />
<StatsPage v-show="store.tab==='stat'" />
<WrongPage v-show="store.tab==='wq'" @export="openExp('wrong')" @txt="exportWrongTxt()" />
<!-- 设置弹窗 -->
<div class="ov" :class="{show:setShow}" @click.self="setShow=false"><div class="pnl"><h3>⚙️ API 设置（文字/视觉 双模型）</h3>
<div class="sec-t">💬 文字模型（纯文字题 · 推荐 DeepSeek）</div>
<div class="fld"><label>提供商</label><select v-model="store.cfg.text.prov" @change="fillProv('text')"><option value="ds">DeepSeek (纯文本·便宜)</option><option value="zhipu">智谱 GLM-4.6V (视觉)</option><option value="openai">OpenAI GPT-4o (视觉)</option><option value="qwen">通义 Qwen-VL (视觉)</option><option value="custom">自定义 API</option></select></div>
<div class="fld"><label>API Key</label><input v-model="store.cfg.text.key" placeholder="sk-..." type="text"></div>
<div class="fld"><label>API 地址</label><input v-model="store.cfg.text.url"></div>
<div class="fld"><label>模型名称</label><input v-model="store.cfg.text.model"></div>
<div class="sec-t">👁️ 视觉模型（图片/截图题 · 推荐智谱 GLM-4.6V）</div>
<div class="fld"><label>提供商</label><select v-model="store.cfg.vision.prov" @change="fillProv('vision')"><option value="zhipu">智谱 GLM-4.6V (视觉·推荐)</option><option value="ds">DeepSeek (纯文本)</option><option value="openai">OpenAI GPT-4o (视觉)</option><option value="qwen">通义 Qwen-VL (视觉)</option><option value="custom">自定义 API</option></select></div>
<div class="fld"><label>API Key</label><input v-model="store.cfg.vision.key" type="text" placeholder="粘贴智谱 Key"></div>
<div class="fld"><label>API 地址</label><input v-model="store.cfg.vision.url"></div>
<div class="fld"><label>模型名称</label><input v-model="store.cfg.vision.model"></div>
<div class="fld"><label>自定义 System Prompt（留空用内置知识库）</label><textarea v-model="store.cfg.sys" rows="3"></textarea></div>
<div class="fld"><label><input type="checkbox" v-model="store.cfg.kb"> 启用内置知识库增强</label></div>
<div class="fld"><label><input type="checkbox" v-model="store.cfg.strm"> 流式输出</label></div>
<div class="fld"><label><input type="checkbox" v-model="store.cfg.tts"> 🔊 自动朗读 AI 回复</label></div>
<div class="pnl-btns"><button class="btn btn-gh" @click="setShow=false">取消</button><button class="btn btn-pri" @click="saveSet()">保存并测试</button></div>
</div></div>
<!-- 导出弹窗 -->
<div class="ov" :class="{show:expShow}" @click.self="expShow=false"><div class="pnl"><h3>📤 导出</h3>
<div class="fld"><label>内容：{{ {chat:'💬 对话记录',wrong:'📋 错题集',review:'📖 单题复盘'}[expType] }}</label></div>
<div class="sec-t">✨ 让 AI 整理后导出（推荐：梳理考点/错因/秒杀规律）</div>
<div class="exp-choices"><button class="btn btn-pri" @click="runExport('docx',true)">AI整理 → Word</button><button class="btn btn-gh" @click="runExport('pdf',true)">AI整理 → PDF</button></div>
<div class="sec-t">📄 直接导出（原样）</div>
<div class="exp-choices"><button class="btn btn-gh" @click="runExport('docx',false)">直接 → Word</button><button class="btn btn-gh" @click="runExport('pdf',false)">直接 → PDF</button></div>
<div class="pnl-btns"><button class="btn btn-gh" @click="expShow=false">取消</button></div>
</div></div>
<div class="toast" id="toast" ref="toastEl"></div>
</div>
</template>