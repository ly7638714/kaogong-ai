<script setup>
// R4：错题模块子组件（从 WrongPage.vue 对应模板逐字搬入）
// 父组件通过 ctx 注入全部依赖；模板保持与 WrongPage 完全一致，仅把状态/方法从 ctx 暴露到本组件作用域。
import { toRefs, computed, ref } from 'vue'
import { richMd, snippet } from '../utils/wrongText' // 错题渲染净化
import { downloadMdScreenshot, downloadLiveScreenshot } from '../utils/capture'
import { retrieveCardsV2 } from '../kb/retrieveV2' // R5 关联知识卡（只读 kb）
import { markLearned } from '../utils/learned'
import { loadSrs, saveSrs, enqueueNew, ymdKey } from '../utils/memorySrs' // R5 二期：一键入记忆
import { showToast } from '../utils/toast' // R5 标记已学

const props = defineProps({ ctx: { type: Object, required: true } })

const {
  aiBusy,
  aiGuideBusy,
  aiPolishBusy,
  boxReasons,
  checkedAllReasons,
  coreAiBusy,
  coreAiText,
  coreCard,
  coreOrigMd,
  cur,
  customReason,
  frm,
  guideText,
  imgView,
  origStem,
  paperView,
  presetBoxOpen,
  presetReasons,
  reasonBoxOpen,
  relatedQs,
  rep,
  reviewGaps,
  show,
  vtAllWrong,
  vtAnswers,
  vtBusy,
  vtCmpBusy,
  vtCmpText,
  vtCount,
  vtIdx,
  vtMax,
  vtMode,
  vtOpen,
  vtPick,
  vtQ,
  vtQueue,
  vtScore,
  vtShow
} = toRefs(props.ctx)

// R5：按本题考点检索关联方法卡（≤3），可在详情内展开 / 标记已学 / 跳知识库
const kbOpen = ref(false)
const kbCards = computed(() => {
  try {
    const q = cur.value >= 0 && store && store.wqs ? store.wqs[cur.value] : null
    if (!q) return []
    return retrieveCardsV2(String(q.subject || q.plate || ''), String(q.question || q.q || q.stem || ''), 3)
  } catch (e) { return [] }
})
function memorizeRule() {
  const q = cur.value >= 0 && store && store.wqs ? store.wqs[cur.value] : null
  if (!q) return
  const txt = String(q.method || q.note || '').trim()
  if (!txt) { try { showToast('请先填写「秒杀规律」或「笔记」再记', 'info') } catch (e) {} return }
  try {
    const srs = loadSrs()
    const title = txt.replace(/\s+/g, ' ').slice(0, 60)
    enqueueNew(srs, '我的错题', title, ymdKey())
    saveSrs(srs)
    showToast('🧠 已加入记忆复习（今天到期，今日复习中枢可见）', 'success')
  } catch (e) {}
}
function openKbCard(id) {
  if (id) { try { markLearned(id) } catch (e) {} }
  window.dispatchEvent(new CustomEvent('xc-open-kb-card', { detail: id }))
}

const {
  addCustomReason,
  aiPolishReason,
  ankiPush,
  askAiGuide,
  askAiReasons,
  askCoreDeep,
  closeImg,
  copyObsidianWrong,
  del,
  downloadImg,
  gotoChat,
  openRecall,
  openRedo,
  wrongSubOf,
  repairFig,
  openRelated,
  openRename,
  removeReason,
  save,
  startVariant,
  store,
  toggleReason,
  viewImg,
  vtAddWrong,
  vtChoose,
  vtClose,
  vtDeepCompare,
  vtGo,
  vtNav,
  vtResultOf,
  vtStartDo,
  vtSubmit,
  vtToggleOpen
} = props.ctx

