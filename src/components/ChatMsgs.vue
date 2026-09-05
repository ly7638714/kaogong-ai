<script setup>
/* eslint-disable no-unused-vars */
// v3.8.195 6B·ChatPage 拆分：消息列表渲染区子组件
import { toRefs } from 'vue'
const props = defineProps({ ctx: { type: Object, required: true } })
defineEmits(['export-review'])
const {
  ref,
  msgsBox,
  sumMsgsScroll,
  scroll,
  store,
  live,
  dStat,
  quickCards,
  askQuick,
  recentQs,
  useRecent,
  motto,
  hlIdx,
  md,
  viewImg,
  text,
  resendMsg,
  copyMsg,
  capMsg,
  fixPlate,
  BK_OPTIONS,
  applyPlate,
  quizPlate,
  mdC,
  quizHasSvg,
  pickQuiz,
  quizFullShow,
  quizDeep,
  capQuizShot,
  quizExplainNow,
  quizScrollTo,
  quizWrongAdd,
  quizWrongIgnore,
  saveQuizWrong,
  variantMenu,
  showVariantExplain,
  followUp,
  focusInput,
  doVariant,
  stepTagText,
  mdCached,
  textOf,
  toggleExpand,
  isLong,
  expanded,
  figZoom,
  figSave,
  retryFigEnhance,
  retryLast,
  figCfg,
  prevHasImg,
  saveWrong,
  sameTypeAgain,
  collectMsg,
  toggleFb,
  toggleSpeak,
  atBottom,
  blStyle,
  onBlDown
} = toRefs(props.ctx)
</script>

<template>
      <div id="msgs" ref="msgsBox" class="msgs" style="flex: 1; overflow-y: auto" @scroll="sumMsgsScroll">
        <div v-if="!store.msgs.length && !live" class="hero">
          <div class="hero-badge">六大板块 · 名师方法论 · 命题人视角</div>
          <h2><span>行测智能助教</span></h2>
          <p>文字题走 DeepSeek · 图表公式走视觉模型 · 给你名师级的做题思路与错题复盘</p>
          <div class="hero-stats">
            <div class="hs">
              <div class="hs-n">{{ dStat.q }}</div>
              <div class="hs-l">累计提问</div>
            </div>
            <div class="hs">
              <div class="hs-n">{{ dStat.w }}</div>
              <div class="hs-l">已收错题</div>
            </div>
            <div class="hs">
              <div class="hs-n g">{{ dStat.r }}</div>
              <div class="hs-l">已复盘</div>
            </div>
          </div>
          <div class="hero-grid">
            <div v-for="c in quickCards" :key="c.t" class="hero-card" @click="askQuick(c)">
              <div :class="'hero-ic b-' + c.bg">{{ c.ic }}</div>
              <div>
                <div class="hero-t">{{ c.t }}</div>
                <div class="hero-s">{{ c.s }}</div>
              </div>
            </div>
          </div>
          <div v-if="recentQs.length" class="hero-recents">
            <div class="hr-t">🕘 最近提问</div>
            <div class="hr-list">
              <button v-for="(rq, ri) in recentQs" :key="ri" class="hr-chip" @click="useRecent(rq)">{{ rq.slice(0, 26) }}</button>
            </div>
          </div>
          <div class="hero-motto">💡 {{ motto }}</div>
        </div>
        <template v-for="(m, i) in store.msgs" :key="m.id">
          <div class="msg" :class="[m.role === 'user' ? 'me' : 'ai', { hl: i === hlIdx }]" :data-i="i">
            <div v-if="m.role === 'user'">
              <template v-if="typeof m.content === 'string'"><div v-html="md(m.content)"></div>
</template>
              <template v-else>
                <div class="msg-imgs">
                  <template v-for="(im, j) in m.content.imgs" :key="j">
                    <img v-if="im" class="msg-img" :src="im" @click="viewImg(im)" />
                  </template>
                </div>
                <div v-html="md(m.content.text)"></div>
