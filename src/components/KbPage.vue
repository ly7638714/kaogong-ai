<script setup>
import { ref, computed, watch } from 'vue'
import { store } from '../store'
import { CARDS } from '../kb/cards-index'
import { markLearned } from '../utils/learned'
import KnowledgeGraph from './KnowledgeGraph.vue'

// R5：错题详情「🔍 知识库打开」→ 定位到对应方法卡（切 tab + 展开卡 + 标记已学）
window.addEventListener('xc-open-kb-card', (e) => {
  const id = e && e.detail
  if (!id) return
  store.tab = 'kb'
  activeShelf.value = 'all'
  view.value = 'cards'
  cardOpen.value = id
  try { markLearned(id) } catch (e) {}
})

const activeShelf = ref('all')
const view = ref('quick') // quick=核心速查 | cards=理论技巧卡 | graph=神经网络图谱

const shelvesList = [
  { key: 'all', name: '📚 全部' },
  { key: '判断推理', name: '🧠 判断推理' },
  { key: '言语理解', name: '📖 言语理解' },
  { key: '数量关系', name: '🔢 数量' },
  { key: '资料分析', name: '📈 资料' },
  { key: '政治理论', name: '🏛️ 政治' },
  { key: '常识判断', name: '🌍 常识' },
  { key: '类比推理', name: '🔗 类比' },
  { key: '定义判断', name: '📋 定义' },
  { key: '图形推理', name: '🔷 图推' }
]
// 板块名 → mode key
function mapMode(shelf) {
  const map = {
    判断推理: 'luoji',
    言语理解: 'zhanggong',
    数量关系: 'shuliang',
    资料分析: 'ziliao',
    政治理论: 'zhengzhi',
    常识判断: 'changshi',
    类比推理: 'leibi',
    定义判断: 'dingyi',
    图形推理: 'tutu'
  }
  return map[shelf] || 'all'
}

