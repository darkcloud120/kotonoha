# ことのは Kotonoha v0.2

個人用日文歌詞閱讀器。純靜態網頁，不需要 npm 或後端。

## GitHub Pages
1. 建立新的 public repository，例如 `kotonoha`。
2. 解壓縮下載檔案，將 `index.html`、`style.css`、`app.js`、`README.md`、`.nojekyll` 放到 repository 根目錄。
3. Settings → Pages → Build and deployment → Source: Deploy from a branch → main → /(root) → Save。
4. 部署完成後，在 Pages 頁面開啟 GitHub 顯示的網址。

## 測試
- 按「試聽示範（無音訊）」載入自創歌詞與中文翻譯；按 ▶ 測試計時、高亮和捲動。
- 搜尋歌名如 W/X/Y，歌手 Tani Yuuki；選擇正確錄音版本。結果取決於 LRCLIB。搜尋會把歌名與歌手送往 LRCLIB。
- 如果有同步歌詞，音樂從頭開始時同時按 ▶，或用滑桿設定目前時間。暫停/快轉音樂時也須手動調整本頁。
- 第一次假名分析需從 jsDelivr 下載 Kuromoji 及字典。讀音是字典推定，不保證符合特殊唱法；不認識的漢字可能沒有假名。
- 支援純文字/LRC 匯入、時間偏移（正值表示歌詞更早顯示）、字體和顯示設定。沒有時間戳的歌詞不會假裝有同步。
- 中文翻譯支援手動貼上，每個有文字的原文行對應一行。翻譯保存在當前瀏覽器 localStorage，不會跨設備同步。

## 還沒有的功能
YouTube Music 自動偵測、真正的音訊播放、雲端同步、讀音手動修正。不要把任何 AI API key 放進公開 repository 或前端 JavaScript。

網站程式碼公開；不要把私人資料或未授權的完整歌詞上傳到 repository。API 可用性、資料授權與曲庫收錄受第三方限制。

參考：https://lrclib.net/docs / https://github.com/takuyaa/kuromoji.js

## v0.2 更新
- 上傳新版 index.html、app.js、style.css、kana-worker.js、README.md 至原 repository 根目錄，覆蓋舊檔；無需重建 Pages。重新整理頁面，確認左上角 v0.2。
- 字典改為 Web Worker 背景處理；計時更新從每幀改為每 100ms，重複句讀音快取。首次下載字典仍需時間。
- 指定歌手找不到時自動以歌名重搜。翻唱版本可沿用原唱文字並自訂版本名稱、時間偏移、倍率及每句 LRC 時間。版本在此瀏覽器儲存；再次輸入相同版本名並按切換即可恢復。倍率 1.05 代表歌詞時間軸進行得快 5%；正偏移代表歌詞提早顯示。若手動重寫 LRC，建議倍率 1、偏移調回 0。純文字歌詞也可補上所有句子的時間戳。此版不會自動取得翻唱時間戳。
- 中文翻譯：複製 AI 指令與原文、貼回 JSON；也可部署選用 Worker 後一鍵翻譯。詳見 optional-ai/SETUP.md，該目錄無須上傳 GitHub Pages。
- 仍未自動偵測 YouTube Music，也不會播放音樂。翻譯、時間設定仍只保存在當前瀏覽器。舊版儲存的逐行翻譯沿用。
