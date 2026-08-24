<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { store, saveMyMem, saveWqs } from '../store'
import { chatOnce, activeCfg, detectBanKuai } from '../api'

// ===== 内置常识池 =====
const CHANGSHI=[
 '我国四大发明：造纸术、印刷术、指南针、火药。',
 '二十四节气起源于黄河流域，"大雪"每年12月7日前后。',
 '《资治通鉴》为北宋司马光主编，编年体通史。',
 '人体最大的器官是皮肤；最长的骨是股骨。',
 '中国陆地处亚欧板块；长江发源于青海格拉丹东。',
 '第一部纪传体通史是《史记》（司马迁）。',
 '光年是长度单位，不是时间单位。',
 '绿茶是不发酵茶，红茶是发酵茶。',
 '货币的发行权平时属于国务院下属的中国人民银行。',
 '新疆是我国面积最大的省级行政区。',
]
// ===== 时政池（带 date/region，可设置时间范围筛选）=====
const SHIZHENG=[
 {t:'新发展理念：创新、协调、绿色、开放、共享。',date:'2025-10',region:'国内'},
 {t:'中国式现代化是人口规模巨大的现代化等五个特征。',date:'2025-10',region:'国内'},
 {t:'高质量发展是全面建设社会主义现代化国家的首要任务。',date:'2025-10',region:'国内'},
 {t:'全过程人民民主是全链条、全方位、全覆盖的民主。',date:'2025-11',region:'国内'},
 {t:'社会保障体系是人民生活的"安全网"、社会运行的"稳定器"。',date:'2025-11',region:'国内'},
 {t:'新质生产力以创新为主导，要求形成新型生产关系。',date:'2025-11',region:'国内'},
 {t:'中央经济工作会议部署"稳中求进、以进促稳"经济工作。',date:'2025-12',region:'国内'},
 {t:'2026年是"十五五"规划开局之年。',date:'2026-01',region:'国内'},
 {t:'贵州实施"新型工业化+新型城镇化"双轮强省战略。',date:'2025-10',region:'贵州'},
 {t:'贵阳做强"中国数谷"，建设国家大数据综合试验区。',date:'2025-11',region:'贵州'},
 {t:'贵州推进"四在农家·和美乡村"乡村振兴建设。',date:'2025-12',region:'贵州'},
 {t:'贵州围绕磷煤化工、新能源材料壮大特色优势工业。',date:'2026-01',region:'贵州'},
]
const myMem = computed(()=>store.myMem)

