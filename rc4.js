'use strict';
const more=$('reader-options');$('reader-more').onclick=()=>{more.open=!more.open;};more.addEventListener('toggle',()=>{$('reader-more').textContent=more.open?'收起選項':'顯示選項';$('reader-more').setAttribute('aria-expanded',String(more.open));});
$('settings-jump').onclick=()=>{more.open=true;more.scrollIntoView({block:'center',behavior:'smooth'});};
$('retranslate').onclick=()=>{if(!aiState.config){$('ai-settings').open=true;$('ai-settings').scrollIntoView({block:'center',behavior:'smooth'});return;}if(readerMode==='off'){readerNote('請先開啟中文翻譯。');return;}startAI(true);};
let seekRequest=0,seekTimer;
function seekLyric(line){if(!timed||line.credit||editingKana)return;const t=clamp((line.t-offset)/rate,0,duration);if(!syncLocked()){seek(t);return;}
 if(loadedKey!==remoteKey||remote.ad){readerNote('歌曲尚未就緒或廣告播放中，暫時不能跳轉。');return;}
 const id=++seekRequest;const state={videoId:remote.videoId,title:remote.title,artist:remote.artist,position:t};
 clearTimeout(seekTimer);readerNote('正在跳轉至 '+timeString(t)+'…');
 if(document.documentElement.dataset.androidSeek==='1'){try{const reply=window.prompt('kotonoha-native-seek-v1',JSON.stringify(state));readerNote(reply==='ok'?'已送出手機跳轉指令':'手機播放器不支援跳轉，或歌曲已切換。');}catch{readerNote('手機跳轉失敗。');}return;}
 if(remote.source==='android'){readerNote('請更新 Android App 以支援點句跳轉。');return;}
 window.postMessage({type:'kotonoha-seek-v1',id,state},location.origin);seekTimer=setTimeout(()=>{if(id===seekRequest)readerNote('未收到播放器回應；請更新擴充功能並重整兩個網頁。');},4500);
}
window.addEventListener('message',e=>{if(e.source!==window||e.origin!==location.origin||e.data?.type!=='kotonoha-seek-result-v1'||e.data.id!==seekRequest)return;clearTimeout(seekTimer);readerNote(e.data.ok?'已跳轉至指定歌詞。':'跳轉失敗：'+(e.data.error||'播放器未就緒'));});
$('native-menu').onclick=()=>{if(document.documentElement.dataset.androidSeek==='1')window.prompt('kotonoha-native-menu-v1','');};
