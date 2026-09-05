<script setup>
// 今日复习中枢（R1+R「全局」）：错题到期 + 记忆卡（到期复习 / 学新词条），统一复习入口
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { store } from '../store'
import { loadSrs, saveSrs, dueMemoryItems, rememberOne, freshPoolItems, ymdKey } from '../utils/memorySrs'
import { POOL_ALL, findPoolItem } from '../data/memoryPools' // 词条池与内容
import { wrongDueOf } from '../utils/reviewHub'

const show = ref(false)
const tab = ref('wrong') // wrong | memory
const memMode = ref('due') // due(到期) | new(学新)
const memCat = ref('常识')
const MEM_CATS = ['常识', '时政', '成语', '实词']
const skipKeys = ref(new Set())
const srs = ref({})
function reloadSrs() { try { srs.value = loadSrs() } catch (e) { srs.value = {} } }
const wrongDue = computed(() => { try { return wrongDueOf(store.wqs) } catch (e) { return [] } })
const memDue = computed(() => { try { return dueMemoryItems(srs.value, ymdKey()) } catch (e) { return [] } })
const fresh = computed(() => { try { return freshPoolItems(POOL_ALL, srs.value, memCat.value, 12).filter((x) => !skipKeys.value.has(x.key)) } catch (e) { return [] } })
function infoOf(title) { try { const i = findPoolItem(title); return i ? String(i.yishi || i.lj || i.fy || '') : '' } catch (e) { return '' } }
function extraText(it) { const e = it && it.extra; return e ? String(e.yishi || e.lj || e.fy || '') : '' }
function openHub() { reloadSrs(); show.value = true }
function redoWq(id) { show.value = false; window.dispatchEvent(new CustomEvent('xc-redo-wq', { detail: id })) }
function memRemember(item, ok) {
  try {
    const out = rememberOne(srs.value, item.cat, item.title, ok, ymdKey())
    saveSrs(out.srs)
    reloadSrs()
  } catch (e) {}
}
function learnNew(it) {
  memRemember(it, true)
  const k = new Set(skipKeys.value); k.delete(it.key); skipKeys.value = k
}
function skipNew(it) {
  const k = new Set(skipKeys.value); k.add(it.key); skipKeys.value = k
}
function switchMemCat(c) { memCat.value = c; skipKeys.value = new Set() }
function closeHub() { show.value = false }
onMounted(() => { window.addEventListener('xc-open-hub', openHub); window.addEventListener('xc-srs', reloadSrs) })
onUnmounted(() => { window.removeEventListener('xc-open-hub', openHub); window.removeEventListener('xc-srs', reloadSrs) })
</script>

