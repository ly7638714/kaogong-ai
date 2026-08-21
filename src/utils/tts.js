function strip(t){ return String(t||'').replace(/[#*\`>|_]/g,'').replace(/\s+/g,' ') }
export function pickVoice(){ try{ const vs=window.speechSynthesis.getVoices(); const zh=vs.filter(v=>v.lang&&v.lang.toLowerCase().startsWith('zh')); return zh.find(v=>/neural|xiaoxiao|xiaoyi|yunxi|yunyang|tingting|huihui|yaoyao|google/i.test(v.name))||zh[0]||null }catch(e){return null} }
export function speak(text, onEnd){ if(!('speechSynthesis' in window))return; try{ window.speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(strip(text)); u.lang='zh-CN'; const v=pickVoice(); if(v)u.voice=v; u.rate=0.98; if(onEnd)u.onend=onEnd; window.speechSynthesis.speak(u) }catch(e){} }
export function stopSpeak(){ try{ window.speechSynthesis.cancel() }catch(e){} }
export function speaking(){ try{ return window.speechSynthesis.speaking||window.speechSynthesis.pending }catch(e){ return false } }
let recog=null, recogOn=false
export function startRecog(onText){
  if(!('webkitSpeechRecognition' in window||'SpeechRecognition' in window)) return false
  if(recogOn){ if(recog)recog.stop(); recogOn=false; return true }
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition; recog=new SR(); recog.lang='zh-CN'; recog.continuous=true; recog.interimResults=true
  recog.onresult=e=>{ let t=''; for(let i=e.resultIndex;i<e.results.length;i++) t+=e.results[i][0].transcript; onText(t) }
  recog.onend=()=>{ recogOn=false }; recog.onerror=()=>{ recogOn=false }
  recogOn=true; recog.start(); return true
}
export function recogActive(){ return recogOn }
