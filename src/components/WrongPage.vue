<script setup>
import { ref } from 'vue'
import { store, saveWqs } from '../store'
const cur=ref(-1), show=ref(false)
function open(i){ cur.value=i; show.value=true }
function del(){ if(cur.value<0)return; store.wqs.splice(cur.value,1); saveWqs(); cur.value=-1; show.value=false }
defineEmits(['export','txt'])
</script>
<template>
<div class="page on"><div class="page-inner">
<div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap"><button class="btn btn-pri" @click="$emit('export')">📤 导出(Word/PDF/AI整理)</button><button class="btn btn-gh" @click="$emit('txt')">TXT</button></div>
<div class="wl"><div v-if="!store.wqs.length" style="text-align:center;padding:40px;color:var(--text3)">📋<br>暂无错题记录</div><div class="wi" v-for="(q,i) in store.wqs" :key="q.id" @click="open(i)"><div class="ws">{{ q.subject }}</div><div class="wq">{{ q.question }}</div><div class="wr"><span v-for="r in q.reasons" :key="r">{{ r }}</span></div><div class="wt">{{ q.time }}</div></div></div>
</div>
<div class="ov" :class="{show}" @click.self="show=false"><div class="pnl"><h3>📋 错题详情</h3><template v-if="cur>=0 && store.wqs[cur]"><div style="font-size:12px;color:var(--accent);font-weight:700">{{ store.wqs[cur].subject }}</div><div style="font-size:13.5px;margin:6px 0">{{ store.wqs[cur].question }}</div><div style="font-size:12px;color:var(--text2)">错因：{{ (store.wqs[cur].reasons||[]).join('、') || '无' }}</div><div style="font-size:11px;color:var(--text3);margin-top:4px">{{ store.wqs[cur].time }}</div></template><div class="pnl-btns"><button class="btn btn-gh" @click="show=false">关闭</button><button class="btn btn-gh" @click="del()">🗑 删除</button></div></div></div>
</div>
</template>