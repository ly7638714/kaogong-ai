<script setup>
import { ref, computed } from 'vue'
import { store } from '../store'
import { detectBanKuai } from '../api'

// 今日练习：统计今天(按日期)的 user 提问数（chat 记录无 time，用日期近似——用 store 计数即可，标注"累计"更稳）
const ck=computed(()=>{
  const q=store.msgs.filter(m=>m.role==='user').length
  const w=store.wqs.length
  const r=store.wqs.filter(x=>x.reviewed).length
  return { q, w, r, revRate:w?Math.round(r/w*100):0 }
})
// 备考倒计时
const daysLeft=computed(()=>{
  try{ const d=store.cfg.examDate?new Date(store.cfg.examDate):null; if(!d||isNaN(d))return null; return Math.max(0,Math.ceil((d-Date.now())/86400000)) }catch(e){ return null }
})
const examDateFmt=computed(()=>{ try{ const d=new Date(store.cfg.examDate||0); if(isNaN(d))return ''; return d.getFullYear()+'年'+(d.getMonth()+1)+'月'+d.getDate()+'日' }catch(e){ return '' } })
// 板块分布
const banKuai=computed(()=>{
  const m={}; store.msgs.forEach(x=>{ if(x.role!=='user')return; const t=String((x.content&&x.content.text)||x.content||''); if(!t)return; const bk=detectBanKuai(t)||'综合'; m[bk]=m[bk]+1||1 })
  const arr=Object.entries(m).sort((a,b)=>b[1]-a[1]); const max=Math.max(1,...arr.map(x=>x[1])); return {arr,max}
})
// 最弱板块（提问最少但存在）提示策略
const weakest=computed(()=>{ const a=banKuai.value.arr; return a.length?a[a.length-1]:null })
function goto(t){ store.tab=t }
// 国考冲刺参考节点（具体以官方公告为准；笔试日联动倒计时设置）
const nodes=[
  {t:'考纲/公告',d:'10月',i:'📄'},
  {t:'报名缴费',d:'10-11月',i:'✍️'},
  {t:'打印准考证',d:'考前',i:'🎫'},
  {t:'📝笔试日',d:store.cfg.examDate||'待定',i:'⏰',hot:true},
  {t:'成绩·进面',d:'考后',i:'📈'},
]
</script>
<template>
<div class="page on"><div class="page-inner cock">
  <div class="ck-head"><div class="ck-title">🚀 学习驾驶舱</div><div class="ck-sub" v-if="daysLeft!=null">距笔试还有 <b>{{ daysLeft }}</b> 天（{{ examDateFmt }}，设置里可调）</div><div class="ck-sub" v-else>在设置 → 数据管理 里配置笔试日期可显示倒计时</div></div>

  <!-- 概览四卡 -->
  <div class="ck-cards">
    <div class="ck-card"><div class="ck-n">{{ ck.q }}</div><div class="ck-l">累计提问</div></div>
    <div class="ck-card g"><div class="ck-n">{{ ck.w }}</div><div class="ck-l">已收错题</div></div>
    <div class="ck-card a"><div class="ck-n">{{ ck.r }}</div><div class="ck-l">已复盘</div></div>
    <div class="ck-card b"><div class="ck-n">{{ daysLeft!=null?daysLeft:'—' }}</div><div class="ck-l">备考倒计时</div></div>
  </div>

  <!-- 板块强度 -->
  <div class="sec-t">📊 板块练习分布</div>
  <div v-if="!banKuai.arr.length" class="empty"><div class="empty-i">🧭</div><div class="empty-t">还没有提问记录</div><div class="empty-d">去对话页问几道题，这里会按板块统计</div></div>
  <div v-else class="bk-chart">
    <div class="bk-row" v-for="[b,n] in banKuai.arr" :key="b"><span class="bk-name">{{ b }}</span><div class="bk-bar"><div class="bk-fill" :style="{width:(n/banKuai.max*100)+'%'}"></div></div><span class="bk-num">{{ n }}</span></div>
  </div>

  <!-- 复盘率 -->
  <div class="sec-t">✅ 错题复盘率</div>
  <div class="rev-prog"><div class="rp-inner" :style="{width:ck.revRate+'%'}"></div><span class="rp-l">{{ ck.revRate }}%</span></div>
  <div style="font-size:11px;color:var(--text3);margin-top:4px">复盘到位是提分关键。待复盘 {{ ck.w - ck.r }} 题。</div>

  <!-- 考试节点横条 -->
  <div class="sec-t">📅 国考冲刺节点</div>
  <div class="ck-nodes">
    <div class="ck-node" v-for="n in nodes" :key="n.t" :class="{hot:n.hot}"><div class="cn-i">{{ n.i }}</div><div class="cn-t">{{ n.t }}</div><div class="cn-d">{{ n.d }}</div></div>
  </div>
  <div style="font-size:10.5px;color:var(--text3);margin-top:4px">参考节点，具体以官方公告为准；笔试日为设置里倒计时对应日期。</div>

  <!-- 学习策略 / 快捷入口 -->
  <div class="sec-t">💡 学习策略</div>
  <div class="ck-tip" v-if="weakest">最近的薄弱板块似乎是「{{ weakest[0] }}」（提问 {{ weakest[1] }} 次）。建议：去对话页切换该板块模式，用 🎲模拟出题 + 🔁变式检验 专项练透。</div>
  <div class="ck-tip" v-else>多去对话页提问、把错题做完复盘，看板会越来越有针对性。</div>

  <div class="ck-acts">
    <button class="btn btn-pri" @click="goto('chat')">💬 去提问 / 智能训练</button>
    <button class="btn btn-gh" @click="goto('wq')">📋 去错题复盘</button>
    <button class="btn btn-gh" @click="goto('stat')">📊 看统计</button>
  </div>
</div></div>
</template>
