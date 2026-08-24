<script setup>
import { ref, computed } from 'vue'
import { store, saveWqs } from '../store'

const cur=ref(-1), show=ref(false)
const rep=ref(false)
const frm=ref({ answer:'', method:'', note:'', sel:[] })
const reasonsOpt=['不理解题干推理','不明白选项功能','忽略主题范围','出题人挖坑','知识点遗忘','粗心/算错']

// 筛选状态
const fSubj=ref(''), fRev=ref('all'), fReason=ref('')
const subjList=computed(()=>{ const s=new Set(store.wqs.map(q=>q.subject||'未分类')); return [...s].filter(Boolean) })
const reasonList=computed(()=>{ const s=new Set(); store.wqs.forEach(q=>(q.reasons||[]).forEach(r=>s.add(r))); return [...s].filter(Boolean) })
const stats=computed(()=>{ const t=store.wqs.length, r=store.wqs.filter(q=>q.reviewed).length; return {t,rev:r,pend:t-r} })
const shown=computed(()=> store.wqs.filter(q=>{
  if(fSubj.value && (q.subject||'未分类')!==fSubj.value) return false
  if(fRev.value==='rev' && !q.reviewed) return false
  if(fRev.value==='pend' && q.reviewed) return false
  if(fReason.value && !(q.reasons||[]).includes(fReason.value)) return false
  return true
}))

function openIdx(i){ openRaw(store.wqs.indexOf(shown.value[i])) } // 用 filter 后索引定位原序错题
function openRaw(idx){ if(idx<0)return; cur.value=idx; show.value=true; rep.value=false; const q=store.wqs[idx]||{}; frm.value={ answer:q.answer||'', method:q.method||'', note:q.note||'', sel:(q.reasons||[]).slice() } }
function toggleReason(r){ const i=frm.value.sel.indexOf(r); if(i>=0){frm.value.sel.splice(i,1)}else{frm.value.sel.push(r)} }
function save(){ if(cur.value<0)return; const q=store.wqs[cur.value]; q.answer=frm.value.answer.trim(); q.method=frm.value.method.trim(); q.note=frm.value.note.trim(); q.reasons=frm.value.sel; q.reviewed = !!(q.answer||q.method||q.note); saveWqs(); alert('✅ 已保存复盘') }
function del(){ if(cur.value<0)return; store.wqs.splice(cur.value,1); saveWqs(); cur.value=-1; show.value=false }
defineEmits(['export','txt','exportMd'])
</script>
<template>
<div class="page on"><div class="page-inner">
<div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap"><button class="btn btn-pri" @click="$emit('export')">📤 导出(Word/PDF/AI)</button><button class="btn btn-gh" @click="$emit('exportMd')">⬇️ 导出 Markdown</button><button class="btn btn-gh" @click="$emit('txt')">TXT</button></div>

<!-- 统计条 -->
<div class="wq-stats">
  <div class="ws2"><span class="ws2-n">{{ stats.t }}</span><span class="ws2-l">共错题</span></div>
  <div class="ws2"><span class="ws2-n g">{{ stats.rev }}</span><span class="ws2-l">已复盘</span></div>
  <div class="ws2"><span class="ws2-n a">{{ stats.pend }}</span><span class="ws2-l">待复盘</span></div>
</div>

<!-- 筛选 -->
<div class="wq-filters">
  <select v-model="fSubj"><option value="">全部板块</option><option v-for="s in subjList" :key="s" :value="s">{{ s }}</option></select>
  <select v-model="fRev"><option value="all">全部状态</option><option value="rev">✅ 已复盘</option><option value="pend">⏳ 待复盘</option></select>
  <select v-model="fReason"><option value="">全部错因</option><option v-for="r in reasonList" :key="r" :value="r">{{ r }}</option></select>
  <button class="btn btn-gh" style="padding:6px 12px" @click="fSubj='';fRev='all';fReason=''">重置</button>
</div>

<div class="wl">
  <div v-if="!store.wqs.length" class="empty"><div class="empty-i">📋</div><div class="empty-t">暂无错题记录</div><div class="empty-d">做题时点 AI 回复下的「📌 存错题」即可收纳</div></div>
  <div v-else-if="!shown.length" class="empty"><div class="empty-i">🔍</div><div class="empty-t">没有符合筛选的错题</div><div class="empty-d">试试调整筛选条件</div></div>
  <div class="wi" v-for="(q,i) in shown" :key="q.id" @click="openIdx(i)">
    <div class="wi-top"><span class="ws">{{ q.subject||'未分类' }}</span><span class="rv" :class="{ok:q.reviewed}">{{ q.reviewed?'✅ 已复盘':'⏳ 待复盘' }}</span></div>
    <div class="wq">{{ q.question }}</div>
    <div class="wr" v-if="q.reasons&&q.reasons.length"><span v-for="r in q.reasons" :key="r">{{ r }}</span></div>
    <div class="wt">{{ q.time }} · {{ q.answer?('答案 '+q.answer):'未填答案' }}<span v-if="q.method" class="wtm">⚡ {{ q.method }}</span></div>
  </div>
</div>
</div>

<div class="ov" :class="{show}" @click.self="show=false"><div class="pnl">
  <h3>📋 错题详情</h3>
  <template v-if="cur>=0 && store.wqs[cur]">
    <div class="pnl-sub">{{ store.wqs[cur].subject||'未分类' }}</div>
    <div class="pnl-q">{{ store.wqs[cur].question }}</div>

    <div class="rev-head" @click="rep=!rep">✍️ {{ rep?'收起':'开始结构化复盘' }} <span style="float:right">{{ rep?'▲':'▼' }}</span></div>
    <div v-if="rep" class="rev-body">
      <div class="fld"><label>正确答案</label><input v-model="frm.answer" placeholder="如：D / 乙 / 主旨句…"></div>
      <div class="fld"><label>错因（可多选）</label><div class="chips"><span class="chip" v-for="r in reasonsOpt" :key="r" :class="{on:frm.sel.includes(r)}" @click="toggleReason(r)">{{ r }}</span></div></div>
      <div class="fld"><label>⚡ 秒杀规律（一句话）</label><input v-model="frm.method" placeholder="下次看到这类题先想…"></div>
      <div class="fld"><label>📝 个人笔记/解析</label><textarea v-model="frm.note" rows="3" placeholder="记录命题人坑点、同类题联想…"></textarea></div>
      <div class="pnl-btns"><button class="btn btn-pri" @click="save()">💾 保存复盘</button></div>
    </div>
    <div class="rev-view" v-if="!rep && (store.wqs[cur].answer||store.wqs[cur].method||store.wqs[cur].note)">
      <div class="rv-item">✅ 答案：{{ store.wqs[cur].answer }}</div>
      <div class="rv-item">⚡ 秒杀：{{ store.wqs[cur].method }}</div>
      <div class="rv-item">📝 {{ store.wqs[cur].note }}</div>
    </div>
  </template>
  <div class="pnl-btns"><button class="btn btn-gh" @click="show=false">关闭</button><button class="btn btn-gh" @click="del()">🗑 删除</button></div>
</div></div>
</div>
</template>
