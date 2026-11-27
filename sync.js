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
function disableAutoSync(){auto.checked=false;changeAuto();}
function changeAuto(){try{localStorage.setItem('kotonoha.v3.auto',auto.checked?'on':'off');}catch{}syncRequest++;requestController?.abort();searchGeneration++;loadedKey='';remoteKey='';selectedRecord=null;setPlaying(false);updateControls();retry.disabled=!syncLocked();if(!auto.checked){syncStatus.textContent='手動模式';ui['track-status'].textContent='手動模式：音樂開始時啟動歌詞計時器。';}else if(syncLocked())receive(remote);else syncStatus.textContent='等待擴充功能連線…';}
auto.addEventListener('change',changeAuto);
function normalized(t){return String(t||'').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');}
// Candidate order expresses confidence, not just the number of bracketed strings.
function titleQueries(t,artist=''){
 const original=String(t||'').normalize('NFKC').trim();
 const promo=/(?:cover(?:ed)?\b|歌ってみた|翻唱|official|music\s*video|^\s*mv\s*$|^\s*pv\s*$|^\s*live\s*$|主題歌|オープニング|エンディング|楽曲(?:好評)?配信|配信中|字幕|切り抜き|shorts?|full\s*ver|歌枠|耐久|公開中|^\s*HD\s*$)/iu;
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
function artistMatches(a,b){a=normalized(a);b=normalized(b);return !!a&&!!b&&(a===b||a.includes(b)||b.includes(a));}
function scoreRecord(r,s,queries){const names=queries.map(normalized),title=normalized(r.trackName||r.name);const exact=names.includes(title);const titleRank=names.indexOf(title);const artist=normalized(s.artist),ra=normalized(r.artistName);const sameArtist=!!artist&&!!ra&&(artist===ra||artist.includes(ra)||ra.includes(artist));const delta=s.duration&&r.duration?Math.abs(s.duration-r.duration):999;const original=queries.map(originalHint).find(Boolean)||'';const isOriginal=artistMatches(original,r.artistName);const noise=sourceNoise(r);return {exact,sameArtist,delta,isOriginal,noise,score:(exact?200:0)+(titleRank===0?300:Math.max(0,100-titleRank*25))+(isOriginal?85:0)+(sameArtist?35:0)+(hasTimedLyrics(r)?150:0)+Math.max(0,30-delta/2)-Math.min(45,noise*3)};}
function chooseAutoRecord(records,s,queries){
 const first=normalized(queries[0]);const hint=originalHint(queries[0]||'');
 const firstRecords=records.filter(r=>normalized(r.trackName||r.name)===first||!!hint&&queries.some(q=>normalized(q)===normalized(r.trackName||r.name)&&originalHint(q)===hint));
 const ranked=rs=>rs.sort((a,b)=>scoreRecord(b,s,queries).score-scoreRecord(a,s,queries).score);
 if(firstRecords.length){
  const credible=firstRecords.filter(r=>{const m=scoreRecord(r,s,queries);return m.sameArtist||m.isOriginal||m.delta<=Math.max(12,(Number(s.duration)||0)*.15);});
  if(credible.length)return ranked(credible)[0];
  const artists=new Set(firstRecords.map(r=>normalized(r.artistName)).filter(Boolean));
  if(artists.size<=1&&(!s.duration||firstRecords.some(r=>!r.duration)))return ranked(firstRecords)[0];
  return undefined;
 }
 // A secondary title is safe only with corroborating artist AND recording duration.
 const fallback=records.filter(r=>{const m=scoreRecord(r,s,queries);return m.exact&&m.sameArtist&&m.delta<=5;});
 const names=new Set(fallback.map(r=>normalized(r.trackName||r.name)));return names.size===1?ranked(fallback)[0]:undefined;
}
function versionFor(s){return `${s.source==='youtube'?'YouTube':'YT Music'} · ${s.title} · ${s.artist}${s.videoId?' ['+s.videoId+']':''}`;}
function applyRemote(){if(!syncLocked()||loadedKey!==remoteKey||!song)return;const actual=remote.duration;if(actual>0&&Math.abs(duration-actual)>.2){duration=actual;updateControls();}const elapsed=remote.playing&&!remote.ad?Math.max(0,Math.min(3,(Date.now()-remote.observedAt)/1000))*(remote.speed||1):0;const target=clamp(remote.position+elapsed,0,duration);const shouldPlay=remote.playing&&!remote.ad&&timed&&target<duration;position=target;anchor=performance.now();if(playing!==shouldPlay)setPlaying(shouldPlay);else update();updateControls();const message=remote.ad?'廣告期間暫停同步':remote.playing?'播放中':'暫停 / 等待播放';syncStatus.textContent='已連線 · '+message;ui['track-status'].textContent=syncNote+(timed?'｜時間由播放裝置同步。':'｜此歌詞沒有有效時間戳，不能逐句同步；可重新搜尋或逐句對時。');}
function activateRecord(record,manual=false){if(!syncLocked()){loadSong(record);return;}selectedRecord=record;loadedKey=remoteKey;const mapping=getMapping(remoteKey);const profileName=mapping?.profile||versionFor(remote);song=record;originalRecord=record;let profile=null;try{profile=JSON.parse(localStorage.getItem(profileKey(profileName))||'null');}catch{}if(profile?.lrc&&hasTimedLyrics(record)&&!hasTimedLyrics({syncedLyrics:profile.lrc})){profile={...profile,lrc:''};}loadSong(record,profile||{name:profileName,rate:1,duration:0,lrc:'',offset:0});const match=scoreRecord(record,remote,titleQueries(remote.title,remote.artist));syncNote='來源：'+sourceName(record)+' · '+(record.artistName||'未知歌手')+(!match.sameArtist||match.delta>4?'｜可能為不同錄音，請確認時間軸。':'');if(manual){putMapping(remoteKey,{record,profile:profileName});syncCache.set(remoteKey,record);}applyRemote();}
function selectSyncRecord(record){if(syncLocked()){syncRequest++;requestController?.abort();activateRecord(record,true);ui['search-status'].textContent='已選擇並記住目前播放版本的歌詞。';}else loadSong(record);}
function rememberSyncProfile(){if(syncLocked()&&loadedKey===remoteKey&&selectedRecord)putMapping(remoteKey,{record:selectedRecord,profile:versionName||versionFor(remote)});}
function resultsList(records){ui.results.replaceChildren();for(const r of records.slice(0,25)){const b=document.createElement('button');b.className='result';b.textContent=r.trackName||r.name||'未知歌曲';const small=document.createElement('small');small.textContent=[r.artistName,r.albumName,timeString(Number(r.duration)||0),hasTimedLyrics(r)?'有同步':'純文字',sourceName(r)].filter(Boolean).join(' · ');b.append(small);b.onclick=()=>selectSyncRecord(r);ui.results.append(b);}}
async function findRemote(s,force=false){const k=remoteKey,g=++syncRequest,sg=++searchGeneration;requestController?.abort();manualSearchController?.abort();requestController=new AbortController();const controller=requestController;const valid=()=>g===syncRequest&&sg===searchGeneration&&k===remoteKey&&auto.checked;ui.query.value=titleQueries(s.title,s.artist)[0]||s.title;ui.artist.value=s.artist;sourceLinks(ui.query.value,s.artist);$('import-current').disabled=false;ui.results.replaceChildren();ui['search-status'].textContent='正在自動搜尋歌詞…';const saved=!force&&(getMapping(k)?.record||syncCache.get(k));if(saved){activateRecord(saved);ui['search-status'].textContent='已載入上次使用的歌詞。';return;}
 // Never show the previous track's lyrics under a new track.
 loadedKey='';selectedRecord=null;loadSong({trackName:s.title,artistName:s.artist,plainLyrics:''});ui['track-status'].textContent='正在搜尋目前播放的歌曲…';
 try{const q=titleQueries(s.title,s.artist);const {records:ranked,errors}=await searchSources(s,q,controller.signal,m=>{if(valid())ui['search-status'].textContent=m;});if(!valid())return;resultsList(ranked);const best=chooseAutoRecord(ranked,s,q);if(best){syncCache.set(k,best);if(syncCache.size>50)syncCache.delete(syncCache.keys().next().value);activateRecord(best);if(force&&getMapping(k)){ui['search-status'].textContent='已重新搜尋，原手動對應仍保留。';}ui['search-status'].textContent='已自動載入 '+sourceName(best)+(hasTimedLyrics(best)?' 同步歌詞。':' 純文字歌詞（無時間戳）。');}else{ui['search-status'].textContent=(ranked.length?'沒有確定的同名歌曲，請從搜尋結果選擇。':'所有已搜尋曲庫均未找到確定歌詞，請使用下方連結或匯入。')+(errors.length?' 部分來源連線失敗：'+errors.join('；'):'');ui['track-status'].textContent='未找到可確認的歌詞，等待手動選擇。';}

 }catch(e){if(valid()){ui['search-status'].textContent='自動搜尋失敗：'+e.message+'。可按重新搜尋。';ui['track-status'].textContent='歌詞載入失敗。';}}
}
function receive(s){remote=s;remoteSeen=Date.now();syncInfo.textContent=s.title+(s.artist?' · '+s.artist:'');retry.disabled=!auto.checked;if(!auto.checked){syncStatus.textContent='已偵測歌曲 · 手動模式';return;}syncStatus.textContent='已連線 · '+(s.ad?'廣告':s.playing?'播放中':'暫停 / 等待播放');if(s.ad){if(playing)setPlaying(false);updateControls();return;}const k=songIdentity(s);if(k!==remoteKey){remoteKey=k;findRemote(s);}else applyRemote();}
window.addEventListener('message',e=>{if(e.source!==window||e.origin!==location.origin||e.data?.type!=='kotonoha-extension-v03')return;const s=e.data.state;if(!s||typeof s.title!=='string'||!s.title.trim()||s.title.length>500||typeof s.artist!=='string'||s.artist.length>500||typeof s.videoId!=='string'||!Number.isFinite(s.position)||s.position<0||!Number.isFinite(s.duration)||s.duration<0||!Number.isFinite(s.observedAt)||Math.abs(Date.now()-s.observedAt)>30000)return;receive(s);});
retry.onclick=()=>{if(syncLocked()){remoteKey=songIdentity(remote);findRemote(remote,true);}};
setInterval(()=>{if(auto.checked&&remote&&Date.now()-remoteSeen>=15000){remote=null;remoteKey='';loadedKey='';syncRequest++;searchGeneration++;requestController?.abort();setPlaying(false);updateControls();retry.disabled=true;syncStatus.textContent='連線中斷，請確認播放器分頁與擴充功能。';ui['track-status'].textContent='已停止自動同步；可關閉跟隨後手動操作。';}},2000);

$('import-current').onclick=()=>{if(!remote)return;ui['manual-title'].value=titleQueries(remote.title,remote.artist)[0]||remote.title;ui['manual-artist'].value=originalHint(ui['manual-title'].value)||remote.artist;ui['manual-lyrics'].closest('details').open=true;ui['manual-lyrics'].focus();ui['manual-lyrics'].scrollIntoView({block:'center',behavior:'smooth'});};
