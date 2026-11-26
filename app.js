'use strict';
const $=id=>document.getElementById(id);
const ui=Object.fromEntries(['query','artist','search','search-status','results','furigana','translation','follow','font-size','font-value','kana-status','manual-title','manual-artist','manual-lyrics','manual-file','import','translation-text','save-translation','translation-status','demo','track-title','track-artist','sync-tag','track-status','lyrics','elapsed','duration','seek','back','play','forward','reset','offset-minus','offset-value','offset-plus'].map(id=>[id,$(id)]));
let song=null, lines=[], timed=false, duration=0, position=0, anchor=0, playing=false, offset=0, active=-1, generation=0, searchGeneration=0, tokenizerPromise=null, frame=0;
const kanji=/[\p{Script=Han}々〆ヶ]/u;
const hira=s=>s.replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
function parseLyrics(text){
 const rows=[], plain=[]; const input=String(text||'').replace(/^\uFEFF/,'');
 const fileOffset=Number(input.match(/^\s*\[offset:([+-]?\d+)\]/im)?.[1]||0)/1000;
 for(const raw of input.split(/\r?\n/)){
  const stamps=[...raw.matchAll(/\[(\d+):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)];
  if(stamps.length){const text=raw.replace(/\[\d+:\d{1,2}(?:[.:]\d{1,3})?\]/g,'').trim();for(const m of stamps){rows.push({t:Math.max(0,+m[1]*60 + +m[2]+(m[3]?Number('0.'+m[3]):0)+fileOffset),text});}}
  else if(raw.trim()&&!/^\s*\[[a-z]+:/i.test(raw))plain.push({t:null,text:raw.trim()});
 }
 return rows.length?rows.sort((a,b)=>a.t-b.t):plain;
}
function tokenizer(){
 if(!tokenizerPromise)tokenizerPromise=new Promise((resolve,reject)=>{
  if(!window.kuromoji){reject(new Error('日文分析工具未載入'));return;}
  const timer=setTimeout(()=>reject(new Error('字典下載逾時')),60000);
  window.kuromoji.builder({dicPath:'https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict/'}).build((err,t)=>{clearTimeout(timer);err?reject(err):resolve(t);});
 }).catch(e=>{tokenizerPromise=null;throw e;});
 return tokenizerPromise;
}
function addRuby(parent,base,reading){const r=document.createElement('ruby'),rt=document.createElement('rt');r.append(document.createTextNode(base));rt.textContent=reading;r.append(rt);parent.append(r);}
function annotated(parent,tokenizer,text){
 const tokens=tokenizer.tokenize(text); if(tokens.map(x=>x.surface_form).join('')!==text){parent.textContent=text;return;}
 const frag=document.createDocumentFragment();
 for(const token of tokens){const base=token.surface_form,reading=hira(token.reading||'');if(!kanji.test(base)||!reading||reading==='*'){frag.append(document.createTextNode(base));continue;}
  const first=base.search(kanji);let last=base.length-1;while(last>=0&&!kanji.test(base[last]))last--;
  const prefix=base.slice(0,first),suffix=base.slice(last+1),a=hira(prefix),b=hira(suffix);
  if(reading.startsWith(a)&&reading.endsWith(b)&&reading.length>a.length+b.length){frag.append(document.createTextNode(prefix));addRuby(frag,base.slice(first,last+1),reading.slice(a.length,reading.length-b.length));frag.append(document.createTextNode(suffix));}else addRuby(frag,base,reading);
 }
 parent.replaceChildren(frag);
}
const key=()=>song?'kotonoha.v1.translation.'+(song.id!=null?'lrclib:'+song.id:JSON.stringify([song.trackName,song.artistName,lines.map(l=>l.text)])):null;
function readTranslations(){try{return JSON.parse(localStorage.getItem(key())||'[]');}catch{return [];}}
function setTranslations(values){let n=0;for(const line of lines){if(!line.text)continue;line.zh.textContent=values[n++]||'';}}
function timeString(t){t=Math.floor(Math.max(0,t));return Math.floor(t/60)+':'+String(t%60).padStart(2,'0');}
function now(){return clamp(position+(playing?(performance.now()-anchor)/1000:0),0,duration);}
function setPlaying(on){position=now();anchor=performance.now();playing=on&&timed&&duration>0&&position<duration;ui.play.textContent=playing?'Ⅱ':'▶';ui.play.setAttribute('aria-label',playing?'暫停歌詞計時':'啟動歌詞計時');if(playing&&!frame)frame=requestAnimationFrame(tick);update();}
function seek(t){position=clamp(t,0,duration);anchor=performance.now();update();}
function tick(){frame=0;if(!playing)return;update();if(now()>=duration){setPlaying(false);return;}frame=requestAnimationFrame(tick);}
function lineAt(t){let lo=0,hi=lines.length;while(lo<hi){const mid=(lo+hi)>>1;if(lines[mid].t<=t)lo=mid+1;else hi=mid;}return lo-1;}
function update(){const t=now();ui.elapsed.textContent=timeString(t);ui.seek.value=String(t);if(!timed)return;const n=lineAt(t+offset);if(n===active)return;if(active>=0)lines[active]?.el.classList.remove('active');active=n;if(n>=0){const l=lines[n];l.el.classList.add('active');if(ui.follow.checked){const panel=ui.lyrics;const top=l.el.offsetTop-(panel.clientHeight-l.el.offsetHeight)/2;panel.scrollTo({top:Math.max(0,top),behavior:'smooth'});}}}
function updateControls(){for(const x of ['seek','back','play','forward','reset','offset-minus','offset-plus'])ui[x].disabled=!timed;ui.seek.max=String(duration||1);ui.duration.textContent=timeString(duration);ui['offset-value'].textContent=(offset>0?'+':'')+offset.toFixed(1)+' s';}
async function addReadings(g){if(!lines.some(l=>kanji.test(l.text))){ui['kana-status'].textContent='沒有需要標註的漢字';return;}ui['kana-status'].textContent='載入日文字典（首次可能較慢）…';try{const t=await tokenizer();if(g!==generation)return;let failures=0;for(const l of lines){if(kanji.test(l.text))try{annotated(l.jp,t,l.text);}catch{failures++;}}ui['kana-status'].textContent=failures?'部分句子無法分析，保留原文':'假名已標註（特殊唱法可能有誤）';}catch(e){if(g===generation)ui['kana-status'].textContent='假名載入失敗：'+e.message+'；重新載入歌曲可再試。';}}
function loadSong(record){setPlaying(false);generation++;song=record;lines=parseLyrics(record.syncedLyrics||record.plainLyrics||'');timed=lines.length>0&&lines.every(x=>x.t!==null);duration=timed?Math.max(Number(record.duration)||0,lines.at(-1).t+5):0;position=0;offset=0;active=-1;ui['track-title'].textContent=record.trackName||'自訂歌曲';ui['track-artist'].textContent=record.artistName||'未知歌手';ui['sync-tag'].textContent=timed?'LRC 同步': '純文字';ui['track-status'].textContent=timed?'手動同步：音樂開始時啟動下方計時器。':'沒有時間戳，暫時只能閱讀；可匯入 LRC 取得同步功能。';if(record.demo)ui['track-status'].textContent='自創句子示範，沒有音訊；按 ▶ 即可測試自動捲動。';ui.lyrics.replaceChildren();ui.lyrics.classList.toggle('timed',timed);for(const l of lines){const el=document.createElement('div');el.className='line'+(timed?' timed':'');const jp=document.createElement('div');jp.className='jp';jp.lang='ja';jp.textContent=l.text||'♪';const zh=document.createElement('div');zh.className='zh';el.append(jp,zh);if(timed){el.tabIndex=0;el.setAttribute('role','button');el.addEventListener('click',()=>seek(l.t-offset));el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();seek(l.t-offset);}});}l.el=el;l.jp=jp;l.zh=zh;ui.lyrics.append(el);}if(!lines.length){const p=document.createElement('p');p.className='empty';p.textContent='沒有可顯示的歌詞。';ui.lyrics.append(p);}ui.lyrics.scrollTop=0;const saved=readTranslations();const values=saved.length?saved:(record.translations||[]);ui['translation-text'].value=values.join('\n');ui['translation-status'].textContent='';setTranslations(values);updateControls();update();addReadings(generation);}
ui.search.addEventListener('submit',async e=>{e.preventDefault();const q=ui.query.value.trim(),artist=ui.artist.value.trim();if(!q)return;const g=++searchGeneration;ui.results.replaceChildren();ui['search-status'].textContent='搜尋中…';try{const params=new URLSearchParams(artist?{track_name:q,artist_name:artist}:{q});const res=await fetch('https://lrclib.net/api/search?'+params,{headers:{'Lrclib-Client':'Kotonoha personal lyrics reader/0.1'},signal:AbortSignal.timeout(20000)});if(!res.ok)throw new Error('HTTP '+res.status);const data=await res.json();if(g!==searchGeneration)return;if(!Array.isArray(data))throw new Error('回傳格式不符');const matches=data.filter(x=>x.syncedLyrics||x.plainLyrics).sort((a,b)=>Number(Boolean(b.syncedLyrics))-Number(Boolean(a.syncedLyrics)));ui['search-status'].textContent=matches.length?`找到 ${matches.length} 筆歌詞，請選擇正確版本。`:'找不到歌詞；試試其他歌名或匯入 LRC。';for(const item of matches){const b=document.createElement('button');b.className='result';b.textContent=item.trackName||item.name||'未知歌曲';const small=document.createElement('small');small.textContent=[item.artistName,item.albumName,timeString(Number(item.duration)||0),item.syncedLyrics?'有同步':'純文字'].filter(Boolean).join(' · ');b.append(small);b.addEventListener('click',()=>loadSong(item));ui.results.append(b);}}catch(err){if(g===searchGeneration)ui['search-status'].textContent='搜尋失敗：'+err.message+'。可使用手動匯入。';}});
ui.demo.addEventListener('click',()=>loadSong({id:null,demo:true,trackName:'夜の散歩',artistName:'自創示範（非真實歌曲）',duration:36,syncedLyrics:'[00:03.00] 静かな夜に歩いていく\n[00:09.00] 遠い街の光を見つめる\n[00:15.00] 明日の風を待ちながら\n[00:21.00] 小さな夢を抱きしめる\n[00:27.00] また新しい朝が来る',translations:['在寧靜的夜晚漫步','凝望遠方城市的燈光','一邊等待明天的風','一邊擁抱小小的夢想','嶄新的早晨又將到來']}));
ui['manual-file'].addEventListener('change',async()=>{const f=ui['manual-file'].files[0];if(f)try{ui['manual-lyrics'].value=await f.text();}catch{alert('無法讀取檔案');}});
ui.import.addEventListener('click',()=>{const text=ui['manual-lyrics'].value;if(!parseLyrics(text).length){alert('請輸入歌詞或有效的 LRC 檔案');return;}loadSong({trackName:ui['manual-title'].value.trim()||'自訂歌曲',artistName:ui['manual-artist'].value.trim(),syncedLyrics:text});});
ui['save-translation'].addEventListener('click',()=>{if(!song){ui['translation-status'].textContent='請先選擇歌曲';return;}const value=ui['translation-text'].value.split(/\r?\n/);setTranslations(value);try{localStorage.setItem(key(),JSON.stringify(value));ui['translation-status'].textContent='已儲存於此瀏覽器。';}catch{ui['translation-status'].textContent='已套用，但瀏覽器儲存失敗。';}const count=lines.filter(l=>l.text).length;if(value.length!==count)ui['translation-status'].textContent+=` 原文有 ${count} 行，目前貼入 ${value.length} 行。`;});
ui.furigana.addEventListener('change',()=>ui.lyrics.classList.toggle('hide-ruby',!ui.furigana.checked));ui.translation.addEventListener('change',()=>ui.lyrics.classList.toggle('hide-translation',!ui.translation.checked));ui.follow.addEventListener('change',()=>{if(ui.follow.checked){active=-1;for(const l of lines)l.el.classList.remove('active');update();}});ui['font-size'].addEventListener('input',()=>{document.documentElement.style.setProperty('--lyric-size',ui['font-size'].value+'px');ui['font-value'].textContent=ui['font-size'].value;});
ui.play.addEventListener('click',()=>{if(!playing&&now()>=duration)seek(0);setPlaying(!playing);});ui.seek.addEventListener('input',()=>seek(Number(ui.seek.value)));ui.back.addEventListener('click',()=>seek(now()-5));ui.forward.addEventListener('click',()=>seek(now()+5));ui.reset.addEventListener('click',()=>{setPlaying(false);seek(0);});function adjust(n){offset=clamp(offset+n,-30,30);updateControls();update();}ui['offset-minus'].addEventListener('click',()=>adjust(-.5));ui['offset-plus'].addEventListener('click',()=>adjust(.5));updateControls();