</template>
              <div class="msg-actions me-actions">
                <button @click="resendMsg(i)">↻ 重发</button>
                <button @click="copyMsg($event)">📋 复制</button>
              </div>
            </div>
            <template v-else>
              <div class="ans-tag">
                <span v-if="m.bk" class="at-plate" style="cursor:pointer" title="点击修正板块归属（同时修正统计）" @click.stop="fixPlate(m, $event)">📐 {{ m.bk }} ✏️</span>
                <div v-if="m.bkEditing" class="bk-fix" style="position:absolute;z-index:30;background:var(--card);border:1px solid rgba(255,255,255,.15);border-radius:10px;padding:8px;display:flex;gap:6px;flex-wrap:wrap;max-width:320px">
                  <button v-for="bp in BK_OPTIONS" :key="'bk' + bp" class="fp-b" :class="{ on: m.bk === bp }" style="padding:2px 8px;font-size:12px" @click.stop="applyPlate(m, bp)">{{ bp }}</button>
                </div>
                <span class="at-mark">✍️ AI 批改</span>
                <span v-if="m.answerTime" class="at-time">{{ m.answerTime }}</span>
              </div>
              <template v-if="m.quiz">
                <div v-if="quizPlate(m)" class="quiz-hd">
                  <span class="quiz-plate">📐 {{ quizPlate(m) }}</span>
                  <span v-if="m.quiz.needAi" class="quiz-tag">先选后判</span>
                  <span v-if="m.orgCard" class="quiz-tag src">截图整理</span>
                </div>
                <div class="quiz-stem" v-html="mdC(m.quiz.stem)"></div>
                <div class="quiz-opts" :class="{ 'has-svg': quizHasSvg(m) }">
                  <button
                    v-for="o in m.quiz.options"
                    :key="o.k"
                    class="quiz-opt"
                    :class="{
                      picked: m.quiz.picked === o.k,
                      right: m.quiz.picked && o.k === m.quiz.answer,
                      wrong: m.quiz.picked && o.k === m.quiz.picked && o.k !== m.quiz.answer
                    }"
                    :disabled="!!m.quiz.picked"
                    @click="pickQuiz(m, o.k)"
                  >
                    <span class="qk">{{ o.k }}</span><span class="qt" v-html="mdC(o.t)"></span>
                  </button>
                </div>
                <div v-if="!m.quiz.picked" class="quiz-guide">
                  <span class="qg-t">🧩 直接点选项作答，选完自动判题+解析</span>
                  <button class="btn btn-gh" @click="quizFullShow(m)">⛶ 全屏做题</button>
                  <button class="btn btn-gh" @click="quizDeep(m)">💬 发到对话深挖</button>
                  <button class="btn btn-gh" @click="capQuizShot(m, 'q')">📸 题目截图</button>
                </div>
                <div v-if="m.orgCard && !m.quiz.picked" class="quiz-org-acts">
                  <button class="btn btn-pri" @click="quizExplainNow(m)">📖 直接讲解</button>
                  <button class="btn btn-gh" @click="quizScrollTo(m)">✍️ 先做一遍</button>
                </div>
                <div v-if="m.quiz.picked" class="quiz-result" :class="m.quiz.checking ? 'pending' : (m.quiz.correct ? 'ok' : 'no')">
                  <template v-if="m.quiz.checking">⏳ AI 判题中…</template>
                  <template v-else-if="m.quiz.correct === null">已提交，等待 AI 判题…</template>
                  <template v-else>{{ m.quiz.correct ? '✅ 回答正确！' : (m.quiz.answer ? '❌ 回答错误，正确答案是 ' + m.quiz.answer : '❌ 回答错误（待人工核对）') }} <span v-if="m.quiz.aiChecked" class="quiz-ai-badge">🤖 已按解析核验</span><span v-else-if="m.quiz.checkFailed" class="quiz-ai-badge warn">⚠️ 未取回答案</span></template>
                </div>
                <div v-if="m.quiz.picked && m.quiz.correct === false && !m.quiz.checking && !m.quiz.wrongPrompted" class="quiz-wrong-bar">
                  <span class="qw-t">📌 这道题做错了，加入错题集？</span>
                  <button class="btn btn-pri qw-yes" @click="quizWrongAdd(m)">加入</button>
                  <button class="btn btn-gh" @click="quizWrongIgnore(m)">忽略</button>
                </div>
                <div v-if="m.quiz.picked && m.quiz.explain && !m.quiz.checking" class="quiz-explain" v-html="mdC(m.quiz.explain)"></div>
                <div v-if="m.quiz.picked && !m.quiz.checking" class="quiz-acts">
                  <button class="btn btn-gh" @click="quizDeep(m)">💬 发到对话深挖</button>
                  <button class="btn btn-gh" @click="saveQuizWrong(m)">📌 存错题本</button>
                  <button class="btn btn-gh" @click="quizFullShow(m)">⛶ 全屏做题</button>
                  <button class="btn btn-gh" @click="capQuizShot(m, 'e')">📸 解析截图</button>
                </div>
                <div v-if="m.quiz.picked && !m.quiz.checking" class="quiz-followup">
                  <span class="qf-t">🤔 答对还想巩固？要不要再来一道变式、看解析，或换个角度聊聊？</span>
                  <button class="qf-b" @click="variantMenu = (variantMenu === m ? null : m)">🔁 再出变式</button>
                  <button class="qf-b" @click="showVariantExplain(m)">📖 看解析</button>
                  <button class="qf-b" @click="followUp(m)">💬 继续追问</button>
                  <button class="qf-b" @click="focusInput()">❓ 其他问题</button>
                  <template v-if="variantMenu === m">
                    <button class="qf-d" @click="doVariant(m, 'easy')">简单</button>
                    <button class="qf-d" @click="doVariant(m, 'mid')">中等</button>
                    <button class="qf-d" @click="doVariant(m, 'hard')">困难</button>
                  </template>
                </div>
              </template>
              <div v-else>
                <span v-if="stepTagText(m)" class="step-tag" style="display:inline-block;font-size:11px;color:var(--accent,#22d3ee);border:1px dashed var(--accent,#22d3ee);padding:0 8px;border-radius:10px;margin:2px 0 4px">{{ stepTagText(m) }}</span>
          <div v-html="mdCached(m, i)"></div>
                <button v-if="isLong(textOf(m))" class="fold-btn" @click="toggleExpand(i)">
                  {{ expanded[i] ? '🔼 收起全文' : '🔽 展开全文（' + textOf(m).length + ' 字）' }}
                </button>
                <div v-if="m.figBusy" class="fig-busy"><span class="fig-spin"></span>🖼 图形增强：正在用独立模型把截图复刻成图…</div>
                <div v-if="m.fig && m.fig.ok" class="fig-card">
                  <div class="fig-hd">
                    <span>🖼 AI 图形复刻 · {{ m.fig.type }}</span>
                    <div style="display:flex;gap:6px;align-items:center">
                    <button class="btn btn-gh" @click="figZoom(m.fig)">⛶ 放大</button>
                    <button class="btn btn-gh" @click="figSave(m.fig)">💾 保存</button>
                    <button class="btn btn-gh" title="收起这张复刻图" @click="m.figHide = !m.figHide">{{ m.figHide ? '🔽 展开' : '🔼 收起' }}</button>
                  </div>
                  </div>
                  <div v-show="!m.figHide" class="fig-svg" @click="figZoom(m.fig)" v-html="m.fig.svg"></div>
                  <div v-if="m.fig.summary" class="fig-summary">📝 {{ m.fig.summary }}</div>
                  <div v-if="m.fig.rule" class="fig-rule">📐 规律：{{ m.fig.rule }}</div>
                  <div v-if="m.fig.tips" class="fig-tips">💡 {{ m.fig.tips }}</div>
                </div>
                <div v-if="m.fig && m.fig.ok === false" class="fig-fail">
                  <div>🖼 图形增强未生成图像（不影响本题解答）——可能该截图无需画图，或模型未返回有效图形。{{ m.fig.err ? '（' + m.fig.err + '）' : '' }}</div>
                  <button class="btn btn-gh" :disabled="m.figBusy" @click="retryFigEnhance(m)">🔄 重试复刻</button>
                </div>
              </div>
              <div class="msg-actions">
                <button v-if="m.err" class="retry-btn" @click="retryLast()">↻ 重试</button>
                <button v-if="!m.err && prevHasImg(m) && figCfg()" :disabled="m.figBusy" :title="'用独立模型把题目截图复刻成图'" @click="retryFigEnhance(m)">🖼 {{ m.fig && m.fig.ok ? '重绘' : '图形增强' }}</button>
                <button v-if="!m.err" @click="saveWrong(m)">📌 存错题</button>
