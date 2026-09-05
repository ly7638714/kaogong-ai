<script setup>
// R3-③d：配置区子组件（从 ExamPanel.vue 的 config 阶段模板逐字搬入）
// 父组件通过 ctx 注入全部依赖；模板保持与 ExamPanel 完全一致，仅把状态/方法从 ctx 暴露到本组件作用域。
import { ref, watch, toRefs, computed } from 'vue'
import { zhentiTypes } from '../data/zhenti'
import { EXTRA_VARIANTS } from './examData' // 实测反馈③：自选下拉“更多/创新题型”同源扩展池
import { readAttempts } from '../utils/attemptLog'
import { loadPending, clearPending } from '../utils/pendingPaper' // 深化·断点续出：中断组卷草稿横幅 // 35号批次3-B：补短解锁进度
import { groupLabelOf } from '../data/groupNames' // 大板块全称显示

const props = defineProps({ ctx: { type: Object, required: true } })

// 状态 ref / 计算属性（双向 / 只读）
const {
  srcMode, sheetMode, templateId, modules, perQ, fastGenModel, useFigGen, aiCap, genConcur,
  mixMode, paperDir, paperDirText, paperYtN, paperYtNGroup, difficulty, singleGroup, singlePlate,
  singleVariant, singleBatch, singleDir, singleDirText, singleLocal, tutuFormat, singleMatType,
  autoNext, imgs, textFiles, qLimit, zhentiSel, zhentiPlates, zhentiLimit, wrongSel, wrongLimit,
  onlyPend, byWrongCount, papers, openPapers, openQuizCol, quizCol, results, openResults, zhentiIdx,
  selTmpl, tmplJudgeNote, judgeSplitHint, totalQ, refTotal, singlePlates, singleVars, dirLib, avgRate, wrongPlates, retryInfo
} = toRefs(props.ctx)

// v3.8.211：统一考场七模式「身份卡」——每个入口有独立 名称/主色/一句话定位/要点，配置页不再千篇一律
const EXAM_META = {
  single: { c: '#34d399', name: '⚡ 单题快练', tag: '专项速刷：大板块(全称)→细分→题型→问法→组量，答完即批、错题入库。', pts: ['本地/离线零额度可用', '答错可钉同考点巩固', '自动进“出题集”可二刷'] },
  ai: { c: '#5cc8ff', name: '🎲 AI 整卷出题', tag: '按真实卷面结构 AI 智能组卷：模块/题量/难度/补短自选，交卷出成绩单。', pts: ['支持断点续出 / 只补失败题', '可开仿真答题卡模式', '成绩单可导出 Word/PDF/MD/LaTeX/Typst'] },
  import: { c: '#fbbf24', name: '📂 导入材料', tag: '把本地真题/讲义（图片/PDF/Word/txt/tex）识别成可做题。', pts: ['OCR 后先“预览校对”再入库', '可一键存入错题本'] },
  wrong: { c: '#fb7185', name: '📚 错题集组卷', tag: '拿错题本组卷二刷：只看未复盘 / 按错次优先。', pts: ['联动 今日复习中枢 / 补弱任务'] },
  zhenti: { c: '#a78bfa', name: '📋 真题快练', tag: '真题库（网友回忆版）快速练，AI 判题。', pts: ['支持按年份/板块选题'] },
  morning: { c: '#f97316', name: '🌅 晨练包', tag: '一键 15 题晨练组合卷（资料5 + 常识5 + 错题二刷5）。', pts: ['完成联动看板“晨练”打卡'] },
  weekRedo: { c: '#22d3ee', name: '📅 每周重做', tag: '每周重做卷：把本周到期/复错题按规则再卷一遍。', pts: ['到期与复错优先'] },
  anchor: { c: '#60a5fa', name: '📐 锚点自测', tag: '每板块固定真题锚点，校准能力值（累计作答后解锁）。', pts: ['与 AI 出题同一套题型体系'] }
}
const meta = computed(() => EXAM_META[srcMode.value] || EXAM_META.ai)

// 常量 / 方法（函数与数组不被 reactive 解包，保持原引用）
const {
  TEMPLATES, SUBJECTS, SIX_GROUPS, zhentiSecs, store,
  onTemplate, templateTotal, moduleRefSec, rmRow, addRow, saveFastGenModel, saveCfg,
  onSingleGroup, onSinglePlate, setDirText, toggleZhentiPlate, toggleWrongSel, toggleFold,
  openPaper, delPaper, startRedo, delQuizCol, clearQuizCol, onFiles, rmImg, rmTxt, fmt, cancel, start, retryGo, retryDismiss, resumePending
} = props.ctx

// 真题题型分布（B4：规则打标 sidecar，零成本）
const zhentiTy = ref(null)
// 深化·断点续出：中断组卷草稿（刷新/关闭后仍可恢复）
const pendingDraft = ref(null)
function refreshDraft() { try { pendingDraft.value = loadPending() } catch (e) { pendingDraft.value = null } }
refreshDraft()
function discardDraft() { try { clearPending() } catch (e) {} refreshDraft() }
// 实测反馈③：把「不限」轮换池里的扩展/创新题型折叠进自选下拉（optgroup 分组，点选即固定该题型）
const extraVars = computed(() => { try { const base = Array.isArray(singleVars.value) ? singleVars.value : []; return (EXTRA_VARIANTS[singlePlate.value] || []).filter((x) => !base.includes(x)) } catch (e) { return [] } })
watch(srcMode, async (v) => {
  if (v === 'zhenti' && !zhentiTy.value) {
    zhentiTy.value = await zhentiTypes().catch(() => null)
  }
}, { immediate: true })

