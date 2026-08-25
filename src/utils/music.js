/* global Audio */
import { ref } from 'vue'

// 内置：开源/免费可直接播放的示例曲目（SoundHelix 提供免费 MP3 样例）
// 内置：安静钢琴/轻音乐学习曲（Kevin MacLeod · CC-BY 免费授权，incompetech.com）
const BUILTIN = [
  { name: '🎹 Almost in F（安静钢琴）', url: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Almost%20in%20F.mp3', builtin: true },
  { name: '🎹 Comfortable Mystery（轻柔钢琴）', url: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Comfortable%20Mystery.mp3', builtin: true },
  { name: '🎹 Cattails（安静钢琴）', url: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Cattails.mp3', builtin: true },
  { name: '🌙 Luminous Rain（静谧氛围）', url: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Luminous%20Rain.mp3', builtin: true },
  { name: '🎹 Thinking Music（轻音乐）', url: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Thinking%20Music.mp3', builtin: true }
]

export const musicOn = ref(false)
export const musicVol = ref(0.3)
export const musicLoop = ref(true)
export const musicIndex = ref(0)
export const musicList = ref([])
export const musicStatus = ref('')
try {
  const saved = JSON.parse(localStorage.getItem('xc_music_list') || '[]') || []
  musicList.value = saved.filter((m) => m && m.url).concat(BUILTIN.filter((b) => !saved.some((s) => s.url === b.url)))
  if (!musicList.value.length) musicList.value = BUILTIN.slice()
} catch (e) {
  musicList.value = BUILTIN.slice()
}
try {
  musicVol.value = Number(localStorage.getItem('xc_music_vol')) || 0.3
} catch (e) {}
try {
  musicLoop.value = localStorage.getItem('xc_music_loop') !== '0'
} catch (e) {}

let audio = null
function ensureAudio() {
  if (!audio) {
    audio = new Audio()
    audio.loop = musicLoop.value
    audio.volume = musicVol.value
    audio.onended = () => {
      if (!musicLoop.value) nextTrack()
    }
    audio.onerror = () => {
      musicStatus.value = '⚠️ 播放失败（网络或链接失效），已切下一首'
      setTimeout(nextTrack, 1200)
    }
  }
  return audio
}
function persist() {
  try {
    localStorage.setItem('xc_music_list', JSON.stringify(musicList.value.filter((m) => !m.builtin)))
    localStorage.setItem('xc_music_vol', String(musicVol.value))
    localStorage.setItem('xc_music_loop', musicLoop.value ? '1' : '0')
  } catch (e) {}
}
export function playTrack(i) {
  const list = musicList.value
  if (!list.length) return
  if (i == null) i = musicIndex.value
  if (i < 0 || i >= list.length) i = 0
  musicIndex.value = i
  const a = ensureAudio()
  a.src = list[i].url
  a.loop = musicLoop.value
  a.volume = musicVol.value
  a.play().catch(() => {
    musicStatus.value = '⚠️ 无法播放（浏览器可能拦截了自动播放，请手动点击一次）'
  })
  musicOn.value = true
  musicStatus.value = '正在播放：' + list[i].name
}
export function toggleMusic() {
  if (musicOn.value) {
    if (audio) audio.pause()
    musicOn.value = false
    musicStatus.value = '已暂停'
  } else {
    playTrack()
  }
}
export function nextTrack() {
  const n = (musicIndex.value + 1) % musicList.value.length
  playTrack(n)
}
export function setVolume(v) {
  musicVol.value = v
  if (audio) audio.volume = v
  persist()
}
export function setLoop(v) {
  musicLoop.value = v
  if (audio) audio.loop = v
  persist()
}
export function addMusicUrl(url, name) {
  const u = String(url || '').trim()
  if (!u) return false
  musicList.value.unshift({ name: name || '🎧 自定义曲目', url: u })
  persist()
  return true
}
export function addMusicFile(file) {
  const url = URL.createObjectURL(file)
  musicList.value.unshift({ name: '📁 ' + (file.name || '本地音频'), url, local: true })
  persist()
  return true
}
export function removeMusic(i) {
  if (musicList.value[i] && musicList.value[i].builtin) return false
  musicList.value.splice(i, 1)
  if (musicIndex.value >= musicList.value.length) musicIndex.value = 0
  persist()
  return true
}
// 网易云歌单分享链接 → 尝试解析歌单（受版权限制，需公共解析服务；失败则给出引导）
export async function importNetEase(link) {
  const s = String(link || '')
  const pm = s.match(/playlist\?id=(\d+)/)
  const sm = s.match(/song\?id=(\d+)/)
  if (!pm && !sm) throw new Error('链接格式不对：请粘贴网易云歌单(playlist?id=…)或单曲(song?id=…)分享链接')
  const kind = pm ? 'playlist' : 'song'
  const id = (pm || sm)[1]
  musicStatus.value = '正在解析网易云' + (kind === 'playlist' ? '歌单' : '单曲') + ' id=' + id + '…'
  try {
    const res = await fetch('https://api.injahow.cn/meting/?type=' + kind + '&id=' + id)
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const arr = await res.json()
    if (!Array.isArray(arr) || !arr.length) throw new Error('歌单为空')
    const added = arr.slice(0, 30).map((t, i) => ({
      name: (t.name || '网易云曲目' + (i + 1)) + ' - ' + ((t.author || t.artist) || ''),
      url: t.url,
      from: '网易云'
    }))
    musicList.value = added.concat(musicList.value.filter((x) => x.builtin))
    persist()
    playTrack(0)
    musicStatus.value = '✅ 已导入网易云歌单（' + added.length + ' 首，来自公共解析服务）'
    return added.length
  } catch (e) {
    musicStatus.value = '⚠️ 网易云受版权/接口限制，浏览器无法直接解析：' + e.message
    throw new Error(
      '受版权与接口限制，浏览器无法直接拉取网易云歌单。建议：① 用第三方工具导出该歌单的 MP3 直链，再粘贴到「自定义曲目」；② 或直接使用内置开源曲目。',
      { cause: e }
    )
}
}
export function pauseAll() {
  if (audio) {
    audio.pause()
    musicOn.value = false
  }
}