// ===== 理论技巧卡：名师蒸馏知识卡（437 张，零 API 碎片化阅读） =====
const cards = CARDS || []
const cardShelf = ref('all')
const cardTeacher = ref('all')
const cardKw = ref('')
const cardOpen = ref(null)
const cardShelves = ['all', '判断推理', '言语理解', '数量关系', '资料分析', '常识判断', '政治理论']
const teachers = computed(() => [...new Set(cards.map((c) => c.source).filter(Boolean))].sort())
const shownCards = computed(() =>
  cards.filter((c) => {
    if (cardShelf.value !== 'all' && c.plate !== cardShelf.value) return false
    if (cardTeacher.value !== 'all' && c.source !== cardTeacher.value) return false
    const kw = cardKw.value.trim()
    if (kw) {
      const blob = [c.type, c.tip, (c.signs || []).join(' '), (c.steps || []).join(' '), (c.traps || []).join(' ')].join(' ')
      if (!blob.includes(kw)) return false
    }
    return true
  })
)
// 理论技巧卡：板块 → 老师 → 卡片 三级分组
const cardGroups = computed(() => {
  const m = {}
  for (const c of shownCards.value) {
    const plate = c.plate || '未分类'
    const src = c.source || '综合'
    m[plate] = m[plate] || {}
    m[plate][src] = m[plate][src] || []
    m[plate][src].push(c)
  }
  return Object.entries(m).map(([plate, bySrc]) => ({
    plate,
    srcs: Object.entries(bySrc),
    total: Object.values(bySrc).reduce((n, arr) => n + arr.length, 0)
  }))
})
// 核心速查：板块 → 老师 → 卡（点击即问）
const quickCards = computed(() =>
  activeShelf.value === 'all' ? cards : cards.filter((c) => c.plate === activeShelf.value)
)
const quickGroups = computed(() => {
  const byPlate = {}
  for (const c of quickCards.value) {
    const plate = c.plate || '未分类'
    const src = c.source || '综合'
    byPlate[plate] = byPlate[plate] || {}
    byPlate[plate][src] = byPlate[plate][src] || []
    byPlate[plate][src].push(c)
  }
  return Object.entries(byPlate).map(([plate, bySrc]) => ({
    plate,
    srcs: Object.entries(bySrc),
    total: Object.values(bySrc).reduce((n, arr) => n + arr.length, 0)
  }))
})
function askCard(c) {
  markLearned(c.id) // 学习印记：一键问 AI = 学过 → 知识图谱星球点亮
  store.mode = mapMode(c.plate)
  store.tab = 'chat'
  store.pendingAsk =
    '请把「' + c.type + '」' + (c.source ? '（来源：' + c.source + '）' : '') + '讲透，我要彻底看懂：\n' +
    '① 一句话说清它是什么、适用于什么题型/场景；\n' +
    '② 分步骤讲清具体怎么做，每步说清“为什么”；\n' +
    '③ 列出 2-3 个最容易踩的坑；\n' +
    '④ 给一句能记住的口诀；\n' +
    '⑤ 出一道检验题（四个选项，最后单独一行【正确答案】X）。\n' +
    '我参考的知识卡内容：\n特征：' + (c.signs || []).join('、') + '\n步骤：' + (c.steps || []).join(' → ') + '\n陷阱：' + (c.traps || []).join('、') + '\n口诀：' + c.tip
}
// 展开/收起知识卡详情；点开查看 = 学过 → 知识图谱星球点亮
function toggleCard(c) {
  cardOpen.value = cardOpen.value === c.id ? null : c.id
  if (cardOpen.value === c.id) markLearned(c.id)
}
// ===== 卡片视图 UX：入门引导 / 板块折叠目录 / 一键展开收起 =====
const cardGuide = ref(true) // 是否显示“从哪开始”引导
const openPlates = ref(new Set()) // 默认全部折叠 = 目录模式：先看大纲（板块+卡数+建议先看），点开再进内容，杜绝一屏长滚
function togglePlate(p) {
  const s = new Set(openPlates.value)
  s.has(p) ? s.delete(p) : s.add(p)
  openPlates.value = s
}
function expandAll() {
  openPlates.value = new Set(cardGroups.value.map((g) => g.plate))
}
// 一键收纳：收起所有卡片详情 + 折叠所有板块，一键回到最干净的目录
function tidyAll() {
  cardOpen.value = null
  openPlates.value = new Set()
}
// 筛选变化时自动展开命中的板块，避免“筛了却看不到”
watch([cardShelf, cardTeacher, cardKw], () => {
  openPlates.value = new Set(cardGroups.value.map((g) => g.plate))
})
// 筛选面板：默认折叠=单行；点开才展开 chips（避免一进页面就被 60 个老师名轰炸）
const filtersOpen = ref(false)
function toggleFilters() {
  filtersOpen.value = !filtersOpen.value
}
// 当前生效的筛选条件数（用于折叠态的角标）
const activeFilterCount = computed(() => {
  let n = 0
  if (cardShelf.value !== 'all') n++
  if (cardTeacher.value !== 'all') n++
  if (cardKw.value.trim()) n++
  return n
})
// 一键清除全部筛选
function clearFilters() {
  cardShelf.value = 'all'
  cardTeacher.value = 'all'
  cardKw.value = ''
}
// 每板块建议先看的卡（第一张即入口）；预计算成映射，避免渲染期反复 find
const firstOfPlateMap = computed(() => {
  const m = {}
  for (const c of shownCards.value) if (!m[c.plate]) m[c.plate] = c
  return m
})
// 收起态也展示卡内有什么：特征/步骤/陷阱/例题 统计；卡片静态，一次性预计算供渲染复用
function cardStats(c) {
  const arr = []
  if (c.signs && c.signs.length) arr.push('🔍 特征 ' + c.signs.length)
  if (c.steps && c.steps.length) arr.push('🪜 步骤 ' + c.steps.length)
  if (c.traps && c.traps.length) arr.push('⚠️ 陷阱 ' + c.traps.length)
  if (c.example) arr.push('📝 例题')
  return arr
}
const statsMap = computed(() => new Map(cards.map((c) => [c.id, cardStats(c)])))
// 随机开卡：展开所属板块 → 定位滚动到该卡
function startRandom() {
  const pool = shownCards.value.length ? shownCards.value : cards
  if (!pool.length) return
  const c = pool[Math.floor(Math.random() * pool.length)]
  cardOpen.value = c.id
  const s = new Set(openPlates.value)
  s.add(c.plate)
  openPlates.value = s
  requestAnimationFrame(() => {
    const el = document.getElementById('kc-' + c.id)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
}
</script>

<template>
  <div class="page on kb-page">
    <div class="page-inner kb-inner">
      <div class="kb-mode-switch">
        <button class="btn btn-gh" :class="{ on: view === 'quick' }" @click="view = 'quick'">⭐ 核心速查</button>
        <button class="btn btn-gh" :class="{ on: view === 'cards' }" @click="view = 'cards'">📇 理论技巧卡（{{ cards.length }}）</button>
        <button class="btn btn-gh" :class="{ on: view === 'graph' }" @click="view = 'graph'">🧠 知识图谱</button>
      </div>
      <!-- ========== 核心速查：板块 → 老师 → 核心知识卡（点击即问） ========== -->
      <template v-if="view === 'quick'">
      <div class="sec-t">⭐ 核心速查 · {{ cards.length }} 张核心知识卡，按板块 → 老师分层浏览，点击即问 AI 讲透</div>
      <!-- 板块抽屉切换 -->
      <div class="shelf-tabs">
        <button
          v-for="s in shelvesList"
          :key="s.key"
          class="shelf-tab"
          :class="{ on: activeShelf === s.key }"
          @click="activeShelf = s.key"
        >
          {{ s.name }}
        </button>
      </div>
      <div class="kb-list">
        <div v-for="g in quickGroups" :key="g.plate" class="kb-group kb-quick">
          <div class="kl-title">{{ g.plate }} · {{ g.total }} 卡 · {{ g.srcs.length }} 位老师</div>
          <div v-for="[src, arr] in g.srcs" :key="src" class="kc-src">
            <div class="kc-src-t">🧑‍🏫 {{ src }}（{{ arr.length }}）</div>
            <div
              v-for="c in arr"
              :key="c.id"
              class="kc-row"
              :title="'问 AI 讲透「' + c.type + '」'"
              @click="askCard(c)"
            >
              <div class="kc-hd">
                <span class="kc-type">{{ c.type }}</span>
                <span class="kc-tip-badge">💡 {{ c.tip }}</span>
                <span class="kc-qask">💬 问 AI</span>
              </div>
            </div>
          </div>
        </div>
        <div v-if="!quickGroups.length" class="empty">
          <div class="empty-i">🔍</div>
          <div class="empty-t">该板块暂无知识卡</div>
        </div>
      </div>
      </template>
      <!-- ========== 理论技巧卡：名师蒸馏知识库 ========== -->
      <template v-else-if="view === 'cards'">
        <div class="sec-t">📇 名师理论技巧卡 · 六大板块 {{ cards.length }} 张，来源为本地名师讲义蒸馏</div>
        <!-- 入门引导：解决“不知道从何开始” -->
        <div v-if="cardGuide" class="kc-guide">
          <div class="kc-guide-hd">
            <span class="kc-guide-t">🧭 从哪开始学？</span>
            <button class="kc-guide-x" @click="cardGuide = false">✕</button>
          </div>
          <div class="kc-guide-path">
            <span class="kgp-step"><b>1</b>判断推理</span><i>→</i>
            <span class="kgp-step"><b>2</b>言语理解</span><i>→</i>
            <span class="kgp-step"><b>3</b>资料分析</span><i>→</i>
            <span class="kgp-step"><b>4</b>数量关系</span><i>→</i>
            <span class="kgp-step"><b>5</b>常识·政治</span>
          </div>
          <div class="kc-guide-acts">
            <button class="btn btn-pri" @click="startRandom()">🎲 随机来一张卡</button>
            <button class="btn btn-gh" @click="cardGuide = false">我熟悉了，开始刷</button>
          </div>
          <div class="kc-guide-tip">💡 每张卡阅读顺序：<b>特征</b>（判断题型）→ <b>操作步骤</b>（怎么做）→ <b>陷阱</b>（易错点）→ <b>例题</b>（检验）→ 卡住就点「💬 问 AI 讲透」</div>
        </div>
        <!-- 吸顶快捷条：仅一行（搜索+一键收纳+全部展开），不遮挡卡片内容 -->
        <div class="kc-bar">
          <input v-model="cardKw" class="kc-search" placeholder="🔍 搜 考点 / 口诀 / 步骤…" />
          <button class="shelf-tab" title="收起所有卡片详情并折叠全部板块" @click="tidyAll()">📥 一键收纳</button>
          <button class="shelf-tab" title="展开全部板块（卡片保持单行）" @click="expandAll()">📤 全部展开</button>
          <span class="kc-count">共 {{ shownCards.length }} 张</span>
        </div>
        <!-- 筛选区（可收纳：默认折叠成单行，点开才展开 chips） -->
        <div class="kc-filters" :class="{ open: filtersOpen }">
          <div class="kc-filters-hd" @click="toggleFilters">
            <span class="kc-filters-icon">{{ filtersOpen ? '🔼' : '🔽' }}</span>
            <span class="kc-filters-t">筛选面板</span>
            <span v-if="activeFilterCount > 0" class="kc-filters-badge">{{ activeFilterCount }}</span>
            <span v-if="!filtersOpen" class="kc-filters-state">
              · 板块: {{ cardShelf === 'all' ? '全部' : cardShelf }} | 老师: {{ cardTeacher === 'all' ? '全部' : cardTeacher }}{{ cardKw.trim() ? ' | 关键词: ' + cardKw.trim() : '' }}
            </span>
            <button v-if="activeFilterCount > 0" class="kc-filters-clr" @click.stop="clearFilters()">× 清除</button>
          </div>
          <div v-if="filtersOpen" class="kc-filters-body">
            <div class="kc-filters-group">
              <span class="kc-filters-label">📂 板块</span>
              <div class="kc-filters-chips">
                <button v-for="s in cardShelves" :key="s" class="shelf-tab" :class="{ on: cardShelf === s }" @click="cardShelf = s">{{ s === 'all' ? '全部' : s }}</button>
              </div>
            </div>
            <div class="kc-filters-group">
              <span class="kc-filters-label">🧑‍🏫 老师</span>
              <div class="kc-filters-chips kc-filters-chips-scroll">
                <button class="shelf-tab" :class="{ on: cardTeacher === 'all' }" @click="cardTeacher = 'all'">全部</button>
                <button v-for="t in teachers" :key="t" class="shelf-tab" :class="{ on: cardTeacher === t }" @click="cardTeacher = t">{{ t }}</button>
              </div>
            </div>
            <div v-if="activeFilterCount > 0" class="kc-filters-foot">
              <button class="kc-filters-clr-btn" @click="clearFilters()">× 清除全部筛选</button>
            </div>
          </div>
        </div>
        <!-- 板块折叠目录：先看大纲，再进内容，不用一屏刷到底 -->
        <div class="kb-list">
          <div v-for="g in cardGroups" :key="g.plate" class="kb-group kb-plate" :class="{ on: openPlates.has(g.plate) }">
            <div class="kp-hd" @click="togglePlate(g.plate)">
              <span class="kp-arrow">{{ openPlates.has(g.plate) ? '▾' : '▸' }}</span>
              <span class="kp-name">{{ g.plate }}</span>
              <span class="kp-count">{{ g.total }} 卡 · {{ g.srcs.length }} 位老师</span>
              <span v-if="firstOfPlateMap[g.plate]" class="kp-first">建议先看「{{ firstOfPlateMap[g.plate].type }}」</span>
            </div>
            <div v-if="openPlates.has(g.plate)" class="kp-body">
              <div v-for="[src, arr] in g.srcs" :key="src" class="kc-src">
                <div class="kc-src-t">🧑‍🏫 {{ src }}（{{ arr.length }}）</div>
                <div
                  v-for="c in arr"
                  :id="'kc-' + c.id"
                  :key="c.id"
                  class="kc-row"
                  :class="{ open: cardOpen === c.id }"
                  @click="toggleCard(c)"
                >
                  <div class="kc-hd">
                    <span class="kc-type">{{ c.type }}</span>
                    <span class="kc-tip-badge">💡 {{ c.tip }}</span>
                    <span class="kc-meta-line">
                      <span v-for="st in statsMap.get(c.id)" :key="st" class="kc-meta-i">{{ st }}</span>
                    </span>
                    <span class="kc-arrow">{{ cardOpen === c.id ? '▾' : '▸' }}</span>
                  </div>
                  <div v-if="cardOpen === c.id" class="kc-body">
                    <div v-if="c.signs && c.signs.length" class="kc-sec"><b>🔍 特征</b><div class="kc-tags"><span v-for="s in c.signs" :key="s" class="kc-tag">{{ s }}</span></div></div>
                    <div v-if="c.steps && c.steps.length" class="kc-sec"><b>🪜 操作步骤</b><ol class="kc-steps"><li v-for="(s, i) in c.steps" :key="i">{{ s }}</li></ol></div>
                    <div v-if="c.traps && c.traps.length" class="kc-sec"><b>⚠️ 常见陷阱</b><div class="kc-tags"><span v-for="t in c.traps" :key="t" class="kc-tag danger">{{ t }}</span></div></div>
                    <div v-if="c.example" class="kc-ex">
                      <div class="kc-ex-q">📝 {{ c.example.q }}</div>
                      <div v-if="c.example.opts" class="kc-ex-opts"><span v-for="o in c.example.opts" :key="o" class="kc-opt">{{ o }}</span></div>
                      <div class="kc-ex-a">✅ 答案：{{ c.example.answer }} · {{ c.example.path }}</div>
                    </div>
                    <div class="ko-acts">
                      <button class="btn btn-gh" @click.stop="askCard(c)">💬 问 AI 讲透</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div v-if="!cardGroups.length" class="empty">
            <div class="empty-i">🔍</div>
            <div class="empty-t">没有匹配的知识卡，换个关键词或筛选试试</div>
          </div>
        </div>
      </template>
      <!-- ========== 神经网络知识图谱 ========== -->
      <KnowledgeGraph v-else-if="view === 'graph'" :cards="cards" @ask="askCard" />
    </div>
  </div>
</template>

<style scoped>
.kb-page { padding: 10px 12px; }
.kb-inner { min-height: 100%; }
.shelf-tabs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.shelf-tab {
  padding: 4px 11px;
  border-radius: 999px;
  border: 1px solid var(--glass-border);
  background: var(--glass-bg);
  color: var(--text2);
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
}
.shelf-tab.on {
  background: linear-gradient(135deg, rgba(34, 211, 238, 0.22), rgba(59, 130, 246, 0.22));
  border-color: var(--hud-cyan);
  color: #fff;
}
.kb-group { margin-bottom: 16px; }
.kl-title { font-size: 13px; font-weight: 700; color: var(--hud-cyan); margin-bottom: 8px; }
/* 老师分组（核心速查 + 理论技巧卡共用） */
.kc-src { margin-top: 4px; }
.kc-src-t { font-size: 12px; font-weight: 700; color: var(--text2); margin: 8px 0 4px; }
.kc-qask { font-size: 10.5px; color: var(--hud-cyan); border: 1px solid rgba(34, 211, 238, 0.35); border-radius: 999px; padding: 1px 9px; flex-shrink: 0; }
.kb-mode-switch { display: flex; gap: 8px; margin-bottom: 10px; }
.kb-mode-switch .btn.on { border-color: var(--hud-cyan); background: rgba(34, 211, 238, 0.14); color: #fff; }
/* ===== 卡片视图 UX：引导 / 折叠目录 / 吸顶筛选 ===== */
.kc-guide {
  background: linear-gradient(135deg, rgba(34, 211, 238, 0.12), rgba(59, 130, 246, 0.12));
  border: 1px solid rgba(34, 211, 238, 0.3);
  border-radius: 14px;
  padding: 10px 12px;
  margin-bottom: 12px;
}
.kc-guide-hd { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.kc-guide-t { font-weight: 800; font-size: 13.5px; color: var(--hud-cyan); }
.kc-guide-x { background: none; border: none; color: var(--text3); font-size: 13px; cursor: pointer; font-family: inherit; padding: 0 2px; }
.kc-guide-path { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: center; font-size: 12.5px; color: var(--text2); margin-bottom: 8px; }
.kgp-step { display: inline-flex; align-items: center; gap: 5px; }
.kgp-step b { display: inline-flex; align-items: center; justify-content: center; min-width: 17px; height: 17px; border-radius: 50%; background: linear-gradient(135deg, #22d3ee, #3b82f6); color: #fff; font-size: 11px; padding: 0 4px; }
.kc-guide-path i { color: var(--text3); font-style: normal; }
.kc-guide-acts { display: flex; gap: 8px; margin-bottom: 8px; }
.kc-guide-acts .btn { padding: 5px 12px; font-size: 12.5px; }
.kc-guide-tip { font-size: 11.5px; color: var(--text2); line-height: 1.6; border-top: 1px dashed var(--glass-border); padding-top: 7px; }
.kc-guide-tip b { color: var(--hud-cyan); }

.kc-bar { position: sticky; top: 0; z-index: 6; display: flex; align-items: center; gap: 6px; padding: 6px 0 8px; background: var(--bg); }
.kc-bar .kc-search { flex: 1; min-width: 0; margin-bottom: 0; padding: 7px 10px; }
.kc-bar .shelf-tab { flex-shrink: 0; padding: 5px 10px; font-size: 11.5px; }
.kc-bar .kc-count { font-size: 11px; color: var(--text3); flex-shrink: 0; padding-left: 4px; }
/* 筛选面板：可收纳，默认折叠为单行，点开展开 chips（老师 chips 横向滚动避免撑高） */
.kc-filters { border: 1px solid var(--glass-border); border-radius: 12px; background: var(--glass-bg); margin-bottom: 6px; overflow: hidden; }
.kc-filters-hd { display: flex; align-items: center; gap: 8px; padding: 7px 10px; cursor: pointer; user-select: none; font-size: 12.5px; }
.kc-filters-hd:hover { background: rgba(34, 211, 238, 0.04); }
.kc-filters-icon { font-size: 11px; color: var(--text3); }
.kc-filters-t { font-weight: 700; color: var(--text); }
.kc-filters-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 16px; height: 16px; border-radius: 8px; background: var(--hud-cyan); color: #fff; font-size: 10px; font-weight: 800; padding: 0 5px; flex-shrink: 0; }
.kc-filters-state { color: var(--text3); font-size: 11.5px; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kc-filters-clr { background: none; border: 1px solid rgba(251, 113, 133, 0.3); color: #fda4af; font-size: 11px; padding: 2px 8px; border-radius: 999px; cursor: pointer; font-family: inherit; flex-shrink: 0; }
.kc-filters-body { padding: 4px 10px 10px; border-top: 1px dashed var(--glass-border); }
.kc-filters-group { display: flex; align-items: flex-start; gap: 8px; margin-top: 8px; }
.kc-filters-label { font-size: 11.5px; color: var(--text3); padding-top: 5px; flex-shrink: 0; width: 44px; }
.kc-filters-chips { display: flex; gap: 5px; flex-wrap: wrap; flex: 1; min-width: 0; }
.kc-filters-chips .shelf-tab { font-size: 11px; padding: 3px 8px; }
.kc-filters-chips-scroll { flex-wrap: nowrap; overflow-x: auto; padding-bottom: 4px; scrollbar-width: thin; }
.kc-filters-chips-scroll .shelf-tab { flex-shrink: 0; }
.kc-filters-foot { display: flex; justify-content: flex-end; margin-top: 8px; }
.kc-filters-clr-btn { background: none; border: none; color: #fda4af; font-size: 11.5px; cursor: pointer; font-family: inherit; padding: 2px 6px; }
.kc-filters-clr-btn:hover { text-decoration: underline; }

.kb-plate { border: 1px solid var(--glass-border); border-radius: 14px; overflow: hidden; background: var(--glass-bg); margin-bottom: 10px; }
.kb-plate.on { border-color: rgba(34, 211, 238, 0.35); }
.kp-hd { display: flex; align-items: center; gap: 8px; padding: 10px 12px; cursor: pointer; user-select: none; }
.kp-hd:hover { background: rgba(34, 211, 238, 0.06); }
.kp-arrow { color: var(--text3); font-size: 12px; width: 12px; }
.kp-name { font-weight: 800; font-size: 13.5px; color: var(--text); }
.kb-plate.on .kp-name { color: var(--hud-cyan); }
.kp-count { font-size: 11px; color: var(--text3); background: var(--surface); padding: 1px 8px; border-radius: 999px; flex-shrink: 0; }
.kp-first { font-size: 11px; color: var(--text3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kp-body { padding: 4px 12px 12px; border-top: 1px dashed var(--glass-border); }

.kc-meta-i { font-size: 10.5px; color: var(--text3); border: 1px solid var(--glass-border); border-radius: 6px; padding: 1px 7px; background: rgba(255, 255, 255, 0.03); white-space: nowrap; }
/* ===== 卡片视图 UX 结束 ===== */
.kc-search { width: 100%; padding: 8px 12px; border-radius: 10px; border: 1px solid var(--glass-border); background: var(--glass-bg); color: var(--text); font-size: 13px; margin-bottom: 8px; box-sizing: border-box; }
.kc-chips { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
.kc-row { padding: 7px 10px; margin-bottom: 2px; border-radius: 9px; cursor: pointer; transition: background .15s; }
.kc-row:hover { background: rgba(34, 211, 238, 0.06); }
.kc-row.open { background: rgba(34, 211, 238, 0.1); }
.kc-hd { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.kc-type { font-size: 12px; font-weight: 800; color: var(--hud-cyan); flex-shrink: 0; }
.kc-tip-badge { flex: 1; min-width: 100px; font-size: 11.5px; color: var(--text2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kc-meta-line { display: inline-flex; gap: 4px; margin-left: auto; flex-shrink: 0; }
.kc-arrow { color: var(--text3); font-size: 11px; flex-shrink: 0; }
.kc-body { margin: 4px 0 8px; padding: 10px 12px; background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: 10px; }
.kc-sec { margin-bottom: 8px; font-size: 12.5px; color: var(--text2); }
.kc-tags { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 4px; }
.kc-tag { font-size: 11px; background: rgba(34, 211, 238, .1); color: #7dd3fc; border: 1px solid rgba(34, 211, 238, .25); padding: 2px 8px; border-radius: 999px; }
.kc-tag.danger { background: rgba(251, 113, 133, .1); color: #fda4af; border-color: rgba(251, 113, 133, .3); }
.kc-steps { margin: 4px 0 0 18px; padding: 0; }
.kc-steps li { margin-bottom: 3px; }
.kc-ex { background: rgba(59, 130, 246, .08); border: 1px solid rgba(59, 130, 246, .2); border-radius: 10px; padding: 8px 10px; margin: 8px 0; font-size: 12.5px; }
.kc-ex-q { color: var(--text); }
.kc-ex-opts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 5px; }
.kc-opt { font-size: 11.5px; background: rgba(255,255,255,.05); border: 1px solid var(--glass-border); border-radius: 6px; padding: 2px 8px; }
.kc-ex-a { margin-top: 5px; color: #86efac; font-weight: 700; }
</style>
