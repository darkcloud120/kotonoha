'use strict';
// Rebuild is explicit and paid only after a matching candidate was found.
// Keep old data until the translation request has succeeded. Never rebuild the next track.
$('rebuild-song').onclick=async()=>{
 const old=song,oldItem=currentItem(),g=generation,sg=searchGeneration,rg=syncRequest,remoteAtStart=syncLocked(),k=remoteKey;
 if(!old||old.demo||!lyricTexts().length)return readerNote('請先載入要重製的歌曲。');
 const c=aiState.config;if(!c){$('ai-settings').open=true;return readerNote('請先設定私人 Worker，才能重新翻譯。');}
 if(window.kotoRebuildActive)return;
 if(aiState.inflight.size)return readerNote('目前正在翻譯，請完成後再重製。');
 if(!confirm('重新搜尋這首歌、重做假名與中文翻譯？會使用一次 AI 翻譯額度。成功後替換這首的歌曲庫紀錄；手動讀音及相容的時間軸會保留。'))return;
 const source=remoteAtStart?{...remote}:{title:old.trackName,artist:old.artistName,duration:Number(old.duration)||0};
 const queries=queriesFor(source);const controller=new AbortController();const btn=$('rebuild-song');btn.disabled=true;window.kotoRebuildActive=true;readerEpoch++;clearTimeout(aiState.timer);
 const valid=()=>generation===g&&searchGeneration===sg&&syncRequest===rg&&(!remoteAtStart||syncLocked()&&remoteKey===k);
 const oldText=lyricTexts(),oldProfile={name:versionName,rate,duration:versionDuration,lrc:customLrc,offset};
 try{
  readerNote('重製：重新搜尋歌詞…');const {records}=await searchSources(source,queries,controller.signal,m=>{if(valid())readerNote('重製：'+m);});if(!valid())return;
  resultsList(records);const record=chooseAutoRecord(records,source,queries);if(!record){readerNote('沒有可確認的新歌詞；舊資料保留。可先選擇正確候選再重製。');return;}
  const rows=parseLyrics(record.syncedLyrics||record.plainLyrics||'');const same=JSON.stringify(rows.map(x=>x.text).filter(Boolean))===JSON.stringify(oldText);
  const profile=same?oldProfile:null;
  const raw=parseLyrics(profile?.lrc||record.syncedLyrics||record.plainLyrics||'').filter(l=>l.text).map(l=>l.text);
  if(!raw.length||raw.length>300||raw.join('').length>12000||raw.some(x=>x.length>1000))throw Error('新歌詞為空或過長');
  if(!same&&!confirm('新找到的版本原文不同。確定是同一首歌並使用新版原文？不相容的自訂時間軸將保留在舊版備份資料，不會套到新版。')){readerNote('已取消；保留舊資料。');return;}
  if(!valid())return;
  readerNote('重製：重新翻譯整首…');
  const result=await cloudCall(c,'/',{lines:raw,force:true,title:record.trackName,artist:record.artistName});
  if(!aiValid(result.translations,raw))throw Error('翻譯格式不符');
  if(!valid()){cacheAITranslation(raw,result.translations);return;}
  cacheAITranslation(raw,result.translations);if(result.cloudStored)markCloud(c,aiSignature(raw));
  const refId=JSON.stringify([refKey(record),rows.map(l=>l.text)]);refCache.delete(refId);try{localStorage.removeItem(autoRefPrefix+refId);}catch{}
  const wasFavorite=!!library[oldItem]?.favorite;
  if(remoteAtStart){const name=same?(oldProfile.name||versionFor(remote)):versionFor(remote)+' · 重製 '+Date.now();putMapping(k,{record,profile:name});syncCache.set(k,record);writeAutoCache(k,record,source,queries);activateRecord(record);if(same&&(oldProfile.lrc!==customLrc||oldProfile.offset!==offset||oldProfile.rate!==rate)){loadSong(record,{...oldProfile,name});applyRemote();saveProfile();}}
  else loadSong(record,profile);
  // Existing custom profile can only be reused when its line text matches the new source.
  if(JSON.stringify(lyricTexts())!==JSON.stringify(raw)){loadSong(record,{name:remoteAtStart?versionFor(remote):'',rate:1,duration:0,lrc:'',offset:0});if(remoteAtStart)applyRemote();}
  if(readerMode==='off'){readerMode='cache';paintMode();}applyAI(result.translations);const item=currentItem();if(item&&library[item]){library[item].favorite=wasFavorite||library[item].favorite;library[item].translated=true;if(oldItem&&oldItem!==item)delete library[oldItem];persistLibrary();paintFavorite();}
  const nowGen=generation;await referenceTask;
  if(generation===nowGen){await addReadings(nowGen);readerNote('重製完成：新歌詞、假名及翻譯已更新。'+(result.cloudStored?'新翻譯已寫入雲端。':'本機已儲存；雲端未確認。'));}
 }catch(e){if(valid())readerNote('重製失敗：'+e.message+'；原歌曲資料未主動刪除。');else if(song===old)readerNote('重製未完成。');}
 finally{controller.abort();window.kotoRebuildActive=false;btn.disabled=false;if(generation!==g&&song!==old&&currentSignature()!==aiSignature(oldText)&&!anyTranslation())readerTrack();}
};