// 错题详情：完整题目 / 完整解析 截图导出
// 图推错题若入库时图形缺失（仅占位符）→ 提示一键本地重建
const missingFig = computed(() => {
  const q = store.wqs && store.wqs[cur.value]
  if (!q) return false
  if (String(q.subject || '') !== '图形推理') return false
  const txt = String(q.question || q.q || q.stem || '')
  return !/<svg|```svg|\[ECHARTS\]|<img|!\[/.test(txt)
})
async function capWrongQuestion() {
  const wq = store.wqs[cur.value]
  if (!wq) return
  // v3.8.170 优先所见即所得：截取详情页真实渲染的题目节点（题干/图形/选项完整、主题一致）
  const live = document.querySelector('.ov.show .paper-q')
  const title = '行测 · 错题原题'
  const sub = (wq.subject || '未分类') + (wq.time ? ' · ' + wq.time : '')
  const name = '错题原题_' + (cur.value + 1)
  if (live) {
    try { const ok = await downloadLiveScreenshot(live, { title, sub, name }); if (ok) return } catch (e) {}
  }
  // 回退：按完整原文渲染导出（材料题组解析不出选项时用 raw 全文）
  const opts = (paperView.value.opts || []).map((o) => o.k + '. ' + o.t).join('\n\n')
  const hasOpts = (paperView.value.opts || []).length
  const srcMd = hasOpts ? (paperView.value.stem || wq.question || '') : String(wq.question || wq.q || wq.stem || '')
  const md = srcMd + (opts ? '\n\n' + opts : '')
  downloadMdScreenshot({ title, sub, md, name })
}
function capWrongExplain() {
  const wq = store.wqs[cur.value]
  if (!wq) return
  const parts = []
  if (wq.your) parts.push('**我的答案：**' + wq.your)
  if (wq.answer) parts.push('**正确答案：**' + wq.answer)
  const ana = wq.explain || wq.analysis || ''
  if (ana) parts.push(ana)
  if (wq.reasons && wq.reasons.length) parts.push('**错因：**' + wq.reasons.join('、'))
  if (wq.method) parts.push('**秒杀：**' + wq.method)
  if (wq.note) parts.push('**笔记/思路：**' + wq.note)
  downloadMdScreenshot({
    title: '行测 · 错题解析',
    sub: (wq.subject || '未分类') + (wq.time ? ' · ' + wq.time : ''),
    md: parts.join('\n\n') || '（本题暂无解析，可在复盘里补充后重新导出）',
    name: '错题解析_' + (cur.value + 1)
  })
}
</script>

<template>
    <div class="ov" :class="{ show }" @click.self="show = false">
      <div class="pnl">
        <h3>📋 错题详情</h3>
        <template v-if="cur >= 0 && store.wqs[cur]">
          <div class="pnl-sub">
            {{ wrongSubOf(store.wqs[cur]) || '未分类' }}
            <span class="wq-goto" @click.self.stop="gotoChat()">↩ 查看原对话</span>
            <span class="wq-goto" title="以答题界面（可作答+即时判题）重做本题" @click.self.stop="openRedo()">✍️ 答题界面重做</span>
            <span class="wq-goto" title="主动回忆复盘：先默写考点/思路再展开解析（计入二刷统计）" @click.self.stop="openRecall(store.wqs[cur])">🧠 主动回忆</span>
            <span class="wq-goto" @click.self.stop="copyObsidianWrong(store.wqs[cur])">📋 复制 Obsidian</span>
            <span class="wq-goto" @click.self.stop="ankiPush()">🃏 推到 Anki</span>
          </div>
          <!-- 原题截图 -->
          <div v-if="(store.wqs[cur].imgs || []).length" class="wq-imgs">
            <img
              v-for="(im, j) in store.wqs[cur].imgs"
              :key="j"
              class="wq-img"
              :src="im"
              alt="原题截图"
              @click="viewImg(im)"
            />
          </div>
                    <div v-if="missingFig" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;background:rgba(255,180,0,.12);border:1px solid rgba(255,180,0,.5);color:#f5b842;border-radius:8px;padding:8px 10px;margin-bottom:8px;font-size:12.5px">
            ⚠️ 该题入库时未保存图形（只有占位符）。可本地一键重建（图形/选项/答案，确定性零额度）：
            <button class="btn btn-pri" style="padding:4px 12px" @click="repairFig()">🛠 重建本题</button>
            <button class="btn btn-gh" style="padding:4px 12px" @click="gotoChat()">↩ 回原对话看原图</button>
          </div>
<div class="paper-q">
            <div class="paper-stem" v-html="richMd(paperView.stem)"></div>
            <div v-if="paperView.opts.length" class="paper-opts">
              <div v-for="o in paperView.opts" :key="o.k" class="paper-opt"><b>{{ o.k }}.</b> <span v-html="richMd(String(o.t || ''))"></span></div>
            </div>
          </div>
          <div class="wq-cap-acts">
            <button class="btn btn-gh" title="把这道题的完整题干与选项导出为高清截图" @click="capWrongQuestion()">📸 题目截图</button>
            <button class="btn btn-gh" title="把这道题的完整解析/答案/错因/秒杀导出为高清截图" @click="capWrongExplain()">📸 解析截图</button>
          </div>

          <div class="rev-head" @click="rep = !rep">
            ✍️ {{ rep ? '收起' : '开始结构化复盘' }}
            <span style="float: right">{{ rep ? '▲' : '▼' }}</span>
          </div>
          <div v-if="rep" class="rev-body">
            <div v-if="reviewGaps.length" class="rev-gap">
              📋 还差 <b>{{ reviewGaps.join(' / ') }}</b> 没填——补全才能彻底吃透这道题
            </div>
            <div class="rev-steps">
              <span :class="{ done: frm.answer.trim() }">1 对答案</span> → <span :class="{ done: (frm.sel || []).length }">2 写错因</span> → <span :class="{ done: frm.note.trim() }">3 理思路</span> → <span :class="{ done: frm.method.trim() }">4 记秒杀</span> → <span :class="{ done: vtShow }">5 做变式</span>
            </div>
            <div class="fld">
              <label>正确答案</label>
              <input v-model="frm.answer" placeholder="如：D / 乙 / 主旨句…" />
            </div>
            <div class="fld">
              <label>错因（可多选 · 已选置顶，候选与历史已收纳）</label>
              <!-- 本题已勾选的错因：置顶显示；预设勾选无删改，自定义/AI 勾选带 ✎✕ -->
              <div v-if="checkedAllReasons.length" class="chips">
                <span
                  v-for="r in checkedAllReasons"
                  :key="'on' + r"
                  class="chip on"
                  :class="{ custom: !presetReasons.includes(r) }"
                  @click="toggleReason(r)"
                >
                  {{ r }}
                  <template v-if="!presetReasons.includes(r)">
                    <i class="chip-act" title="改名（当前题 + 自定义错因池）" @click.stop="openRename(r)">✎</i>
                    <i class="chip-act" title="删除该错因（当前题 + 自定义错因池）" @click.stop="removeReason(r)">✕</i>
                  </template>
                </span>
              </div>
              <div v-else class="cr-empty">还没有勾选错因——从下面收纳盒里选，或用 🧭 引导 / ✨ 规范化 生成</div>
              <!-- 收纳盒①：板块预设候选（默认折叠） -->
              <div v-if="presetReasons.length" class="reason-box">
                <button type="button" class="reason-box-hd" @click="presetBoxOpen = !presetBoxOpen">
                  📦 预设错因（{{ store.wqs[cur].subject || '板块' }} · {{ presetReasons.length }}）{{ presetBoxOpen ? '▾ 收起' : '▸ 展开' }}
                </button>
                <div v-if="presetBoxOpen" class="chips">
                  <span
                    v-for="r in presetReasons"
                    :key="'p' + r"
                    class="chip"
                    :class="{ on: frm.sel.includes(r) }"
                    @click="toggleReason(r)"
                  >{{ r }}</span>
                </div>
              </div>
              <!-- 收纳盒②：我的历史错因（自定义/AI 生成，默认折叠，可删改） -->
              <div v-if="boxReasons.length" class="reason-box">
                <button type="button" class="reason-box-hd" @click="reasonBoxOpen = !reasonBoxOpen">
                  📦 我的历史错因（{{ boxReasons.length }}）{{ reasonBoxOpen ? '▾ 收起' : '▸ 展开' }}
                </button>
                <div v-if="reasonBoxOpen" class="chips">
                  <span
                    v-for="r in boxReasons"
                    :key="'b' + r"
                    class="chip custom"
                    @click="toggleReason(r)"
                  >
                    {{ r }}
                    <i class="chip-act" title="改名（当前题 + 自定义错因池）" @click.stop="openRename(r)">✎</i>
                    <i class="chip-act" title="删除该错因（当前题 + 自定义错因池）" @click.stop="removeReason(r)">✕</i>
                  </span>
                </div>
              </div>
              <!-- AI 引导找错因：帮助用户科学决策、自己发现错因 -->
              <div class="guide-row">
                <button type="button" class="btn btn-gh" :disabled="aiBusy" @click="askAiReasons()">{{ aiBusy ? '⏳ 归纳中…' : '🤖 AI 归纳错因' }}</button>
                <button type="button" class="btn btn-gh" :disabled="aiGuideBusy" @click="askAiGuide()">{{ aiGuideBusy ? '⏳ 引导中…' : '🧭 引导我找错因' }}</button>
                <span class="cr-tip">🤖 直接归纳 · 🧭 引导你自己发现错因</span>
              </div>
              <div v-if="guideText" class="guide-text">{{ guideText }}</div>
              <!-- 自定义错因 + AI 规范化 -->
              <div class="custom-reason">
                <input
                  v-model="customReason"
                  placeholder="用自己的话写下错因，如：我把因果倒置当成了另有他因…"
                  @keydown.enter.prevent="addCustomReason()"
                />
                <button type="button" class="btn btn-gh" @click="addCustomReason()">➕ 添加</button>
                <button type="button" class="btn btn-gh" :disabled="aiPolishBusy" title="把口语化原因改写成专业表述" @click="aiPolishReason()">{{ aiPolishBusy ? '⏳ 规范化中…' : '✨ AI 规范化' }}</button>
              </div>
              <div class="cr-tip">✎/✕ 可改名、删除自定义与 AI 错因；✨ 规范化能把你的口语原因写成专业说法</div>
            </div>
            <div class="fld">
              <label>⚡ 秒杀规律（一句话）</label>
              <input v-model="frm.method" placeholder="下次看到这类题先想…" />
            </div>
            <div class="fld">
              <label>📝 个人笔记/解析</label>
              <textarea v-model="frm.note" rows="3" placeholder="记录命题人坑点、同类题联想…"></textarea>
            </div>
            <div class="pnl-btns">
              <button class="btn btn-pri" @click="save()">💾 保存复盘</button>
              <button class="btn btn-gh" :disabled="vtBusy" @click="startVariant()">{{ vtBusy ? '⏳ 找同类/出变式…' : '🔁 变式训练' }}</button>
            </div>
            <div v-if="relatedQs.length" class="related-box">
              <div class="related-hd">🔗 同类错题（同板块·同错因 {{ relatedQs.length }}）—— 连看吃透</div>
              <div v-for="(rq, ri) in relatedQs" :key="ri" class="related-it" @click="openRelated(rq.i)">
                <span class="related-sub">{{ rq.x.subject }}</span>
                <span class="related-q">{{ snippet((rq.x.question || ''), 60) }}</span>
                <span class="related-w">错 {{ rq.x.wrongCount || 1 }} 次</span>
              </div>
            </div>
          </div>
          <div v-if="!rep && (store.wqs[cur].answer || store.wqs[cur].method || store.wqs[cur].note)" class="rev-view">
            <div class="rv-item">✅ 答案：{{ store.wqs[cur].answer }}</div>
            <div class="rv-item">⚡ 秒杀：{{ store.wqs[cur].method }}</div>
            <div class="rv-item">📝 {{ store.wqs[cur].note }}</div>
            <div class="pnl-btns">
              <button class="btn btn-gh" @click="rep = true">✍️ 重新复盘</button>
              <button class="btn btn-gh" :disabled="vtBusy" @click="startVariant()">{{ vtBusy ? '⏳ 找同类/出变式…' : '🔁 变式训练' }}</button>
            </div>
          </div>

        <div v-if="cur >= 0 && store.wqs[cur]" style="margin-top:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <button class="btn btn-gh" style="padding:2px 10px;font-size:12px" @click="memorizeRule()">🧠 记下这条规律（入记忆复习）</button>
          <span class="cr-tip">把「秒杀 / 笔记」摘要（≤60字）加入今日记忆复习队列</span>
        </div>
        <!-- R5 关联知识卡（按本题考点检索 437 张方法卡，只读 kb） -->
        <div v-if="kbCards.length" class="kb-link" style="margin-top:10px">
          <div class="kb-link-hd" style="cursor:pointer;font-weight:600" @click="kbOpen = !kbOpen">📇 关联知识卡（{{ kbCards.length }}）{{ kbOpen ? '▾ 收起' : '▸ 展开' }} <span class="cr-tip">按本题考点匹配 · 可展开 / 标记已学 / 跳知识库</span></div>
          <div v-if="kbOpen" style="margin-top:6px">
            <div v-for="c in kbCards" :key="c.id" class="kb-link-card" style="border:1px dashed var(--bg3,#334155);border-radius:8px;padding:6px 8px;margin-bottom:6px">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <b style="flex:1;min-width:140px">{{ c.plate }} · {{ c.type }}</b>
                <button class="btn btn-gh" style="padding:1px 8px;font-size:11px" title="标记为已学（点亮知识图谱）" @click="markLearned(c.id)">✓ 已学</button>
                <button class="btn btn-gh" style="padding:1px 8px;font-size:11px" @click="openKbCard(c.id)">🔍 知识库打开</button>
              </div>
              <details style="margin-top:4px"><summary style="cursor:pointer;font-size:12px;color:var(--text2)">要点 / 陷阱 / 例题</summary>
                <div style="font-size:12px;margin-top:4px;line-height:1.7">
                  <div v-if="(c.steps || []).length"><b>步骤：</b><span v-for="(s, i) in c.steps" :key="i">{{ s }}；</span></div>
                  <div v-if="(c.traps || []).length"><b>陷阱：</b><span v-for="(s, i) in c.traps" :key="i">{{ s }}；</span></div>
                  <div v-if="c.tip"><b>提示：</b>{{ c.tip }}</div>
                  <div v-if="c.example && c.example.q"><b>例：</b>{{ c.example.q }}</div>
                </div>
              </details>
            </div>
          </div>
        </div>
</template>
        <div class="pnl-btns">
          <button class="btn btn-gh" @click="show = false">关闭</button>
          <button class="btn btn-gh" @click="del()">🗑 删除</button>
        </div>
      </div>
    </div>
  <div v-if="imgView" class="img-view" @click.self="closeImg()">
    <img :src="imgView" class="iv-img" />
    <div class="iv-bar">
      <button type="button" class="iv-btn" @click.stop.prevent="downloadImg()">💾 保存原图</button>
      <button type="button" class="iv-btn iv-close" @click.stop.prevent="closeImg()">✕ 关闭</button>
    </div>
  </div>
  <div v-if="vtShow" class="ov redo-ov show" style="z-index: 500" @click.self="vtClose()">
    <div class="pnl redo-pnl">
      <h3>🔁 变式训练
        <span v-if="vtMode === 'do'" class="vt-prog">{{ vtIdx + 1 }} / {{ vtQueue.length }}</span>
        <span v-if="vtMode === 'result'" class="vt-prog">得分 {{ vtScore }} / {{ vtQueue.length }}</span>
      </h3>

      <!-- ① 选题量 -->
      <div v-if="vtMode === 'pick'" class="vt-pick">
        <div class="vt-pick-t">请选择本次变式训练题量（最多 <b>{{ vtMax }}</b> 道）</div>
        <div class="vt-pick-opts">
          <button v-for="n in vtMax" :key="n" class="btn" :class="vtCount === n ? 'btn-pri' : 'btn-gh'" @click="vtCount = n">{{ n }} 道</button>
        </div>
        <div class="vt-pick-src">{{ vtQueue.length ? '📚 你的错题集有 ' + vtQueue.length + ' 道同类题，直接复用练习' : '🤖 错题集暂无同类题，AI 将按此题生成变式' }}</div>
        <div class="pnl-btns">
          <button class="btn btn-gh" @click="vtClose()">取消</button>
          <button class="btn btn-pri" @click="vtStartDo()">🚀 开始训练</button>
        </div>
      </div>

      <!-- ② 答题卡作答（可切换题号、可改答案，全部做完提交统一批改） -->
      <div v-else-if="vtMode === 'do'">
        <div v-if="vtBusy" class="vt-busy">⏳ AI 正在按此题生成变式题…</div>
        <template v-else-if="vtQ">
          <div class="vt-card-nav">
            <span
              v-for="(q, i) in vtQueue"
              :key="i"
              class="vt-no"
              :class="{ cur: i === vtIdx, done: vtAnswers[i] }"
              @click="vtGo(i)"
            >{{ i + 1 }}</span>
            <span class="vt-nav-tip">点题号可跳转 · 已答 {{ Object.keys(vtAnswers).length }} / {{ vtQueue.length }}</span>
          </div>
          <div class="redo-subj">{{ vtQ.subject }} · {{ vtQ.source === 'ai' ? 'AI 变式' : '错题集同类' }}</div>
          <div class="paper-q">
            <div class="paper-stem" v-html="richMd(vtQ.stem)"></div>
            <div v-if="(vtQ.options || []).length >= 2" class="paper-opts">
              <button
                v-for="o in vtQ.options"
                :key="o.k"
                class="paper-opt"
                :class="{ sel: vtPick === o.k }"
                @click="vtChoose(o.k)"
              >{{ o.k }}. <span v-html="richMd(String(o.t || ''))"></span></button>
            </div>
            <div v-else class="redo-btns">
              <button class="btn btn-pri" :class="{ sel: vtPick === '对' }" @click="vtChoose('对')">✅ 我答对了</button>
              <button class="btn btn-gh" :class="{ sel: vtPick === '错' }" @click="vtChoose('错')">❌ 还是错了</button>
            </div>
          </div>
          <div class="pnl-btns">
            <button class="btn btn-gh" :disabled="vtIdx === 0" @click="vtNav(-1)">← 上一题</button>
            <button class="btn btn-gh" :disabled="vtIdx === vtQueue.length - 1" @click="vtNav(1)">下一题 →</button>
            <button class="btn btn-pri" @click="vtSubmit()">📋 提交答题卡</button>
          </div>
        </template>
      </div>

      <!-- ③ 批改结果 -->
      <div v-else-if="vtMode === 'result'" class="vt-result">
        <div class="vt-score">
          得分 <b>{{ vtScore }}</b> / {{ vtQueue.length }} · 正确率 {{ Math.round((vtScore / vtQueue.length) * 100) }}%
        </div>
        <div class="vt-comment" :class="vtScore === vtQueue.length ? 'all' : vtScore === 0 ? 'none' : 'part'">
          {{ vtScore === vtQueue.length ? '🎉 全部答对，这组题彻底拿下了！' : vtScore === 0 ? '😥 全部答错——先别急，看看下面的横向对比复盘' : '💪 答对 ' + vtScore + ' 道，把答错的题重点巩固' }}
        </div>
        <div v-for="(q, i) in vtQueue" :key="i" class="vt-r-item">
          <div class="vt-r-hd" @click="vtToggleOpen(i)">
            <span class="vt-r-no">{{ i + 1 }}</span>
            <span class="vt-r-badge" :class="vtResultOf(i)">{{ vtResultOf(i) === 'ok' ? '✓' : '✗' }}</span>
            <span class="vt-r-q">{{ snippet((q.stem || ''), 70) }}</span>
            <span class="vt-r-mine">我选 {{ vtAnswers[i] }} · 答案 {{ q.answer }}</span>
          </div>
          <div v-if="vtOpen[i]" class="vt-r-detail">
            <div class="vt-r-ex" v-html="richMd(String((q && q.explain) || ''))"></div>
            <button v-if="vtResultOf(i) === 'no' && q.source === 'ai'" class="btn btn-pri" @click="vtAddWrong(i)">📌 加入错题集</button>
            <span v-else-if="vtResultOf(i) === 'no'" class="cr-tip">错题集同类题已在错题本中</span>
          </div>
        </div>
        <!-- 第 6 步 · 回到原题深度巩固（记骨架，不记答案；分板块针对性核心要点 + AI 结合本题剖析） -->
        <div class="vt-step6" :class="{ hard: vtAllWrong }">
          <div class="vt-step6-t">📌 第 6 步 · 回到原题深度巩固 <span class="cr-tip">记骨架，不记答案</span></div>
          <div class="paper-q">
            <div class="paper-stem" v-html="richMd(coreOrigMd)"></div>
          </div>
          <div v-if="coreCard" class="core-card">
            <div class="core-hd">🧠 {{ coreCard.subject }} · 记忆核心要点（{{ coreCard.tag }}）</div>
            <ul class="core-points">
              <li v-for="(p, i) in coreCard.points" :key="i">{{ p }}</li>
            </ul>
          </div>
          <div class="core-acts">
            <button class="btn btn-pri" :disabled="coreAiBusy" @click="askCoreDeep()">{{ coreAiBusy ? '⏳ AI 剖析中…' : '🧠 AI 深度剖析本题骨架' }}</button>
          </div>
          <div v-if="coreAiText" class="core-ai">{{ coreAiText }}</div>
        </div>
        <!-- 全错 → 原题 × 变式 横向比较复盘 -->
        <div v-if="vtAllWrong" class="vt-deep">
          <div class="vt-deep-t">⚠️ 全部做错 = 没掌握这组题的共同套路，建议深度复盘突破瓶颈</div>
          <div class="vt-compare">
            <div class="vt-c-col">
              <div class="vt-c-hd">📄 原题</div>
              <div class="vt-c-q">{{ origStem }}</div>
            </div>
            <div v-for="(q, i) in vtQueue" :key="i" class="vt-c-col">
              <div class="vt-c-hd">🔁 变式{{ i + 1 }}</div>
              <div class="vt-c-q">{{ snippet((q.stem || ''), 240) }}</div>
            </div>
          </div>
          <button class="btn btn-pri" :disabled="vtCmpBusy" @click="vtDeepCompare()">{{ vtCmpBusy ? '⏳ 对比中…' : '🧠 AI 横向比较复盘' }}</button>
          <div v-if="vtCmpText" class="vt-cmp">{{ vtCmpText }}</div>
        </div>
        <div class="pnl-btns">
          <button class="btn btn-gh" @click="vtClose()">关闭</button>
          <button class="btn btn-pri" @click="vtClose()">✅ 完成训练</button>
        </div>
      </div>
    </div>
  </div>
</template>
