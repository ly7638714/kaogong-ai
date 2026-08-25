// ===== 养成系萌宠：靠刷题/问答成长，知学习状态、有情绪与作息 =====
import { ref, computed } from 'vue'
import { store } from '../store'

const KEY = 'xc_pet'
const STAGES = [
  { xp: 0, emoji: '🥚', name: '蛋生期' },
  { xp: 10, emoji: '🐣', name: '幼年期' },
  { xp: 30, emoji: '🐥', name: '成长期' },
  { xp: 60, emoji: '🐔', name: '成熟期' },
  { xp: 120, emoji: '🦉', name: '智学期' },
  { xp: 250, emoji: '🐲', name: '大师期' }
]
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (d && typeof d === 'object') {
      const b = { name: '小灵', xp: 0, food: 10, lastFeed: Date.now(), affinity: 0, born: Date.now() }
      b.xp = Number(d.xp) || 0
      b.food = Number(d.food) || 10
      b.affinity = Number(d.affinity) || 0
      b.lastFeed = Number(d.lastFeed) || Date.now()
      b.born = Number(d.born) || Date.now()
      b.name = d.name || '小灵'
      return b
    }
  } catch (e) {}
  return { name: '小灵', xp: 0, food: 10, lastFeed: Date.now(), affinity: 0, born: Date.now() }
}
export const pet = ref(load())
export const petShow = ref(false)
export const petMuted = ref(false)
try { petMuted.value = localStorage.getItem('xc_pet_muted') === '1' } catch (e) {}
export const bubble = ref('')

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(pet.value)) } catch (e) {}
}
// 学习统计（宠物"知道"用户状态）
export const petStats = computed(() => {
  const asks = store.msgs.filter((m) => m.role === 'user').length
  const answers = store.msgs.filter((m) => m.role === 'assistant').length
  const wrongs = store.wqs.length
  const reviewed = store.wqs.filter((q) => q.reviewed || q.digested).length
  const digested = store.wqs.filter((q) => q.digested).length
  let streak = 0
  try {
    const s = JSON.parse(localStorage.getItem('xc_streak') || '{"n":0}')
    streak = s.n || 0
  } catch (e) {}
  return { asks, answers, wrongs, reviewed, digested, streak }
})
export const petStage = computed(() => {
  const xp = pet.value.xp
  let s = STAGES[0]
  for (const st of STAGES) if (xp >= st.xp) s = st
  return s
})
export const petLevel = computed(() => Math.floor(Math.sqrt(pet.value.xp / 4)) + 1)
export const petNextXp = computed(() => {
  const xp = pet.value.xp
  let next = STAGES[STAGES.length - 1].xp
  for (const st of STAGES) if (xp < st.xp) { next = st.xp; break }
  return next
})
export const petNextName = computed(() => {
  const xp = pet.value.xp
  for (const st of STAGES) if (xp < st.xp) return st
  return null
})
// 饱食度：随时间下降（每 2 小时 -1）
export const petHunger = computed(() => {
  const elapsed = Math.floor((Date.now() - pet.value.lastFeed) / (2 * 3600000))
  return Math.max(0, Math.min(10, pet.value.food - elapsed))
})
// 心情：时间作息 + 饱食度 + 学习状态
export const petMood = computed(() => {
  const h = new Date().getHours()
  if (petHunger.value <= 0) return { emoji: '😫', label: '饿坏了' }
  if (h >= 0 && h < 5) return { emoji: '😴', label: '睡觉中' }
  if (h >= 22 || h < 6) return { emoji: '😴', label: '困困' }
  if (petStats.value.streak >= 3) return { emoji: '😎', label: '为你骄傲' }
  if (petStats.value.asks >= 10) return { emoji: '🤩', label: '超兴奋' }
  return { emoji: '😊', label: '开心' }
})
export const petXpOf = computed(() => pet.value.xp)
// 气泡：按时间 + 状态生成
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)] }
export function petSpeak() {
  if (petMuted.value) { bubble.value = ''; return }
  const s = petStats.value
  const h = new Date().getHours()
  const msgs = []
  if (h >= 0 && h < 5) msgs.push('呼噜……我睡了，你也早点休息 😴', '半夜了还学？快睡，明天效率更高 🌙')
  else if (h >= 5 && h < 9) msgs.push('早安！今天也要一起上岸 💪', '早起的鸟儿有虫吃，今天的题准备好了吗？')
  else if (h >= 21) msgs.push('晚上了，该复盘今天的错题啦 📋', '睡前把错题本过一遍，明天忘得少～')
  if (petHunger.value <= 1) msgs.push('我饿坏了……去刷几道题给我换口粮吧 🍖', '咕咕……喂我一点学习积分嘛')
  if (s.asks < 3) msgs.push('今天还没怎么学习，陪我刷几道题嘛 🥺', '空空的脑袋需要装点知识哦～')
  if (s.streak >= 3) msgs.push('你已经连续打卡 ' + s.streak + ' 天，超棒！', '你的坚持我都看在眼里 😎')
  if (s.wrongs > 0 && s.reviewed < s.wrongs) msgs.push('还有 ' + (s.wrongs - s.reviewed) + ' 道错题没复盘，我帮你记着呢 📋')
  if (s.digested >= 3) msgs.push('都消化 ' + s.digested + ' 道错题了，进步明显！')
  msgs.push('今天已提问 ' + s.asks + ' 次、存错题 ' + s.wrongs + ' 道，继续冲！', '你学你的，我看着你变强 🐾')
  bubble.value = pick(msgs)
  setTimeout(() => { if (bubble.value) bubble.value = '' }, 6000)
}
export function addPoints(n) {
  const before = petStage.value
  pet.value.xp = (Number(pet.value.xp) || 0) + n
  save()
  const after = petStage.value
  if (after !== before) {
    bubble.value = after.emoji === '🐣' ? '🎉 破壳啦！我从蛋里出来啦，谢谢你带我长大！' : '🎉 我进化到「' + after.name + '」啦！'
    setTimeout(() => { bubble.value = '' }, 7000)
  }
}
// 喂食：消耗 5 学习积分，+饱食度
export function feedPet() {
  if (pet.value.xp < 5) return false
  pet.value.xp = Math.max(0, (Number(pet.value.xp) || 0) - 5)
  pet.value.food = Math.min(10, petHunger.value + 5)
  pet.value.lastFeed = Date.now()
  save()
  bubble.value = '啊呜～谢谢投喂！🍖 我又满血了！'
  setTimeout(() => { bubble.value = '' }, 5000)
  return true
}
export function patPet() {
  pet.value.affinity++
  save()
  const msgs = ['嘿嘿，被你摸头了～ 🐾', '再摸一下我就更开心了！', '手感不错吧？好好学习哦～']
  bubble.value = pick(msgs)
  setTimeout(() => { bubble.value = '' }, 4500)
}
export function renamePet(name) {
  const n = String(name || '').trim()
  if (!n) return false
  pet.value.name = n.slice(0, 12)
  save()
  bubble.value = '我叫「' + pet.value.name + '」啦！请多指教 🐾'
  setTimeout(() => { bubble.value = '' }, 4000)
  return true
}
export function setPetMuted(v) {
  petMuted.value = !!v
  try { localStorage.setItem('xc_pet_muted', petMuted.value ? '1' : '0') } catch (e) {}
  if (v) bubble.value = ''
}
export const petPoints = computed(() => pet.value.xp)
