'use strict';
// Readings are overlays only: never change raw lyrics, timestamps, or translation keys.
const refReadings=new Map(),refCache=new Map();
const autoRefPrefix='kotonoha.v103.reference.';
let refAbort=null;
const refKey=r=>JSON.stringify([r?.trackName||'',r?.artistName||'']);
const refIdentity=()=>JSON.stringify([refKey(song),lines.map(l=>l.text)]);
const manualRefPrefix='kotonoha.rc6.reference.';
const compactKanaText=s=>s.replace(/\s/gu,'');
function inlineSpans(text){let i=0;const out=[];for(const p of lyricParts(text)){if(p.reading)out.push({start:i,end:i+p.text.length,reading:p.reading});i+=p.text.length;}return out;}
function normalSpans(text,tokens){const out=[];let pos=0;for(const t of tokens||[]){const b=t.surface_form,r=hira(t.reading||'');if(!b)continue;const at=text.indexOf(b,pos);if(at<0)return [];pos=at+b.length;if(!kanji.test(b)||!r||r==='*'||!/^[ぁ-ゖー]+$/u.test(r))continue;const first=b.search(kanji);let last=b.length-1;while(last>=0&&!kanji.test(b[last]))last--;const a=hira(b.slice(0,first)),z=hira(b.slice(last+1));if(r.startsWith(a)&&r.endsWith(z)&&r.length>a.length+z.length)out.push({start:at+first,end:at+last+1,reading:r.slice(a.length,r.length-z.length)});else out.push({start:at,end:pos,reading:r});}return out;}
function ruleSpans(text,record,kind="all"){const out=[];const add=(re,reading)=>{for(const m of text.matchAll(re))out.push({start:m.index,end:m.index+m[0].length,reading:typeof reading==='function'?reading(m[0]):reading});};
 // No overrides in counters such as 十一人 or compounds 一人称/一人前.
 if(kind!=="song")add(/(?<![一二三四五六七八九十百千万億兆零〇0-9０-９第])(?:一人|二人)(?![称前組])/gu,b=>b==='一人'?'ひとり':'ふたり');
 if(kind!=="song"){
  add(/(?<![\p{Script=Han}])二十歳(?![\p{Script=Han}])/gu,'はたち');
  add(/(?<![\p{Script=Han}])一昨日(?![\p{Script=Han}])/gu,'おととい');
  add(/七変化/gu,'しちへんげ');
 }
 const title=String(record?.trackName||'').normalize('NFKC');
 if(kind!=="common"&&/^星降る海(?:$|\s*[-(（～~])/u.test(title))add(/(?<![\p{Script=Han}])宙(?![\p{Script=Han}])/gu,'そら');
 if(kind!=="common"&&/^キラキラだとか夢だとか(?:$|[\s~～(（])/u.test(title))add(/(?<=["“「『])音楽(?=["”」』])|音楽(?=["”」』]?\s*という)/gu,'きずな');
 // Track-scoped pronunciation dictionary, not a copy of the song lyrics.
 if(kind!=="common"&&/^おにけもだんす$/u.test(title.trim())){
  const overrides={'電気通信網':'いんたーねっと','超課金伝書鳩':'すーぱーちゃっと','御人':'おひと','狛犬':'こまいぬ','狐':'きつね','一二三':'ひふみ','物怪':'もののけ','怪物':'もののけ','偶像':'あいどる','神仏':'かみほとけ','仮想':'ばーちゃる','現世':'りある','天晴':'あっぱれ','大好':'だいす','凸':'とつ'};
  for(const [word,reading] of Object.entries(overrides))add(new RegExp(word==='大好'?'大好(?=こ)':word,'gu'),reading);
  add(/(?<![\p{Script=Han}])余(?![\p{Script=Han}])/gu,'よ');
  add(/(?<!大)好(?=こ|る)/gu,'す');
 }
 return out;
}
function mergeSpans(text,groups){const out=[];const valid=s=>Number.isInteger(s.start)&&Number.isInteger(s.end)&&s.start>=0&&s.end<=text.length&&s.start<s.end&&kanji.test(text.slice(s.start,s.end))&&/^[ぁ-ゖー]+$/u.test(s.reading);for(const group of groups)for(const input of group||[]){if(!valid(input))continue;let s={...input};for(const h of out.filter(x=>x.start<s.end&&s.start<x.end).sort((a,b)=>a.start-b.start)){if(h.start<=s.start&&h.end>=s.end){s=null;break;}if(h.start===s.start&&h.end<s.end){const word=text.slice(h.start,h.end);const alternatives=[h.reading,...(word==='一人'?['いちにん']:word==='二人'?['ににん']:[])];const r=alternatives.find(r=>s.reading.startsWith(r));if(!r){s=null;break;}s={start:h.end,end:s.end,reading:s.reading.slice(r.length)};}else if(h.end===s.end&&h.start>s.start&&s.reading.endsWith(h.reading)){s={start:s.start,end:h.start,reading:s.reading.slice(0,-h.reading.length)};}else{s=null;break;}}if(s&&valid(s)&&!out.some(x=>x.start<s.end&&s.start<x.end))out.push(s);}return out.sort((a,b)=>a.start-b.start);}
function referenceFor(text){const data=refReadings.get(compactKanaText(text));if(!Array.isArray(data))return [];const chars=[];for(let i=0;i<text.length;i++)if(!/\s/u.test(text[i]))chars.push(i);return data.map(s=>({start:chars[s.start],end:chars[s.end-1]+1,reading:s.reading})).filter(s=>Number.isInteger(s.start)&&Number.isInteger(s.end));}
// Match punctuation-insensitive sequences of up to three lines in each version.
// Preserve original line offsets for display and never rewrite the timed text.
function matchChars(text){const chars=[],indices=[];for(const m of text.matchAll(/\P{M}\p{M}*|\p{M}+/gu)){const ch=m[0],at=m.index;for(const c of ch.normalize('NFKC')){if(/[\s\p{P}]/u.test(c))continue;chars.push(c);indices.push({start:at,end:at+ch.length});}}return {key:chars.join(''),indices};}
function referenceMap(rawRows,currentRows){
 const current=currentRows.map(raw=>{const text=displayLyric(raw);return {text,...matchChars(text)};}).filter(x=>x.key);
 const other=rawRows.map(raw=>{const text=displayLyric(raw);return {text,spans:inlineSpans(raw),...matchChars(text)};}).filter(x=>x.key);
 if(!current.length||!other.length)return new Map();
 const windows=rows=>{const out=new Map();for(let i=0;i<rows.length;i++){let key='';const items=[];for(let j=i;j<Math.min(i+3,rows.length);j++){items.push({row:rows[j],index:j,offset:Array.from(key).length});key+=rows[j].key;if(!out.has(key))out.set(key,[]);out.get(key).push(items.slice());}}return out;};
 const cw=windows(current),ow=windows(other),covered=new Set(),pending=new Map(),conflicts=new Set();
 const insert=(key,s)=>{const list=pending.get(key)||[];const id=JSON.stringify([key,s.start,s.end]);if(conflicts.has(id))return;const prev=list.find(x=>x.start===s.start&&x.end===s.end);if(prev&&prev.reading!==s.reading){conflicts.add(id);list.splice(list.indexOf(prev),1);}else if(!prev)list.push(s);pending.set(key,list);};
 for(const [key,groups] of cw){const refs=ow.get(key);if(!refs)continue;
  for(const group of groups){for(const part of group)covered.add(part.index);
   for(const ref of refs)for(const entry of ref)for(const span of entry.row.spans){
    const ids=entry.row.indices.map((v,i)=>v.start>=span.start&&v.end<=span.end?i:-1).filter(i=>i>=0);if(!ids.length)continue;
    const start=entry.offset+ids[0],end=entry.offset+ids.at(-1)+1;
    const dest=group.find(v=>start>=v.offset&&end<=v.offset+v.row.indices.length);if(!dest)continue;
    const startRaw=dest.row.indices[start-dest.offset].start,endRaw=dest.row.indices[end-dest.offset-1].end;
    const text=dest.row.text,k=compactKanaText(text);insert(k,{start:compactKanaText(text.slice(0,startRaw)).length,end:compactKanaText(text.slice(0,endRaw)).length,reading:span.reading});
   }
  }
 }
 const distinct=new Set(current.map(x=>x.key)),matched=new Set([...covered].map(i=>current[i].key));
 if(matched.size<Math.min(3,distinct.size)||matched.size<Math.ceil(distinct.size*.55))return new Map();
 return new Map([...pending].filter(([,v])=>v.length));
}
function combineReferenceMaps(maps){const all=new Map(),out=new Map();for(const m of maps)for(const [key,spans] of m){if(!all.has(key))all.set(key,[]);for(const span of spans){const list=all.get(key);if(!list.some(x=>x.start===span.start&&x.end===span.end&&x.reading===span.reading))list.push(span);}}for(const [key,spans] of all){const valid=spans.filter(a=>!spans.some(b=>a!==b&&a.start<b.end&&b.start<a.end));if(valid.length)out.set(key,valid.sort((a,b)=>a.start-b.start));}return out;}
function referenceRows(r){return [...parseLyrics(r.syncedLyrics||'').map(l=>l.text),...parseLyrics(r.plainLyrics||'').map(l=>l.text)];}
async function findReference(record,g,force=false){refAbort?.abort();refAbort=null;refReadings.clear();const valid=()=>g===generation;const label=$('ref-status');const title=record?.trackName||'';const artist=originalHint(title)||record?.artistName||'';const url=$('ref-link');const known=titleKey(title)===titleKey('好きだから。')?'https://utaten.com/lyric/ma21063004/':normalized(title)==='psycho'&&/hakos\s*baelz|ハコス[・･ ]?ベールズ/iu.test(artist)?'https://utaten.com/lyric/hw23050921/':normalized(title)===normalized('おにけもだんす')?'https://utaten.com/lyric/mi22092863/':title==='星降る海'?'https://utaten.com/lyric/sz25120805/':title.startsWith('キラキラだとか夢だとか')?'https://utaten.com/lyric/ya17021530/':'';url.href=known||'https://www.google.com/search?'+new URLSearchParams({q:[title,artist,'歌詞 ふりがな site:utaten.com'].filter(Boolean).join(' ')});if(!title||record.demo||!lines.some(l=>kanji.test(l.text))){label.textContent='等待日文歌曲';return;}
 const key=JSON.stringify([refKey(record),lines.map(l=>l.text)]),raw=lines.filter(l=>!l.credit).map(l=>l.text);const use=(map,status)=>{if(!valid())return;refReadings.clear();for(const [k,v] of map)refReadings.set(k,v);label.textContent=status;repaintReference();};
 try{const stored=JSON.parse(localStorage.getItem(manualRefPrefix+key)||'null');if(Array.isArray(stored)){const m=new Map(stored);use(m,`已載入自訂參考讀音 ${m.size} 句`);return;}}catch{}
 if(!force){try{const saved=JSON.parse(localStorage.getItem(autoRefPrefix+key)||'null');if(saved&&Date.now()-saved.at<30*86400000&&Array.isArray(saved.map)){const m=new Map(saved.map);use(m,`已載入網路參考讀音 ${m.size} 句`);return;}}catch{}}
 if(!force&&refCache.has(key)){const m=refCache.get(key);use(m,m.size?`其他歌詞版本：已對照 ${m.size} 句`:'未找到可對照的標註版本');return;}
 const controller=new AbortController();refAbort=controller;label.textContent='正在搜尋有讀音的其他歌詞版本…';let errors=0;
 const candidates=[];const collect=records=>{for(const r of records||[]){if(titleKey(r.trackName)!==titleKey(title))continue;for(const text of [r.syncedLyrics,r.plainLyrics]){if(!text)continue;const m=referenceMap(parseLyrics(text).map(l=>l.text),raw);if(m.size)candidates.push(m);}}};
 collect([record]);const recent=searchedRecords.get(titleKey(title));if(recent&&Date.now()-recent.at<300000)collect(recent.records);
 let best=combineReferenceMaps(candidates);const count=new Set(raw.filter(x=>kanji.test(x)).map(x=>compactKanaText(displayLyric(x)))).size;
 if(best.size)use(best,`已採用網路參考讀音 ${best.size} 句，背景補查中…`);
 if((force||!recent)&&best.size<count*.8){try{const v=await lyricFetch('https://lrclib.net/api/search?'+new URLSearchParams({track_name:title}),controller.signal,4500,{reuse:!force});if(Array.isArray(v))collect(v);}catch{errors++;}}
 if(!valid()||controller.signal.aborted)return;
 best=combineReferenceMaps(candidates);
 if(best.size<count*.8){try{const q=artist?{title,artist,fast:'1'}:{Q:title,fast:'1'};const v=await lyricFetch('https://api.liriqo-alfarrizi.my.id/v1/lyrics?'+new URLSearchParams(q),controller.signal,6500,{reuse:!force});collect(liriqoRecords(v,[title]));}catch{errors++;}}
 if(!valid()||controller.signal.aborted)return;
 best=combineReferenceMaps(candidates);if(!errors||best.size){refCache.set(key,best);if(refCache.size>40)refCache.delete(refCache.keys().next().value);if(best.size)try{localStorage.setItem(autoRefPrefix+key,JSON.stringify({at:Date.now(),map:[...best]}));}catch{}}
 use(best,best.size?`網路參考讀音：已對照 ${best.size} 句${errors?'（部分來源未連線）':''}`:errors?'未找到可對照版本（部分來源未連線）':'未找到可對照的標註版本；使用字典與規則');

}

function repaintReference(){for(const l of lines){if(!l.credit&&kanji.test(l.text))renderSourceLine(l,true);}queueCenter();}
function importReference(){if(!song||song.demo||!lines.length){$('ref-status').textContent='請先選擇歌曲';return;}const text=$('ref-text').value.trim();if(!text||text.length>30000){$('ref-status').textContent='請貼上有括號讀音的歌詞，每行一句，最多 30,000 字元。';return;}const raw=parseLyrics(text).map(l=>l.text),current=lines.filter(l=>!l.credit).map(l=>l.text),m=referenceMap(raw,current);if(!m.size){$('ref-status').textContent='沒有足夠的相符原句或括號假名，未套用。';return;}refAbort?.abort();refReadings.clear();for(const [k,v] of m)refReadings.set(k,v);let saved=true;try{localStorage.setItem(manualRefPrefix+refIdentity(),JSON.stringify([...m]));}catch{saved=false;}$('ref-status').textContent=`自訂參考讀音：已對照 ${m.size} 句${saved?'，已儲存':'，僅本次開頁'}`;$('ref-text').value='';repaintReference();}

// Rich-text paste supports standard ruby and common .ruby/.rb/.rt markup.
// Never mount the pasted HTML; extract text only from an inert template.
function rubyClipboardText(html){
 const template=document.createElement('template');template.innerHTML=html;
 const chunks=[];let marked=0;
 const getText=node=>node?.textContent||'';
 function visit(node){if(node.nodeType===3){chunks.push(node.nodeValue);return;}if(node.nodeType!==1&&node.nodeType!==11)return;
 if(node.nodeType===1){const tag=node.tagName;if(['SCRIPT','STYLE','NOSCRIPT','IFRAME','OBJECT','IMG','RT','RP'].includes(tag))return;
 if(tag==='RUBY'||node.classList.contains('ruby')){const rt=node.querySelector('rt,.rt'),rb=node.querySelector('rb,.rb');let base=getText(rb);if(!base){const clone=node.cloneNode(true);clone.querySelectorAll('rt,rp,.rt').forEach(n=>n.remove());base=clone.textContent;}const reading=hira(getText(rt).trim());if(/^[\p{Script=Han}々〆ヶ]+$/u.test(base.trim())&&/^[ぁ-ゖー]+$/u.test(reading)){chunks.push(base.trim()+'('+reading+')');marked++;return;}}
 if(tag==='BR'){chunks.push('\n');return;}}
 for(const child of node.childNodes)visit(child);
 if(node.nodeType===1&&['DIV','P','LI','SECTION'].includes(node.tagName))chunks.push('\n');}
 visit(template.content);return marked?chunks.join('').trim():'';
}
