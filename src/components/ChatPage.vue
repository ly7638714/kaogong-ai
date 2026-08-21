<script setup>
import { ref, nextTick, computed, onMounted, onUnmounted } from 'vue'
import { marked } from 'marked'
import { store, saveMsgs, saveWqs } from '../store'
import { activeCfg, supportsVision, buildSys, chatStream, detectBanKuai } from '../api'
import { speak, stopSpeak, speaking, startRecog, recogActive } from '../utils/tts'
import { MODE_NAMES } from '../kb'
import { collectChat } from '../utils/chat'
const text=ref(''), imgs=ref([]), linkShow=ref(false), linkUrl=ref(''), recogOn=ref(false)
const live=ref(null) // 当前流式消息 {role:'ai', text, think, thinkOpen}
const msgsBox=ref(null)
function md(t){ try{ return marked.parse(t||'') }catch(e){ return String(t||'').replace(/\n/g,'<br>') } }
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }
function addMsg(m){ store.msgs.push(m); saveMsgs(); scroll() }
async function scroll(){ await nextTick(); if(msgsBox.value) msgsBox.value.scrollTop=msgsBox.value.scrollHeight }
async function pickImage(ev){ const files=ev.target.files||[]; for(const f of files){ if(!f.type.startsWith('image/'))continue; const r=new FileReader(); r.onload=e=>{ imgs.value.push(e.target.result); }; r.readAsDataURL(f) } ev.target.value='' }
function addImageUrl(){ const u=linkUrl.value.trim(); if(!u){ alert('请粘贴图片链接'); return } fetch(u).then(r=>{ if(!r.ok)throw new Error('HTTP '+r.status); return r.blob() }).then(b=>{ if(!b.type.startsWith('image/')){ alert('该链接不是图片'); return } const rd=new FileReader(); rd.onload=e=>{ imgs.value.push(e.target.result); linkShow.value=false; linkUrl.value='' }; rd.readAsDataURL(b) }).catch(e=>alert('加载图片失败：'+e.message)) }
function rmImg(i){ imgs.value.splice(i,1) }
async function send(){
 const txt=text.value.trim(); if(!txt&&!imgs.value.length)return;
 const hasImg=imgs.value.length>0; const c=activeCfg(hasImg); if(!c||!c.key){ alert('请先在设置配置 '+(hasImg?'视觉':'文字')+' 模型 API Key'); return }
 const userMsg={role:'user', content:hasImg?{text:txt,imgs:imgs.value.slice()}:txt}; store.msgs.push(userMsg); saveMsgs(); text.value=''; const sentImgs=imgs.value.slice(); imgs.value=[]; scroll();
 const sys=buildSys(); const history=store.msgs.slice(-20).map(m=>{ if(typeof m.content==='string')return {role:m.role,content:m.content}; return {role:m.role,content:[{type:'text',text:m.content.text},...m.content.imgs.map(u=>({type:'image_url',image_url:{url:u}}))]} });
 live.value={text:'',think:'',thinkOpen:true}; scroll();
 try{ const full=await chatStream([{role:'system',content:sys},...history], c, (d)=>{ if(d.type==='think'){ live.value.think=d.think } else { live.value.text=d.text } scroll() });
  live.value=null; addMsg({role:'assistant',content:full});
  if(store.cfg.tts&&full) speak(full.replace(/[#*`>|]/g,''));
 }catch(e){ live.value=null; addMsg({role:'assistant',content:'❌ 请求失败：'+e.message}); }
}
function saveWrong(){ const c=collectChat(); if(c.length<2){ alert('请先完成一次问答'); return } const u=c[c.length-2]; const bk=detectBanKuai(u?u.text:'')||'判断推理'; const q=(u?u.text:'').slice(0,200)+(u&&u.imgs&&u.imgs.length?'\n[含图片]':''); store.wqs.unshift({id:Date.now(),subject:bk,question:q,reasons:[],time:new Date().toLocaleString()}); saveWqs(); alert('✅ 已存入错题本（板块：'+bk+'）') }
function exportReview(){ import('../utils/export').then(m=>{ /* 由导出弹窗处理 */ }) }
function toggleSpeak(ev){ const btn=ev.currentTarget; const msg=btn.closest('.msg'); if(!msg)return; if(speaking()){ stopSpeak(); btn.textContent='🔊 朗读'; return } const c=msg.cloneNode(true); const tb=c.querySelector('.think-box'); if(tb)tb.remove(); speak(c.innerText||'', ()=>{ btn.textContent='🔊 朗读' }); btn.textContent='🔇 停止' }
function toggleMic(){ const ok=startRecog(t=>{ text.value+=t; scroll() }); if(!ok){ alert('当前浏览器不支持语音输入（请用Chrome/Edge）'); return } recogOn.value=recogActive() }
function stopSpeech(){ stopSpeak() }
const modes=Object.keys(MODE_NAMES)
function setMode(m){ store.mode=m; localStorage.setItem('xc_mode',m) }
function viewImg(src){ window.open(src,'_blank') }
function onAsk(e){ text.value=(e.detail||''); scroll() }
onMounted(()=>window.addEventListener('xc-ask', onAsk))
onUnmounted(()=>window.removeEventListener('xc-ask', onAsk))
defineEmits(['export-review'])
</script>
<template>
<div class="page on" style="display:flex;flex-direction:column;height:100%">
<div class="page-inner" style="display:flex;flex-direction:column;flex:1;min-height:0">
<div class="mode-row"><button v-for="m in modes" :key="m" class="mode-chip" :class="{on:store.mode===m}" @click="setMode(m)">{{ MODE_NAMES[m] }}</button></div>
<div ref="msgsBox" class="msgs" style="flex:1;overflow-y:auto" id="msgs">
<div v-if="!store.msgs.length && !live" class="welcome"><h2><span>行测 AI</span> 问答助手</h2><p>文字题走 DeepSeek · 图片题走智谱视觉 · 命题人视角教学</p></div>
<template v-for="(m,i) in store.msgs" :key="i">
<div class="msg" :class="m.role==='user'?'me':'ai'">
<div v-if="m.role==='user'"><template v-if="typeof m.content==='string'"><div v-html="esc(m.content)"></div></template><template v-else><div class="msg-imgs"><img v-for="(im,j) in m.content.imgs" :key="j" class="msg-img" :src="im" @click="viewImg(im)"></div><div v-html="esc(m.content.text)"></div></template></div>
<template v-else><div v-html="md(m.content)"></div><div class="msg-actions"><button @click="saveWrong()">📌 存错题</button><button @click="$emit('export-review')">📄 导出复盘</button><button @click="toggleSpeak($event)">🔊 朗读</button></div></template>
</div>
</template>
<div v-if="live" class="msg ai">
<div class="think-box" :class="{open:live.thinkOpen}" v-if="live.think"><div class="tb-head" @click="live.thinkOpen=!live.thinkOpen">💭 {{ live.thinkOpen?'正在思考…（实时推理）':'思考过程（点击展开）' }}</div><div class="tb-body">{{ live.think }}</div></div>
<div v-html="md(live.text)"></div>
</div>
</div>
<div class="img-strip" v-if="imgs.length"><div class="img-thumb" v-for="(im,i) in imgs" :key="i"><img :src="im" @click="viewImg(im)"><button class="x" @click="rmImg(i)">×</button></div></div>
<div style="padding:0 14px 6px" v-if="linkShow"><input v-model="linkUrl" placeholder="粘贴图片链接，如 https://.../题目.png" style="flex:1;padding:8px 12px;border-radius:14px;border:1px solid rgba(255,255,255,.1);background:var(--card);color:var(--text);font-size:13px"><button class="btn btn-pri" style="margin-top:6px" @click="addImageUrl()">添加该图片</button></div>
<div class="input-bar">
<textarea v-model="text" rows="1" placeholder="输入题目或问题… (可语音/传图/拖拽图片)" @keydown.enter.exact.prevent="send()" style="flex:1"></textarea>
<button class="ib-btn" @click="toggleMic()" :style="{color:recogOn?'var(--red)':''}">🎤</button>
<button class="ib-btn" @click="linkShow=!linkShow">🔗</button>
<label class="ib-btn" style="display:flex;align-items:center;justify-content:center;cursor:pointer">📷<input type="file" accept="image/*" style="display:none" @change="pickImage"></label>
<button class="ib-send" @click="send()">➤</button>
</div>
</div>
</div>
</template>