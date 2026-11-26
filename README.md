# ことのは Kotonoha v0.3

個人用日文歌詞閱讀器。純靜態 GitHub Pages 網站；Chrome / Edge 擴充功能提供電腦 YouTube Music 自動同步。

## 更新網站
1. 將網站 ZIP 解壓縮，將 index.html、app.js、sync.js（新增）、style.css、kana-worker.js、README.md 上傳到原 repository 根目錄，覆蓋同名檔案。保留原本的 .nojekyll。
2. 不必重建 Pages。Commit changes，部署完成後 Ctrl+F5 確認左上顯示 v0.3。
3. optional-ai 仍為可選的私人 Worker 後端，無須上傳 Pages；不要公開 API 金鑰。

## 安裝電腦擴充功能
1. 將另附的 kotonoha-extension-v0.3.zip 解壓縮到電腦固定資料夾，裡面有 manifest.json。不要在 ZIP 裡直接操作，也不要上傳 GitHub Pages。
2. Chrome 輸入 chrome://extensions/；Edge 輸入 edge://extensions/。開啟開發人員模式，按「載入未封裝項目」，選擇 manifest.json 所在的資料夾。
3. 點瀏覽器工具列拼圖圖示，打開 Kotonoha · YT Music Sync（可釘選）。貼上你已部署的完整 GitHub Pages 網址（https://你的帳號.github.io/kotonoha/），按儲存並授權。同意該 github.io 網站權限。
4. 同一個瀏覽器/使用者設定檔中開啟歌詞頁與 https://music.youtube.com/，重新整理兩頁，播放歌曲。網站「跟隨 YouTube Music」需勾選。
5. 歌詞網站顯示已連線、歌名及歌手。測試播放、暫停、拖曳時間、下一首、播放清單自然換歌。擴充功能不接管播放器；在 YouTube Music 操作。兩個分頁需維持開啟。

## 翻唱與搜尋
- 自動搜尋 LRCLIB：先歌名+歌手，再歌名；自動選擇最接近的同名結果。不同版本可能誤配，使用搜尋結果手動選擇，或手動搜尋原唱歌手，再點選歌詞。會記住目前播放版本對應的歌詞。無歌詞時可自行匯入 LRC 或純文字。
- 翻唱可能有不同前奏、速度和編曲。歌詞原文可沿用，時間軸需校準。版本依播放歌曲及影片 ID 建立；偏移、倍率、LRC 修改保存在此瀏覽器。正偏移表示提早顯示，倍率大於 1 表示時間軸更快。純文字無法自動逐句高亮，須補時間戳。
- 選取的歌詞、版本與翻譯保存在目前瀏覽器 localStorage；不會跨裝置同步。v0.2 翻譯鍵沿用。舊的手動版本可在版本欄輸入原名稱切換並儲存，讓自動模式記住。
- 預設假名開啟，第一次下載 Kuromoji 字典較慢；特殊唱法可能不正確。翻譯沿用 v0.2 的手動匯入與選用 AI Worker，並非預設自動翻譯。

## 排錯
- 等待連線：確認已安裝擴充、網站網址完全正確、兩頁重新整理、播放網頁版 YouTube Music 而不是其他 App。同時開多個 YT Music 分頁可能選到另一個播放來源，測試時建議只留一個。
- 已連線但沒有歌詞：確認歌名、歌手、搜尋狀態，改搜原唱或手動匯入；API 曲庫與連線受第三方限制。
- 有歌詞但不同步：確認有 LRC，並測試原唱；翻唱用偏移或版本設定校準。
- 不想同步：取消勾選跟隨 YouTube Music，回到手動模式。網站不會操作實際音樂，也不會在手機自動偵測。
- 擴充只讀取 music.youtube.com 的播放資訊，透過本機瀏覽器傳給你指定的 GitHub Pages 網頁；不需額外伺服器。網站會將歌名/歌手送 LRCLIB 搜尋。選用 AI 翻譯才會向設定的 Worker 傳送歌詞。

測試：JavaScript 語法檢查及模擬 DOM/歌詞 API 測試已通過；環境限制瀏覽器導航，尚未驗證真實 YouTube Music DOM、權限流程與實際 API 連線。初版擴充可能需依 YouTube Music 改版調整。