// 35号批次3-B：🎯 补短模式（薄弱点加权组卷）——冷启动门槛 板块累计作答 ≥30 才可开启（doc 35 §3.2）
const attemptsN = computed(() => { try { return (readAttempts() || []).length } catch (e) { return 0 } })
const strengthenUnlock = computed(() => attemptsN.value >= 30)
const remainN = computed(() => Math.max(0, 30 - attemptsN.value))
function toggleStrengthen(v) {
  if (v && !strengthenUnlock.value) { return }
  store.cfg.strengthen = !!v
  saveCfg()
}
</script>

<template>
  <div class="pp-config">
    <div class="ep-src-row">
      <button class="fp-b" :class="{ on: srcMode === 'single' }" @click="srcMode = 'single'">⚡ 单题快练</button>
      <button class="fp-b" :class="{ on: srcMode === 'ai' }" @click="srcMode = 'ai'">🎲 AI 整卷出题</button>
      <button class="fp-b" :class="{ on: srcMode === 'import' }" @click="srcMode = 'import'">📂 导入材料</button>
      <button class="fp-b" :class="{ on: srcMode === 'wrong' }" @click="srcMode = 'wrong'">📚 错题集组卷</button>
      <button class="fp-b" :class="{ on: srcMode === 'zhenti' }" @click="srcMode = 'zhenti'">📋 真题快练</button>
      <button class="fp-b" :class="{ on: srcMode === 'morning' }" @click="srcMode = 'morning'">🌅 晨练包</button>
      <button class="fp-b" :class="{ on: srcMode === 'weekRedo' }" @click="srcMode = 'weekRedo'">📅 每周重做</button>
    </div>
    <!-- v3.8.211 模式身份卡：每种训练入口独特配色与一句话定位 -->
    <div class="ep-mode-id" :style="'background:linear-gradient(135deg,' + meta.c + '22,transparent);border:1px solid ' + meta.c + '55;border-radius:10px;padding:8px 12px;margin:6px 0'">
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <b :style="{ color: meta.c, fontSize: '14px' }">{{ meta.name }}</b>
        <span style="font-size:12px;color:var(--text2);flex:1;min-width:200px">{{ meta.tag }}</span>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
        <span v-for="p in meta.pts" :key="p" style="font-size:11px;color:var(--text3);border:1px solid rgba(127,127,127,.3);border-radius:10px;padding:1px 9px">{{ p }}</span>
      </div>
    </div>
    <!-- 深化·续出：组卷残缺被拦截后 → 保留已出成功题、只补失败题的横幅 -->
    <div v-if="retryInfo" class="ep-note" style="margin: 6px 0; padding: 8px 10px; border: 1px dashed #e0a63c; background: #fff8e6">
      ⚠️ 上次组卷有 <b>{{ retryInfo.n }}</b> 题出题失败，已被拦截（避免残缺卷作答）；已出成功的 <b>{{ retryInfo.ok }}</b> 题<b>全部保留</b>，可只补失败题：{{ retryInfo.summary }}
      <div v-if="retryInfo.reasons && retryInfo.reasons.length" style="margin-top: 4px; color: var(--text3, #8a8a8a); max-height: 96px; overflow: auto">
        失败原因：<template v-for="(rs, ri) in retryInfo.reasons" :key="ri"><span style="display:block; margin-top:2px">· {{ rs }}</span></template>
      </div>
      <div style="margin-top: 6px">
        <button class="fp-b on" style="font-weight: 700" @click="retryGo()">🔄 只补失败 {{ retryInfo.n }} 题（保留 {{ retryInfo.ok }} 题）</button>
        <button class="fp-b" style="margin-left: 6px" @click="retryDismiss()">✕ 放弃此卷，重新配置</button>
      </div>
    </div>
    <!-- 深化·断点续出：上次中断/拦截的组卷草稿（刷新后仍在），可一键恢复并只补失败题 -->
    <div v-if="!retryInfo && pendingDraft" class="ep-note" style="margin: 6px 0; padding: 8px 10px; border: 1px dashed #4a90d9; background: #eef5fd">
      💾 发现一组中断的出卷草稿：<b>{{ pendingDraft.name }}</b> —— 已出成功 <b>{{ pendingDraft.ok }}</b> 题、失败 <b>{{ pendingDraft.n }}</b> 题（{{ pendingDraft.summary }}），保存于 {{ new Date(pendingDraft.savedAt).toLocaleString('zh-CN', { hour12: false }) }}
      <div style="margin-top: 6px">
        <button class="fp-b on" style="font-weight: 700" @click="resumePending()">▶️ 从上次中断处继续（保留 {{ pendingDraft.ok }} 题）</button>
        <button class="fp-b" style="margin-left: 6px" @click="discardDraft()">✕ 丢弃此草稿</button>
      </div>
    </div>
    <div v-if="srcMode === 'morning'" class="ep-note">🌅 每日晨练包：资料速算 5 题（真题材料）+ 常识速测 5 题 + 错题本未复盘 5 题（二刷），一键生成 15 题组合卷。</div>

    <div class="ep-param" style="margin: 10px 0 2px">
      <label>
        <input v-model="sheetMode" type="checkbox" />
        📋 仿真考试答题卡模式（填涂姓名/考场/准考证号 + 2B铅笔逐题填涂，交卷后统一看答案与解析）
      </label>
      <span class="ep-hint">关闭 = 恢复「答完即时看对错 + 萌宠错因分析」原体验（单题快练更轻快）；开启 = 先答卷再交卷，仿真真实考试</span>
    </div>

    <div v-if="srcMode === 'ai'" class="ep-param" style="margin: 8px 0 2px">
      <label>
        <input type="checkbox" :checked="!!(store.cfg && store.cfg.strengthen)" :disabled="!strengthenUnlock" @change="toggleStrengthen($event.target.checked)" />
        🎯 补短模式（组卷向薄弱考点加权，λ = 0.6）
      </label>
      <span v-if="!strengthenUnlock" class="ep-hint">还需累计作答 {{ remainN }} 题后解锁——补短需要足够作答数据标定薄弱点，样本不足不给加权（宁不给数，不给没根据的数）</span>
      <span v-else class="ep-hint">开启后整卷题量 = 真题考频 × (1 + 0.6·薄弱度)：答得差的变体多出，答得好的让位；各板块作答不足 30 时自动退化为纯考频分配</span>
    </div>

    <div class="ep-param" style="margin: 4px 0 2px">
      <label>
        <input type="checkbox" :checked="!!(store.cfg && store.cfg.blueprintRag)" @change="store.cfg.blueprintRag = $event.target.checked; saveCfg()" />
        📚 真题蓝本 RAG（few-shot 学结构 · 出题默认关）
      </label>
      <span class="ep-hint">开启后出题前按同板块/题型检索 2 道近年真题作骨架参考（只学考点切入/干扰结构，禁止照抄——生成后程序做连续 12 字重合检测，违规自动重出）。代价：每题约 +0.4~0.7k token，属可选 AI 功能，默认关闭以守住默认路径零成本红线</span>
    </div>

    <div class="ep-param" style="margin: 2px 0 2px">
      <label>
        <input type="checkbox" :checked="!!(store.cfg && store.cfg.dualCheck)" @change="store.cfg.dualCheck = $event.target.checked; saveCfg()" />
        🔍 双模型互检（第二厂商复核唯一性 · 默认关）
      </label>
      <span class="ep-hint">开启后每道 AI 出题在过闸基础上，用「图增强模型」配置里的独立厂商模型（若存在且与出题模型不同）再做一次唯一解复核；未通过即重出。代价：每题 +1 次快模型调用（计入 costTrack），仅在有独立复核模型时建议开启</span>
    </div>

    <div class="ep-param" style="margin: 2px 0 2px">
      <label>
        <input type="checkbox" :checked="!!(store.cfg && store.cfg.keepSame)" @change="store.cfg.keepSame = $event.target.checked; saveCfg()" />
        🎯 同类连做（单题快练·答错钉住同考点巩固 · 默认关）
      </label>
      <span class="ep-hint">开启后单题快练答错 → 下一题仍出同考点/题型（换素材不换考点）直到答对；连续答对 3 题 → 自动换下一考点。用于把“错题打击”下沉到单题练习（doc35 §5.3）</span>
    </div>

    <div class="ep-param" style="margin: 2px 0 2px">
      <label>
        <input type="checkbox" :checked="!!(store.cfg && store.cfg.preferLocalDet)" @change="store.cfg.preferLocalDet = $event.target.checked; saveCfg()" />
        🎛️ 本地优先（确定性出题 · 推荐开启）
      </label>
      <span class="ep-hint">开启后单题快练“自由练（不限题型）”的 图推/数量/政治 直接用本地确定性生成器（答案程序可重算、零错题、零额度）；需要具体题型的 AI 题不受影响。追求“无错题”建议开启</span>
    </div>

    <div class="ep-param" style="margin: 2px 0 2px">
      <label style="display: flex; align-items: center; gap: 6px">
        ⏱️ 单题时间预算（秒/题）
        <input v-model.number="store.cfg.genTimeoutSec" type="number" min="10" max="90" style="width: 64px" @change="store.cfg.genTimeoutSec = Math.max(10, Math.min(90, Number(store.cfg.genTimeoutSec) || 45)); saveCfg()" />
      </label>
      <span class="ep-hint">默认 45 秒：每次出题/重试/质检共用该预算，超预算自动止损（最多重试 2 次 → 本地回退或拦截残缺卷）。用思考模型嫌慢时：降到 40-45 并把“出题并发”调到 ≤2，整卷时长更可控；不想要残缺卷就保持默认拦截</span>
    </div>

    <div v-if="srcMode === 'ai'" class="ep-block">
      <div class="ep-block-hd">📐 卷面构成（国考/省考模板，均可自由编辑）</div>
      <div class="ep-note">💡 全真模考：按国考/省考模板题量与时限整卷组题，考点/题型自动轮换，出完直接开考计时。</div>
      <div class="ep-tmpl-row">
        <select v-model="templateId" class="tb-sel" @change="onTemplate()">
          <option v-for="t in TEMPLATES" :key="t.id" :value="t.id">{{ t.name }} · {{ templateTotal(t) }}题 / {{ t.mins }}分钟</option>
        </select>
        <button class="btn btn-gh" @click="onTemplate()">↻ 载入模板</button>
      </div>
      <div v-if="selTmpl.tag" class="ep-note">🏷️ {{ selTmpl.tag }}</div>
      <div v-if="selTmpl.note" class="ep-note">💡 {{ selTmpl.note }}</div>
      <div v-if="tmplJudgeNote" class="ep-note">🧩 判断推理子板块：{{ tmplJudgeNote }}（国考判断推理常为 4 子板块各 10 题）</div>
      <div v-if="judgeSplitHint" class="ep-note">{{ judgeSplitHint }}</div>

      <div class="ep-mods">
        <div class="ep-mod-row hd"><span>板块</span><span>题数</span><span>参考时限(分)</span><span class="ep-perq">每题约</span><span></span></div>
        <div v-for="(m, i) in modules" :key="i" class="ep-mod-row">
          <select v-model="m.subject" class="tb-sel">
            <option v-for="s in SUBJECTS" :key="s" :value="s">{{ s }}</option>
          </select>
          <input v-model.number="m.count" type="number" min="1" max="80" class="ep-inp" />
          <input v-model.number="m.refMin" type="number" min="1" max="120" class="ep-inp" />
          <span class="ep-perq">{{ moduleRefSec(m) }}s</span>
          <button class="ep-x" @click="rmRow(i)">×</button>
        </div>
      </div>
      <div class="ep-mod-actions">
        <button class="btn btn-gh" @click="addRow()">➕ 加板块</button>
        <span class="ep-total">合计 <b>{{ totalQ }}</b> 题 · 参考 <b>{{ refTotal }}</b> 分钟<template v-if="selTmpl.mins">（官方 {{ selTmpl.mins }} 分钟）</template></span>
      </div>
    </div>

    <div class="ep-block">
      <div class="ep-block-hd">⚙️ 出卷参数</div>
      <div class="ep-param">
        <label>每题限时</label>
        <select v-model="perQ" class="tb-sel">
          <option :value="30">30 秒</option><option :value="45">45 秒</option>
          <option :value="60">60 秒（推荐，≤1分钟）</option>
          <option :value="75">75 秒</option><option :value="90">90 秒</option>
        </select>
        <span class="ep-hint">整卷倒计时 = 题数 × 每题限时</span>
      </div>
      <div class="ep-param">
        <label>出题快模型（提速）</label>
        <input v-model="fastGenModel" class="pv-edit" style="margin-top: 6px" placeholder="留空=跟随文字模型；填 deepseek-chat 等非思考模型名，出题/预生成用它，比思考模型(v4-flash)快很多（需与文字模型同一服务商/Key）" @change="saveFastGenModel()" />
        <span class="ep-hint">为什么：v4-flash 是思考模型，每次出题先想一大段再作答；deepseek-chat 直接作答。出题用快的、对话/解析用质量高的。</span>
      </div>
      <div class="ep-param">
        <label><input v-model="useFigGen" type="checkbox" /> 🚀 出题用智谱快模型（图形增强里配置的 GLM）</label>
        <span class="ep-hint">出题/预生成/解析/质检都用智谱 GLM（非思考、快）；智谱 Key 在「设置 → 图形增强」里填。此项优先于「出题快模型」。</span>
      </div>
      <div v-if="srcMode === 'ai'" class="ep-param">
        <label>每板块题量</label>
        <select v-model="aiCap" class="tb-sel">
          <option :value="0">全量（严格按卷面模板题量）</option>
          <option :value="3">抽样 3 题/板块（快测）</option>
          <option :value="5">抽样 5 题/板块</option>
          <option :value="10">抽样 10 题/板块</option>
        </select>
        <span class="ep-hint">全量=按所选国考/省考模板题量出题（如国考副省 135 题）；抽样用于快速体验，题量与模板不符</span>
      </div>
      <div v-if="srcMode === 'ai'" class="ep-param">
        <label>出卷并发度</label>
        <select v-model="genConcur" class="tb-sel">
          <option :value="2">2 路并发（稳妥）</option>
          <option :value="3">3 路并发（推荐）</option>
          <option :value="4">4 路并发（最快，需 API 支持）</option>
        </select>
        <span class="ep-hint">并发出题请求数，越高整卷出得越快；若模型 API 频繁报限流/超时，请调低</span>
      </div>
      <div v-if="srcMode !== 'single'" class="ep-param">
        <label>出卷顺序</label>
        <select v-model="mixMode" class="tb-sel">
          <option value="module">按板块顺序（贴近真实卷）</option>
          <option value="mix">混合打乱</option>
        </select>
      </div>
      <div v-if="srcMode === 'ai'" class="ep-param">
        <label>问法（整卷统一）</label>
        <select v-model="paperDir" class="tb-sel">
          <option value="auto">AI 随机（是/非 自由）</option>
          <option value="is">选是题（正确的是/属于/能推出）</option>
          <option value="not">选非题（错误的是/不属于/不能推出）</option>
          <option value="custom">自定义问法</option>
        </select>
        <input v-if="paperDir === 'custom'" v-model="paperDirText" class="pv-edit" style="margin-top: 6px" placeholder="输入整卷统一问法，如：最能削弱上述结论？" />
        <span class="ep-hint">整卷每题按此问法出题；auto=AI 自由随机 是/非；自定义问法全卷统一</span>
      </div>
      <div v-if="srcMode === 'ai'" class="ep-param">
        <label>一拖N 分析推理组（逻辑判断）</label>
        <select v-model="paperYtNGroup" class="tb-sel">
          <option :value="0">不加入（默认）</option>
          <option :value="1">1 组</option>
          <option :value="2">2 组</option>
        </select>
        <label style="margin-top: 6px">每组题数</label>
        <select v-model="paperYtN" class="tb-sel">
          <option :value="2">一拖2（江苏考情）</option>
          <option :value="3">一拖3</option>
          <option :value="4">一拖4</option>
          <option :value="5">一拖5（国考地市/执法）</option>
        </select>
        <span class="ep-hint">一拖N = 1 个共用题干 + N 个分析推理小题（属分析推理综合推演，独立于削弱/加强等题型）；小题可在不违背总题干逻辑的前提下新增附加条件</span>
      </div>
      <div class="ep-param">
        <label>出题难度</label>
        <select v-model="difficulty" class="tb-sel">
          <option value="curve">智能曲线（前易后难，30%易/50%中/20%难）</option>
          <option value="easy">易（单一考点，直接对应）</option>
          <option value="mid">中（一处拐弯/一个陷阱）</option>
          <option value="hard">难（复合考点+强干扰）</option>
          <option value="real">真题级（反套路·强干扰·陷阱叠加）</option>
        </select>
        <span class="ep-hint">已接入「命题专家」规范：考点先行·干扰项错因·唯一解自检</span>
      </div>
      <div class="ep-param">
        <label>
          <input v-model="store.cfg.strictGen" type="checkbox" @change="saveCfg()" />
          出题严格质检（生成后二次验证 唯一解/恰一正确/无逻辑谬误，更稳但略慢）
        </label>
      </div>
      <div class="ep-param" style="margin: 2px 0 2px">
        <label>
          <input type="checkbox" :checked="!!(store.cfg && store.cfg.fastAutoQC)" @change="store.cfg.fastAutoQC = $event.target.checked; saveCfg()" />
          🛡️ 快模型自动质检（默认开：用「出题快模型 / 图形快模型」时，即使上面严格质检被关，也保留一次 AI 复核兜底，防快出降质；追极限速度可关）
      <div class="ep-param" style="margin: 2px 0 2px">
        <label>
          <input type="checkbox" :checked="!!(store.cfg && store.cfg.deepPlan)" @change="store.cfg.deepPlan = $event.target.checked; saveCfg()" />
          🧠 深度命题两段式（默认关：先让子命题人设计本题坑点/数据结构/干扰项错解，再按设计成题——言语·逻辑·判断类质感更强；每题 +1 次短请求、略慢）
      <div class="ep-param" style="margin: 2px 0 2px">
        <label style="display:flex; align-items:center; gap:6px">
          命题质感：
          <select class="tb-sel" style="width:auto" :value="(store.cfg && store.cfg.propStyle) || 'standard'" @change="store.cfg.propStyle = $event.target.value; saveCfg()">
            <option value="standard">标准（现默认）</option>
            <option value="strong">强陷阱（贴近真题卷面·坑更密）</option>
            <option value="gentle">入门友好（干扰平实直白）</option>
          </select>
        </label>
        <span class="ep-hint">影响题干/材料/选项的“挖坑密度与难度观感”；对数量/资料仍强制 答案唯一可复算</span>
      </div>
        </label>
      </div>
        </label>
      </div>
    </div>

    <div v-if="srcMode === 'single'" class="ep-block">
      <div class="ep-block-hd">⚡ 单题快练</div>
      <div class="ep-note">💡 专项速刷 · 五层配置：六大板块 → 细分板块 → 题型 → 问法 → 组量，碎片时间快速突破。</div>
      <div class="ep-param">
        <label>① 六大板块</label>
        <select v-model="singleGroup" class="tb-sel" @change="onSingleGroup()">
          <option v-for="g in SIX_GROUPS" :key="g.key" :value="g.key">{{ groupLabelOf(g.key) }}</option>
        </select>
      </div>
      <div class="ep-param">
        <label>② 细分板块</label>
        <select v-model="singlePlate" class="tb-sel" @change="onSinglePlate()">
          <option v-for="s in singlePlates" :key="s" :value="s">{{ s }}</option>
        </select>
      </div>
      <div class="ep-param">
        <label>③ 题型</label>
        <select v-model="singleVariant" class="tb-sel">
          <option value="不限">不限（自动轮换）</option>
          <option v-for="v in singleVars" :key="v" :value="v">{{ v }}</option>
          <optgroup label="✨ 更多常考/创新题型（=「不限」轮换池同源）">
            <option v-for="v in extraVars" :key="'x' + v" :value="v">{{ v }}</option>
          </optgroup>
        </select>
        <span class="ep-hint">该细分板块下的子题型，由对应「子命题人」精准出题</span>
      </div>
      <div class="ep-param">
        <label>④ 问法</label>
        <select v-model="singleDir" class="tb-sel">
          <option value="auto">AI 自由随机（是/非）</option>
          <option value="is">选是题（正确的是 / 属于 / 能推出）</option>
          <option value="not">选非题（错误的是 / 不属于 / 不能推出）</option>
          <option value="custom">自定义问法</option>
        </select>
        <input v-if="singleDir === 'custom'" v-model="singleDirText" class="pv-edit" style="margin-top: 6px" placeholder="输入自定义问法，如：最能削弱上述结论？" />
        <div v-if="dirLib.length" class="ep-chips" style="margin-top: 6px">
          <button v-for="dir in dirLib" :key="dir" class="fp-b" @click="setDirText(dir)">{{ dir }}</button>
        </div>
        <span class="ep-hint">不同板块题干可自由问法（如判断推理：最能削弱 / 最不能 / 前提假设…），点上面快捷问法或自定义</span>
      </div>
      <div class="ep-param">
        <label>⑤ 组量</label>
        <select v-model="singleBatch" class="tb-sel">
          <option :value="1">1 题（单题）</option>
          <template v-if="singlePlate === '资料分析'">
            <option :value="5">5 题（1篇材料·真题5题组）</option>
            <option :value="10">10 题（2篇材料）</option>
            <option :value="15">15 题（3篇材料）</option>
            <option :value="20">20 题（4篇材料）</option>
          </template>
          <template v-else>
            <option :value="5">5 题一组</option>
            <option :value="10">10 题一组</option>
            <option :value="15">15 题一组</option>
            <option :value="20">20 题一组</option>
          </template>
        </select>
        <span class="ep-hint">{{ singlePlate === '资料分析' ? '资料分析真题模式：一篇完整材料配5题（第5题为综合分析），可自定义材料形式；选 1 题则出单题' : '组内逐题作答，做完自动批改，可「再来一组」' }}</span>
      </div>
      <div v-if="singlePlate === '图形推理'" class="ep-param">
        <label>⑥ 出题形式</label>
        <select v-model="tutuFormat" class="tb-sel">
          <option value="auto">不限（自动轮换）</option>
          <option value="一组图">一组图（5图+问号）</option>
          <option value="两组图">两组图（类比式）</option>
          <option value="九宫格">九宫格（3×3）</option>
          <option value="分组分类">分组分类（6图）</option>
        </select>
        <span class="ep-hint">固定某种图推出题形式；「不限」= 一组图/两组图/九宫格/分组分类 自动轮换</span>

        <div class="ep-param">
          <label>⑦ 出题方式</label>
          <div class="ep-chips">
            <button class="fp-b" :class="{ on: !singleLocal }" @click="singleLocal = false">🤖 AI 出题（丰富多变）</button>
            <button class="fp-b" :class="{ on: singleLocal }" @click="singleLocal = true">🎲 本地真题生成（零额度）</button>
          </div>
          <span class="ep-hint">本地 = 黑白块/汉字/字母/旋转/数量/对称/叠加/分组等真题高频规律，确定性且永不裁切；AI 出题失败也会自动回退本地</span>
        </div>
      </div>
      <div v-if="singlePlate === '资料分析'" class="ep-param">
        <label>⑥ 材料类型（真题：一篇材料配5题）</label>
        <select v-model="singleMatType" class="tb-sel">
          <option value="auto">随机轮换（文字/表格/图形/综合）</option>
          <option value="text">纯文字材料</option>
          <option value="table">表格材料</option>
          <option value="chart">图形材料（柱状/折线/饼图）</option>
          <option value="mixed">综合混合（文字+表格+图形）</option>
        </select>
        <span class="ep-hint">组量选 5/10/15/20 时按真题模式出「完整材料 + 每5题一组」（第5题为综合分析题）；选 1 题则出单题。材料类型选「图形/混合」时**必定配真图**：优先 AI+图增强模型绘制；未配置或绘制失败时自动用内置确定性统计图（柱/折线/饼）兜底，不再出现“选了图形材料却只有文字”。</span>
      </div>
      <div class="ep-param">
        <label>
          <input v-model="autoNext" type="checkbox" />
          填涂后自动下一题（答题卡模式；交卷前可改涂，连刷更流畅）
        </label>
      </div>
    </div>

    <div v-if="srcMode === 'import'" class="ep-block">
      <div class="ep-block-hd">📂 题目材料（图片 / PDF / Word / txt / tex）</div>
      <div class="ep-src-row" style="margin-top: 0">
        <label class="btn btn-pri" style="cursor: pointer; text-align: center; margin: 0">
          📁 添加题目材料（可多选）
          <input type="file" accept="image/*,.pdf,.docx,.txt,.tex,.md,.markdown" multiple style="display: none" @change="onFiles" />
        </label>
        <button v-if="imgs.length || textFiles.length" class="btn btn-gh" @click="imgs = []; textFiles = []">🧹 清空材料</button>
      </div>
      <div v-if="imgs.length || textFiles.length" class="ep-note" style="color: var(--hud-cyan)">已添加：图片 {{ imgs.length }} 张 · 文本 {{ textFiles.length }} 份</div>
      <div class="ep-param" style="margin-top: 8px">
        <label>识别后题量上限</label>
        <select v-model="qLimit" class="tb-sel">
          <option :value="0">不限（按卷面裁剪）</option>
          <option :value="10">10 题</option>
          <option :value="20">20 题</option>
          <option :value="50">50 题</option>
        </select>
        <span class="ep-hint">AI 识别整理后先按「📐 卷面构成」裁剪，再按此上限取题（整卷出题里可调整卷面）</span>
      </div>
      <div style="font-size: 11px; color: var(--text3); margin-top: 4px">💡 本地试卷数字化：图片/PDF/Word/txt/tex 上传 → AI 统一整理成题 → 按卷面裁剪组卷作答</div>
      <div v-if="imgs.length" class="pp-imgs">
        <div v-for="(im, i) in imgs" :key="'i' + i" class="pp-thumb"><img :src="im" /><button class="pp-x" @click="rmImg(i)">×</button></div>
      </div>
      <div v-if="textFiles.length" class="pp-txts">
        <div v-for="(t, i) in textFiles" :key="'t' + i" class="pp-txt-item"><span>📄 {{ t.name }}（{{ t.text.length }} 字）</span><button class="pp-x" @click="rmTxt(i)">×</button></div>
      </div>
    </div>

    <div v-if="srcMode === 'zhenti'" class="ep-block">
      <div class="ep-block-hd">📋 真题快练</div>
      <div class="ep-note">💡 真题库首批：国考2017-2026+贵州卷 <b>28套 {{ zhentiIdx?.papers?.reduce((n, p) => n + p.totalQ, 0) || 3583 }}题</b>（网友回忆版）。<b style="color:var(--hud-amber,#fbbf24)">当前收录不全</b>——省考专项/资料分析图表题等持续补充。真题多数无官方答案，作答后由AI判题并给解析。</div>
      <div class="ep-param">
        <label>选择真题卷（{{ zhentiIdx ? (zhentiIdx.papers?.length || 0) + ' 卷' : '加载中…' }}）</label>
        <select v-model="zhentiSel" class="tb-sel">
          <option value="">— 选择年份卷 —</option>
          <option v-for="p in (zhentiIdx?.papers || [])" :key="p.id" :value="p.id">{{ p.title }}（{{ p.totalQ }}题）</option>
        </select>
      </div>
      <div class="ep-param">
        <label>板块选择（不选 = 全部板块）</label>
        <div class="ep-chips">
          <button class="fp-b" :class="{ on: !zhentiPlates.length }" @click="zhentiPlates = []">✅ 全部</button>
          <button v-for="sp in zhentiSecs" :key="sp" class="fp-b" :class="{ on: zhentiPlates.includes(sp) }" @click="toggleZhentiPlate(sp)">{{ sp }}</button>
        </div>
      </div>
      <div class="ep-param">
        <label>练习题量</label>
        <select v-model="zhentiLimit" class="tb-sel">
          <option :value="0">全部</option>
          <option :value="10">10 题</option>
          <option :value="20">20 题</option>
          <option :value="40">40 题</option>
        </select>
      </div>
      <details class="ep-param" style="margin-top:8px">
        <summary style="cursor:pointer">🧭 真题题型分布（规则打标 · {{ zhentiTy ? Object.values(zhentiTy.summary).reduce((a, m) => a + Object.values(m).reduce((x, y) => x + y, 0), 0) : '…' }}题）</summary>
        <div v-if="zhentiTy" style="margin-top:6px">
          <div v-for="(m, sec) in zhentiTy.summary" :key="sec" style="margin-bottom:6px">
            <div style="font-size:12px;color:var(--text3);margin-bottom:2px">{{ sec }}</div>
            <div style="display:flex;flex-wrap:wrap;gap:4px">
              <span v-for="(n, t) in m" :key="t" class="zt-dist-it">{{ t }} {{ n }}</span>
            </div>
          </div>
        </div>
      </details>
    </div>
    <div v-if="srcMode === 'wrong'" class="ep-block">
      <div class="ep-block-hd">📚 错题集组卷</div>
      <div class="ep-note">💡 错题复盘卷：从<b>应用内错题本</b>组卷（作答后不会重复入库），可只刷未复盘的、先刷错得多的，做完自动判分。</div>
      <div class="ep-note" style="color: var(--hud-cyan)">需要导入本地错题文件（错题截图 / 错题 PDF / 新题）？→ 用「📂 导入材料」→ 识别预览 →「📌 全部存入错题本」→ 再回此处组卷二刷。</div>
      <div class="ep-param">
        <label>板块选择（可多选 / 全选，自由组合）</label>
        <div class="ep-chips">
          <button class="fp-b" :class="{ on: !wrongSel.length }" @click="wrongSel = []">✅ 全部</button>
          <button v-for="p in wrongPlates" :key="p" class="fp-b" :class="{ on: wrongSel.includes(p) }" @click="toggleWrongSel(p)">{{ p }}</button>
        </div>
        <span class="ep-hint">选一个或多个板块自由组合组卷，不选 = 全部板块</span>
      </div>
      <div class="ep-param">
        <label>组卷题量</label>
        <select v-model="wrongLimit" class="tb-sel">
          <option :value="0">全部（按板块裁剪）</option>
          <option :value="5">5 题</option>
          <option :value="10">10 题</option>
          <option :value="20">20 题</option>
          <option :value="30">30 题</option>
        </select>
        <span class="ep-hint">先按卷面板块匹配裁剪，再按此上限取题</span>
      </div>
      <div class="ep-param">
        <label>
          <input v-model="onlyPend" type="checkbox" />
          只看未复盘错题（优先攻克待复盘）
        </label>
      </div>
      <div class="ep-param">
        <label>
          <input v-model="byWrongCount" type="checkbox" />
          按错次优先排序（错得越多越靠前）
        </label>
      </div>
      <div class="ep-note">当前错题本：共 <b>{{ store.wqs.length }}</b> 题 · 已复盘 <b>{{ store.wqs.filter((q) => q.reviewed || q.digested).length }}</b> 题</div>
    </div>

    <div v-if="papers.length" class="ep-block">
      <div class="ep-block-hd ep-fold-hd" @click="toggleFold('papers')">
        <span>🗂️ 历史卷子（{{ papers.length }}）</span><span class="ep-fold-ic">{{ openPapers ? '▾ 收起' : '▸ 展开' }}</span>
      </div>
      <div v-if="openPapers" class="ep-list-scroll">
        <div v-for="(p, i) in papers" :key="p.id" class="ep-paper">
          <button class="ep-paper-btn" title="打开原卷（题目已保存，直接作答/重刷，不再重新出题）" @click="openPaper(p)">📄 {{ p.name }} · {{ p.questions.length }} 题 · {{ new Date(p.ts).toLocaleString() }}</button>
          <button class="ep-x" @click="delPaper(i)">×</button>
        </div>
        <div class="ep-note">共 {{ papers.length }} 卷（全部保留，可滚动查看）</div>
      </div>
    </div>

    <div v-if="quizCol.length" class="ep-block">
      <div class="ep-block-hd ep-fold-hd" @click="toggleFold('quizcol')">
        <span>📚 出题集（{{ quizCol.length }}）</span><span class="ep-fold-ic">{{ openQuizCol ? '▾ 收起' : '▸ 展开' }}</span>
      </div>
      <div v-if="openQuizCol">
        <div class="ep-note">单题快练/出题自动收纳，支持二刷：先做题 → 点选项 → 再显示答案与解析</div>
        <div class="ep-list-scroll">
          <div v-for="(c, i) in quizCol" :key="c.id" class="ep-paper">
            <span class="qc-status" :class="c.lastOk === true ? 'ok' : c.lastOk === false ? 'no' : ''">{{ c.lastOk === true ? '✓' : c.lastOk === false ? '✗' : '•' }}</span>
            <button class="ep-paper-btn" :title="'【' + c.subject + (c.variant ? '·' + c.variant : '') + '】' + (c.stem || '').slice(0, 80) + '（累计错' + c.wrongCount + '次 · 连对' + c.correctStreak + '）'" @click="startRedo(c)">{{ c.subject }}{{ c.variant ? '·' + c.variant : '' }} · {{ (c.stem || '').slice(0, 22) }}…</button>
            <button class="ep-x" @click="delQuizCol(i)">×</button>
          </div>
        </div>
        <div class="ep-note">共 {{ quizCol.length }} 题（全部保留，可滚动查看）</div>
        <button class="btn btn-gh" style="margin-top: 6px" @click="clearQuizCol()">🗑 清空出题集</button>
      </div>
    </div>

    <div v-if="results.length" class="ep-block">
      <div class="ep-block-hd ep-fold-hd" @click="toggleFold('results')">
        <span>🏅 考试战绩（{{ results.length }}）</span><span class="ep-fold-ic">{{ openResults ? '▾ 收起' : '▸ 展开' }}</span>
      </div>
      <div v-if="openResults">
        <div class="ep-stats">平均正确率 <b>{{ avgRate }}%</b> · 已完成 <b>{{ results.length }}</b> 卷</div>
        <div class="ep-list-scroll">
          <div v-for="(r, i) in results" :key="i" class="pp-item">
            <div class="pp-info"><div class="pp-name">{{ r.name }}</div><div class="pp-meta">{{ r.n }} 题 · {{ new Date(r.ts).toLocaleString() }}</div></div>
            <span class="pp-score" :class="r.rate >= 80 ? 'ok' : r.rate >= 60 ? 'mid' : 'no'">{{ r.score }}/{{ r.n }} · {{ r.rate }}%</span>
            <span class="pp-meta">⏱ {{ fmt(r.sec) }}</span>
          </div>
        </div>
        <div class="ep-note">共 {{ results.length }} 次（全部保留，可滚动查看）</div>
      </div>
    </div>

    <div class="pnl-btns">
      <button class="btn btn-gh" @click="cancel()">取消</button>
      <button class="btn btn-pri" @click="start()">
        🚀 {{ srcMode === 'single' ? '开始单题快练' : srcMode === 'ai' ? '开始考试（AI 出题）' : srcMode === 'import' ? '识别并组卷' : '错题组卷开始' }}
      </button>
    </div>
  </div>
</template>