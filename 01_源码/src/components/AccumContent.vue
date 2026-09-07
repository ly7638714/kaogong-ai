<script setup>
/* eslint-disable no-unused-vars */
// v3.8.191 6B·FloatPanel 拆分子组件：AccumContent（ctx 注入，行为与原先一致）
import { toRefs } from 'vue'
const props = defineProps({ ctx: { type: Object, required: true } })
const {
  quiz,
  quizBatch,
  next,
  reviewMode,
  dueCount,
  cur,
  curDetail,
  cat,
  srs,
  remember,
  favorite,
  openDetail,
  openVerify,
  quizBusyB,
  startQuiz,
  quizBusy,
  askQuiz,
  picked,
  mark,
  choose,
  seeExplain,
  pick,
  qbPick,
  qbNext,
  qbScore,
  qbSaveWrong
} = toRefs(props.ctx)
</script>

<template>
    <!-- 正文 -->
    <template v-if="!quiz && !quizBatch">
      <div v-if="reviewMode" class="fp-modebar">🔁 复习模式 · 本分类到期 {{ dueCount }} 条<button class="fp-modebar-x" @click="reviewMode = false; next()">退出</button></div>
      <div class="fp-body">{{ cur }}<span v-if="curDetail && curDetail.src" class="src-badge" :class="curDetail.src === '雨菲800词' ? 'yf' : 'bt'">{{ curDetail.src === '雨菲800词' ? '🟣 雨菲800词' : '🟠 半月谈' }}</span></div>
      <div v-if="(cat === '成语' || cat === '实词') && curDetail" class="fp-body sub">{{ curDetail.yishi }}</div>
      <div class="fp-foot srs-foot">
        <button class="fp-b ok big" @click="remember(true)">✅ 记住了</button>
        <button class="fp-b no big" @click="remember(false)">❌ 没记住</button>
        <span class="fp-srs-tip">艾宾浩斯 1/2/4/7/15/30 天</span>
      </div>
      <div class="fp-foot">
        <button class="fp-b" @click="next()">🎲 换一条</button>
        <button class="fp-b" :class="{ on: reviewMode }" @click="reviewMode = !reviewMode; next()">🔁 复习<span v-if="dueCount"> {{ dueCount }}</span></button>
        <button class="fp-b gold" @click="favorite()">⭐ 收藏</button>
        <button v-if="cat === '成语' || cat === '实词'" class="fp-b quiz" @click="openDetail()">📖 详解</button>
        <button v-if="cat === '常识' || cat === '时政'" class="fp-b quiz" @click="openVerify()">🔍 核实</button>
      </div>
      <div v-if="cat === '常识'" class="fp-foot">
        <button class="fp-b quiz" :disabled="quizBusyB" @click="startQuiz()">{{ quizBusyB ? '生成中…' : '📝 常识速测' }}</button>
        <button class="fp-b quiz" :disabled="quizBusy" @click="askQuiz('quiz')">
          {{ quizBusy ? '出题中…' : '✏️ 出题考我' }}
        </button>
        <button class="fp-b gold" :disabled="quizBusy" @click="askQuiz('explain')">📖 名师详解</button>
      </div>
</template>
    <!-- 答题面板 -->
    <div v-else-if="quiz" class="fp-quiz">
      <div class="q-hd">
        ❓ {{ quiz.q }}
        <span v-if="quiz.考点" class="q-kd">考点：{{ quiz.考点 }}</span>
      </div>
      <div class="q-opts">
        <button
          v-for="(o, i) in quiz.opts"
          :key="i"
          class="q-o"
          :class="{
            on: picked === String.fromCharCode(65 + i),
            right: mark != null && i === quiz.ans && picked === String.fromCharCode(65 + i),
            wrong: mark != null && picked === String.fromCharCode(65 + i) && i !== quiz.ans
          }"
          @click="choose(i)"
        >
          {{ o }}
        </button>
      </div>
      <div v-if="mark != null" class="q-mark" :class="mark ? 'ok' : 'no'">
        {{ mark ? '✅ 回答正确' : '❌ 回答错误（已存入错题集）' }}
      </div>
      <div class="fp-foot">
        <button
          class="fp-b"
          @click="quiz = null; mark = null; picked = ''"
        >
          关闭
        </button>
        <button
          class="fp-b"
          @click="seeExplain = ''; askQuiz('explain')"
        >
          📖 看讲解
        </button>
      </div>
    </div>
    <!-- 常识速测 -->
    <div v-if="quizBatch && !quizBatch.done" class="fp-batch">
      <div class="q-hd">❓ {{ quizBatch.cur + 1 }}/{{ quizBatch.qs.length }} · {{ quizBatch.qs[quizBatch.cur].stem }}</div>
      <div class="q-opts">
        <button
          v-for="o in quizBatch.qs[quizBatch.cur].options"
          :key="o.k"
          class="q-o"
          :class="{
            on: quizBatch.marks[quizBatch.cur] && quizBatch.marks[quizBatch.cur].pick === o.k,
            right: quizBatch.marks[quizBatch.cur] && o.k === quizBatch.qs[quizBatch.cur].answer,
            wrong: quizBatch.marks[quizBatch.cur] && quizBatch.marks[quizBatch.cur].pick === o.k && o.k !== quizBatch.qs[quizBatch.cur].answer
          }"
          :disabled="quizBatch.marks[quizBatch.cur] != null"
          @click="qbPick(o.k)"
        >{{ o.k }}. {{ o.t }}</button>
      </div>
      <div v-if="quizBatch.marks[quizBatch.cur]" class="q-mark" :class="quizBatch.marks[quizBatch.cur].ok ? 'ok' : 'no'">
        {{ quizBatch.marks[quizBatch.cur].ok ? '✅ 正确' : '❌ 错误，答案 ' + quizBatch.qs[quizBatch.cur].answer }}
        <span v-if="quizBatch.qs[quizBatch.cur].analysis" class="qb-an">· {{ quizBatch.qs[quizBatch.cur].analysis }}</span>
      </div>
      <div class="fp-foot">
        <button class="fp-b" @click="quizBatch = null">退出</button>
        <button v-if="quizBatch.marks[quizBatch.cur]" class="fp-b" @click="qbNext()">
          {{ quizBatch.cur + 1 >= quizBatch.qs.length ? '交卷 📄' : '下一题 ▶' }}
        </button>
      </div>
    </div>
    <div v-if="quizBatch && quizBatch.done" class="fp-batch done">
      <div class="q-hd">📄 常识速测成绩</div>
      <div class="qb-score">{{ qbScore() }} / {{ quizBatch.qs.length }}</div>
      <div class="qb-rate">{{ Math.round((qbScore() / quizBatch.qs.length) * 100) }}%</div>
      <div class="pnl-btns">
        <button class="btn btn-gh" @click="qbSaveWrong()">📌 错题入库</button>
        <button class="btn btn-gh" @click="quizBatch = null">再来一组</button>
        <button class="btn btn-pri" @click="quizBatch = null">完成</button>
      </div>
    </div>
</template>
