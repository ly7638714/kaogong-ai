<script setup>
/* eslint-disable no-unused-vars */
// v3.8.191 6B·FloatPanel 拆分子组件：AccumDialogs（ctx 注入，行为与原先一致）
import { toRefs } from 'vue'
const props = defineProps({ ctx: { type: Object, required: true } })
const {
  detailShow,
  detailItem,
  cat,
  openGmSearch,
  aiDetail,
  aiExplainDetail,
  gmSearch,
  lookupTerm,
  SEARCH_SOURCES,
  verifyShow,
  cur,
  verifyTab,
  verifyBusy,
  verifyAi,
  verifyWeb,
  saveVerify,
  kw,
  pool,
  quiz,
  onlineLookup,
  addToMem,
  lookupShow,
  saveAiCard,
  aiCardBusy,
  aiCard,
  memShow,
  store,
  myMem,
  memKw,
  memFilter,
  memType,
  memText,
  memAdd,
  memFiltered,
  memDel,
  memClear,
  exportKb,
  seeExplain,
  followQ,
  askFollow
} = toRefs(props.ctx)
</script>

<template>
    <!-- 词条详解（成语/实词） -->
    <div v-if="detailShow && detailItem" class="ov show" @click.self="detailShow = false">
      <div class="pnl idiom-pnl">
        <h3>📖 {{ detailItem.t }} <span class="id-tag">{{ detailItem.cat }}</span><span v-if="detailItem.src" class="src-badge" :class="detailItem.src === '雨菲800词' ? 'yf' : 'bt'">{{ detailItem.src === '雨菲800词' ? '🟣 雨菲800词' : '🟠 半月谈' }}</span></h3>
        <div class="id-row"><b>释义</b><span>{{ detailItem.yishi || '—' }}</span></div>
        <div v-if="detailItem.jy" class="id-row"><b>近义</b><span>{{ detailItem.jy }}</span></div>
        <div v-if="detailItem.fy" class="id-row"><b>反义</b><span>{{ detailItem.fy }}</span></div>
        <div v-if="detailItem.lj" class="id-row"><b>例句</b><span>{{ detailItem.lj }}</span></div>
        <div v-if="detailItem.ly" class="id-row"><b>来源</b><span>{{ detailItem.ly }}</span></div>
        <div v-if="detailItem.yf" class="id-row bi"><b>🧠 易混辨析</b><span class="bi-body">{{ detailItem.yf }}</span></div>
        <div v-if="detailItem.p" class="id-row"><b>真题频次</b><span>{{ detailItem.p }}</span></div>
        <div v-if="detailItem.gm" class="id-row gm"><b>官媒例句</b><span>{{ detailItem.gm }}</span></div>
        <div class="pnl-btns">
          <button class="btn btn-gh" @click="detailShow = false">关闭</button>
          <button class="btn btn-gh" @click="openGmSearch(detailItem.t)">🔍 查官媒用法</button>
          <button class="btn btn-pri" :disabled="aiDetail === '（AI 生成中…）'" @click="aiExplainDetail()">🤖 AI 助记详解</button>
        </div>
        <div v-if="aiDetail" class="id-ai">{{ aiDetail }}</div>
        <div v-if="gmSearch && gmSearch.busy" class="sim-loading"><span class="spin"></span> 正在检索官媒用法…</div>
        <div v-else-if="gmSearch && !gmSearch.busy" class="gm-res">
          <div class="gm-title">📰 「{{ gmSearch.term }}」官媒检索结果</div>
          <div class="gm-go">
            <a :href="gmSearch.people" target="_blank" rel="noopener" class="gm-go-btn">📰 人民网搜「{{ gmSearch.term }}」</a>
            <a :href="gmSearch.baike" target="_blank" rel="noopener" class="gm-go-btn">📖 百度百科查词</a>
            <span class="gm-go-tip">学习强国主要在 App 内搜索</span>
          <div class="gm-sec">🌐 多源官网搜索（点击直达官方搜索页）</div>
          <div class="gm-sources">
            <a v-for="s in SEARCH_SOURCES" :key="s.k" :href="s.url(lookupTerm)" target="_blank" rel="noopener" class="gm-go-btn src">{{ s.n }}</a>
          </div>
          </div>
          <div v-for="(s, i) in gmSearch.items" :key="i" class="vw-item">
            <div class="vw-t">{{ s.text }}</div>
            <a v-if="s.url" :href="s.url" target="_blank" rel="noopener" class="vw-u">来源 ↗</a>
          </div>
        </div>
      </div>
    </div>
    <!-- 联网核实（常识/时政） -->
    <div v-if="verifyShow" class="ov show" @click.self="verifyShow = false">
      <div class="pnl verify-pnl">
        <h3>🔍 联网核实 · {{ cur }}</h3>
        <div class="fp-reg cats">
          <button class="fp-c s" :class="{ on: verifyTab === 'ai' }" @click="verifyTab = 'ai'">🤖 AI 校验</button>
          <button class="fp-c s" :class="{ on: verifyTab === 'web' }" @click="verifyTab = 'web'">🌐 联网结果</button>
        </div>
        <div v-if="verifyBusy" class="sim-loading"><span class="spin"></span> 正在联网搜索并 AI 校验…</div>
        <template v-else>
          <div v-if="verifyTab === 'ai'" class="verify-ai">{{ verifyAi || '（暂无）' }}</div>
          <div v-else class="verify-web">
            <div v-for="(s, i) in verifyWeb" :key="i" class="vw-item">
              <div class="vw-t">{{ s.text }}</div>
              <a v-if="s.url" :href="s.url" target="_blank" rel="noopener" class="vw-u">来源 ↗</a>
            </div>
          </div>
          <div class="pnl-btns">
            <button class="btn btn-gh" @click="verifyShow = false">关闭</button>
            <button class="btn btn-pri" @click="saveVerify()">📌 收藏核实结果</button>
          </div>
        </template>
      </div>
    </div>
    <!-- 本地无结果 → 联网查词 -->
    <div v-if="kw.trim() && !pool(cat).length" class="fp-nohit">
      <div class="fp-nohit-t">本地库暂无「{{ kw }}」</div>
      <div class="fp-nohit-s">可联网查词（释义/官媒用法/百科）或加入本地记忆库</div>
      <div class="fp-nohit-acts">
        <button class="fp-b quiz" @click="onlineLookup(kw)">📡 联网查词</button>
        <button class="fp-b" @click="addToMem(kw)">➕ 加入记忆库</button>
      </div>
    </div>
    <!-- 联网查词弹窗 -->
    <div v-if="lookupShow" class="ov show" @click.self="lookupShow = false">
      <div class="pnl idiom-pnl">
        <h3>📡 联网查「{{ lookupTerm }}」</h3>
        <div v-if="gmSearch && gmSearch.busy" class="sim-loading"><span class="spin"></span> 正在检索…</div>
        <template v-else-if="gmSearch">
          <div v-for="(s, i) in gmSearch.items" :key="i" class="vw-item">
            <div class="vw-t">{{ s.text }}</div>
            <a v-if="s.url" :href="s.url" target="_blank" rel="noopener" class="vw-u">来源 ↗</a>
          </div>
          <div class="gm-go">
            <a :href="gmSearch.people" target="_blank" rel="noopener" class="gm-go-btn">📰 人民网搜「{{ lookupTerm }}」</a>
            <a :href="gmSearch.baike" target="_blank" rel="noopener" class="gm-go-btn">📖 百度百科查词</a>
          </div>
          <div class="gm-sec">🌐 多源官网搜索（点击直达官方搜索页）</div>
          <div class="gm-sources">
            <a v-for="s in SEARCH_SOURCES" :key="s.k" :href="s.url(lookupTerm)" target="_blank" rel="noopener" class="gm-go-btn src">{{ s.n }}</a>
          </div>
          <div class="pnl-btns">
            <button class="btn btn-gh" @click="lookupShow = false">关闭</button>
            <button class="btn btn-pri" @click="saveAiCard()">➕ 加入记忆库</button>
          <div v-if="aiCardBusy" class="sim-loading"><span class="spin"></span> 🤖 AI 正在整理知识卡…</div>
          <div v-else-if="aiCard" class="id-ai"><b>🤖 AI 学习卡</b><br />{{ aiCard }}</div>
          </div>
        </template>
      </div>
    </div>
    <!-- 我的记忆库管理面板 -->
    <div v-if="memShow" class="ov show" @click.self="memShow = false">
      <div class="pnl mem-pnl">
        <h3>📦 我的记忆库（{{ store.myMem.length }} 条）</h3>
        <div class="fp-search">
          <input v-model="memKw" placeholder="🔍 搜索记忆库…" />
        </div>
        <div class="fp-reg cats">
          <button v-for="f in ['全部', '常识', '时政', '成语', '实词']" :key="f" class="fp-c s" :class="{ on: memFilter === f }" @click="memFilter = f">{{ f }}</button>
        </div>
        <div class="mem-add">
          <select v-model="memType" style="flex: 0 0 74px"><option>常识</option><option>时政</option><option>成语</option><option>实词</option></select>
          <input v-model="memText" placeholder="新增一条积累…" @keydown.enter="memAdd()" />
          <button class="fp-b" @click="memAdd()">➕ 添加</button>
        </div>
        <div class="mem-list">
          <div v-for="(x, i) in memFiltered" :key="i" class="mem-it">
            <span class="mem-tag">{{ x.type }}</span>
            <span class="mem-txt">{{ x.text }}</span>
            <button class="mem-del" @click="memDel(i)">✕</button>
          </div>
          <div v-if="!memFiltered.length" class="acc-notes-empty">暂无条目，可联网查词/生成10条扩库/手动添加</div>
        </div>
        <div class="pnl-btns">
          <button class="btn btn-gh" @click="memClear()">🗑 清空</button>
          <button class="btn btn-gh" @click="exportKb()">📤 导出</button>
          <button class="btn btn-pri" @click="memShow = false">完成</button>
        </div>
      </div>
    </div>
    <!-- 讲解/追问 -->
    <div v-if="seeExplain" class="fp-body exp">{{ seeExplain }}</div>
    <div v-if="seeExplain && !quiz" class="fp-follow">
      <input v-model="followQ" placeholder="追问：如 这题为啥选A？" @keydown.enter="askFollow()" />
      <button class="fp-b" @click="askFollow()">追问</button>
    </div>
</template>
