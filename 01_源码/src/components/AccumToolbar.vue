<script setup>
/* eslint-disable no-unused-vars */
// v3.8.191 6B·FloatPanel 拆分：分类/搜索/筛选/更多功能/说明条/首次引导 工具区子组件
import { toRefs } from 'vue'
const props = defineProps({ ctx: { type: Object, required: true } })
const {
  cat,
  switchCat,
  dueOfCat,
  kw,
  searchPick,
  searchPh,
  fCat,
  setCatFilter,
  curCats,
  curRegion,
  setRegion,
  moreShow,
  queryTerm,
  onlineQuery,
  quiz,
  aiCardBusy,
  genBusy,
  genBatch,
  exportKb,
  isLex,
  srcTipOff,
  srcStats,
  catTotal,
  dismissSrcTip,
  lexGuide,
  closeLexGuide,
  tryYihun
} = toRefs(props.ctx)
</script>

<template>
    <div class="fp-cat">
      <button class="fp-c" :class="{ on: cat === '常识' }" @click="switchCat('常识')">常识<span v-if="dueOfCat('常识')" class="fc-badge">{{ dueOfCat('常识') }}</span></button>
      <button class="fp-c" :class="{ on: cat === '时政' }" @click="switchCat('时政')">时政·政治<span v-if="dueOfCat('时政')" class="fc-badge">{{ dueOfCat('时政') }}</span></button>
      <button class="fp-c" :class="{ on: cat === '成语' }" @click="switchCat('成语')">成语<span v-if="dueOfCat('成语')" class="fc-badge">{{ dueOfCat('成语') }}</span></button>
      <button class="fp-c" :class="{ on: cat === '实词' }" @click="switchCat('实词')">实词<span v-if="dueOfCat('实词')" class="fc-badge">{{ dueOfCat('实词') }}</span></button>
    </div>
    <!-- 搜索 + 领域/类型筛选 -->
    <div class="fp-search">
      <input v-model="kw" :placeholder="searchPh" @keydown.enter="searchPick()" />
      <button class="fp-b" @click="searchPick()">搜索</button>
    </div>
    <div class="fp-reg cats">
      <button class="fp-c s" :class="{ on: fCat === '全部' }" @click="setCatFilter('全部')">全部</button>
      <button v-for="ct in curCats" :key="ct" class="fp-c s" :class="{ on: fCat === ct }" @click="setCatFilter(ct)">{{ ct }}</button>
    </div>
    <div v-if="cat === '时政'" class="fp-reg">
      <button class="fp-c s" :class="{ on: curRegion === '全部' }" @click="setRegion('全部')">全部</button>
      <button class="fp-c s" :class="{ on: curRegion === '国内' }" @click="setRegion('国内')">国内</button>
      <button class="fp-c s" :class="{ on: curRegion === '贵州' }" @click="setRegion('贵州')">贵州·地方</button>
    </div>
    <!-- 更多功能（折叠收纳：联网查 / AI扩库 / 导出） -->
    <div class="fp-more">
      <button class="fp-more-btn" @click="moreShow = !moreShow">{{ moreShow ? '🔼 收起' : '🧰 更多功能' }}</button>
      <div v-if="moreShow" class="fp-more-body">
        <div class="fp-query">
          <input v-model="queryTerm" placeholder="输入任意 常识/时政/成语/实词，联网查 + AI 整理…" @keydown.enter="onlineQuery()" />
          <button class="fp-b quiz" :disabled="aiCardBusy" @click="onlineQuery()">{{ aiCardBusy ? '查询中…' : '📡 联网查' }}</button>
        </div>
        <div class="fp-gen"><button class="fp-b quiz" :disabled="genBusy" @click="genBatch()">{{ genBusy ? '生成中…' : '🤖 生成 10 条扩库' }}</button><span class="fp-gen-tip">AI 批量生成该板块新知识点加入记忆库</span></div>
        <div class="fp-gen"><button class="fp-b gold" @click="exportKb()">📤 导出积累</button><span class="fp-gen-tip">导出我的记忆库（Word/PDF/Markdown）</span></div>
      </div>
    </div>
    <!-- 词条来源说明条（常驻，可关闭；讲清雨菲800词 / 半月谈 角标含义） -->
    <div v-if="isLex && !srcTipOff" class="fp-srctip">
      <span>📚 词条来源：<b class="st-b yf">🟣 雨菲800词</b> 与 <b class="st-b bt">🟠 半月谈</b> 已并入易混词辨析；带角标的即来自对应词库。<template v-if="srcStats">（本类共 {{ catTotal }} 条：内置 {{ srcStats.内置 }} · 雨菲 {{ srcStats['雨菲800词'] }} · 半月谈 {{ srcStats['半月谈'] }}）</template></span>
      <button class="st-x" @click="dismissSrcTip()">✕</button>
    </div>
    <!-- 首次进入引导（一次性，切到成语/实词才出现；教用户怎么用易混辨析） -->
    <div v-if="isLex && lexGuide" class="fp-lexguide">
      <div class="lg-card">
        <div class="lg-h">🎓 易混词辨析 · 新词库上线</div>
        <p>本次为你接入两大词库，已自动并入「易混」分类：</p>
        <ul>
          <li><b class="st-b yf">🟣 雨菲800词</b>：公考高频实词/成语主书（原《雨菲言语·27言语带背800词》），高频常考词。</li>
          <li><b class="st-b bt">🟠 半月谈</b>：易混词专项（原《言语理解易混词B5》），带双向辨析，专攻克易混点。</li>
        </ul>
        <p class="lg-how">👉 用法：点下方 <b>「📖 详解/辨析」</b> 看 <b>逻辑填空用法</b>（含易混对象）；切到 <b>「易混」</b> 分类可集中刷易混对。</p>
        <div class="lg-btns">
          <button class="btn btn-gh" @click="closeLexGuide()">稍后看</button>
          <button class="btn btn-pri" @click="tryYihun()">⚡ 一键去刷易混词</button>
        </div>
      </div>
    </div>
</template>
