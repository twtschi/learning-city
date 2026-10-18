# AI Coding 章節影片

每個章節（互動章節與知識庫筆記）各有一支導讀影片：投影片＋語音合成旁白＋中文字幕，時長至少三分鐘，依內容多寡調整。章節頁面的標題下方會自動出現播放器；沒有影片的章節不顯示。

```text
scripts/<id>.txt ──build_videos.py──▶ <id>.mp4  <id>.vtt  <id>.jpg  <id>.json  manifest.js
                   │
                   ├─ 旁白：sherpa-onnx + Kokoro（離線語音合成），逐句合成
                   ├─ 投影片：render_slides.mjs（Playwright + Chromium 截圖，1280×720）
                   ├─ 字幕：WebVTT，保留原文術語，時間依每句實際音長切分
                   └─ 品質檢查（選用）：SenseVoice 把每句旁白轉回文字，計算字元錯誤率
```

| 檔案 | 是否 commit | 說明 |
|---|---|---|
| `scripts/<id>.txt` | 是 | 影片腳本：投影片內容與旁白。`id` 對應章節 id（互動章節如 `tokens`，筆記如 `glossary`） |
| `tools/build_videos.py` | 是 | 建置工具，腳本格式寫在檔案開頭的說明 |
| `tools/render_slides.mjs` | 是 | 投影片版型（title、big、bullets、steps、compare、table、figure、code、quiz、end） |
| `tools/pronunciations.tsv` | 是 | 術語讀法：旁白用右欄讀，字幕仍顯示左欄原文 |
| `<id>.mp4` `<id>.vtt` `<id>.jpg` | 是 | 網站直接讀取的影片、字幕、封面 |
| `<id>.json` | 是 | 這支影片的秒數、投影片數、旁白字數、檔案大小、ASR 字元錯誤率與錯誤率最高的 5 句 |
| `manifest.js` | 是 | 章節 id → 影片路徑與秒數，網站用它決定哪些章節有影片 |
| `.cache/` | 否 | 語音合成快取（已被 `.gitignore` 的 `.cache` 規則忽略） |

## 重建影片

需要：Python 3.11+、numpy、ffmpeg、Node.js、Playwright 與 Chromium。

```bash
# 1. Python 套件
pip install sherpa-onnx opencc-python-reimplemented soundfile

# 2. 模型（k2-fsa/sherpa-onnx 的 GitHub releases）
curl -LO https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-int8-multi-lang-v1_1.tar.bz2
curl -LO https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17.tar.bz2
tar xf kokoro-int8-multi-lang-v1_1.tar.bz2
tar xf sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17.tar.bz2

# 3. 投影片字型（不裝的話用系統字型，粗體可能不正確）
npm install @fontsource/noto-sans-tc @fontsource/dm-mono

# 4. 建置（不給 id 就建全部；--asr 可省略）
F=node_modules/@fontsource
python regions/ai-coding/videos/tools/build_videos.py tokens glossary \
  --model kokoro-int8-multi-lang-v1_1 \
  --asr sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17 \
  --font-css $F/noto-sans-tc/400.css --font-css $F/noto-sans-tc/700.css \
  --font-css $F/dm-mono/400.css --font-css $F/dm-mono/500.css

# 只檢查腳本格式（不需要模型）
python regions/ai-coding/videos/tools/build_videos.py --check-only
```

Playwright 不在 Node 的模組搜尋路徑時，用 `--playwright <playwright 套件目錄>` 指定；Chromium 不是 Playwright 預設下載的那一個時，用 `--chromium <執行檔>` 指定。

在 4 核心 CPU、無 GPU 的環境，一支約 1,000–1,600 字旁白的影片約需 4–6 分鐘建置；同一句旁白重建時會直接使用快取。

## 新增或修改一支影片

1. 編輯 `scripts/<id>.txt`。`id` 必須是章節 id：互動章節用 `app.js` 裡的 id，知識庫筆記用筆記前置資料的 `id`。
2. 旁白的語速約每字 0.21–0.24 秒；要超過三分鐘，旁白大約需要 950 字以上。
3. 遵守知識庫的內容規範：不出現書名、作者、頁碼與原文引用；數字與研究結果要能對應到筆記中標示【實測】【外部】的內容。
4. 執行建置，看輸出的 `asr_cer` 與 `<id>.json` 裡的 `worst`。錯誤率高的句子，通常是英文術語讀錯，到 `pronunciations.tsv` 加一行讀法；百分比請寫成中文（「百分之三十」），`%` 會被讀錯。

## 已知限制（客觀說明）

- **口音**：Kokoro 的中文聲音是以普通話資料訓練，口音是中國大陸普通話，不是臺灣華語。旁白文字在送進語音合成前會轉成簡體字（OpenCC `t2s`），字幕仍是繁體。
- **聲音選擇**：以同一段測試旁白比較 12 個中文聲音（speaker id 3–102），用 SenseVoice 轉寫後計算字元錯誤率，選擇錯誤率最低的 speaker id 40。
- **術語讀法**：模型對英文縮寫與術語的發音不穩定，因此部分術語在旁白中改讀中文（例如 pull request 讀作「合併請求」、token 讀作「詞元」）。字幕保留原文，所以聽到的與看到的用詞會不同。
- **錯誤率的意義**：`asr_cer` 是「另一個模型聽寫的結果」與旁白文字的差異，同時包含合成與辨識兩邊的錯誤，只能當作相對指標，不等於聽眾的理解程度。
- **字幕時間**：同一句內的字幕依字數比例分配時間，句與句的切換則對齊實際音訊。
- **瀏覽器**：影片是 H.264／AAC 的 MP4（High profile、yuv420p、faststart），Chrome、Edge、Safari、Firefox 都能播放；不含專有編解碼器的開源 Chromium 版本（例如 Playwright 內建的 Chromium）無法解碼 H.264。自動化測試時可以用 `page.route` 把 MP4 換成同內容的 VP9 轉檔，測播放器與字幕。
- **檔案大小**：投影片是靜態畫面，影片以 12 fps、CRF 30 與 56 kbps 單聲道 AAC 編碼，每支約 2–4 MB；全部影片都 commit 進版本庫，GitHub Pages 直接提供。
