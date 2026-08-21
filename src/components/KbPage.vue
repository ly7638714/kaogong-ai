<script setup>
import { store } from '../store'
import { MODE_NAMES } from '../kb'
const cards=[
 {icon:'🧠',name:'薛睿五步法',mode:'luoji',q:'请讲解薛睿论证推理五步40秒解题法'}, {icon:'⬅️',name:'由果推因',mode:'luoji',q:'讲解由果推因三种削弱方法及力度排序'}, {icon:'⚡',name:'选项13美丑',mode:'luoji',q:'讲解选项13美和13丑，各举一个真题例子'}, {icon:'📐',name:'形式逻辑口诀',mode:'luoji',q:'列出形式逻辑全部口诀（顺肯逆否/矛盾/文氏图）'},
 {icon:'📖',name:'三师片段阅读',mode:'yanyu',q:'讲片段阅读三师四步法（结构/逻辑/关键词/三比）'}, {icon:'✏️',name:'逻辑填空三步',mode:'yanyu',q:'讲逻辑填空三师三步法（语境还原/逻辑关联/词语辨析）'}, {icon:'🔷',name:'图推6眼法',mode:'tutu',q:'讲解刘义恒6眼破题法和特征信号表'}, {icon:'📈',name:'资料公式',mode:'ziliao',q:'列资料分析核心公式（基期/增长率/比重/平均数）'}, {icon:'💯',name:'速算百化分',mode:'ziliao',q:'讲解百化分速算和常见百分数对应'}, {icon:'🔢',name:'数量金字塔',mode:'ziliao',q:'讲数量关系四层金字塔和必拿分题型'},
]
function ask(c){ store.mode=c.mode; store.tab='chat'; setTimeout(()=>window.dispatchEvent(new CustomEvent('xc-ask',{detail:c.q})),50) }
</script>
<template>
<div class="page on"><div class="page-inner">
<div class="sec-t">📚 方法速查（点击提问）</div>
<div class="kc-grid"><div class="kc" v-for="c in cards" :key="c.name" @click="ask(c)"><div class="kc-i">{{ c.icon }}</div><div class="kc-n">{{ c.name }}</div><div class="kc-s">{{ MODE_NAMES[c.mode] }}</div></div></div>
</div></div>
</template>