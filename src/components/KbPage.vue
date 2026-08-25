<script setup>
import { ref, computed } from 'vue'
import { store } from '../store'
import { readBooks } from '../kb'
import ShelfScene from './ShelfScene.vue'

const books = readBooks()
const activeShelf = ref('all')
// 视图：默认 2D 速查（快、省资源），3D 书柜为可切换的沉浸式展示
const showShelf = ref(false)

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
const shownBooks = computed(() =>
  activeShelf.value === 'all' ? books : books.filter((b) => b.shelf === activeShelf.value)
)
// 按板块分组，2D 速查更好扫
const groupedBooks = computed(() => {
  const m = {}
  for (const b of shownBooks.value) (m[b.shelf] = m[b.shelf] || []).push(b)
  return Object.entries(m).map(([shelf, items]) => ({ shelf, items }))
})
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
// 点击书 → 切到对话页并填入该书提问（点击即问）
function ask(b) {
  store.mode = mapMode(b.shelf)
  store.tab = 'chat'
  setTimeout(() => window.dispatchEvent(new CustomEvent('xc-ask', { detail: b.q })), 60)
}
// 2D 卡片展开：查看内置要点（离线可用，不耗 API）
const open = ref(null)
function toggleBook(b) {
  open.value = open.value === b.name ? null : b.name
}
function studyTip(type) {
  return {
    理论: '先理解方法逻辑 → 问 AI 讲透 → 再做 2 道例题检验',
    技巧: '先背口诀/步骤 → 限时练 3 道 → 把易错点记进错题本',
    例题: '先自己做（不看解析）→ 再对解析 → 记录错因与秒杀规律'
  }[type] || '先问 AI 讲透 → 做例题检验 → 把易错点记进错题本'
}
function quizBook(b) {
  store.mode = mapMode(b.shelf)
  store.tab = 'chat'
  setTimeout(() => window.dispatchEvent(new CustomEvent('xc-ask', { detail: '请针对「' + b.name + '」这个方法出一道检验题，输出选项并单独一行输出【正确答案】X' })), 60)
}
</script>

<template>
  <div class="page on kb-page">
    <div class="page-inner kb-inner">
      <div class="sec-t">📚 知识宝典（2D 速查为主 · 点击即问；3D 书柜可选展示）</div>
      <div class="kb-view-toggle">
        <button class="kb-vt" :class="{ on: !showShelf }" @click="showShelf = false">📚 2D 速查</button>
        <button class="kb-vt" :class="{ on: showShelf }" @click="showShelf = true">🕹️ 3D 书柜</button>
      </div>
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
      <!-- 3D 沉浸式书柜（可选展示） -->
      <div v-if="showShelf" class="shelf-wrap">
        <ShelfScene @ask="ask" />
      </div>
      <!-- 2D 方法速查（默认主界面）：按板块分组，点击即问 -->
      <div class="kb-list">
        <div v-for="g in groupedBooks" :key="g.shelf" class="kb-group">
          <div class="kl-title">{{ g.shelf }}</div>
          <div class="kl-grid">
            <div
              v-for="b in g.items"
              :key="b.name"
              class="kb-book-card"
              :class="{ open: open === b.name }"
              @click="toggleBook(b)"
            >
              <div class="kb-card-top">
                <span class="kb-em">{{ b.icon }}</span>
                <span class="kb-type" :class="'t-' + (b.type || '')">{{ b.type || '知识' }}</span>
              </div>
              <div class="kb-n">{{ b.name }}</div>
              <div class="kb-s">{{ b.shelf }} · 点击看要点</div>
              <div v-if="open === b.name" class="kb-open">
                <div class="ko-line">📖 类型：{{ b.type || '知识' }}</div>
                <div class="ko-line">💡 核心：{{ b.q }}</div>
                <div class="ko-tip">🧭 {{ studyTip(b.type) }}</div>
                <div class="ko-acts">
                  <button class="btn btn-pri" @click.stop="ask(b)">💬 问 AI 讲透</button>
                  <button class="btn btn-gh" @click.stop="quizBook(b)">🎲 出题检验</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.kb-page { padding: 10px 12px; }
.kb-inner { min-height: 100%; }
.kb-view-toggle {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}
.kb-vt {
  padding: 5px 14px;
  border-radius: 999px;
  border: 1px solid var(--glass-border);
  background: var(--glass-bg);
  color: var(--text2);
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
}
.kb-vt.on {
  background: linear-gradient(135deg, rgba(34, 211, 238, 0.22), rgba(59, 130, 246, 0.22));
  border-color: var(--hud-cyan);
  color: #fff;
}
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
.shelf-wrap {
  position: relative;
  height: 260px;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid var(--glass-border);
  margin-bottom: 16px;
}
.kb-group { margin-bottom: 16px; }
.kl-title { font-size: 13px; font-weight: 700; color: var(--hud-cyan); margin-bottom: 8px; }
.kl-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 10px;
}
.kb-book-card {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: 12px;
  padding: 10px 12px;
  cursor: pointer;
  transition: all 0.2s;
  backdrop-filter: blur(10px);
}
.kb-book-card:hover {
  transform: translateY(-3px);
  border-color: var(--glass-border-hi);
  box-shadow: var(--grad-glow);
}
.kb-card-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.kb-em { font-size: 20px; }
.kb-type { font-size: 10px; padding: 1px 7px; border-radius: 6px; font-weight: 700; }
.t-理论 { background: rgba(59, 130, 246, 0.16); color: #93c5fd; }
.t-技巧 { background: rgba(34, 211, 238, 0.16); color: #7dd3fc; }
.t-例题 { background: rgba(251, 191, 36, 0.16); color: #fbbf24; }
.kb-n { font-weight: 700; font-size: 14px; margin-bottom: 3px; }
.kb-s { font-size: 11px; color: var(--text3); }
</style>
