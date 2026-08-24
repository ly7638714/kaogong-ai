import { store } from './store'
import { SYS, KB } from './kb'
export function supportsVision(c){ c=c||store.cfg.vision; const m=(c.model||'').toLowerCase(), p=c.prov||''; if(p==='openai'||p==='anthropic'||p==='custom')return true; if(p==='zhipu')return m.includes('v')||m.includes('vision'); if(p==='qwen')return m.includes('vl')||m.includes('vision'); if(p==='ds')return m.includes('vision')||m.includes('vl'); return false }
function hds(c){ const h={'Content-Type':'application/json'}; if(c.prov==='anthropic'){h['x-api-key']=c.key;h['anthropic-version']='2023-06-01'} else h['Authorization']='Bearer '+c.key; return h }
export function buildSys(extraMode){ let sp=(store.cfg.sys||'').trim(); if(!sp&&store.cfg.kb!==false){ const base=KB[store.mode]||''; const extra=(extraMode&&extraMode!==store.mode)?(KB[extraMode]||''):''; sp=SYS+base+extra } return sp }
export function activeCfg(hasImg){ const v=store.cfg.vision; if(hasImg&&v&&v.key&&supportsVision(v))return v; return store.cfg.text&&store.cfg.text.key?store.cfg.text:(hasImg?v:store.cfg.text) }
export async function chatStream(messages, c, onDelta, signal){
  // 推理/思考模型（deepseek-reasoner、deepseek-v4 系列、kimi 等）不支持 temperature，
  // 且「思考过程 + 图片 + 正文」会大量占用 max_tokens：必须给足输出上限并去掉 temperature，
  // 否则思考没写完 max_tokens 就耗尽，正式回答(content)为空（表现为"只出思考过程"）。
  const isReasoner=/(reasoner|deepseek-r1|deepseek-v4|kimi|k2|o1|o3|thinking)/i.test(c.model||'')
  const body={model:c.model,messages,max_tokens:isReasoner?20000:10000,stream:true}
  if(!isReasoner) body.temperature=.7
  const resp=await fetch(c.url,{method:'POST',headers:hds(c),body:JSON.stringify(body),signal})
  if(!resp.ok){ const e=await resp.json().catch(()=>({})); throw new Error(e.error?.message||'HTTP '+resp.status) }
  const reader=resp.body.getReader(), dec=new TextDecoder('utf-8'); let buf='', full='', think='', finish=''
  while(true){ const{done,value}=await reader.read(); if(done)break
    buf+=dec.decode(value,{stream:true}); const lines=buf.split('\n'); buf=lines.pop()
    for(const line of lines){ if(!line.startsWith('data: '))continue; const d=line.slice(6).trim(); if(d==='[DONE]')continue
      try{ const p=JSON.parse(d); const ch=p.choices?.[0]||{}; const delta=ch.delta||{}; const c2=delta?.content||'', rc=delta?.reasoning_content||''
        if(ch.finish_reason) finish=ch.finish_reason
        if(c2){full+=c2; onDelta?.({type:'content', text:full, think})} else if(rc){think+=rc; onDelta?.({type:'think', think})}
      }catch(e){} }
  }
  // 核心修复：思考过程(reasoning_content)只是"实时推理"，绝不能当正式回答发给用户。
  if(!full){
    if(think) throw new Error('模型只输出了思考过程、未生成正式回答（多为思考占满输出上限所致）。请重试，或检查识图用视觉模型（deepseek-v4-flash-vision-exp）的 API Key 是否有效。')
    throw new Error('模型未返回任何内容，请重试。')
  }
  if(finish==='length') full+='\n\n> ⚠️ 内容已达单次输出上限被截断，可继续追问剩余部分。'
  return full
}
export async function chatOnce(c, messages, maxTokens=2000){
  const isReasoner=/(reasoner|deepseek-r1|deepseek-v4|kimi|k2|o1|o3|thinking)/i.test(c.model||'')
  const body={model:c.model,messages,max_tokens:isReasoner?Math.max(maxTokens,8192):maxTokens,stream:false}
  if(!isReasoner) body.temperature=.3
  const resp=await fetch(c.url,{method:'POST',headers:hds(c),body:JSON.stringify(body)})
  if(!resp.ok){ const e=await resp.json().catch(()=>({})); throw new Error(e.error?.message||'HTTP '+resp.status) }
  const d=await resp.json(); const m=d.choices?.[0]?.message||{}; return (m.content||'').trim()||null
}
export async function aiPolish(text){
  const c=activeCfg(false); if(!c||!c.key)return null
  const prompt='你是一位行测学习笔记整理助手。请把下面的内容整理成一份结构清晰、适合复习的笔记：按题归纳考点/题型、正确答案的依据（为什么对）、错误选项的坑（为什么错）、一句话秒杀规律；分条列点，用 Markdown 格式。不要遗漏关键信息，不要编造。\n\n内容：\n'+String(text).slice(0,6000)
  try{ return await chatOnce(c,[{role:'system',content:'你是行测复习笔记整理助手，输出精炼准确的Markdown笔记。'},{role:'user',content:prompt}],2000) }catch(e){ return null }
}
export function detectBanKuai(text){ const t=String(text||''); if(/新思想|五位一体|四个全面|马克思主义|唯物|辩证|哲学|党代会|全会|政府工作报告|习近平新时代中国特色社会主义思想|二十大|二十大报告|马原/.test(t))return '政治理论'; if(/常识|时政|二十四节气|科技成就|法律常识|生活常识|全面建成|周年|纪念日|地理常识|文史常识|科技常识|物理常识|化学常识|生物常识|医学常识|经济常识|下列.*说法.*(正确|错误).*常识|宪法|民法典/.test(t))return '常识判断'; if(/根据上述定义|下列.*属于|下列.*不属于|定义判断|不符合.*定义|属于.*定义|不属于.*定义|下列.*符合.*定义/.test(t))return '定义判断'; if(/对于.*相当于|相对于|与.*关系.*一致|关系.*最为相近|下列.*与.*关系|包含于|种属|组成关系|交叉关系/.test(t))return '类比推理'; if(/削弱|加强|支持|前提|假设|结论|论证|推理|假言|推出|最能|由此/.test(t))return '判断推理'; if(/意在|主旨|这段文字|填入|排序|标题|成语|词语|文段|作者|强调/.test(t))return '言语理解'; if(/图形|图推|规律|对称|黑白|立体|展开图|折叠|截面/.test(t))return '图形推理'; if(/同比|环比|增长|比重|平均|倍数|亿元|万吨|百分点|基期|现期/.test(t))return '资料分析'; if(/工程|行程|相遇|追及|概率|排列组合|工作效率|工作量|单独完成|合作|同时开工|牛吃草|利润率|生产成本|售价|打折|和差倍比|整除|质数|容斥|最值|抽屉|空瓶|年龄|方阵|钟表|浓度|溶质/.test(t))return '数量关系'; return '' }

