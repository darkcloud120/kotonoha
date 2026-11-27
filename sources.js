'use strict';
// Original-song hints contain metadata only, never lyric text.
const originalHints={'おにけもだんす':'いろはにほへっと あやふぶみ','Cotton Days':'Sizuk','チューリングラブ':'ナナヲアカリ','ラビットホール':'DECO*27','ねぇねぇねぇ。':'ピノキオピー','教室に青':'星街すいせい','W/X/Y':'Tani Yuuki','初めての恋が終わる時':'supercell','初めての恋が終わるとき':'supercell'};
const knownPages={'おにけもだんす':[['UtaTen（含假名）','https://utaten.com/lyric/mi22092863/'],['官方 MV','https://www.youtube.com/watch?v=4Hg0Nchl3HU']],'教室に青':[['歌ネット','https://www.uta-net.com/song/350749/'],['UtaTen（含假名）','https://utaten.com/lyric/hw24022875/']]};
function originalHint(title){const n=titleKey(title);return Object.entries(originalHints).find(([t])=>titleKey(t)===n)?.[1]||'';}
function sourceName(r){return r.source|| (r.id!=null?'LRCLIB':'自行匯入');}
function sourceLinks(title,artist){const el=$('source-links');el.replaceChildren();if(!title)return;const hint=originalHint(title);const psycho=normalized(title)==='psycho'&&/hakos\s*baelz|ハコス[・･ ]?ベールズ/iu.test(artist||'');const known=psycho?[['UtaTen（含假名）','https://utaten.com/lyric/hw23050921/'],['歌ネット','https://www.uta-net.com/song/336850/']]:Object.entries(knownPages).find(([t])=>normalized(t)===normalized(title))?.[1]||[];const links=[...known,['搜尋日文歌詞','https://www.google.com/search?'+new URLSearchParams({q:[title,hint||artist,'歌詞'].filter(Boolean).join(' ')})]];for(const [name,url] of links){const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=name;el.append(a,document.createTextNode('　'));}}
function liriqoRecords(data,queries){if(!data||data.error)return [];const meta=data.metadata||{}, title=String(meta.title||'');if(!title||!queries.some(q=>titleKey(q)===titleKey(title)))return [];const d=typeof meta.duration==='string'&&/^\d+:\d+$/.test(meta.duration)?meta.duration.split(':').reduce((a,b)=>a*60+Number(b),0):Number(meta.duration)||0;const tracks=Array.isArray(data.tracks)&&data.tracks.length?data.tracks:[data.primary];return tracks.filter(Boolean).flatMap(t=>{const rows=Array.isArray(t.timed)?t.timed:[];const usable=rows.filter(l=>typeof l.text==='string'&&l.text.trim()&&Number.isFinite(l.start)&&l.start>=0&&!l.isCue&&!l.isInstrumental);const plain=typeof t.plain==='string'?t.plain.trim():rows.map(l=>l.text||'').filter(Boolean).join('\n');const lrc=usable.map(l=>{const ms=Math.round(l.start);return `[${String(Math.floor(ms/60000)).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}.${String(ms%1000).padStart(3,'0')}] ${l.text.replace(/\r?\n/g,' ')}`;}).join('\n');if(!plain&&!lrc)return [];return [{trackName:title,artistName:String(meta.artist||''),albumName:String(meta.album||''),duration:d,source:'LiriQo / '+String(t.upstreamProvider||t.lyricsSource||t.provider||'未知來源'),plainLyrics:plain,syncedLyrics:lrc||null}];});}
async function searchSources(s,queries,signal,onStatus=()=>{}){
 const records=new Map(),errors=[];
 const add=r=>{if(r&&(r.syncedLyrics||r.plainLyrics)){const key=JSON.stringify([sourceName(r),r.id??null,r.trackName,r.artistName,r.duration,!!r.syncedLyrics]);records.set(key,r);}};
 const alive=()=>{if(signal?.aborted)throw new DOMException('Aborted','AbortError');};
 const title=queries[0]||s.title, hint=trustedHint(s,queries),artists=[...new Set([hint,...artistCandidates(s,queries)].filter(Boolean))].slice(0,4),primary=artists[0];
 const all=()=>[...records.values()];
 const best=()=>chooseAutoRecord(all(),s,queries);
 const strict=()=>chooseAutoRecord(all(),s,queries,{strict:true});
 const finish=()=>{alive();return {records:all().sort((a,b)=>scoreRecord(b,s,queries).score-scoreRecord(a,s,queries).score),errors};};
 // Wait for a small window after a strong match, not for slow redundant requests.
 // Phase cancellation is local; switching songs still aborts the entire search.
 async function phase(tasks,early=()=>!!strict()){
   alive();if(!tasks.length)return;
   const controller=new AbortController();let timer=null,closed=false;
   const parentAbort=()=>controller.abort();signal?.addEventListener('abort',parentAbort,{once:true});if(signal?.aborted)parentAbort();
   async function json(url,timeout){alive();const res=await fetch(url,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(timeout)])});if(res.status===404)return null;if(!res.ok)throw Error('HTTP '+res.status);return res.json();}
   try{await new Promise(resolve=>{
     let left=tasks.length;
     const done=()=>{if(closed)return;closed=true;clearTimeout(timer);controller.abort();resolve();};
     const onAbort=()=>done();controller.signal.addEventListener('abort',onAbort,{once:true});
     if(controller.signal.aborted){done();return;}
     for(const {name,url,ms,convert} of tasks){(async()=>{try{const data=await json(url,ms);if(!closed&&!controller.signal.aborted)convert(data).forEach(add);}catch(e){if(!controller.signal.aborted)errors.push(name+': '+e.message);}finally{if(closed)return;if(--left===0)done();else if(timer===null&&early())timer=setTimeout(()=>{if(early())done();else timer=null;},250);}})();}
   });}finally{clearTimeout(timer);signal?.removeEventListener('abort',parentAbort);controller.abort();}
   alive();
 }
 const lr=(params,path='search')=>({name:'LRCLIB',url:'https://lrclib.net/api/'+path+'?'+new URLSearchParams(params),ms:4500,convert:data=>(Array.isArray(data)?data:data?[data]:[]).map(r=>({...r,source:'LRCLIB'}))});
 const lq=params=>({name:'LiriQo',url:'https://api.liriqo-alfarrizi.my.id/v1/lyrics?'+new URLSearchParams(params),ms:8500,convert:data=>liriqoRecords(data,queries)});
 onStatus('快速搜尋 LRCLIB（歌名＋歌手並行）…');
 const alternatives=queries.filter(q=>normalized(q)!==normalized(title)&&titleKey(q)===titleKey(title)).slice(0,2);const metadata=Array.isArray(s.titleHints)?s.titleHints.filter(x=>typeof x==='string').slice(0,2).map(t=>titleQueries(t,s.artist)[0]).filter(Boolean):[];const initial=[...new Set([title,...alternatives,...metadata])].slice(0,4).map(q=>lr({track_name:q}));if(primary)initial.push(lr({track_name:title,artist_name:primary}));
 if(primary&&s.duration>0)initial.push(lr({track_name:title,artist_name:primary,duration:Math.round(s.duration)},'get'));
 await phase(initial);
 if(strict()||best()&&hasTimedLyrics(best()))return finish();
 // Manual searches with exact timed results can show the list without waiting for other providers.
 if(!s.duration&&all().some(r=>scoreRecord(r,s,queries).titleRank===0&&hasTimedLyrics(r)))return finish();
 onStatus('比對其他歌名與曲庫（並行）…');
 const secondary=[...(all().length===0?[{...lr({track_name:title}),ms:7500}]:[]),...artists.slice(1,3).map(a=>lr({track_name:title,artist_name:a})),...queries.slice(1,8).map(q=>lr({track_name:q})),...(primary?[lr({q:title+' '+primary}),lq({title,artist:primary,fast:'1'})]:[]),lq({Q:title,fast:'1'})];
 // Plain-text fallback runs concurrently with the other providers, rather than another sequential timeout.
 if(primary)secondary.push({name:'lyrics.ovh',url:'https://api.lyrics.ovh/v1/'+encodeURIComponent(primary)+'/'+encodeURIComponent(title),ms:5000,convert:data=>typeof data?.lyrics==='string'&&data.lyrics.trim()?[{trackName:title,artistName:primary,source:'lyrics.ovh',plainLyrics:data.lyrics.trim()}]:[]});
 await phase(secondary);
 return finish();
}
