<script setup>
import { ref, computed } from 'vue'
import { store } from '../store'
const stats=computed(()=>({tot:store.msgs.filter(m=>m.role==='user').length, q:store.msgs.filter(m=>m.role==='user'&&/分析|讲解|题目/.test(String(m.content))).length, r:store.msgs.filter(m=>m.role==='assistant'&&/复盘|解析/.test(String(m.content))).length, w:store.wqs.length}))
const detail=ref(''), show=ref(false)
function openStat(kind){ if(kind==='w'){ store.tab='wq'; return } const ums=store.msgs.filter(m=>m.role==='user'); let list=[]; if(kind==='tot')list=ums.slice(-10).map(m=>String(m.content).slice(0,60)); else if(kind==='q')list=ums.filter(m=>/分析|讲解|题目/.test(String(m.content))).slice(-10).map(m=>String(m.content).slice(0,60)); else list=ums.filter(m=>/复盘|分析|讲解/.test(String(m.content))).slice(-10).map(m=>String(m.content).slice(0,60)); detail.value=list.length?list.map(t=>'· '+t).join('\n'):'暂无记录'; show.value=true }
</script>
<template>
<div class="page on"><div class="page-inner">
<div class="sg"><div class="sc" @click="openStat('tot')"><div class="sn">{{ stats.tot }}</div><div class="sl">总对话</div></div><div class="sc" @click="openStat('q')"><div class="sn">{{ stats.q }}</div><div class="sl">题目分析</div></div><div class="sc" @click="openStat('r')"><div class="sn">{{ stats.r }}</div><div class="sl">复盘次数</div></div><div class="sc" @click="openStat('w')"><div class="sn">{{ stats.w }}</div><div class="sl">错题数</div></div></div>
<div class="sec-t">📊 明细（点击上方卡片查看）</div>
</div>
<div class="ov" :class="{show}" @click.self="show=false"><div class="pnl"><h3>📊 明细</h3><pre style="white-space:pre-wrap;font-size:13px;font-family:inherit">{{ detail }}</pre><div class="pnl-btns"><button class="btn btn-gh" @click="show=false">关闭</button></div></div></div>
</div>
</template>