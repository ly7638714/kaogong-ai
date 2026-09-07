<script setup>
import { onMounted, onUnmounted, ref, computed } from 'vue'
import { createLibrary } from '../scene/bookShelf'
import { readBooks } from '../kb'
import { activeCfg, chatOnce, buildSys } from '../api'

const el = ref(null)
const emit = defineEmits(['ask'])
const currentBook = ref(null)
const page = ref(0)
let engine = null
let raf = 0
let dispose = null
const books = readBooks()
const loading = ref(false)
const fallbackUsed = ref(false)
// AI 生成的章节目录（`{title, body}` 数组），页 = 封面 + 这些章节
const chapterPages = ref([])
let bookSeq = 0
// 已读书籍记忆（书脊金色已读标记）
const readed = ref([])
try {
  readed.value = JSON.parse(localStorage.getItem('xc_lib_read') || '[]')
} catch (e) {}
function bookRead(name) {
  if (name && !readed.value.includes(name)) {
    readed.value.push(name)
    try {
      localStorage.setItem('xc_lib_read', JSON.stringify(readed.value))
    } catch (e) {}
    if (engine) engine.setRead(name)
  }
}

function turn(dir) {  page.value = Math.max(0, Math.min(totalPages.value - 1, page.value + dir))
  // 只要翻开任一张正文页即标记已读（书脊金标）
  if (page.value > 0 && currentBook.value) bookRead(currentBook.value.name)
}
function closeAndPut() {
  currentBook.value = null
  onBookChange(null)
  chapterPages.value = []
  if (engine) engine.putBack()
}
const totalPages = computed(() => 1 + chapterPages.value.length) // 封面 + N 章节
// 自动生成的每页内容
const pageContent = computed(() => {
  const b = currentBook.value
  if (!b) return []
  const pages = []
  // 封面
  pages.push({ t: b.name, body: '「' + (b.type || '知识') + '」知识书 · ' + b.shelf + '\n\n' + (b.desc || '') })
  // 内置要点：书的核心知识点（不依赖 AI，点开即有内容）
  pages.push({
    t: '📌 本书核心知识点（内置）',
    body: '· 板块：' + (b.shelf || '未分类') + '\n' +
      '· 类型：' + (b.type || '知识') + '\n\n' +
      '【这本书要掌握的核心内容】\n' + (b.q || '') + '\n\n' +
      '（下方可继续翻开 AI 详细展开，或用「💬 书内提问」针对本书追问）'
  })
  // 章节
  for (const ch of chapterPages.value) pages.push({ t: ch.title, body: ch.body })
  // 末页收尾
  pages.push({ t: '末页 · 自查清单', body: '□ 我能复述本书核心要点\n□ 我练过 ≥3 道例题\n□ 我已掌握陷阱点' })
  return pages
})
function contentFor(idx) {
  return pageContent.value[idx] || { t: '', body: '' }
}
// 把 AI 返回的 markdown 拆成分章节
function splitSections(text) {
  const sections = []
  const lines = String(text || '').split('\n')
  let cur = null
  for (const line of lines) {
    const m = line.match(/^#{2,3}\s+(.+)/)
    if (m) {
      if (cur) sections.push(cur)
      cur = { title: m[1].replace(/\*\*/g, '').trim(), body: [] }
    } else if (cur) {
      if (line.trim()) cur.body.push(line)
    } else if (line.trim()) {
      if (!cur) cur = { title: '正文', body: [] }
      cur.body.push(line)
    }
  }
  if (cur) sections.push(cur)
  const flattened = []
  for (const s of sections) {
    // 每章节内部可能过长，再按 ~400 字分页
    const full = s.body.join('\n')
    const chunk = full.match(/.{1,400}/gs) || []
    for (let i = 0; i < chunk.length; i++) {
      flattened.push({ title: i === 0 ? s.title : s.title + '（续）', body: chunk[i] })
    }
  }
  return flattened.length ? flattened : [{ title: '内容', body: String(text || '').slice(0, 400) }]
}
function fallbackSections(b) {
  return [
    { title: '核心要点', body: '这是知识书「' + b.name + '」的骨架页，AI 生成暂不可用。\n· 方法：' + (b.q || '') + '\n· 请在「对话」页直接提问，即可获得完整讲解。' },
    { title: '如何阅读', body: '· 在对话里让 AI 展开本节\n· 完成例题自测\n· 记录到错题本' }
  ]
}
// 抽书翻开 → 自动生成内容
async function loadBookContent(b) {
  bookSeq++
  const seq = bookSeq
  chapterPages.value = []
  currentBook.value = b
  page.value = 0
  fallbackUsed.value = false
  loading.value = true
  try {
    const c = activeCfg(false)
    if (!c || !c.key) {
      chapterPages.value = fallbackSections(b)
      fallbackUsed.value = true
      loading.value = false
      return
    }
    const sys = buildSys('all')
    const prompt =
      '请系统讲解行测知识「' + b.name + '」，归类：' + (b.type || '知识') + '（板块：' + b.shelf + '）。' +
      '要求：分成 3-4 个章节，每章用 "## 章节名" 开头；内容包含核心方法/要点、常见误区、1-2 道例题示范（若合适）。用 markdown 与你的原问题结合展开。'
    const reply = await chatOnce(c, [{ role: 'system', content: sys }, { role: 'user', content: prompt + '。补充参考议题：' + b.q }], 3000)
    if (seq !== bookSeq) return // 已切换书，丢弃
    if (!reply) {
      chapterPages.value = fallbackSections(b)
      fallbackUsed.value = true
    } else {
      chapterPages.value = splitSections(reply)
    }
  } catch (e) {
    if (seq === bookSeq) {
      chapterPages.value = fallbackSections(b)
      fallbackUsed.value = true
    }
  } finally {
    if (seq === bookSeq) loading.value = false
  }
}
function onBookChange(b) {
  if (!b) {
    currentBook.value = null
    chapterPages.value = []
    return
  }
  loadBookContent(b)
}
onMounted(() => {
  try {
    engine = createLibrary(el.value, books, new Set(readed.value))
    engine.on('bookChange', onBookChange)
    const loop = () => {
      // 元素不可见（如切到其它板块/隐藏）时暂停渲染，防 GPU 空转
      const visible = el.value && el.value.offsetParent !== null
      if (visible && engine) {
        try {
          engine.render()
        } catch (e) {}
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    const onResize = () => engine.resize(el.value.clientWidth, el.value.clientHeight)
    window.addEventListener('resize', onResize)
    onResize()
    // 2D 书卡点击：翻开该书（KbPage 列表触发）
    const onOpenBook = (e) => {
      if (e && e.detail) loadBookContent(e.detail)
    }
    window.addEventListener('xc-open-book', onOpenBook)
    dispose = () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('xc-open-book', onOpenBook)
      engine.dispose()
      engine = null
    }
  } catch (e) {
    el.value.style.background = 'radial-gradient(circle at 50% 30%, #1a2c40, #0a0f18)'
    console.warn('图书馆初始化失败，降级 2D', e)
  }
})
onUnmounted(() => {
  if (dispose) dispose()
})
</script>

<template>
  <div class="lib-root">
    <div ref="el" class="lib-scene"></div>
    <div class="lib-hint">
      <span>🚶 WASD/方向键 走动</span>
      <span>🖱️ 按住拖动 转视角</span>
      <span>🖱️ 点击书 拿取</span>
    </div>
    <Transition name="read">
      <div v-if="currentBook" class="read-sheet" @click.self="closeAndPut">
        <div class="real-book">
          <div class="page3d">
            <div v-if="page > 0" class="pg-face pg-front">
              <div class="pg-num">{{ page }} / {{ totalPages - 1 }}</div>
              <div class="pg-title">{{ contentFor(page).t }}</div>
              <pre class="pg-body">{{ contentFor(page).body }}</pre>
              <div v-if="loading" class="pg-loading"><span class="spin"></span> AI 排版中…</div>
            </div>
            <div v-else class="pg-face pg-cover">
              <div class="cv-emoji">{{ currentBook.icon }}</div>
              <div class="cv-title">{{ currentBook.name }}</div>
              <div class="cv-type">{{ currentBook.type }} 知识库 · {{ currentBook.shelf }}</div>
              <div class="cv-desc">{{ currentBook.desc }}</div>
              <div v-if="loading" class="cv-loading"><span class="spin"></span> 正在翻开 · 生成书中内容…</div>
              <div v-else-if="fallbackUsed" class="cv-fallback">（AI 生成不可用，已用骨架页）</div>
              <button class="cv-open" :disabled="loading" @click.stop="turn(1)">📖 打开看内容</button>
              <button v-if="fallbackUsed" class="cv-retry" @click.stop="loadBookContent(currentBook)">↻ 重试 AI 生成</button>
            </div>
          </div>
          <div class="turn-bar">
            <button class="tbtn" :disabled="page <= 0" @click.stop="turn(-1)">◀ 上一页</button>
            <span class="turn-state">{{ page === 0 ? '封面' : page + ' / ' + (totalPages - 1) }}</span>
            <button class="tbtn" :disabled="page >= totalPages - 1" @click.stop="turn(1)">下一页 ▶</button>
            <button class="tbtn put" @click.stop="closeAndPut">🔙 放回书架</button>
          </div>
          <div class="bk-chat-toggle">
            <button class="tbtn chat" @click.stop="emit('ask', currentBook)">💬 到对话页深入提问</button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.lib-root { position: absolute; inset: 0; }
.lib-scene {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: radial-gradient(circle at 50% 30%, #1a2c40, #0a0f18);
}
.lib-hint {
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 3;
  display: flex;
  gap: 10px;
  background: rgba(8, 14, 24, 0.72);
  border: 1px solid rgba(80, 200, 255, 0.2);
  border-radius: 999px;
  padding: 5px 12px;
  font-size: 11px;
  color: var(--text2);
  white-space: nowrap;
}
.read-sheet {
  position: fixed;
  inset: 0;
  z-index: 800;
  background: rgba(4, 8, 14, 0.72);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
}
.real-book { width: min(620px, 94vw); }
.page3d {
  background: #fdf6e3;
  color: #333;
  border-radius: 14px;
  box-shadow: 0 30px 70px rgba(0, 0, 0, 0.55), inset 0 0 40px rgba(120, 90, 40, 0.15);
  padding: 28px 34px;
  min-height: 340px;
  position: relative;
}
.pg-cover {
  background: linear-gradient(135deg, #0f2a44, #174a75);
  color: #eaf6ff;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: 4px 16px 16px 4px;
}
.cv-emoji { font-size: 46px; margin-bottom: 10px; }
.cv-title { font-size: 24px; font-weight: 800; margin-bottom: 6px; }
.cv-type { color: #7dd3fc; font-size: 13px; margin-bottom: 16px; letter-spacing: 2px; }
.cv-desc { color: #b8d4ea; font-size: 14px; max-width: 360px; line-height: 1.7; }
.cv-open {
  margin-top: 22px;
  padding: 11px 26px;
  border-radius: 999px;
  background: linear-gradient(135deg, #0ea5e9, #3b82f6);
  color: #fff;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  border: none;
  box-shadow: 0 10px 26px rgba(2, 132, 199, 0.45);
}
.pg-num { position: absolute; top: 12px; right: 18px; font-size: 12px; color: #b3a888; }
.pg-title { font-size: 18px; font-weight: 800; color: #1f3b5c; margin-bottom: 12px; }
.pg-body { font-family: inherit; font-size: 15px; line-height: 1.8; white-space: pre-wrap; color: #3a342a; }
.pg-loading, .cv-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #93b8d6;
  font-size: 13px;
  margin-top: 14px;
}
.spin {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(34, 211, 238, 0.3);
  border-top-color: var(--hud-cyan);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  display: inline-block;
}
@keyframes spin { to { transform: rotate(360deg); } }
.cv-fallback {
  margin-top: 8px;
  font-size: 12px;
  color: #fbbf24;
  opacity: 0.8;
}
.cv-retry {
  margin-top: 8px;
  padding: 7px 16px;
  border-radius: 999px;
  border: 1px solid rgba(251, 191, 36, 0.5);
  background: transparent;
  color: #fcd34d;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
}
.turn-bar {
  display: flex;
  gap: 8px;
  justify-content: center;
  margin-top: 14px;
  flex-wrap: wrap;
}
.tbtn {
  padding: 7px 15px;
  border-radius: 999px;
  border: 1px solid rgba(120, 200, 255, 0.4);
  background: rgba(10, 22, 38, 0.85);
  color: #cbe8ff;
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
}
.tbtn:hover:not(:disabled) { background: rgba(34, 211, 238, 0.14); }
.tbtn:disabled { opacity: 0.4; cursor: default; }
.tbtn.put { border-color: rgba(251, 191, 36, 0.5); color: #fcd34d; }
.turn-state { align-self: center; color: var(--text2); font-size: 12px; }
.read-enter-active, .read-leave-active { transition: opacity 0.3s; }
.read-enter-from, .read-leave-to { opacity: 0; }
.bk-chat-toggle {
  display: flex;
  justify-content: center;
  margin-top: 10px;
}
.tbtn.chat {
  border-color: rgba(52, 211, 153, 0.4);
  color: #6ee7b7;
}
</style>