<button v-if="m._vt" @click="sameTypeAgain(m)">🔁 同型再练</button>
                <button v-if="!m.err" @click="variantMenu = (variantMenu === m ? null : m)">🔁 变式题</button>
                <template v-if="variantMenu === m">
                  <button class="vt-diff" @click="doVariant(m, 'easy')">简单</button>
                  <button class="vt-diff" @click="doVariant(m, 'mid')">中等</button>
                  <button class="vt-diff" @click="doVariant(m, 'hard')">困难</button>
                </template>
                <button v-if="!m.err" @click="$emit('export-review')">📄 复盘</button>
                <button title="基于这条回复继续追问" @click="followUp(m)">💬 追问</button>
                <button title="收藏到我的笔记" @click="collectMsg(m)">📌 收藏</button>
                <button :class="{ 'fb-on': m.fb === 1 }" title="这条回复对你有用" @click="toggleFb(m, 1)">👍</button>
                <button :class="{ 'fb-on': m.fb === -1 }" title="这条回复需改进" @click="toggleFb(m, -1)">👎</button>
                <button @click="copyMsg($event)">📋 复制</button>
                <button @click="toggleSpeak($event)">🔊 朗读</button>
                <button title="把这条 AI 回复整屏截成高清图：发给同学/群里看（无需对方装本项目）" @click="capMsg(m, i)">📸 截图分享</button>
              </div>