<template>
  <div v-if="show" class="ov show" @click.self="closeHub()">
    <div class="pnl" style="max-width: 560px">
      <h3>🗓️ 今日复习中枢</h3>
      <p style="font-size: 12px; color: var(--text3); margin: 2px 0 10px">到期 = 按记忆曲线该回访；📖 学新 = 挑没学过的词条先记住（按 1/2/4/7/15/30 天排期）。</p>
      <div style="display: flex; gap: 6px; margin-bottom: 10px; flex-wrap: wrap">
        <button class="btn" :class="tab === 'wrong' ? 'btn-pri' : 'btn-gh'" style="padding: 4px 12px" @click="tab = 'wrong'">📋 错题到期（{{ wrongDue.length }}）</button>
        <button class="btn" :class="tab === 'memory' ? 'btn-pri' : 'btn-gh'" style="padding: 4px 12px" @click="tab = 'memory'; memMode = 'due'">🧠 记忆（到期 {{ memDue.length }}）</button>
      </div>

      <template v-if="tab === 'wrong'">
        <div v-if="!wrongDue.length" class="empty"><div class="empty-t">暂无到期的已消化错题 🎉</div><div class="empty-d">到期复习会自动按 3/7/15/30 天排期，到点出现在这里。</div></div>
        <div v-for="(q, i) in wrongDue" :key="q.id" class="focus-item">
          <span class="fi-idx">{{ i + 1 }}</span>
          <div class="fi-body">
            <div class="fi-subj">{{ q.subject || '未分类' }} · 错 {{ q.wrongCount || 1 }} 次 · 🔔 到期</div>
            <div class="fi-q">{{ String(q.question || q.q || q.stem || '').replace(/```svg[sS]*?```/g, '【图】').replace(/<[^>]+>/g, ' ').slice(0, 120) }}</div>
          </div>
          <button class="btn btn-gh" @click="redoWq(q.id)">✍️ 二刷</button>
        </div>
      </template>

      <template v-else>
        <div style="display: flex; gap: 6px; margin-bottom: 8px">
          <button class="btn" :class="memMode === 'due' ? 'btn-pri' : 'btn-gh'" style="padding: 3px 10px; font-size: 12px" @click="memMode = 'due'">🔁 到期（{{ memDue.length }}）</button>
          <button class="btn" :class="memMode === 'new' ? 'btn-pri' : 'btn-gh'" style="padding: 3px 10px; font-size: 12px" @click="memMode = 'new'">📖 学新词条</button>
        </div>

        <template v-if="memMode === 'due'">
          <div v-if="!memDue.length" class="empty"><div class="empty-t">暂无到期的记忆卡 🎉</div><div class="empty-d">学过并到期的常识/时政/成语/实词会出现在这里；也可以切「📖 学新词条」先学新。</div></div>
          <div v-for="(item, i) in memDue" :key="item.key" class="focus-item">
            <span class="fi-idx">{{ i + 1 }}</span>
            <div class="fi-body">
              <div class="fi-subj">{{ item.cat }} · 已学 {{ item.lvl }} 次</div>
              <div class="fi-q" style="white-space:pre-wrap">{{ item.title.slice(0, 160) }}</div>
              <div v-if="infoOf(item.title)" class="fi-q" style="color:var(--text3);font-size:12px;margin-top:2px">📖 {{ infoOf(item.title).slice(0, 140) }}</div>
            </div>
            <button class="btn btn-gh" @click="memRemember(item, true)">✓ 记住</button>
            <button class="btn btn-gh" @click="memRemember(item, false)">✗ 忘记</button>
          </div>
        </template>

        <template v-else>
          <div style="display: flex; gap: 6px; margin-bottom: 8px; flex-wrap: wrap">
            <button v-for="c in MEM_CATS" :key="c" class="btn" :class="memCat === c ? 'btn-pri' : 'btn-gh'" style="padding: 2px 10px; font-size: 12px" @click="switchMemCat(c)">{{ c }}</button>
          </div>
          <div v-if="!fresh.length" class="empty"><div class="empty-t">「{{ memCat }}」的词条都学过啦 🎉</div><div class="empty-d">切到「🔁 到期」复习，或换一个分类继续学新。</div></div>
          <div v-for="(it, i) in fresh" :key="it.key" class="focus-item">
            <span class="fi-idx">{{ i + 1 }}</span>
            <div class="fi-body">
              <div class="fi-subj">{{ it.cat }} · 新词条</div>
              <div class="fi-q" style="white-space:pre-wrap">{{ it.title.slice(0, 200) }}</div>
              <div v-if="extraText(it)" class="fi-q" style="color:var(--text3);font-size:12px;margin-top:2px">📖 {{ extraText(it).slice(0, 160) }}</div>
            </div>
            <button class="btn btn-gh" @click="learnNew(it)">✓ 已学会</button>
            <button class="btn btn-gh" @click="skipNew(it)">⏭ 跳过</button>
          </div>
        </template>
      </template>

      <div class="pnl-btns">
        <button class="btn btn-gh" @click="closeHub()">关闭</button>
      </div>
    </div>
  </div>
</template>
