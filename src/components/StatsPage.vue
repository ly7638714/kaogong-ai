<script setup>
import { ref, computed } from 'vue'
import { store } from '../store'
import { detectBanKuai } from '../api'
const stats=computed(()=>({tot:store.msgs.filter(m=>m.role==='user').length, q:store.msgs.filter(m=>m.role==='user'&&/分析|讲解|题目/.test(String(m.content&&m.content.text||m.content||''))).length, r:store.msgs.filter(m=>m.role==='assistant'&&/复盘|解析/.test(String(m.content))).length, w:store.wqs.length}))
const banKuai=computed(()=>{
  const m={}
  store.msgs.forEach(x=>{ if(x.role!=='user')return; const t=String((x.content&&x.content.text)||x.content||''); if(!t)return; const bk=detectBanKuai(t)||'综合'; m[bk]=m[bk]+1||1 })
  const arr=Object.entries(m).sort((a,b)=>b[1]-a[1]); const max=Math.max(1,...arr.map(x=>x[1]))
  return {arr,max}
})
const revRate=computed(()=> store.wqs.length? Math.round(store.wqs.filter(q=>q.reviewed).length/store.wqs.length*100) : 0)
const detail=ref(''), show=ref(false)
function openStat(kind){ if(kind==='w'){ store.tab='wq'; return } const ums=store.msgs.filter(m=>m.role==='user'); let list=[]; if(kind==='tot')list=ums.slice(-10).map(m=>String((m.content&&m.content.text)||m.content||'').slice(0,60)); else if(kind==='q')list=ums.filter(m=>/分析|讲解|题目/.test(String((m.content&&m.content.text)||m.content||''))).slice(-10).map(m=>String((m.content&&m.content.text)||m.content||'').slice(0,60)); else list=ums.filter(m=>/复盘|分析|讲解/.test(String((m.content&&m.content.text)||m.content||''))).slice(-10).map(m=>String((m.content&&m.content.text)||m.content||'').slice(0,60)); detail.value=list.length?list.map(t=>'· '+t).join('\n'):'暂无记录'; show.value=true }
</script>
<template>
<div class="page on"><div class="page-inner">
<div class="sg"><div class="sc" @click="openStat('tot')"><div class="sn">{{ stats.tot }}</div><div class="sl">总对话</div></div><div class="sc" @click="openStat('q')"><div class="sn">{{ stats.q }}</div><div class="sl">题目分析</div></div><div class="sc" @click="openStat('r')"><div class="sn">{{ stats.r }}</div><div class="sl">复盘次数</div></div><div class="sc" @click="openStat('w')"><div class="sn">{{ stats.w }}</div><div class="sl">错题数</div></div></div>

<div class="sec-t">📊 板块提问分布</div>
<div v-if="!banKuai.arr.length" class="empty"><div class="empty-i">🧭</div><div class="empty-t">还没有提问记录</div><div class="empty-d">去对话页问几道题，这里会按板块统计你的练习分布</div></div>
<div v-else class="bk-chart">
  <div class="bk-row" v-for="[b,n] in banKuai.arr" :key="b">
    <span class="bk-name">{{ b }}</span>
    <div class="bk-bar"><div class="bk-fill" :style="{width:(n/banKuai.max*100)+'%'}"></div></div>
    <span class="bk-num">{{ n }}</span>
  </div>
</div>

<div class="sec-t">✅ 错题复盘率</div>
<div class="rev-prog"><div class="rp-inner" :style="{width:revRate+'%'}"></div><span class="rp-l">{{ revRate }}%</span></div>
<div style="font-size:11px;color:var(--text3);margin-top:4px">已复盘 {{ store.wqs.filter(q=>q.reviewed).length }} / {{ store.wqs.length }} 题 — 复盘到位是提分关键</div>

<div class="sec-t">📄 明细（点击上方卡片查看）</div>
</div>
<div class="ov" :class="{show}" @click.self="show=false"><div class="pnl"><h3>📊 明细</h3><pre style="white-space:pre-wrap;font-size:13px;font-family:inherit">{{ detail }}</pre><div class="pnl-btns"><button class="btn btn-gh" @click="show=false">关闭</button></div></div></div>
</div>
</template>