// ===== 智能训练：出题 / 变式 / 诊断 系统提示词 =====
export const PLATE_MODE={判断推理:'luoji',言语理解:'yanyu',图形推理:'tutu',资料分析:'ziliao',数量关系:'shuliang',政治理论:'zhengzhi',常识判断:'changshi',类比推理:'leibi',定义判断:'dingyi'}
export function buildTaskSys(kind, opts={}){
  if(kind==='quiz'){
    const plate=opts.plate||''; const mode=opts.mode||PLATE_MODE[plate]||'all'; const kb=KB[mode]||'';
    return (SYS?SYS:'' )+'\n\n━━━━━━━━━━━━━━━━━━━━━━━━\n【本次任务·模拟出题】\n你现在是资深公考命题老师。基于上面的方法论体系，出一道'+(plate||'所选板块')+'的模拟真题（单选题），质量要求：\n1. 题干表述贴合真题风格（公务员考试表述习惯），考点明确；\n2. 提供 4 个选项（A/B/C/D），其中 1 个正确、2 个为典型干扰项（对应板块的陷阱）、1 个明显错误；\n3. 给出答案解析（用对应方法论讲清为什么对/错）+ 考点 + 一句话秒杀规律。\n\n输出格式：\n### 📝 题目\n（题干）\nA. … B. … C. … D. …\n### ✅ 答案解析\n（正确项分析+干扰项拆解）\n### 🎯 考点\n（所属考点/题型）\n### ⚡ 秒杀规律\n（一句话）'
  }
  if(kind==='variant'){
    const prev=opts.prev||'';
    return (SYS?SYS:'')+'\n\n━━━━━━━━━━━━━━━━━━━━━━━━\n【本次任务·变式检验（举一反三）】\n用户刚问过一道题并得到了讲解。请你出一道【考点、题型完全相同，但题干背景、数字、人物、场景等素材完全换新】的变式题，用于检验用户是否真正掌握了这个知识点。\n\n用户刚问的原题：\n'+String(prev).slice(0,1000)+'\n\n要求：考点与解题思路保持一致，但题目素材全新；按同样格式输出（题目+4选项+答案解析+考点+秒杀规律），并在一开始特别标注【本题为上一题的变式，答案应是：】。'
  }
  if(kind==='diag'){
    return (SYS?SYS:'')+'\n\n━━━━━━━━━━━━━━━━━━━━━━━━\n【本次任务·学习诊断报告】\n请依据下面提供的用户学习数据（各板块提问次数、正确情况、错题分布、复盘情况），生成一份简洁务实的学习诊断报告，包含：\n1. 📊 板块表现一览（按掌握度排序，强→弱，用表格）；\n2. 🔍 高频薄弱点与普遍错因；\n3. 🎯 分板块学习建议（每个板块给2-3条具体可执行建议）；\n4. ⏱️ 备考优先级建议。\n用 Markdown，语气鼓励但实事求是。'
  }
  return (SYS||'')
}
