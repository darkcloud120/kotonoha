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
const autoCacheKey='kotonoha.v104.autoCache';
function readAutoCache(k){try{const e=JSON.parse(localStorage.getItem(autoCacheKey)||'{}')[k];if(e&&Date.now()-e.at<30*86400000)return e.record;}catch{}}
function writeAutoCache(k,record,s,queries){if(!chooseAutoRecord([record],s,queries,{strict:true}))return;try{const data=JSON.parse(localStorage.getItem(autoCacheKey)||'{}');data[k]={record,at:Date.now()};const keys=Object.keys(data).sort((a,b)=>data[b].at-data[a].at);for(const x of keys.slice(40))delete data[x];localStorage.setItem(autoCacheKey,JSON.stringify(data));}catch{}}
function disableAutoSync(){auto.checked=false;changeAuto();}
function changeAuto(){try{localStorage.setItem('kotonoha.v3.auto',auto.checked?'on':'off');}catch{}syncRequest++;requestController?.abort();searchGeneration++;loadedKey='';remoteKey='';selectedRecord=null;setPlaying(false);updateControls();retry.disabled=!syncLocked();if(!auto.checked){syncStatus.textContent='手動模式';ui['track-status'].textContent='手動模式：音樂開始時啟動歌詞計時器。';}else if(syncLocked())receive(remote);else syncStatus.textContent='等待擴充功能連線…';}
auto.addEventListener('change',changeAuto);
function normalized(t){return String(t||'').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');}
// Song aliases are metadata only. Keep original spellings for provider queries.
const titleAliases=[['チューリングラブ','Turing Love','圖靈之戀','图灵之恋'],['ラビットホール','Rabbit Hole'],['ねぇねぇねぇ。','Nee Nee Nee.','ねえねえねえ。'],['初めての恋が終わる時','初めての恋が終わるとき'],['好きだから。','Sukidakara','すきだから'],['フォニイ','Phony'],['カタオモイ','Kataomoi'],['Say!ファンファーレ!','Say! Fanfare!'],['花に雨を、君に歌を','花に雨を君に歌を'],['#あくあ色ぱれっと','あくあ色ぱれっと','Aqua Iro Palette'],['そこに命はありますか。','那裏存在著生命嗎。','那裡存在著生命嗎。'],['威風堂々','Ifuudoudou']];
function trimFeature(t){return String(t||'').normalize('NFKC').replace(/\s*[（(\[【]\s*(?:feat(?:uring)?\.?|ft\.?)\s+[^)）\]】]+[)）\]】]/giu,' ').replace(/\s+(?:feat(?:uring)?\.?|ft\.?)\s*[^/|｜]+$/iu,'').replace(/^[《〈「『【\[]+|[》〉」』】\]]+$/gu,'').trim();}
function titleKey(t){const n=normalized(trimFeature(t));const group=titleAliases.find(g=>g.some(x=>normalized(x)===n));return group?normalized(group[0]):n;}
function aliasesFor(t){return titleAliases.find(g=>g.some(x=>normalized(x)===normalized(trimFeature(t))))||[];}
function queriesFor(s){const base=titleQueries(s.title,s.artist);const extra=Array.isArray(s.titleHints)?s.titleHints.filter(x=>typeof x==='string'&&x.length<=500).slice(0,4).flatMap(t=>titleQueries(t,s.artist)):[];const seen=new Set();return [...base,...extra].filter(x=>{const n=normalized(x);if(!n||seen.has(n))return false;seen.add(n);return true;}).slice(0,10);}
// Candidate order expresses confidence, not just the number of bracketed strings.
function legacyTitleQueries(t,artist=''){
 const raw=String(t||'').normalize('NFKC').trim();
 const promo=/^(?:original(?:\s*(?:mv|pv|music\s*video|song))?|official(?:\s*(?:mv|pv|music\s*video|video|audio))?|(?:lyric|lyrics|music)\s*video|mv|pv|cover(?:ed)?|歌ってみた|翻唱|live|hd|full\s*ver\.?|shorts?)$/iu;
 const junk=/(?:主題歌|オープニング|エンディング|楽曲(?:好評)?配信|配信中|字幕|切り抜き|歌枠|耐久|公開中|ホロライブ\/|hololive\/)/iu;
 const clean=raw.split(/\s*[／/|｜-]?\s*(?=(?:TV\s*アニメ|テレビアニメ|TV\s*anime|アニメ[「『]))/iu)[0]
 .replace(/[【\[（(]([^】\]）)]+)[】\]）)]/gu,(m,v)=>promo.test(v.trim())||junk.test(v)||/^(?:covered?\s+by|feat\.?)/iu.test(v)?' ':m)
 .replace(/\s*(?:covered\s+by|cover\s+by).*$/iu,'').trim();
 const pieces=clean.split(/\s*[｜|–—]+\s*|\s+[/-]\s+/u).map(v=>v.trim()).filter(Boolean);
 const unwrap=v=>v.replace(/^[《〈「『【\[]+|[》〉」』】\]]+$/gu,'').trim();
 const artistLike=v=>artistMatches(v,artist);
 const strong=[],weak=[];
 for(const piece of pieces){
  const stripped=trimFeature(unwrap(piece.replace(/\s+(?:cover|official)\s*$/iu,'').replace(/[【\[]([^】\]]+)[】\]]/gu,(m,v)=>promo.test(v)||junk.test(v)?' ':m).trim()));
  if(!stripped||promo.test(stripped)||junk.test(stripped)||(pieces.length>1&&artistLike(stripped)))continue;
  const quoted=[...stripped.matchAll(/[「『《〈]([^」』》〉]+)[」』》〉]/gu)].filter(m=>!promo.test(m[1])&&!junk.test(m[1]));
  if(quoted.length&&artistLike(stripped.slice(0,quoted[0].index)))strong.push(quoted[0][1]);
  strong.push(stripped);for(const m of quoted)weak.push(m[1]);
 }
 // The first side of an artist - title video is often the uploader, even if the channel spelling differs.
 if(pieces.length>=2&&/\s[-–—]\s/u.test(clean)&&strong.length>=2&&artistLike(pieces[0]))strong.shift();
 const seen=new Set();const out=[];
 for(const v of [...strong,...weak])for(const x of [...aliasesFor(v),v]){const n=normalized(x);if(!n||seen.has(n)||promo.test(x)||junk.test(x)||artistLike(x))continue;seen.add(n);out.push(x);}
 return out.slice(0,6);
}
// Structural candidates: preserve slashes in actual names and keep the original as fallback.
function titleQueries(t,artist=''){
 const raw=String(t||'').normalize('NFKC').trim();
 const promo=/^(?:original(?:\s*(?:mv|pv|song|music video))?|official(?:\s*(?:mv|pv|video))?|オリジナル曲|歌ってみた|cover|mv|pv|lyrics? video|music video)$/iu;
 const isPromo=v=>promo.test(v.trim())||v.trim().split(/\s*[/|｜・]\s*/u).every(x=>x&&promo.test(x));
 const cleaned=raw.replace(/[【\[（(]([^】\]）)]+)[】\]）)]/gu,(m,v)=>isPromo(v)?' ':m).trim();
 const out=[],add=x=>{x=trimFeature(String(x||'').trim()).replace(/\s+歌ってみた.*$/u,'').trim();if(!x||promo.test(x)||artistMatches(x,artist))return;for(const v of [...aliasesFor(x),x])if(!out.some(y=>normalized(y)===normalized(v)))out.push(v);};
 // Prefer the explicit Japanese original inside parentheses when the outer title is localized.
 const localized=cleaned.match(/^([^()]+?)\s*\(([^()]+)\)(?=\s*(?:[/|]|$))/u);
 if(localized&&/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(localized[2])&&!/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(localized[1])&&!artistMatches(localized[2],artist))add(localized[2].trim());
 // A clean title between a promo prefix and a bracketed list of performers.
 const bracketed=cleaned.match(/^([^【\[]+?)\s*[【\[]([^】\]]+)[】\]]\s*$/u);
 if(bracketed&&(/[/|]/u.test(bracketed[2])||artistMatches(bracketed[2],artist)))add(bracketed[1]);
 const quotes=[...cleaned.matchAll(/[「『《〈]([^」』》〉]+)[」』》〉]/gu)];
 // A quoted title near the beginning or after an anime name is informative, not a trailing anime promotion.
 if(quotes.length&&!/(?:TV\s*アニメ|主題歌|オープニング|エンディング)/iu.test(cleaned.slice(0,quotes[0].index)))add(quotes[0][1]);
 // Only split tight slash when the trailing portion looks like the uploader or a cover credit.
 const slash=cleaned.match(/^(.+?)\s+\/\s+(.+)$/u)||cleaned.match(/^(.+)\/([^/]+)$/u);
 if(slash){const tail=slash[2].replace(/\s*\(?cover\)?\s*$/iu,'').trim();const known=/^(?:白上フブキ|夏色まつり|星街すいせい|結城さくな|百鬼あやめ)$/u.test(tail);if(known||artistMatches(tail,artist)||/cover|歌ってみた/iu.test(slash[2])||/\s\/\s/u.test(cleaned)){const left=slash[1].trim();const par=left.match(/^(.+?)\s*\(([^()]+)\)$/u);if(par&&!promo.test(par[2]))add(par[1]);add(left);}}
 // A parenthetical original artist on a cover is a separate candidate.
 const parent=cleaned.match(/^([^()]+?)\s*\(([^()]+)\)(?:\s*\/|\s*$)/u);if(parent&&!promo.test(parent[2]))add(parent[1]);
 for(const x of legacyTitleQueries(cleaned,artist))add(x);
 return out.slice(0,8);
}
function hasTimedLyrics(r){return validTimeline(parseLyrics(r.syncedLyrics||''),Number(r.duration)||0);}
function sourceNoise(r){const rows=parseLyrics(r.syncedLyrics||r.plainLyrics||'');return rows.filter(l=>isCredit(l.text)||displayLyric(l.text)!==l.text).length;}
function cleanArtist(value){return String(value||'').normalize('NFKC').replace(/\s*\(?cover\)?\s*$/iu,'').replace(/\s*(?:[-–—]\s*Topic|Ch\.?\s*(?:hololive.*)?|Official(?:\s+Channel)?|公式チャンネル|Channel)\s*$/iu,'').trim();}
const artistAliases=[['星街すいせい','Hoshimachi Suisei','Suisei','Suisei Channel'],['博衣こより','Hakui Koyori','Koyori'],['音乃瀬奏','Otonose Kanade','Kanade'],['ハコス・ベールズ','Hakos Baelz','Baelz'],['いろはにほへっと あやふぶみ','Irohanihohetto Ayafubumi'],['ナナヲアカリ','Nanao Akari','Nana Akari','NANAWOAKARI','Nanaoakari'],['DECO*27','DECO27'],['ピノキオピー','PinocchioP','ピノキオピー PINOCCHIOP'],['ユイカ','Yuika','『ユイカ』'],['湊あくあ','Minato Aqua','Aqua Ch. 湊あくあ'],['百鬼あやめ','Nakiri Ayame','Nakiri Ayame Ch. 百鬼あやめ'],['結城さくな','Yuki Sakuna','Sakuna Ch. 結城さくな'],['ツミキ','Tsumiki'],['Kanaria','カナリア'],['白上フブキ','Shirakami Fubuki','フブキCh・白上フブキ','フブキCh. 白上フブキ'],['Aimer','エメ'],['7!!','Seven Oops','セブンウップス']];
function artistKey(a){const n=normalized(cleanArtist(a));const group=artistAliases.find(g=>g.some(v=>normalized(cleanArtist(v))===n));return group?normalized(group[0]):n;}
function artistMatches(a,b){a=artistKey(a);b=artistKey(b);return !!a&&!!b&&(a===b||(Math.min(a.length,b.length)>=5&&(a.includes(b)||b.includes(a))));}
function trustedHint(s,queries){const hint=originalHint(queries[0]||'')||(titleKey(queries[0])===titleKey('オレンジ')&&/四月は君の嘘/iu.test(s.title)?'7!!':'');if(!hint)return '';if(titleKey(queries[0])==='supernova'&&!/白上フブキ|fubuki/iu.test(s.title+' '+s.artist))return '';if(titleKey(queries[0])==='henceforth'&&!/cover|歌ってみた|orangestar|結城さくな|sakuna/iu.test(s.title+' '+s.artist))return '';if(titleKey(queries[0])==='king'&&!/cover|歌ってみた|kanaria|カナリア|百鬼あやめ|nakiri ayame/iu.test(s.title+' '+s.artist))return '';const group=aliasesFor(queries[0]);if(!group.length)return hint;const raw=[s.title,...(Array.isArray(s.titleHints)?s.titleHints.filter(x=>typeof x==='string').slice(0,4):[])].map(normalized);const canonical=normalized(group[0]);return artistMatches(s.artist,hint)||raw.some(t=>t.includes(canonical)||group.slice(1).some(a=>/[\p{Script=Han}]/u.test(a)&&t.includes(normalized(a))))?hint:'';}
function artistCandidates(s,queries){
 const raw=String(s.title||'').normalize('NFKC').replace(/\s*\(\s*official\s*\)\s*$/iu,''), channel=cleanArtist(s.artist), out=[];
 const add=x=>{x=cleanArtist(x);if(x&&x.length<=100&&!out.some(y=>normalized(y)===normalized(x)))out.push(x);};
 const parts=raw.replace(/[【\[][^】\]]*(?:MV|music video|official|cover|歌ってみた|配信中)[^】\]]*[】\]]/giu,' ').split(/\s*[|｜]+\s*|\s+[-–—/]\s+/u).map(x=>x.trim()).filter(Boolean);
 const first=normalized(queries[0]);
 if(parts.length===2){const pos=parts.findIndex(x=>normalized(x)===first);if(pos>=0){const other=parts[1-pos];if(!/主題歌|アニメ|covered|歌ってみた|music video|official|lyrics|配信/iu.test(other)&&(!channel||artistMatches(other,channel)||/\|\|/.test(raw)))add(other);}}
 if(first==='psycho'&&(/hakos\s*baelz|ハコス[・･ ]?ベールズ/iu.test(raw+' '+channel))){add('Hakos Baelz');add('ハコス・ベールズ');}
 add(parentArtist(s,queries));add(channel);add(trustedHint(s,queries));const group=artistAliases.find(g=>g.some(a=>out.some(b=>artistKey(a)===artistKey(b))));if(group)for(const a of group)add(a);
 return out.slice(0,4);
}
function parentArtist(s,queries){const m=String(s.title||'').normalize('NFKC').match(/^(.+?)\s*\(([^()]+)\)\s*\//u);if(!m||titleKey(m[1])!==titleKey(queries[0])||!/cover|歌ってみた/iu.test(s.title)||/^(?:original|official|mv|pv|cover|live|ver\.?|remix|lyrics? video|music video)$/iu.test(m[2].trim()))return '';return m[2].trim();}
function preferredArtist(s,queries){const hint=trustedHint(s,queries);return hint||parentArtist(s,queries)||artistCandidates(s,queries)[0]||'';}
// Memoize expensive lyric parsing; the same result is ranked repeatedly during a search.
const recordQuality=new WeakMap();
function qualityOf(r){let q=recordQuality.get(r);if(!q){q={timed:hasTimedLyrics(r),noise:sourceNoise(r)};recordQuality.set(r,q);}return q;}
function scoreRecord(r,s,queries){const names=queries.map(titleKey),title=titleKey(r.trackName||r.name);const exact=!!title&&names.includes(title);const titleRank=names.indexOf(title);const artists=artistCandidates(s,queries);const sameArtist=artists.some(a=>artistMatches(a,r.artistName));const knownDuration=Number(s.duration)>0&&Number(r.duration)>0;const delta=knownDuration?Math.abs(s.duration-r.duration):Infinity;const original=trustedHint(s,queries);const isOriginal=artistMatches(original,r.artistName);const {timed,noise}=qualityOf(r);return {exact,titleRank,sameArtist,delta,knownDuration,isOriginal,noise,timed,score:(exact?200:0)+(titleRank===0?140:Math.max(20,115-titleRank*12))+(isOriginal?35:0)+(sameArtist?35:0)+(timed?65:0)+(knownDuration?Math.max(-70,100-delta*3):0)-Math.min(35,noise*2)};}
// Identical lyrics from different providers are not competing songs. Compare normalized
// lyric text, not punctuation or timestamps; do not collapse short/empty records.
function lyricFingerprint(r){const text=parseLyrics(r.syncedLyrics||r.plainLyrics||'').filter(x=>!isCredit(x.text)).map(x=>normalized(displayLyric(x.text))).join('');return text.length>=45?text:'';}
function equivalent(a,b){if(titleKey(a.r.trackName||a.r.name)!==titleKey(b.r.trackName||b.r.name))return false;const x=lyricFingerprint(a.r),y=lyricFingerprint(b.r);return !!(x&&x===y)||artistMatches(a.r.artistName,b.r.artistName);}
function uniqueGroup(rows){return !!rows.length&&rows.every(r=>equivalent(rows[0],r)||r===rows[0]);}
function chooseAutoRecord(records,s,queries,{strict=false}={}){
 if(!queries.length)return;
 const ranked=records.map(r=>({r,...scoreRecord(r,s,queries)})).filter(m=>m.exact).sort((a,b)=>b.score-a.score);
 if(!ranked.length)return;
 const generic=/^[a-z0-9]{1,12}$/i.test(titleKey(queries[0]));
 const cover=/cover|歌ってみた|翻唱/iu.test(s.title);
 const close=m=>m.knownDuration&&m.delta<=Math.max(8,Number(s.duration)*.035);
 const original=ranked.filter(m=>m.isOriginal&&m.timed&&m.titleRank===0);
 const strong=ranked.filter(m=>(m.sameArtist||m.isOriginal)&&m.timed&&close(m)&&(m.titleRank===0||m.sameArtist));
 if(strong.length&&uniqueGroup(strong.filter(m=>m.score>=strong[0].score-25)))return strong[0].r;
 if(original.length&&uniqueGroup(original)&&(!generic||trustedHint(s,queries)))return original[0].r;
 if(strict)return;
 const matched=ranked.filter(m=>m.sameArtist||m.isOriginal);
 if(matched.length&&uniqueGroup(matched.filter(m=>m.score>=matched[0].score-25)))return matched[0].r;
 const near=ranked.filter(m=>close(m)&&m.timed);
 if(near.length===1&&near[0].titleRank===0&&(!generic||near[0].sameArtist||near[0].delta<=3)&&!ranked.some(m=>m!==near[0]&&m.titleRank===0&&m.timed&&!m.knownDuration&&!equivalent(near[0],m)))return near[0].r;
 if(near.length&&uniqueGroup(near))return near[0].r;
 // Cover title + non-generic name is sufficient if candidate lyrics agree or only one exact result exists.
 if(!generic&&uniqueGroup(ranked)&&ranked[0].titleRank===0)return ranked[0].r;
 const firstTitle=ranked.filter(m=>m.titleRank===0);if(!generic&&firstTitle.length&&uniqueGroup(firstTitle))return firstTitle[0].r;
 if(cover&&!generic&&near.length&&near[0].delta+5<(near[1]?.delta??Infinity))return near[0].r;
 return undefined;
}
// Do not change the confidence gate used for fast exit, cache, or paid rebuilds.
function displayChoice(records,s,queries){const best=chooseAutoRecord(records,s,queries);return best?{record:best,provisional:false}:records.length?{record:records[0],provisional:true}:null;}
function versionFor(s){return `${s.source==='youtube'?'YouTube':'YT Music'} · ${s.title} · ${s.artist}${s.videoId?' ['+s.videoId+']':''}`;}
function applyRemote(){if(!syncLocked()||loadedKey!==remoteKey||!song)return;const actual=remote.duration;if(actual>0&&Math.abs(duration-actual)>.2){duration=actual;updateControls();}const elapsed=remote.playing&&!remote.ad?Math.max(0,Math.min(3,(Date.now()-remote.observedAt)/1000))*(remote.speed||1):0;const target=clamp(remote.position+elapsed,0,duration);const shouldPlay=remote.playing&&!remote.ad&&timed&&target<duration;position=target;anchor=performance.now();if(playing!==shouldPlay)setPlaying(shouldPlay);else update();updateControls();const message=remote.ad?'廣告期間暫停同步':remote.playing?'播放中':'暫停 / 等待播放';syncStatus.textContent='已連線 · '+message;ui['track-status'].textContent=syncNote+(timed?'｜時間由播放裝置同步。':'｜此歌詞沒有有效時間戳，不能逐句同步；可重新搜尋或逐句對時。');}
function activateRecord(record,manual=false){if(manual&&record._provisional){record={...record};delete record._provisional;}if(!syncLocked()){loadSong(record);return;}selectedRecord=record;loadedKey=remoteKey;const mapping=getMapping(remoteKey);const profileName=mapping?.profile||versionFor(remote);song=record;originalRecord=record;let profile=null;try{profile=JSON.parse(localStorage.getItem(profileKey(profileName))||'null');}catch{}if(profile?.lrc&&hasTimedLyrics(record)&&!hasTimedLyrics({syncedLyrics:profile.lrc})){profile={...profile,lrc:''};}loadSong(record,profile||{name:profileName,rate:1,duration:0,lrc:'',offset:0});const match=scoreRecord(record,remote,queriesFor(remote));syncNote=(record._provisional?'暫時顯示第一筆候選，請確認歌曲。｜':'')+'來源：'+sourceName(record)+' · '+(record.artistName||'未知歌手')+(!match.sameArtist||match.delta>4?'｜可能為不同錄音，請確認時間軸。':'');if(manual){putMapping(remoteKey,{record,profile:profileName});syncCache.set(remoteKey,record);}applyRemote();}
function selectSyncRecord(record){if(syncLocked()){syncRequest++;requestController?.abort();activateRecord(record,true);ui['search-status'].textContent='已選擇並記住目前播放版本的歌詞。';}else loadSong(record);}
function rememberSyncProfile(){if(syncLocked()&&loadedKey===remoteKey&&selectedRecord&&!selectedRecord._provisional)putMapping(remoteKey,{record:selectedRecord,profile:versionName||versionFor(remote)});}
function resultsList(records){ui.results.replaceChildren();for(const r of records.slice(0,25)){const b=document.createElement('button');b.className='result';b.textContent=r.trackName||r.name||'未知歌曲';const small=document.createElement('small');small.textContent=[r.artistName,r.albumName,Number(r.duration)>0?timeString(Number(r.duration)):'長度未知',hasTimedLyrics(r)?'有同步':'純文字',sourceName(r)].filter(Boolean).join(' · ');b.append(small);b.onclick=()=>selectSyncRecord(r);ui.results.append(b);}}
async function findRemote(s,force=false){const k=remoteKey,g=++syncRequest,sg=++searchGeneration;requestController?.abort();manualSearchController?.abort();requestController=new AbortController();const controller=requestController;const valid=()=>g===syncRequest&&sg===searchGeneration&&k===remoteKey&&auto.checked;ui.query.value=queriesFor(s)[0]||s.title;ui.artist.value=preferredArtist(s,queriesFor(s))||s.artist;sourceLinks(ui.query.value,ui.artist.value);$('import-current').disabled=false;ui.results.replaceChildren();ui['search-status'].textContent='正在自動搜尋歌詞…';const manualSaved=getMapping(k)?.record;const cached=syncCache.get(k)||readAutoCache(k);const saved=!force&&(manualSaved||(cached&&hasTimedLyrics(cached)?cached:null));if(saved&&(!saved.syncedLyrics||hasTimedLyrics(saved))){activateRecord(saved);ui['search-status'].textContent='已載入上次使用的歌詞。';return;}
 // Never show the previous track's lyrics under a new track.
 loadedKey='';selectedRecord=null;loadSong({trackName:s.title,artistName:s.artist,plainLyrics:''});ui['track-status'].textContent='正在搜尋目前播放的歌曲…';
 try{const q=queriesFor(s);const {records:ranked,errors}=await searchSources(s,q,controller.signal,m=>{if(valid())ui['search-status'].textContent=m;});if(!valid())return;rememberSearchRecords(q,ranked);resultsList(ranked);const choice=displayChoice(ranked,s,q);if(choice){const best=choice.provisional?{...choice.record,_provisional:true}:choice.record;if(!choice.provisional){syncCache.set(k,best);writeAutoCache(k,best,s,q);}if(syncCache.size>50)syncCache.delete(syncCache.keys().next().value);activateRecord(best);if(force&&getMapping(k)){ui['search-status'].textContent='已重新搜尋，原手動對應仍保留。';}ui['search-status'].textContent=(choice.provisional?'暫時載入第一筆候選（可切換或確認）・':'已自動載入 ')+sourceName(best)+(hasTimedLyrics(best)?' 同步歌詞。':' 純文字歌詞（無時間戳）。');}else{ui['search-status'].textContent=(ranked.length?'已找到候選歌詞，但有同名歧義或資料不足，請選擇。':'所有已搜尋曲庫均未找到確定歌詞，請使用下方連結或匯入。')+(errors.length?' 部分來源連線失敗：'+errors.join('；'):'');ui['track-status'].textContent=ranked.length?'候選歌詞待確認，請從左側選擇。':'目前沒有找到歌詞，可使用下方連結或手動匯入。';}

 }catch(e){if(valid()){ui['search-status'].textContent='自動搜尋失敗：'+e.message+'。可按重新搜尋。';ui['track-status'].textContent='歌詞載入失敗。';}}
}
$('confirm-match').onclick=()=>{if(!song?._provisional)return;const r={...song};delete r._provisional;selectSyncRecord(r);ui['search-status'].textContent='已確認候選歌曲；下次可直接載入。';};
function receive(s){const prevHints=JSON.stringify(remote?.titleHints||[]);remote=s;remoteSeen=Date.now();syncInfo.textContent=s.title+(s.artist?' · '+s.artist:'');retry.disabled=!auto.checked;if(!auto.checked){syncStatus.textContent='已偵測歌曲 · 手動模式';return;}syncStatus.textContent='已連線 · '+(s.ad?'廣告':s.playing?'播放中':'暫停 / 等待播放');if(s.ad){if(playing)setPlaying(false);updateControls();return;}const k=songIdentity(s);if(k!==remoteKey){remoteKey=k;findRemote(s);}else if(!loadedKey&&JSON.stringify(s.titleHints||[])!==prevHints&&Array.isArray(s.titleHints)&&s.titleHints.length){findRemote(s);}else applyRemote();}
window.addEventListener('message',e=>{if(e.source!==window||e.origin!==location.origin||e.data?.type!=='kotonoha-extension-v03')return;const s=e.data.state;if(!s||typeof s.title!=='string'||!s.title.trim()||s.title.length>500||typeof s.artist!=='string'||s.artist.length>500||typeof s.videoId!=='string'||!Number.isFinite(s.position)||s.position<0||!Number.isFinite(s.duration)||s.duration<0||!Number.isFinite(s.observedAt)||Math.abs(Date.now()-s.observedAt)>30000)return;receive(s);});
retry.onclick=()=>{if(syncLocked()){remoteKey=songIdentity(remote);findRemote(remote,true);}};
setInterval(()=>{if(auto.checked&&remote&&Date.now()-remoteSeen>=15000){remote=null;remoteKey='';loadedKey='';syncRequest++;searchGeneration++;requestController?.abort();setPlaying(false);updateControls();retry.disabled=true;syncStatus.textContent='連線中斷，請確認播放器分頁與擴充功能。';ui['track-status'].textContent='已停止自動同步；可關閉跟隨後手動操作。';}},2000);

$('import-current').onclick=()=>{if(!remote)return;ui['manual-title'].value=queriesFor(remote)[0]||remote.title;ui['manual-artist'].value=preferredArtist(remote,queriesFor(remote))||remote.artist;ui['manual-lyrics'].closest('details').open=true;ui['manual-lyrics'].focus();ui['manual-lyrics'].scrollIntoView({block:'center',behavior:'smooth'});};
