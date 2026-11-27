'use strict';
let remote=null, remoteKey='', loadedKey='', remoteSeen=0, syncRequest=0, requestController=null, syncNote='', selectedRecord=null;
const syncCache=new Map();
const syncStatus=$('connection-status'), syncInfo=$('playing-info'), auto=$('auto-sync'), retry=$('retry-sync');
try{auto.checked=localStorage.getItem('kotonoha.v3.auto')!=='off';}catch{}
function syncLocked(){return auto.checked&&!!remote&&Date.now()-remoteSeen<15000;}
function songIdentity(s){return JSON.stringify([s.videoId||'',s.title,s.artist]);}
function mappingKey(k){return 'kotonoha.v3.map.'+k;}
function getMapping(k){try{return JSON.parse(localStorage.getItem(mappingKey(k))||'null');}catch{return null;}}
function putMapping(k,m){try{localStorage.setItem(mappingKey(k),JSON.stringify(m));}catch{}}
const autoCacheKey='kotonoha.v101.autoCache';
function readAutoCache(k){try{const e=JSON.parse(localStorage.getItem(autoCacheKey)||'{}')[k];if(e&&Date.now()-e.at<30*86400000)return e.record;}catch{}}
function writeAutoCache(k,record,s,queries){if(!chooseAutoRecord([record],s,queries,{strict:true}))return;try{const data=JSON.parse(localStorage.getItem(autoCacheKey)||'{}');data[k]={record,at:Date.now()};const keys=Object.keys(data).sort((a,b)=>data[b].at-data[a].at);for(const x of keys.slice(40))delete data[x];localStorage.setItem(autoCacheKey,JSON.stringify(data));}catch{}}
function disableAutoSync(){auto.checked=false;changeAuto();}
function changeAuto(){try{localStorage.setItem('kotonoha.v3.auto',auto.checked?'on':'off');}catch{}syncRequest++;requestController?.abort();searchGeneration++;loadedKey='';remoteKey='';selectedRecord=null;setPlaying(false);updateControls();retry.disabled=!syncLocked();if(!auto.checked){syncStatus.textContent='手動模式';ui['track-status'].textContent='手動模式：音樂開始時啟動歌詞計時器。';}else if(syncLocked())receive(remote);else syncStatus.textContent='等待擴充功能連線…';}
auto.addEventListener('change',changeAuto);
function normalized(t){return String(t||'').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');}
// Candidate order expresses confidence, not just the number of bracketed strings.
function titleQueries(t,artist=''){
 const original=String(t||'').normalize('NFKC').trim();
 const promo=/(?:cover(?:ed)?\b|歌ってみた|翻唱|original\s*(?:mv|pv|music\s*video)|official|music\s*video|^\s*mv\s*$|^\s*pv\s*$|^\s*live\s*$|主題歌|オープニング|エンディング|楽曲(?:好評)?配信|配信中|字幕|切り抜き|shorts?|full\s*ver|歌枠|耐久|公開中|^\s*HD\s*$)/iu;
 const clean=original.split(/\s*[／/|｜-]?\s*(?=(?:TV\s*アニメ|テレビアニメ|TV\s*anime|アニメ[「『]))/iu)[0]
 .replace(/[【\[（(]([^】\]）)]+)[】\]）)]/gu,(m,v)=>promo.test(v)?' ':m)
 .replace(/\s*(?:covered\s+by|cover\s+by|歌ってみた|翻唱|official\s+(?:music\s+)?video).*$/iu,'').trim();
 const pieces=clean.split(/\s*[｜|–—]\s*|\s+[/-]\s+|(?<=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])\/(?=[^/])/u).map(v=>v.trim()).filter(Boolean);
 const unwrap=v=>v.replace(/^[「『【\[]|[」』】\]]$/gu,'').trim();
 const artistLike=v=>artistMatches(v,artist)||artistMatches(v.replace(/\s*[-–—]?\s*Topic$/i,''),artist);
 if(pieces.length>1&&(artistLike(pieces[0])||(/\s[-–—]\s/u.test(clean)&&/music video|\bMV\b/iu.test(original)&&!artistLike(pieces[1]))))pieces.shift();
 const strong=[],weak=[];
 for(const piece of pieces){if(artistLike(piece)&&pieces.length>1)continue;const value=unwrap(piece);const quoted=[...piece.matchAll(/[「『【\[]([^」』】\]]+)[」』】\]]/gu)].filter(m=>!promo.test(m[1]));
 const pref=quoted.find(m=>artistLike(piece.slice(0,m.index))||!piece.slice(0,m.index).trim());if(pref)strong.push(pref[1]);
 const stripped=unwrap(piece.replace(/[【\[][^】\]]+[】\]]/gu,' ').replace(/\s+/g,' ').trim());if(stripped&&!promo.test(stripped))strong.push(stripped);if(value&&!promo.test(value))weak.push(value);for(const m of quoted)weak.push(m[1]);}
 const candidates=[...strong,...weak,unwrap(clean)].filter(x=>x&&!promo.test(x));
 const hint=Object.keys(originalHints).find(k=>candidates.some(v=>normalized(v)===normalized(k)));
 const aliases=candidates.some(v=>/^初めての恋が終わる(?:時|とき)$/.test(v))?['初めての恋が終わる時','初めての恋が終わるとき']:[];
 const seen=new Set();return [hint,...aliases,...candidates].filter(v=>{const n=normalized(v);if(!n||seen.has(n))return false;seen.add(n);return true;}).slice(0,6);
}
function hasTimedLyrics(r){const rows=parseLyrics(r.syncedLyrics||'');return rows.some(x=>x.text&&Number.isFinite(x.t));}
function sourceNoise(r){const rows=parseLyrics(r.syncedLyrics||r.plainLyrics||'');return rows.filter(l=>isCredit(l.text)||displayLyric(l.text)!==l.text).length;}
function cleanArtist(value){return String(value||'').normalize('NFKC').replace(/\s*(?:[-–—]\s*Topic|Ch\.?\s*(?:hololive.*)?|Official(?:\s+Channel)?|公式チャンネル|Channel)\s*$/iu,'').trim();}
const artistAliases=[['星街すいせい','Hoshimachi Suisei','Suisei','Suisei Channel'],['博衣こより','Hakui Koyori','Koyori'],['音乃瀬奏','Otonose Kanade','Kanade'],['ハコス・ベールズ','Hakos Baelz','Baelz'],['いろはにほへっと あやふぶみ','Irohanihohetto Ayafubumi']];
function artistKey(a){const n=normalized(cleanArtist(a));const group=artistAliases.find(g=>g.some(v=>normalized(cleanArtist(v))===n));return group?normalized(group[0]):n;}
function artistMatches(a,b){a=artistKey(a);b=artistKey(b);return !!a&&!!b&&(a===b||(Math.min(a.length,b.length)>=5&&(a.includes(b)||b.includes(a))));}
function artistCandidates(s,queries){
 const raw=String(s.title||'').normalize('NFKC').replace(/\s*\(\s*official\s*\)\s*$/iu,''), channel=cleanArtist(s.artist), out=[];
 const add=x=>{x=cleanArtist(x);if(x&&x.length<=100&&!out.some(y=>normalized(y)===normalized(x)))out.push(x);};
 const parts=raw.replace(/[【\[][^】\]]*(?:MV|music video|official|cover|歌ってみた|配信中)[^】\]]*[】\]]/giu,' ').split(/\s*[|｜]+\s*|\s+[-–—/]\s+/u).map(x=>x.trim()).filter(Boolean);
 const first=normalized(queries[0]);
 if(parts.length===2){const pos=parts.findIndex(x=>normalized(x)===first);if(pos>=0){const other=parts[1-pos];if(!/主題歌|アニメ|covered|歌ってみた|music video|official|lyrics|配信/iu.test(other)&&(!channel||artistMatches(other,channel)||/\|\|/.test(raw)))add(other);}}
 if(first==='psycho'&&(/hakos\s*baelz|ハコス[・･ ]?ベールズ/iu.test(raw+' '+channel))){add('Hakos Baelz');add('ハコス・ベールズ');}
 add(channel);for(const q of queries.slice(0,2))add(originalHint(q));const group=artistAliases.find(g=>g.some(a=>out.some(b=>artistKey(a)===artistKey(b))));if(group)for(const a of group)add(a);
 return out.slice(0,4);
}
function preferredArtist(s,queries){const hint=originalHint(queries[0]||'');return hint||artistCandidates(s,queries)[0]||'';}
// Memoize expensive lyric parsing; the same result is ranked repeatedly during a search.
const recordQuality=new WeakMap();
function qualityOf(r){let q=recordQuality.get(r);if(!q){q={timed:hasTimedLyrics(r),noise:sourceNoise(r)};recordQuality.set(r,q);}return q;}
function scoreRecord(r,s,queries){const names=queries.map(normalized),title=normalized(r.trackName||r.name);const exact=names.includes(title);const titleRank=names.indexOf(title);const artists=artistCandidates(s,queries);const sameArtist=artists.some(a=>artistMatches(a,r.artistName));const knownDuration=Number(s.duration)>0&&Number(r.duration)>0;const delta=knownDuration?Math.abs(s.duration-r.duration):Infinity;const original=originalHint(queries[0]||'');const isOriginal=artistMatches(original,r.artistName);const {timed,noise}=qualityOf(r);return {exact,titleRank,sameArtist,delta,knownDuration,isOriginal,noise,timed,score:(exact?200:0)+(titleRank===0?220:Math.max(0,100-titleRank*25))+(isOriginal?65:0)+(sameArtist?55:0)+(timed?45:0)+(knownDuration?Math.max(-50,85-delta*3):0)-Math.min(35,noise*2)};}
function chooseAutoRecord(records,s,queries,{strict=false}={}){
 const first=normalized(queries[0]),hint=originalHint(queries[0]||'');if(!first)return;
 const ranked=records.map(r=>({r,...scoreRecord(r,s,queries)})).filter(m=>m.exact).sort((a,b)=>b.score-a.score);
 const primary=ranked.filter(m=>m.titleRank===0||!!hint&&originalHint(m.r.trackName||m.r.name)===hint);
 // A known artist is strong evidence. Do not discard valid lyrics just because a cover differs in duration.
 const matched=primary.filter(m=>m.sameArtist||m.isOriginal);
 if(matched.length){const best=matched[0];if(!strict||(best.timed&&best.delta<=Math.max(8,Number(s.duration)*.025)))return best.r;}
 if(strict)return;
 // Only use a title-only fallback when duration is known and ambiguity is low.
 const generic=/^[a-z0-9]{1,12}$/i.test(first);
 const tolerance=generic?3:Math.min(12,Math.max(5,Number(s.duration)*.035));
 const close=primary.filter(m=>m.knownDuration&&m.delta<=tolerance).sort((a,b)=>a.delta-b.delta||b.score-a.score);
 if(close.length){const nearest=close[0];const competing=close.filter(m=>m.delta<=nearest.delta+(generic?3:5));const groups=new Set(competing.map(m=>artistKey(m.r.artistName)||'?'));
  // A short English title with no corroborating artist is especially ambiguous.
  if(!generic&&groups.size===1)return competing.sort((a,b)=>b.score-a.score)[0].r;
 }
 const secondary=ranked.filter(m=>m.titleRank>0&&(m.sameArtist||m.isOriginal)&&m.delta<=8);
 if(new Set(secondary.map(m=>normalized(m.r.trackName||m.r.name))).size===1)return secondary[0]?.r;
 return undefined;
}
function versionFor(s){return `${s.source==='youtube'?'YouTube':'YT Music'} · ${s.title} · ${s.artist}${s.videoId?' ['+s.videoId+']':''}`;}
function applyRemote(){if(!syncLocked()||loadedKey!==remoteKey||!song)return;const actual=remote.duration;if(actual>0&&Math.abs(duration-actual)>.2){duration=actual;updateControls();}const elapsed=remote.playing&&!remote.ad?Math.max(0,Math.min(3,(Date.now()-remote.observedAt)/1000))*(remote.speed||1):0;const target=clamp(remote.position+elapsed,0,duration);const shouldPlay=remote.playing&&!remote.ad&&timed&&target<duration;position=target;anchor=performance.now();if(playing!==shouldPlay)setPlaying(shouldPlay);else update();updateControls();const message=remote.ad?'廣告期間暫停同步':remote.playing?'播放中':'暫停 / 等待播放';syncStatus.textContent='已連線 · '+message;ui['track-status'].textContent=syncNote+(timed?'｜時間由播放裝置同步。':'｜此歌詞沒有有效時間戳，不能逐句同步；可重新搜尋或逐句對時。');}
function activateRecord(record,manual=false){if(!syncLocked()){loadSong(record);return;}selectedRecord=record;loadedKey=remoteKey;const mapping=getMapping(remoteKey);const profileName=mapping?.profile||versionFor(remote);song=record;originalRecord=record;let profile=null;try{profile=JSON.parse(localStorage.getItem(profileKey(profileName))||'null');}catch{}if(profile?.lrc&&hasTimedLyrics(record)&&!hasTimedLyrics({syncedLyrics:profile.lrc})){profile={...profile,lrc:''};}loadSong(record,profile||{name:profileName,rate:1,duration:0,lrc:'',offset:0});const match=scoreRecord(record,remote,titleQueries(remote.title,remote.artist));syncNote='來源：'+sourceName(record)+' · '+(record.artistName||'未知歌手')+(!match.sameArtist||match.delta>4?'｜可能為不同錄音，請確認時間軸。':'');if(manual){putMapping(remoteKey,{record,profile:profileName});syncCache.set(remoteKey,record);}applyRemote();}
function selectSyncRecord(record){if(syncLocked()){syncRequest++;requestController?.abort();activateRecord(record,true);ui['search-status'].textContent='已選擇並記住目前播放版本的歌詞。';}else loadSong(record);}
function rememberSyncProfile(){if(syncLocked()&&loadedKey===remoteKey&&selectedRecord)putMapping(remoteKey,{record:selectedRecord,profile:versionName||versionFor(remote)});}
function resultsList(records){ui.results.replaceChildren();for(const r of records.slice(0,25)){const b=document.createElement('button');b.className='result';b.textContent=r.trackName||r.name||'未知歌曲';const small=document.createElement('small');small.textContent=[r.artistName,r.albumName,timeString(Number(r.duration)||0),hasTimedLyrics(r)?'有同步':'純文字',sourceName(r)].filter(Boolean).join(' · ');b.append(small);b.onclick=()=>selectSyncRecord(r);ui.results.append(b);}}
async function findRemote(s,force=false){const k=remoteKey,g=++syncRequest,sg=++searchGeneration;requestController?.abort();manualSearchController?.abort();requestController=new AbortController();const controller=requestController;const valid=()=>g===syncRequest&&sg===searchGeneration&&k===remoteKey&&auto.checked;ui.query.value=titleQueries(s.title,s.artist)[0]||s.title;ui.artist.value=preferredArtist(s,titleQueries(s.title,s.artist))||s.artist;sourceLinks(ui.query.value,ui.artist.value);$('import-current').disabled=false;ui.results.replaceChildren();ui['search-status'].textContent='正在自動搜尋歌詞…';const saved=!force&&(getMapping(k)?.record||syncCache.get(k)||readAutoCache(k));if(saved){activateRecord(saved);ui['search-status'].textContent='已載入上次使用的歌詞。';return;}
 // Never show the previous track's lyrics under a new track.
 loadedKey='';selectedRecord=null;loadSong({trackName:s.title,artistName:s.artist,plainLyrics:''});ui['track-status'].textContent='正在搜尋目前播放的歌曲…';
 try{const q=titleQueries(s.title,s.artist);const {records:ranked,errors}=await searchSources(s,q,controller.signal,m=>{if(valid())ui['search-status'].textContent=m;});if(!valid())return;resultsList(ranked);const best=chooseAutoRecord(ranked,s,q);if(best){syncCache.set(k,best);writeAutoCache(k,best,s,q);if(syncCache.size>50)syncCache.delete(syncCache.keys().next().value);activateRecord(best);if(force&&getMapping(k)){ui['search-status'].textContent='已重新搜尋，原手動對應仍保留。';}ui['search-status'].textContent='已自動載入 '+sourceName(best)+(hasTimedLyrics(best)?' 同步歌詞。':' 純文字歌詞（無時間戳）。');}else{ui['search-status'].textContent=(ranked.length?'沒有確定的同名歌曲，請從搜尋結果選擇。':'所有已搜尋曲庫均未找到確定歌詞，請使用下方連結或匯入。')+(errors.length?' 部分來源連線失敗：'+errors.join('；'):'');ui['track-status'].textContent='未找到可確認的歌詞，等待手動選擇。';}

 }catch(e){if(valid()){ui['search-status'].textContent='自動搜尋失敗：'+e.message+'。可按重新搜尋。';ui['track-status'].textContent='歌詞載入失敗。';}}
}
function receive(s){remote=s;remoteSeen=Date.now();syncInfo.textContent=s.title+(s.artist?' · '+s.artist:'');retry.disabled=!auto.checked;if(!auto.checked){syncStatus.textContent='已偵測歌曲 · 手動模式';return;}syncStatus.textContent='已連線 · '+(s.ad?'廣告':s.playing?'播放中':'暫停 / 等待播放');if(s.ad){if(playing)setPlaying(false);updateControls();return;}const k=songIdentity(s);if(k!==remoteKey){remoteKey=k;findRemote(s);}else applyRemote();}
window.addEventListener('message',e=>{if(e.source!==window||e.origin!==location.origin||e.data?.type!=='kotonoha-extension-v03')return;const s=e.data.state;if(!s||typeof s.title!=='string'||!s.title.trim()||s.title.length>500||typeof s.artist!=='string'||s.artist.length>500||typeof s.videoId!=='string'||!Number.isFinite(s.position)||s.position<0||!Number.isFinite(s.duration)||s.duration<0||!Number.isFinite(s.observedAt)||Math.abs(Date.now()-s.observedAt)>30000)return;receive(s);});
retry.onclick=()=>{if(syncLocked()){remoteKey=songIdentity(remote);findRemote(remote,true);}};
setInterval(()=>{if(auto.checked&&remote&&Date.now()-remoteSeen>=15000){remote=null;remoteKey='';loadedKey='';syncRequest++;searchGeneration++;requestController?.abort();setPlaying(false);updateControls();retry.disabled=true;syncStatus.textContent='連線中斷，請確認播放器分頁與擴充功能。';ui['track-status'].textContent='已停止自動同步；可關閉跟隨後手動操作。';}},2000);

$('import-current').onclick=()=>{if(!remote)return;ui['manual-title'].value=titleQueries(remote.title,remote.artist)[0]||remote.title;ui['manual-artist'].value=preferredArtist(remote,titleQueries(remote.title,remote.artist))||remote.artist;ui['manual-lyrics'].closest('details').open=true;ui['manual-lyrics'].focus();ui['manual-lyrics'].scrollIntoView({block:'center',behavior:'smooth'});};
