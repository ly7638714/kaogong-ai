<script setup>
import { store } from '../store'
import { MODE_NAMES } from '../kb'
const cards=[
 {icon:'🧠',name:'薛睿五步法',mode:'luoji',q:'请讲解薛睿论证推理五步40秒解题法'}, {icon:'⬅️',name:'由果推因',mode:'luoji',q:'讲解由果推因三种削弱方法及力度排序'}, {icon:'⚡',name:'选项13美丑',mode:'luoji',q:'讲解选项13美和13丑，各举一个真题例子'}, {icon:'📐',name:'形式逻辑口诀',mode:'luoji',q:'列出形式逻辑全部口诀（顺肯逆否/矛盾/文氏图）'},
 {icon:'🧭',name:'张弓三层分析法',mode:'zhanggong',q:'讲解张弓文段三层分析法（背景层/论点层/展开层）和中心理解七大关系'}, {icon:'📝',name:'逻辑填空三步法',mode:'zhanggong',q:'讲解张弓逻辑填空三步法和近70%靠语境锁答案的原理'}, {icon:'🕳️',name:'张弓陷阱六类',mode:'zhanggong',q:'讲解张弓命题陷阱六类（偷换概念/以偏概全/无中生有/因果倒置/时态/程度错位）'}, {icon:'🔢',name:'整除秒杀',mode:'shuliang',q:'讲解数量关系整除/奇偶/倍数联动和不定方程五大技法'}, {icon:'🎯',name:'行程工程',mode:'shuliang',q:'讲解行程问题(多次相遇/流水/牛吃草)和工程问题秒杀技法'}, {icon:'🎲',name:'排列概率',mode:'shuliang',q:'讲解排列组合概率(捆绑/插空/隔板/错位/环形/独立重复)口诀'}, {icon:'⚖️',name:'容斥最值',mode:'shuliang',q:'讲解容斥公式和鸽巢原理/和定最值/均值不等式最值'},
 {icon:'🔗',name:'类比三步定位',mode:'leibi',q:'讲解类比推理三步定位法（看词数→判关系→比强弱）和关系判定矩阵'}, {icon:'⚖️',name:'类比二级辨析',mode:'leibi',q:'讲解类比推理二级辨析五维度，举几个易混关系真题'}, {icon:'📋',name:'定义四步破题',mode:'dingyi',q:'讲解定义判断四步破题法和五要件（主客方目果）记忆法'}, {icon:'🕳️',name:'定义十大陷阱',mode:'dingyi',q:'讲解定义判断十大高频陷阱和命题人选项三母版'}, {icon:'📖',name:'三师片段阅读',mode:'yanyu',q:'讲片段阅读三师四步法（结构/逻辑/关键词/三比）'}, {icon:'✏️',name:'逻辑填空三步',mode:'yanyu',q:'讲逻辑填空三师三步法（语境还原/逻辑关联/词语辨析）'}, {icon:'🔷',name:'图推6眼法',mode:'tutu',q:'讲解刘义恒6眼破题法和特征信号表'}, {icon:'📈',name:'资料公式',mode:'ziliao',q:'列资料分析核心公式（基期/增长率/比重/平均数）'}, {icon:'💯',name:'速算百化分',mode:'ziliao',q:'讲解百化分速算和常见百分数对应'}, {icon:'🔢',name:'数量金字塔',mode:'shuliang',q:'讲数量关系四层金字塔和必拿分题型'},
 {icon:'🏛️',name:'政治·新思想',mode:'zhengzhi',q:'讲解习近平新时代中国特色社会主义思想总论和五大新发展理念口诀'}, {icon:'🛡️',name:'政治·马原',mode:'zhengzhi',q:'讲解马克思主义哲学基本问题、物质与意识、唯物辩证法考点和易混点'}, {icon:'📜',name:'政治·五位一体',mode:'zhengzhi',q:'讲解五位一体(经济政治文化社会生态)和四个全面核心考点'}, {icon:'🌍',name:'常识蒙题',mode:'changshi',q:'讲解常识判断蒙题技巧和绝对化词排除、积累框架'}, {icon:'🧠',name:'常识考点',mode:'changshi',q:'讲常识判断常见考点(时政/法律/科技/人文/地理/经济)答题要点'},
]
// 按板块分组
const groups=[
 {title:'🧠 判断推理',emoji:'🧠',modes:['luoji','leibi','dingyi','tutu']},
 {title:'📖 言语理解',emoji:'📖',modes:['zhanggong','yanyu']},
 {title:'📈 资料分析 / 数量',emoji:'📈',modes:['ziliao','shuliang']},
 {title:'🏛️ 政治 / 常识',emoji:'🏛️',modes:['zhengzhi','changshi']},
]
const byGroup=(modes)=>cards.filter(c=>modes.includes(c.mode))
function ask(c){ store.mode=c.mode; store.tab='chat'; setTimeout(()=>window.dispatchEvent(new CustomEvent('xc-ask',{detail:c.q})),50) }
</script>
<template>
<div class="page on"><div class="page-inner">
<div class="sec-t">📚 方法速查（点击即可提问）</div>
<div v-for="g in groups" :key="g.title" class="kb-group">
  <div class="kg-title">{{ g.title }}</div>
  <div class="kc-grid">
    <div class="kc" v-for="c in byGroup(g.modes)" :key="c.name" @click="ask(c)">
      <div class="kc-i">{{ c.icon }}</div><div class="kc-n">{{ c.name }}</div><div class="kc-s">{{ MODE_NAMES[c.mode] }}</div>
    </div>
  </div>
</div>
</div></div>
</template>