</template>
          </div>
</template>
        <div v-if="live" class="msg ai live-cursor">
          <div v-if="live.think" class="think-box" :class="{ open: live.thinkOpen }">
            <div class="tb-head" @click="live.thinkOpen = !live.thinkOpen">
              💭 {{ live.thinkOpen ? '正在思考…（实时推理）' : '思考过程（点击展开）' }}
            </div>
            <div class="tb-body">{{ live.think }}</div>
          </div>
          <template v-if="live.text">
            <div v-html="md(live.text)"></div>
            <span class="type-cursor" aria-hidden="true"></span>
</template>
          <div v-else class="ai-skels">
            <div class="skel-typing"><span class="skel-dot"></span><span class="skel-dot"></span><span class="skel-dot"></span> 正在回复…</div>
            <span class="skel" style="width: 70%; height: 14px"></span>
            <span class="skel" style="width: 88%; height: 14px"></span>
            <span class="skel" style="width: 55%; height: 14px"></span>
          </div>
        </div>
        <!-- 回到最新：全局悬浮按钮（Teleport 到 body，脱离滚动容器），点击回最新、可拖到页面任意位置并记忆 -->
        <Teleport to="body">
          <button v-if="store.tab === 'chat'" v-show="!atBottom" class="back-latest" :style="blStyle" @pointerdown="onBlDown">▼ 回到最新</button>
        </Teleport>
      </div>
</template>
