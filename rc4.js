'use strict';
const more=$('reader-options');$('reader-more').onclick=()=>{more.open=!more.open;};more.addEventListener('toggle',()=>{$('reader-more').textContent=more.open?'⚙ 收起選項':'⚙ 顯示選項';$('reader-more').setAttribute('aria-expanded',String(more.open));});
$('settings-jump').onclick=()=>{more.open=true;more.scrollIntoView({block:'center',behavior:'smooth'});};
$('retranslate').onclick=()=>{if(!aiState.config){$('ai-settings').open=true;$('ai-settings').scrollIntoView({block:'center',behavior:'smooth'});return;}if(readerMode==='off'){readerNote('請先開啟中文翻譯。');return;}startAI(true);};
let seekRequest=0,seekTimer;
function seekLyric(line){if(!timed||line.credit||editingKana)return;const t=clamp((line.t-offset)/rate,0,duration);if(!syncLocked()){seek(t);return;}sendTransport('seek',t);}
function sendTransport(action,t){
 if(!syncLocked()||loadedKey!==remoteKey||remote.ad){readerNote('歌曲尚未就緒或廣告播放中，暫時不能控制。');return;}
 if(!['seek','play','pause'].includes(action))return;
 if(action!=='seek'&&remote.controls?.[action]!==true){readerNote('請更新同步擴充功能或手機 App；播放器也必須支援此操作。');return;}
 if(action==='seek'&&(!Number.isFinite(t)||duration<=0||remote.controls?.seek===false))return;
 const id=++seekRequest;const state={videoId:remote.videoId,title:remote.title,artist:remote.artist,action};if(action==='seek')state.position=clamp(t,0,duration);
 clearTimeout(seekTimer);readerNote(action==='seek'?'正在跳轉至 '+timeString(state.position)+'…':'正在送出播放控制…');
 if(document.documentElement.dataset.androidSeek==='1'){try{const reply=window.prompt(action==='seek'?'kotonoha-native-seek-v1':'kotonoha-native-transport-v1',JSON.stringify(state));readerNote(reply==='ok'?'已送出手機播放器指令':'手機播放器不支援此操作，或歌曲已切換。');}catch{readerNote('手機播放器控制失敗。');}return;}
 if(remote.source==='android'){readerNote('請更新 Android App 以支援播放器控制。');return;}
 window.postMessage({type:'kotonoha-seek-v1',id,state},location.origin);seekTimer=setTimeout(()=>{if(id===seekRequest)readerNote('未收到播放器回應；請更新擴充功能並重整兩個網頁。');},4500);
}
window.addEventListener('message',e=>{if(e.source!==window||e.origin!==location.origin||e.data?.type!=='kotonoha-seek-result-v1'||e.data.id!==seekRequest)return;clearTimeout(seekTimer);readerNote(e.data.ok?'已送出播放器指令。':'控制失敗：'+(e.data.error||'播放器未就緒'));});
$('native-menu').onclick=()=>{if(document.documentElement.dataset.androidSeek==='1')window.prompt('kotonoha-native-menu-v1','');};

$('ref-retry').onclick=()=>{if(song)findReference(song,generation,true);};

$('ref-import').onclick=importReference;

$('ref-text').addEventListener('paste',e=>{const html=e.clipboardData?.getData('text/html');if(!html||html.length>500000)return;const converted=rubyClipboardText(html);if(!converted)return;e.preventDefault();const el=e.currentTarget;el.setRangeText(converted,el.selectionStart,el.selectionEnd,'end');$('ref-status').textContent='已讀取剪貼簿的假名格式；按比對並儲存讀音。';});
