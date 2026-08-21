import { reactive } from 'vue'
const D = () => ({
  text:{ prov:'ds', key:'', url:'https://api.deepseek.com/chat/completions', model:'deepseek-chat' },
  vision:{ prov:'zhipu', key:'', url:'https://open.bigmodel.cn/api/paas/v4/chat/completions', model:'glm-4.6v' },
  sys:'', kb:true, strm:true, tts:true
})
export const store = reactive({ cfg:D(), mode:'all', msgs:[], wqs:[], tab:'chat', busy:false })
export function load(){
  try{ const s=localStorage.getItem('xc_cfg'); if(s){ const d=JSON.parse(s); store.cfg=Object.assign(D(), d, { text:Object.assign(D().text, d.text||{}), vision:Object.assign(D().vision, d.vision||{}) }) } }catch(e){}
  try{ const m=localStorage.getItem('xc_msgs'); if(m) store.msgs=JSON.parse(m).slice(-200) }catch(e){}
  try{ const w=localStorage.getItem('xc_wqs'); if(w) store.wqs=JSON.parse(w) }catch(e){}
  try{ const mo=localStorage.getItem('xc_mode'); if(mo) store.mode=mo }catch(e){}
}
export const saveCfg = () => { try{ localStorage.setItem('xc_cfg', JSON.stringify(store.cfg)) }catch(e){} }
export const saveMsgs = () => { try{ localStorage.setItem('xc_msgs', JSON.stringify(store.msgs.slice(-200))) }catch(e){} }
export const saveWqs = () => { try{ localStorage.setItem('xc_wqs', JSON.stringify(store.wqs)) }catch(e){} }
