'use strict';
// Original-song hints contain metadata only, never lyric text.
const originalHints={'おにけもだんす':'いろはにほへっと あやふぶみ','Cotton Days':'Sizuk','教室に青':'星街すいせい','W/X/Y':'Tani Yuuki','初めての恋が終わる時':'supercell','初めての恋が終わるとき':'supercell'};
const knownPages={'おにけもだんす':[['UtaTen（含假名）','https://utaten.com/lyric/mi22092863/'],['官方 MV','https://www.youtube.com/watch?v=4Hg0Nchl3HU']],'教室に青':[['歌ネット','https://www.uta-net.com/song/350749/'],['UtaTen（含假名）','https://utaten.com/lyric/hw24022875/']]};
function originalHint(title){const n=normalized(title);return Object.entries(originalHints).find(([t])=>normalized(t)===n)?.[1]||'';}
function sourceName(r){return r.source|| (r.id!=null?'LRCLIB':'自行匯入');}
function sourceLinks(title,artist){const el=$('source-links');el.replaceChildren();if(!title)return;const hint=originalHint(title);const known=Object.entries(knownPages).find(([t])=>normalized(t)===normalized(title))?.[1]||[];const links=[...known,['搜尋日文歌詞','https://www.google.com/search?'+new URLSearchParams({q:[title,hint||artist,'歌詞'].filter(Boolean).join(' ')})]];for(const [name,url] of links){const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=name;el.append(a,document.createTextNode('　'));}}
function liriqoRecords(data,queries){if(!data||data.error)return [];const meta=data.metadata||{}, title=String(meta.title||'');if(!title||!queries.some(q=>normalized(q)===normalized(title)))return [];const d=typeof meta.duration==='string'&&/^\d+:\d+$/.test(meta.duration)?meta.duration.split(':').reduce((a,b)=>a*60+Number(b),0):Number(meta.duration)||0;const tracks=Array.isArray(data.tracks)&&data.tracks.length?data.tracks:[data.primary];return tracks.filter(Boolean).flatMap(t=>{const rows=Array.isArray(t.timed)?t.timed:[];const usable=rows.filter(l=>typeof l.text==='string'&&l.text.trim()&&Number.isFinite(l.start)&&l.start>=0&&!l.isCue&&!l.isInstrumental);const plain=typeof t.plain==='string'?t.plain.trim():rows.map(l=>l.text||'').filter(Boolean).join('\n');const lrc=usable.map(l=>{const ms=Math.round(l.start);return `[${String(Math.floor(ms/60000)).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}.${String(ms%1000).padStart(3,'0')}] ${l.text.replace(/\r?\n/g,' ')}`;}).join('\n');if(!plain&&!lrc)return [];return [{trackName:title,artistName:String(meta.artist||''),albumName:String(meta.album||''),duration:d,source:'LiriQo / '+String(t.upstreamProvider||t.lyricsSource||t.provider||'未知來源'),plainLyrics:plain,syncedLyrics:lrc||null}];});}
async function searchSources(s,queries,signal,onStatus=()=>{}){const records=new Map(),errors=[];const add=r=>{if(r&&(r.syncedLyrics||r.plainLyrics)){const key=JSON.stringify([sourceName(r),r.id??null,r.trackName,r.artistName,r.duration,!!r.syncedLyrics]);records.set(key,r);}};const alive=()=>{if(signal?.aborted)throw new DOMException('Aborted','AbortError');};async function json(url,timeout=9000){alive();const signals=[AbortSignal.timeout(timeout)];if(signal)signals.push(signal);const res=await fetch(url,{signal:AbortSignal.any(signals)});if(res.status===404)return null;if(!res.ok)throw Error('HTTP '+res.status);return res.json();}async function attempt(name,fn){alive();try{await fn();}catch(e){alive();errors.push(name+': '+e.message);}}
 const title=queries[0]||s.title, hint=originalHint(title);const exact=()=>[...records.values()].filter(r=>scoreRecord(r,s,queries).exact);const good=()=>exact().some(r=>{const m=scoreRecord(r,s,queries);return hasTimedLyrics(r)&&(hint?m.isOriginal:m.sameArtist&&m.delta<=4)&&m.noise===0;});async function lr(params){await attempt('LRCLIB',async()=>{const data=await json('https://lrclib.net/api/search?'+new URLSearchParams(params));if(Array.isArray(data))data.forEach(r=>add({...r,source:'LRCLIB'}));});}
 onStatus('搜尋 LRCLIB…');
 // Title-only queries are important for translated artist names and covers. Try the strongest candidate first.
 if(hint)await lr({track_name:title,artist_name:hint});
 if(!good()&&s.artist&&normalized(s.artist)!==normalized(hint))await lr({track_name:title,artist_name:s.artist});
 if(!good())await lr({track_name:title});
 if(!good())await lr({q:title});
 // If the strongest title did not resolve, try independent candidates, not a combined long string.
 if(!exact().some(r=>normalized(r.trackName)===normalized(title)&&hasTimedLyrics(r))){
   onStatus('比對其他可能歌名…');
   for(const q of queries.slice(1,5)){await lr({track_name:q});if(chooseAutoRecord([...records.values()],s,queries)&&exact().some(hasTimedLyrics))break;}
 }
 if(!exact().some(r=>normalized(r.trackName)===normalized(title)&&hasTimedLyrics(r))){
   onStatus('搜尋其他歌詞曲庫…');
   const artist=hint||s.artist;const requests=[artist?{title,artist,fast:'1'}:{Q:title,fast:'1'}];if(artist)requests.push({Q:title,fast:'1'});
   for(const params of requests){await attempt('LiriQo',async()=>{const data=await json('https://api.liriqo-alfarrizi.my.id/v1/lyrics?'+new URLSearchParams(params),16000);liriqoRecords(data,queries).forEach(add);});if(exact().some(r=>normalized(r.trackName)===normalized(title)&&hasTimedLyrics(r)))break;}
   if(!exact().length&&artist){onStatus('搜尋 lyrics.ovh 純文字…');await attempt('lyrics.ovh',async()=>{const data=await json('https://api.lyrics.ovh/v1/'+encodeURIComponent(artist)+'/'+encodeURIComponent(title));if(typeof data?.lyrics==='string'&&data.lyrics.trim())add({trackName:title,artistName:artist,source:'lyrics.ovh',plainLyrics:data.lyrics.trim()});});}
 }
 alive();return {records:[...records.values()].sort((a,b)=>scoreRecord(b,s,queries).score-scoreRecord(a,s,queries).score),errors};}