// ===== 状态 =====
const collapsed=ref(false)
const size=ref('md')
const cat=ref('常识')
const cur=ref('')
const curRegion=ref('全部')   // 时政地区筛选：全部/国内/贵州
const nowMonth=computed(()=>{ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0') })

// 时政按时间+地区过滤（时政时间范围 szFrom 起、szTo 止或今日）
function shizhengAvailable(){
  const from=store.cfg.szFrom||'2025-10', to=store.cfg.szTo||nowMonth.value
  return SHIZHENG.filter(x=> { const r=x.region; const okR=(curRegion.value==='全部'||r===curRegion.value); const d=x.date||''; const okD=(!from||d>=from)&&(!to||d<=to); return okR&&okD })
}
function pool(c){
  if(c==='时政'){ const mine=myMem.value.filter(x=>x.type==='时政').map(x=>({t:x.text,date:'',region:'我的'})); return shizhengAvailable().map(x=>x.t).concat(mine.map(x=>x.t)) }
  const mine=myMem.value.filter(x=>x.type==='常识').map(x=>x.text); return CHANGSHI.concat(mine)
}
function pick(c){ const p=pool(c); if(!p.length){ cur.value='（当前筛选下暂无条目，可调整设置）'; return } cur.value=p[Math.floor(Math.random()*p.length)] }
function switchCat(c){ cat.value=c; if(c!=='时政')curRegion.value='全部'; pick(c) }
function setRegion(r){ curRegion.value=r; pick('时政') }
function toggle(){ collapsed.value=!collapsed.value }
function toggleSize(){ size.value=size.value==='md'?'sm':'md' }
function next(){ pick(cat.value) }
function favorite(){ if(!cur.value)return; if(store.myMem.some(x=>x.text===cur.value)){ alert('这条已在我的记忆库'); return } store.myMem.push({type:cat.value, text:cur.value, t:new Date().toLocaleString()}); saveMyMem(); alert('✅ 已加入我的记忆库') }

// ===== 常识 AI 出题交互 =====
const quiz=ref(null)      // {q, opts:[], ans, type}
const picked=ref('')       // 用户选的选项
const mark=ref(null)       // true/false
const quizBusy=ref(false)
const seeExplain=ref('')   // 解释/追问文本
const followQ=ref('')
function hasKey(){ const c=activeCfg(false); return !!(c&&c.key) }
async function askQuiz(kind){
  if(!hasKey()){ alert('请先在设置配置 API Key'); return }
  quizBusy.value=true; quiz.value=null; picked.value=''; mark.value=null; seeExplain.value=''
  const topic=cur.value||(cat.value==='常识'?'常识知识点':'时政时政知识点')
  let prompt
  if(kind==='quiz') prompt='你是行测常识判断命题老师。请基于下面这条知识点，出1道单选题（仿真题风格）。严格只输出 JSON，格式：{"问题":"题干","选项":["A. …","B. …","C. …","D. …"],"答案":0,"考点":"本题考点"}\n知识点：'+topic.slice(0,200)
  else prompt='请为下面这条知识点写一段精炼的名师讲解（100-200字），解释生僻点、易错点、怎么记。\n知识点：'+topic.slice(0,200)
  try{
    const c=activeCfg(false)
    const txt=await chatOnce(c, [{role:'system',content:'你是资深公考老师，只输出用户要求的内容。'},{role:'user',content:prompt}], 1200)
    if(kind==='quiz'){
      const m=txt.match(/\{[\s\S]*\}/); if(!m){ throw new Error('AI返回格式异常') }
      const j=JSON.parse(m[0]); quiz.value={q:j.问题,opts:j.选项||[],ans:j.答案,考点:j.考点||'常识'}
    } else seeExplain.value=txt
  }catch(e){ alert('生成失败：'+e.message) }
  finally{ quizBusy.value=false }
}
function choose(i){
  if(!quiz.value)return
  picked.value=String.fromCharCode(65+i)
  const right=i===quiz.value.ans
  mark.value=right
  // 答错 → 存错题集
  if(!right){ const q='【常识出题自测】'+quiz.value.q+' | 知识点源：'+(cur.value||'').slice(0,60); store.wqs.unshift({id:Date.now(),subject:'常识判断',question:q,answer:String.fromCharCode(65+quiz.value.ans),reasons:[right?'':'知识点遗忘'],time:new Date().toLocaleString()}); saveWqs(); alert('❌ 已加入错题集（常识判断）') }
}
async function askFollow(){ if(!followQ.value.trim())return; seeExplain.value='（追问中…）'; const t='用户追问：'+followQ.value.trim()+' 请结合该知识点精炼作答（100-200字）。\n知识点：'+(cur.value||'').slice(0,150); try{ const c=activeCfg(false); seeExplain.value=await chatOnce(c,[{role:'system',content:'你是考公名师，简明精准作答。'},{role:'user',content:t}],600) }catch(e){ seeExplain.value='追问失败：'+e.message } }

// 拖动
const drag=ref(null), panel=ref(null)
function onDown(e){ const r=panel.value.getBoundingClientRect(); drag.value={dx:e.clientX-r.left, dy:e.clientY-r.top} }
function onMove(e){ if(!drag.value)return; const x=e.clientX-drag.value.dx, y=e.clientY-drag.value.dy; panel.value.style.left=Math.min(window.innerWidth-80,Math.max(-10,x))+'px'; panel.value.style.top=Math.min(window.innerHeight-60,Math.max(0,y))+'px'; panel.value.style.right='auto'; panel.value.style.bottom='auto' }
function onUp(){ drag.value=null }
onMounted(()=>{ document.addEventListener('mousemove',onMove); document.addEventListener('mouseup',onUp); pick('常识') })
onUnmounted(()=>{ document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onUp) })
</script>
<template>
<div v-if="collapsed" class="fp-btn" @click="toggle()" title="展开常识/时政积累">🧠<span class="fp-dot"></span></div>
<div v-else ref="panel" class="fp-card" :class="size">
  <div class="fp-head" @mousedown="onDown"><span class="fp-title">📚 常识·时政积累</span><div class="fp-ops"><button class="fp-o" @click.stop="toggle()" title="折叠">—</button><button class="fp-o" @click.stop="toggleSize()" title="缩放">{{ size==='md'?'⤡':'⟶' }}</button></div></div>
  <div class="fp-cat">
    <button class="fp-c" :class="{on:cat==='常识'}" @click="switchCat('常识')">常识</button>
    <button class="fp-c" :class="{on:cat==='时政'}" @click="switchCat('时政')">时政·政治</button>
  </div>
  <!-- 时政地区筛选 -->
  <div class="fp-reg" v-if="cat==='时政'">
    <button class="fp-c s" :class="{on:curRegion==='全部'}" @click="setRegion('全部')">全部</button>
    <button class="fp-c s" :class="{on:curRegion==='国内'}" @click="setRegion('国内')">国内</button>
    <button class="fp-c s" :class="{on:curRegion==='贵州'}" @click="setRegion('贵州')">贵州·地方</button>
  </div>
  <!-- 正文 -->
  <template v-if="!quiz">
    <div class="fp-body">{{ cur }}</div>
    <div class="fp-foot">
      <button class="fp-b" @click="next()">🎲 换一条</button>
      <button class="fp-b gold" @click="favorite()">⭐ 收藏</button>
    </div>
    <div class="fp-foot" v-if="cat==='常识'">
      <button class="fp-b quiz" :disabled="quizBusy" @click="askQuiz('quiz')">{{ quizBusy?'出题中…':'✏️ 出题考我' }}</button>
      <button class="fp-b gold" :disabled="quizBusy" @click="askQuiz('explain')">📖 名师详解</button>
    </div>
  </template>
  <!-- 答题面板 -->
  <div v-else class="fp-quiz">
    <div class="q-hd">❓ {{ quiz.q }} <span v-if="quiz.考点" class="q-kd">考点：{{ quiz.考点 }}</span></div>
    <div class="q-opts"><button class="q-o" v-for="(o,i) in quiz.opts" :key="i" :class="{on:picked===String.fromCharCode(65+i), right:mark!=null&&i===quiz.ans&&picked===String.fromCharCode(65+i), wrong:mark!=null&&picked===String.fromCharCode(65+i)&&i!==quiz.ans}" @click="choose(i)">{{ o }}</button></div>
    <div class="q-mark" v-if="mark!=null" :class="mark?'ok':'no'">{{ mark?'✅ 回答正确':'❌ 回答错误（已存入错题集）' }}</div>
    <div class="fp-foot"><button class="fp-b" @click="quiz=null;mark=null;picked=''">关闭</button><button class="fp-b" @click="seeExplain='';askQuiz('explain')">📖 看讲解</button></div>
  </div>
  <!-- 讲解/追问 -->
  <div v-if="seeExplain" class="fp-body exp">{{ seeExplain }}</div>
  <div class="fp-follow" v-if="seeExplain && !quiz"><input v-model="followQ" placeholder="追问：如 这题为啥选A？" @keydown.enter="askFollow()"><button class="fp-b" @click="askFollow()">追问</button></div>
</div>
</template>
<style scoped>
.fp-btn{position:fixed;right:16px;bottom:18px;width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--grad2,var(--purple)));color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;cursor:pointer;box-shadow:0 8px 22px rgba(0,0,0,.35);z-index:600}
.fp-btn:hover{transform:scale(1.08)}
.fp-dot{position:absolute;top:6px;right:6px;width:9px;height:9px;border-radius:50%;background:var(--green);border:2px solid var(--bg)}
.fp-card{position:fixed;right:14px;bottom:16px;width:300px;background:var(--card);border:1px solid rgba(255,255,255,.1);border-radius:16px;box-shadow:0 18px 48px rgba(0,0,0,.45);z-index:600;overflow:hidden;backdrop-filter:blur(14px);max-height:86vh;overflow-y:auto}
.fp-card.sm{width:220px}
.fp-head{display:flex;justify-content:space-between;align-items:center;padding:9px 10px;background:rgba(0,0,0,.18);cursor:grab;user-select:none}
.fp-title{font-size:12px;font-weight:700;color:var(--accent)}
.fp-ops{display:flex;gap:3px}.fp-o{width:22px;height:22px;border:none;border-radius:6px;background:rgba(255,255,255,.08);color:var(--text2);cursor:pointer;font-size:11px;line-height:1}.fp-o:hover{background:var(--accent2);color:var(--accent)}
.fp-cat{display:flex;gap:4px;padding:8px 10px 2px}
.fp-reg{display:flex;gap:4px;padding:4px 10px 2px}
.fp-c{padding:3px 10px;border-radius:12px;border:1px solid rgba(255,255,255,.1);background:transparent;color:var(--text2);font-size:11px;cursor:pointer}.fp-c.s{padding:2px 8px;font-size:10.5px}
.fp-c.on{background:var(--accent2);color:var(--accent);border-color:rgba(56,189,248,.3)}
.fp-body{padding:12px 12px 8px;font-size:12.5px;line-height:1.65;color:var(--text);min-height:64px}
.fp-body.exp{border-top:1px dashed rgba(255,255,255,.14);color:var(--text2);font-size:12px;min-height:0}
.fp-card.sm .fp-body{font-size:12px}
.fp-foot{display:flex;gap:6px;padding:2px 10px 10px}
.fp-b{flex:1;padding:6px 0;border:none;border-radius:12px;background:var(--accent2);color:var(--accent);font-size:11.5px;cursor:pointer;font-family:inherit}.fp-b.gold{background:rgba(251,191,36,.12);color:var(--amber)}.fp-b.quiz{background:#2f6fb3;color:#fff}
.fp-b:disabled{opacity:.5}.fp-b:hover{filter:brightness(1.12)}
/* 答题面板 */
.fp-quiz{padding:10px}
.q-hd{font-size:12.5px;line-height:1.55;color:var(--text);margin-bottom:8px}.q-kd{display:inline-block;margin-left:6px;font-size:10px;color:var(--accent)}
.q-opts{display:flex;flex-direction:column;gap:6px}
.q-o{padding:7px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.1);background:var(--surface);color:var(--text);font-size:12px;text-align:left;cursor:pointer}.q-o:hover{border-color:var(--accent)}
.q-o.on{border-color:var(--accent);background:var(--accent2)}
.q-o.right{background:rgba(52,211,153,.16);border-color:var(--green);color:var(--green)}
.q-o.wrong{background:rgba(248,113,113,.16);border-color:var(--red);color:var(--red)}
.q-mark{margin-top:8px;font-size:12px;font-weight:700}.q-mark.ok{color:var(--green)}.q-mark.no{color:var(--red)}
.fp-follow{display:flex;gap:6px;padding:0 10px 10px}.fp-follow input{flex:1;padding:6px 9px;border-radius:8px;border:1px solid rgba(255,255,255,.1);background:var(--surface);color:var(--text);font-size:11.5px;font-family:inherit;outline:none}
</style>
