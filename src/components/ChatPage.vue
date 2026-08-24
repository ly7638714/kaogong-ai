<script setup>
import { ref, nextTick, computed, onMounted, onUnmounted } from 'vue'
import 'katex/dist/katex.min.css'
import { renderMd } from '../utils/renderMd'
function md(t){ return renderMd(t) }
import { store, saveMsgs, saveWqs } from '../store'
import { activeCfg, supportsVision, buildSys, chatStream, detectBanKuai, buildTaskSys, PLATE_MODE } from '../api'
import { speak, stopSpeak, speaking, startRecog, recogActive } from '../utils/tts'
import { MODE_NAMES } from '../kb'
import { collectChat } from '../utils/chat'
const text=ref(''), imgs=ref([]), linkShow=ref(false), linkUrl=ref(''), recogOn=ref(false)
const live=ref(null) // 当前流式消息 {role:'ai', text, think, thinkOpen}
const msgsBox=ref(null)
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }
function addMsg(m){ store.msgs.push(m); saveMsgs(); scroll() }
async function scroll(){ await nextTick(); if(msgsBox.value) msgsBox.value.scrollTop=msgsBox.value.scrollHeight }
async function pickImage(ev){ const files=ev.target.files||[]; for(const f of files){ if(!f.type.startsWith('image/'))continue; const r=new FileReader(); r.onload=e=>{ imgs.value.push(e.target.result); }; r.readAsDataURL(f) } ev.target.value='' }
function addImageUrl(){ const u=linkUrl.value.trim(); if(!u){ alert('请粘贴图片链接'); return } fetch(u).then(r=>{ if(!r.ok)throw new Error('HTTP '+r.status); return r.blob() }).then(b=>{ if(!b.type.startsWith('image/')){ alert('该链接不是图片'); return } const rd=new FileReader(); rd.onload=e=>{ imgs.value.push(e.target.result); linkShow.value=false; linkUrl.value='' }; rd.readAsDataURL(b) }).catch(e=>alert('加载图片失败：'+e.message)) }
function rmImg(i){ imgs.value.splice(i,1) }
async function send(){
 const txt=text.value.trim(); if(!txt&&!imgs.value.length)return;
 const hasImg=imgs.value.length>0; const c=activeCfg(hasImg); if(!c||!c.key){ alert('请先在设置配置 '+(hasImg?'视觉':'文字')+' 模型 API Key'); return }
 if(hasImg && !supportsVision(c)){ alert('当前「'+store.cfg.vision.model+'」不是视觉模型/未配置视觉Key：无法识别图片。\n请到 ⚙️设置→视觉模型 配置智谱 GLM-4.6V 等视觉接口；或在下方输框删掉图片、改用文字描述题目。'); return }
 const userMsg={role:'user', content:hasImg?{text:txt,imgs:imgs.value.slice()}:txt}; store.msgs.push(userMsg); saveMsgs(); text.value=''; const sentImgs=imgs.value.slice(); imgs.value=[]; scroll();
 const sys=buildSys(); const history=store.msgs.slice(-20).map(m=>{ if(typeof m.content==='string')return {role:m.role,content:m.content}; return {role:m.role,content:[{type:'text',text:m.content.text},...m.content.imgs.map(u=>({type:'image_url',image_url:{url:u}}))]} });
 live.value={text:'',think:'',thinkOpen:true}; scroll();
 try{ const full=await chatStream([{role:'system',content:sys},...history], c, (d)=>{ if(d.type==='think'){ live.value.think=d.think } else { live.value.text=d.text } scroll() });
  live.value=null; addMsg({role:'assistant',content:full});
  if(store.cfg.ttsOn) autoSpeak(full);
 }catch(e){ live.value=null; addMsg({role:'assistant',content:'❌ 请求失败：'+e.message}); }
}
function saveWrong(){ const c=collectChat(); if(c.length<2){ alert('请先完成一次问答'); return } const u=c[c.length-2]; const bk=detectBanKuai(u?u.text:'')||'判断推理'; const q=(u?u.text:'').slice(0,200)+(u&&u.imgs&&u.imgs.length?'\n[含图片]':''); store.wqs.unshift({id:Date.now(),subject:bk,question:q,reasons:[],time:new Date().toLocaleString()}); saveWqs(); alert('✅ 已存入错题本（板块：'+bk+'）') }
function getLastUserText(){ const c=collectChat(); let x=null; for(let i=c.length-1;i>=0;i--){ if(c[i].role==='user'){ x=c[i].text; break } } return x||'' }
const trainPlate=ref('判断推理')
const plates=Object.keys(PLATE_MODE)
const modeHint={'all':'输入题目或问题，或直接提问某个知识点','luoji':'请教一道论证/形式逻辑题，我用薛睿五步法给你讲','yanyu':'把文段粘贴进来，三师帮你找准主旨','tutu':'上传图推截图，我按薛睿24诀帮你找规律','ziliao':'粘贴资料材料+问题，我帮你列公式并速算','shuliang':'发一道数量题，我教你可秒杀的思路','zhengzhi':'问政治理论考点，小黑口诀帮你记','changshi':'问一道常识题，我给你考点和蒙题思路','leibi':'发一个类比题，用三步定位法帮你拆','dingyi':'发一道定义判断，我按五要件帮你核对'}
const inputPh=computed(()=> modeHint[store.mode]||'输入题目或问题… (可语音/传图)')
const dStat=computed(()=>({ q:store.msgs.filter(m=>m.role==='user').length, w:store.wqs.length, r:store.wqs.filter(v=>v.reviewed).length }))
const motos=['日拱一卒，功不唐捐','把错题当补药，吃一颗涨一分','你不是不会，只是还差一次次复盘','稳定发挥 = 会的都对、错的不再错','今日刷题，明日上岸','方法对了，努力才有价值']
const motto=ref(motos[Math.floor(Math.random()*motos.length)])
function collectStat(){
  const bc={}
  collectChat().forEach(m=>{ if(m.role!=='user')return; const t=m.text||''; if(!t)return; const bk=detectBanKuai(t)||'综合'; bc[bk]=bc[bk]+1||1 })
  const wqBy={}, rs={}
  ;(store.wqs||[]).forEach(q=>{ wqBy[q.subject||'未分类']=wqBy[q.subject||'未分类']+1||1; (q.reasons||[]).forEach(r=>rs[r]=rs[r]+1||1) })
  return ('各板块提问次数：'+Object.entries(bc).map(([k,v])=>k+' '+v+'次').join('、')+
    '\n各板块错题数：'+Object.entries(wqBy).map(([k,v])=>k+' '+v+'题').join('、')+
    '\n错因分布：'+Object.entries(rs).map(([k,v])=>k+'×'+v).join('、')+
    '\n已复盘/总错题：'+store.wqs.filter(q=>q.reviewed).length+'/'+store.wqs.length)
}
async function train(kind, opts={}){
  const c=activeCfg(false); if(!c||!c.key){ alert('请先在设置配置文字模型 API Key'); return }
  if(store.busy)return
  const sys=buildTaskSys(kind, opts)
  let userText
  if(kind==='quiz') userText='请为【'+(opts.plate||'所选板块')+'】出一道仿真模拟题。'
  else if(kind==='variant'){ userText='请针对我刚才问的那道题，出一道【考点题型完全相同、题干素材全新】的变式检验题。原题：'+String(opts.prev||getLastUserText()).slice(0,600) }
  else if(kind==='diag'){ userText='我的学习数据如下，请诊断：\n'+collectStat() }
  else return
  const userMsg={role:'user', content:userText}
  store.msgs.push(userMsg); saveMsgs(); scroll()
  live.value={text:'',think:'',thinkOpen:true}; store.busy=true; scroll()
  try{
    const full=await chatStream([{role:'system',content:sys},{role:'user',content:userText}], c, (d)=>{ if(d.type==='think'){live.value.think=d.think}else{live.value.text=d.text}; scroll() })
    live.value=null; addMsg({role:'assistant',content:full})
    if(store.cfg.ttsOn) autoSpeak(full)
  }catch(e){ live.value=null; addMsg({role:'assistant',content:'❌ 生成失败：'+e.message}) }
  store.busy=false
}
function autoSpeak(t){ if(store.cfg.ttsOn!==false&&t) speak(String(t).replace(/[#*`>|_]/g,''), {scene:store.cfg.ttsScene, rate:store.cfg.ttsRate, pitch:store.cfg.ttsPitch}) }
function exportReview(){ import('../utils/export').then(m=>{ /* 由导出弹窗处理 */ }) }
function toggleSpeak(ev){ const btn=ev.currentTarget; const msg=btn.closest('.msg'); if(!msg)return; if(speaking()){ stopSpeak(); btn.textContent='🔊 朗读'; return } const c=msg.cloneNode(true); const tb=c.querySelector('.think-box'); if(tb)tb.remove(); speak(c.innerText||'', {scene:store.cfg.ttsScene, rate:store.cfg.ttsRate, pitch:store.cfg.ttsPitch, onEnd:()=>{ btn.textContent='🔊 朗读' }}); btn.textContent='🔇 停止' }
function toggleMic(){ const ok=startRecog(t=>{ text.value+=t; scroll() }); if(!ok){ alert('当前浏览器不支持语音输入（请用Chrome/Edge）'); return } recogOn.value=recogActive() }
function stopSpeech(){ stopSpeak() }
const modes=Object.keys(MODE_NAMES)
function setMode(m){ store.mode=m; localStorage.setItem('xc_mode',m) }
const quickCards=[
 {ic:'🧠',t:'逻辑判断',s:'薛睿五步法',bg:'a',mode:'luoji',q:'讲解论点削弱/支持的五步分析和拆桥论证'},
 {ic:'📖',t:'言语理解',s:'三师片段',bg:'g',mode:'yanyu',q:'分析这段文字的意图（附上题干即可）'},
 {ic:'🔷',t:'图形推理',s:'图推 24 诀',bg:'b',mode:'tutu',q:'这道图推题怎么找规律（上传图片）'},
 {ic:'📊',t:'资料分析',s:'四大神器',bg:'y',mode:'ziliao',q:'基期比重公式是什么，何时用'},
 {ic:'🏛️',t:'政治理论',s:'小黑口诀',bg:'p',mode:'zhengzhi',q:'新思想五大新发展理念和口诀'},
 {ic:'🔢',t:'数量关系',s:'四层金字塔',bg:'r',mode:'shuliang',q:'工程问题设最小公倍数的秒杀法'},
]
function askQuick(c){ store.mode=c.mode; text.value=c.q; scroll(); const tb=document.querySelector('.input-bar textarea'); if(tb)tb.focus() }
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
<div class="train-bar"><span class="tb-l">🎯 智能训练</span><select v-model="trainPlate" class="tb-sel"><option v-for="p in plates" :key="p" :value="p">{{ p }}</option></select><button class="btn btn-gh tb-btn" @click="train('quiz',{plate:trainPlate,mode:PLATE_MODE[trainPlate]})">🎲 模拟出题</button><button class="btn btn-gh tb-btn" @click="train('diag')">📊 学习诊断</button></div>
<div ref="msgsBox" class="msgs" style="flex:1;overflow-y:auto" id="msgs">
<div v-if="!store.msgs.length && !live" class="hero"><div class="hero-badge">六大板块 · 名师方法论 · 命题人视角</div><h2><span>行测智能助教</span></h2><p>文字题走 DeepSeek · 图表公式走视觉模型 · 给你名师级的做题思路与错题复盘</p>
<div class="hero-stats"><div class="hs"><div class="hs-n">{{ dStat.q }}</div><div class="hs-l">累计提问</div></div><div class="hs"><div class="hs-n">{{ dStat.w }}</div><div class="hs-l">已收错题</div></div><div class="hs"><div class="hs-n g">{{ dStat.r }}</div><div class="hs-l">已复盘</div></div></div>
<div class="hero-grid"><div class="hero-card" v-for="c in quickCards" :key="c.t" @click="askQuick(c)"><div :class="'hero-ic b-'+c.bg">{{ c.ic }}</div><div><div class="hero-t">{{ c.t }}</div><div class="hero-s">{{ c.s }}</div></div></div></div>
<div class="hero-motto">💡 {{ motto }}</div></div>
<template v-for="(m,i) in store.msgs" :key="i">
<div class="msg" :class="m.role==='user'?'me':'ai'">
<div v-if="m.role==='user'"><template v-if="typeof m.content==='string'"><div v-html="esc(m.content)"></div></template><template v-else><div class="msg-imgs"><img v-for="(im,j) in m.content.imgs" :key="j" class="msg-img" :src="im" @click="viewImg(im)"></div><div v-html="esc(m.content.text)"></div></template></div>
<template v-else><div v-html="md(m.content)"></div><div class="msg-actions"><button @click="saveWrong()">📌 存错题</button><button @click="train('variant',{prev:getLastUserText()})">🔁 出变式题</button><button @click="$emit('export-review')">📄 导出复盘</button><button @click="toggleSpeak($event)">🔊 朗读</button></div></template>
</div>
</template>
<div v-if="live" class="msg ai live-cursor">
<div class="think-box" :class="{open:live.thinkOpen}" v-if="live.think"><div class="tb-head" @click="live.thinkOpen=!live.thinkOpen">💭 {{ live.thinkOpen?'正在思考…（实时推理）':'思考过程（点击展开）' }}</div><div class="tb-body">{{ live.think }}</div></div>
<div v-html="md(live.text)"></div>
</div>
</div>
<div class="img-strip" v-if="imgs.length"><div class="img-thumb" v-for="(im,i) in imgs" :key="i"><img :src="im" @click="viewImg(im)"><button class="x" @click="rmImg(i)">×</button></div></div>
<div style="padding:0 14px 6px" v-if="linkShow"><input v-model="linkUrl" placeholder="粘贴图片链接，如 https://.../题目.png" style="flex:1;padding:8px 12px;border-radius:14px;border:1px solid rgba(255,255,255,.1);background:var(--card);color:var(--text);font-size:13px"><button class="btn btn-pri" style="margin-top:6px" @click="addImageUrl()">添加该图片</button></div>
<div class="input-bar">
<textarea v-model="text" rows="1" :placeholder="inputPh" @keydown.enter.exact.prevent="send()" style="flex:1"></textarea>
<button class="ib-btn" @click="toggleMic()" :style="{color:recogOn?'var(--red)':''}">🎤</button>
<button class="ib-btn" @click="linkShow=!linkShow">🔗</button>
<label class="ib-btn" style="display:flex;align-items:center;justify-content:center;cursor:pointer">📷<input type="file" accept="image/*" style="display:none" @change="pickImage"></label>
<button class="ib-send" @click="send()">➤</button>
</div>
</div>
</div>
</template>