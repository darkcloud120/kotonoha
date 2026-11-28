'use strict';
// A translation belongs to the exact ordered source lines, not to a video ID or timing.
const aiSessionKey='kotonoha.v4.ai-session';
const aiRememberKey='kotonoha.rc6.private-worker';
const aiCachePrefix='kotonoha.v4.translation.';
const aiState={config:null,timer:0,inflight:new Map(),memory:new Map(),starts:[],failed:new Set()};
const aiStatus=m=>{$('ai-status').textContent=m;};
const aiSignature=source=>JSON.stringify(source);
const aiValid=(v,source)=>Array.isArray(v)&&v.length===source.length&&v.every(x=>typeof x==='string'&&x.trim()&&!/[\r\n]/.test(x));
function readAITranslation(source){if(!source.length)return [];const sig=aiSignature(source);if(aiState.memory.has(sig))return aiState.memory.get(sig);try{const v=JSON.parse(localStorage.getItem(aiCachePrefix+sig)||'null');return aiValid(v,source)?v:[];}catch{return [];}}
function cacheAITranslation(source,values){const sig=aiSignature(source);aiState.memory.set(sig,values);if(aiState.memory.size>40)aiState.memory.delete(aiState.memory.keys().next().value);try{localStorage.setItem(aiCachePrefix+sig,JSON.stringify(values));return true;}catch{return false;}}
function anyTranslation(){return lines.some(l=>l.text&&l.zh?.textContent.trim());}
function showAIValues(values){ui['translation-text'].value=values.join('\n');setTranslations(values);if(ui.follow.checked&&active>=0){lines[active]?.el.classList.remove('active');active=-1;update();}}
function currentSignature(){return aiSignature(lyricTexts());}
function aiCurrentStatus(){const source=lyricTexts(), sig=aiSignature(source);if(!source.length){aiStatus('等待歌詞。');return;}if(aiState.inflight.has(sig)){aiStatus('AI 正在翻譯整首…');return;}if(anyTranslation()){aiStatus('已有翻譯；不會自動重複扣費。');return;}if(aiState.failed.has(sig)){aiStatus('此曲上次翻譯失敗，請手動重試。');return;}if(!aiState.config){aiStatus('尚未啟用：請設定 Worker 網址及私人密碼。');return;}aiStatus(aiState.config.auto?'等待自動翻譯…':'可按 AI 翻譯目前歌曲。');}
function onAITrackLoaded(){clearTimeout(aiState.timer);aiCurrentStatus();if(typeof readerTrack==='function')readerTrack();else if(aiState.config?.auto&&song&&!song.demo&&lyricTexts().length&&!anyTranslation()){const sig=currentSignature();aiState.timer=setTimeout(()=>{if(currentSignature()===sig&&aiState.config?.auto&&!anyTranslation())startAI(false);},1500);}}
function saveAIConfig(){const u=new URL($('ai-url').value.trim());if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)throw new Error('請輸入合法 HTTPS Worker 網址（無帳密、查詢參數或片段）');if(u.origin===location.origin||u.hostname.endsWith('.github.io'))throw new Error('這是歌詞網站，不是翻譯後端。請填入 Cloudflare Worker 網址（通常以 .workers.dev 結尾）。');const token=$('ai-token').value;if(token.length<24)throw new Error('私人存取密碼至少 24 字元');const c={url:u.href,token,auto:$('ai-auto').checked};aiState.config=c;try{localStorage.setItem('kotonoha.v2.ai-url',c.url);}catch{}try{sessionStorage.removeItem(aiSessionKey);if($('ai-remember').checked)localStorage.setItem(aiRememberKey,JSON.stringify(c));else localStorage.removeItem(aiRememberKey);}catch{throw new Error('此裝置無法保存私人設定，請確認瀏覽器儲存權限。');}return c;}
$('ai-save').onclick=()=>{try{saveAIConfig();aiState.failed.clear();onAITrackLoaded();}catch(e){aiStatus(e.message);}};
$('ai-auto').onchange=()=>{if(!$('ai-auto').checked){clearTimeout(aiState.timer);if(aiState.config)aiState.config.auto=false;try{const old=JSON.parse(localStorage.getItem(aiRememberKey)||'null');if(old){old.auto=false;localStorage.setItem(aiRememberKey,JSON.stringify(old));}}catch{}aiCurrentStatus();}else aiStatus('按「儲存設定 / 啟用」確認自動翻譯及 API 費用。');};
$('ai-disconnect').onclick=()=>{clearTimeout(aiState.timer);aiState.config=null;for(const r of aiState.inflight.values())r.controller.abort();$('ai-token').value='';$('ai-auto').checked=false;$('ai-remember').checked=false;try{sessionStorage.removeItem(aiSessionKey);localStorage.removeItem(aiRememberKey);}catch{}aiStatus('已停止並清除密碼。已送出的請求可能仍會計費。');};
$('ai-remember').onchange=()=>{if(!$('ai-remember').checked)try{sessionStorage.removeItem(aiSessionKey);localStorage.removeItem(aiRememberKey);}catch{}else aiStatus('按儲存設定後，密碼會保留在此裝置。');};
async function startAI(manual){
 if(song?._provisional){aiStatus('請先確認候選歌詞，再翻譯。');return;}
 if(!song||!lyricTexts().length){aiStatus('請先載入歌詞。');return;}
 const source=lyricTexts(),sig=aiSignature(source),g=generation;let config=aiState.config;
 if(manual){try{config=saveAIConfig();}catch(e){aiStatus(e.message);return;}if(anyTranslation()&&!confirm('已有翻譯，確定重新翻譯並覆蓋目前顯示的翻譯？這會使用 API 額度。'))return;}
 if(!config||(!manual&&!config.auto))return;
 if(!manual&&(anyTranslation()||aiState.failed.has(sig)))return;
 if(aiState.inflight.has(sig)){aiStatus('同一首正在翻譯，請勿重複送出。');return;}
 if(aiState.inflight.size>=2){aiStatus('目前已有兩首正在翻譯；完成後會再檢查目前歌曲。');return;}
 aiState.starts=aiState.starts.filter(t=>Date.now()-t<600000);
 if(!manual&&aiState.starts.length>=15){aiStatus('已達本分頁自動翻譯頻率限制，可稍後手動翻譯。');return;}
 if(source.length>300||source.join('').length>12000||source.some(s=>s.length>1000)){aiStatus('歌詞過長，請手動分段翻譯。');return;}
 const prior=JSON.stringify(readTranslations());const draft=ui['translation-text'].value;
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),90000);const job={controller};aiState.inflight.set(sig,job);aiState.starts.push(Date.now());aiStatus('AI 正在翻譯整首… 可繼續聽歌。');if(typeof readerNote==='function')readerNote('AI 正在翻譯整首…');let failed=false;
 try{const res=await fetch(config.url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+config.token},body:JSON.stringify({lines:source,force:manual&&anyTranslation(),title:song.trackName||'',artist:song.artistName||''}),signal:controller.signal,redirect:'error'});if(!/json/i.test(res.headers.get('content-type')||''))throw new Error('Worker 沒有回傳 JSON，請確認填的是翻譯後端網址及部署狀態（HTTP '+res.status+'）');const body=await res.json();if(!res.ok)throw new Error(body.error||'HTTP '+res.status);if(!aiValid(body.translations,source))throw new Error('AI 回傳行數或格式不符，未覆蓋翻譯');if(controller.signal.aborted)return;
 aiState.failed.delete(sig);const stored=cacheAITranslation(source,body.translations);if(typeof markCloud==='function'&&body.cloudStored)markCloud(config,sig);
 if(currentSignature()===sig){const unchanged=JSON.stringify(readTranslations())===prior&&ui['translation-text'].value===draft;if(manual&&generation===g&&unchanged){applyAI(body.translations);aiStatus('翻譯完成。'+ui['translation-status'].textContent);}else if(!anyTranslation()&&unchanged){showAIValues(body.translations);aiStatus(stored?'翻譯完成，已儲存於此瀏覽器。':'翻譯完成，但本機空間不足，僅暫存本次開頁。');}else if(!anyTranslation()&&generation!==g&&ui['translation-text'].value===''){showAIValues(body.translations);aiStatus(stored?'翻譯完成，已儲存。':'翻譯完成，僅暫存。');}else aiStatus('AI 翻譯已快取；保留你目前的翻譯或編輯內容。');}
 if(currentSignature()===sig&&typeof readerNote==='function')readerNote(body.cacheHit?'已讀取雲端翻譯・未呼叫 AI':'翻譯完成');
 }catch(e){failed=true;aiState.failed.add(sig);if(currentSignature()===sig&&typeof readerNote==='function')readerNote('翻譯失敗，請查看 AI 設定。');if(currentSignature()===sig&&aiState.config)aiStatus('翻譯失敗：'+(controller.signal.aborted?'請求取消或逾時':e.message)+'。可手動重試，不會自動重複扣費。');}
 finally{clearTimeout(timer);aiState.inflight.delete(sig);if(currentSignature()!==sig&&aiState.config?.auto&&!anyTranslation()&&!aiState.inflight.has(currentSignature()))onAITrackLoaded();else if(!failed&&currentSignature()===sig&&!anyTranslation()&&aiState.config){const saved=readAITranslation(lyricTexts());if(saved.length&&!ui['translation-text'].value)showAIValues(saved);}}
}
$('ai-translate').onclick=()=>startAI(true);
try{$('ai-url').value=localStorage.getItem('kotonoha.v2.ai-url')||'';const permanent=localStorage.getItem(aiRememberKey);const saved=JSON.parse(permanent||sessionStorage.getItem(aiSessionKey)||'null');if(saved){$('ai-url').value=saved.url;$('ai-token').value=saved.token;$('ai-auto').checked=!!saved.auto;$('ai-remember').checked=!!permanent;saveAIConfig();}}catch{}
aiCurrentStatus();
