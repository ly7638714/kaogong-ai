import { store } from './store'
import { SYS, KB } from './kb'
export function supportsVision(c){ c=c||store.cfg.vision; const m=(c.model||'').toLowerCase(), p=c.prov||''; if(p==='openai'||p==='anthropic'||p==='custom')return true; if(p==='zhipu')return m.includes('v')||m.includes('vision'); if(p==='qwen')return m.includes('vl')||m.includes('vision'); return false }
function hds(c){ const h={'Content-Type':'application/json'}; if(c.prov==='anthropic'){h['x-api-key']=c.key;h['anthropic-version']='2023-06-01'} else h['Authorization']='Bearer '+c.key; return h }
export function buildSys(){ let sp=(store.cfg.sys||'').trim(); if(!sp&&store.cfg.kb!==false)sp=SYS+(KB[store.mode]||''); return sp }
export function activeCfg(hasImg){ const v=store.cfg.vision; if(hasImg&&v&&v.key&&supportsVision(v))return v; return store.cfg.text&&store.cfg.text.key?store.cfg.text:(hasImg?v:store.cfg.text) }
export async function chatStream(messages, c, onDelta, signal){
  const resp=await fetch(c.url,{method:'POST',headers:hds(c),body:JSON.stringify({model:c.model,messages,max_tokens:4096,stream:true,temperature:.7}),signal})
  if(!resp.ok){ const e=await resp.json().catch(()=>({})); throw new Error(e.error?.message||'HTTP '+resp.status) }
  const reader=resp.body.getReader(), dec=new TextDecoder('utf-8'); let buf='', full='', think=''
  while(true){ const{done,value}=await reader.read(); if(done)break
    buf+=dec.decode(value,{stream:true}); const lines=buf.split('\n'); buf=lines.pop()
    for(const line of lines){ if(!line.startsWith('data: '))continue; const d=line.slice(6).trim(); if(d==='[DONE]')continue
      try{ const p=JSON.parse(d); const delta=p.choices?.[0]?.delta; const c2=delta?.content||'', rc=delta?.reasoning_content||''
        if(c2){full+=c2; onDelta({type:'content', text:full, think})} else if(rc){think+=rc; onDelta({type:'think', think})}
      }catch(e){} }
  }
  if(!full&&think) full=think
  return full
}
export async function chatOnce(c, messages, maxTokens=2000){
  const resp=await fetch(c.url,{method:'POST',headers:hds(c),body:JSON.stringify({model:c.model,messages,max_tokens:maxTokens,stream:false})})
  if(!resp.ok){ const e=await resp.json().catch(()=>({})); throw new Error(e.error?.message||'HTTP '+resp.status) }
  const d=await resp.json(); const m=d.choices?.[0]?.message||{}; return m.content||m.reasoning_content||''
}
export async function aiPolish(text){
  const c=activeCfg(false); if(!c||!c.key)return null
  const prompt='你是一位行测学习笔记整理助手。请把下面的内容整理成一份结构清晰、适合复习的笔记：按题归纳考点/题型、正确答案的依据（为什么对）、错误选项的坑（为什么错）、一句话秒杀规律；分条列点，用 Markdown 格式。不要遗漏关键信息，不要编造。\n\n内容：\n'+String(text).slice(0,6000)
  try{ return await chatOnce(c,[{role:'system',content:'你是行测复习笔记整理助手，输出精炼准确的Markdown笔记。'},{role:'user',content:prompt}],2000) }catch(e){ return null }
}
export function detectBanKuai(text){ const t=String(text||''); if(/削弱|加强|支持|前提|假设|结论|论证|推理|假言|推出|最能|由此/.test(t))return '判断推理'; if(/意在|主旨|这段文字|填入|排序|标题|成语|词语|文段|作者|强调/.test(t))return '言语理解'; if(/图形|图推|规律|对称|黑白|立体|展开图|折叠|截面/.test(t))return '图形推理'; if(/同比|环比|增长|比重|平均|倍数|亿元|万吨|百分点|基期|现期/.test(t))return '资料分析'; if(/工程|行程|相遇|追及|概率|排列组合|工作效率/.test(t))return '数量关系'; return '' }
