# AI Coding 章節影片

每個章節（互動章節與知識庫筆記）各有一支導讀影片：投影片＋AI 語音旁白＋中文字幕，時長至少三分鐘，依內容多寡調整。章節頁面的標題下方會自動出現播放器；沒有影片的章節不顯示。

```text
scripts/<id>.txt ──build_videos.py──▶ <id>.mp4  <id>.vtt  <id>.jpg  <id>.json  manifest.js
                   │
                   ├─ 旁白：OpenRouter 語音 API（預設免費的 Fish Audio S2.1 Pro、低沉男聲、要求台灣口音），一章一次請求
                   │        或 sherpa-onnx + Kokoro（離線，逐句合成）
                   ├─ 投影片：render_slides.mjs（Playwright + Chromium 截圖，1280×720）
                   ├─ 字幕：WebVTT；句子與投影片的切點由語音辨識的逐字時間戳對齊
                   └─ 品質檢查：SenseVoice 把每句旁白轉回文字，計算字元錯誤率
```

| 檔案 | 是否 commit | 說明 |
|---|---|---|
| `scripts/<id>.txt` | 是 | 影片腳本：投影片內容與旁白。`id` 對應章節 id（互動章節如 `tokens`，筆記如 `glossary`） |
| `tools/build_videos.py` | 是 | 建置工具，用法與腳本格式寫在檔案開頭的說明 |
| `tools/render_slides.mjs` | 是 | 投影片版型（title、big、bullets、steps、compare、table、figure、code、quiz、end） |
| `tools/pronunciations.tsv` | 是 | 只給離線 Kokoro 聲音用的術語讀法；雲端聲音直接唸原文 |
| `<id>.mp4` `<id>.vtt` `<id>.jpg` | 是 | 網站直接讀取的影片、字幕、封面 |
| `<id>.json` | 是 | 這支影片的秒數、投影片數、旁白字數、檔案大小、使用的聲音、ASR 字元錯誤率與錯誤率最高的 5 句 |
| `manifest.js` | 是 | 章節 id → 影片路徑與秒數，網站用它決定哪些章節有影片 |
| `.cache/` | 否 | 語音合成快取（已被 `.gitignore` 的 `.cache` 規則忽略）。雲端語音的回應存成 mp3，旁白沒改就不會重新請求 |

## 重建影片

需要：Python 3.11+、numpy、ffmpeg、curl、Node.js、Playwright 與 Chromium；語音辨識檢查需要 sherpa-onnx 與 opencc。

```bash
# 1. Python 套件（語音辨識檢查用；離線 Kokoro 聲音也用它）
pip install sherpa-onnx opencc-python-reimplemented soundfile

# 2. 語音辨識模型（k2-fsa/sherpa-onnx 的 GitHub releases）。雲端聲音需要它來對齊字幕，請不要省略
curl -LO https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17.tar.bz2
tar xf sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17.tar.bz2

# 3. 投影片字型（不裝的話用系統字型，粗體可能不正確）
npm install @fontsource/noto-sans-tc @fontsource/dm-mono

# 4. 建置（不給 id 就建全部）。金鑰從環境變數讀，不要寫進指令或檔案
export OPENROUTER_API_KEY=...
F=node_modules/@fontsource
python regions/ai-coding/videos/tools/build_videos.py tokens glossary \
  --asr sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17 \
  --font-css $F/noto-sans-tc/400.css --font-css $F/noto-sans-tc/700.css \
  --font-css $F/dm-mono/400.css --font-css $F/dm-mono/500.css

# 改用離線 Kokoro 聲音（不需要金鑰；要另外下載 kokoro-int8-multi-lang-v1_1）
python regions/ai-coding/videos/tools/build_videos.py --engine kokoro --model kokoro-int8-multi-lang-v1_1 ...

# 只檢查腳本格式（不需要模型與金鑰）
python regions/ai-coding/videos/tools/build_videos.py --check-only
```

預設的聲音設定：

| 參數 | 預設值 | 說明 |
|---|---|---|
| `--or-model` | `fish-audio/s2.1-pro-free:free` | OpenRouter 上唯一免費的語音模型 |
| `--or-voice` | `96ea459f9ca145899ade882d871d2968` | Fish Audio 聲音庫的聲音 ID（低沉男聲） |
| `--or-prefix` | `[台灣口音，低沉、沉穩的男聲] ` | 放在每次請求文字前面的風格標籤，不會被唸出來 |
| `--or-max-chars` | `4000` | 每次請求的旁白字數上限；預設等於一章一次請求，`1` 等於一張投影片一次 |
| `--min-seconds` | `182` | 影片不到這個長度時，把不足的秒數平均加在換頁停頓上（每次最多 2 秒） |

可用的模型與聲音見 `https://openrouter.ai/api/v1/models?output_modalities=speech` 與各模型頁面的 `llms.txt`。例如改用付費的 ElevenLabs：`--or-model elevenlabs/eleven-v3 --or-voice george --or-prefix "[Taiwanese Mandarin accent, deep calm voice] " --or-max-chars 1`。

Playwright 不在 Node 的模組搜尋路徑時，用 `--playwright <playwright 套件目錄>` 指定；Chromium 不是 Playwright 預設下載的那一個時，用 `--chromium <執行檔>` 指定。

在雲端環境裡建置時，網路政策要允許 `openrouter.ai`。

## 費用與限制

- 預設模型免費。OpenRouter 對免費模型的限制是每分鐘 20 次、每天 50 次（帳戶儲值未滿 10 美元時）；一章一次請求，全部 27 章是 27 次。超過限制會回應 429，已完成的章節留在快取裡，隔天再執行就會接著做。
- 付費模型依模型計價。實測 ElevenLabs v3 的扣款約每個中文字 0.00011 美元，全部重建約 4.5 美元。

## 新增或修改一支影片

1. 編輯 `scripts/<id>.txt`。`id` 必須是章節 id：互動章節用 `app.js` 裡的 id，知識庫筆記用筆記前置資料的 `id`。
2. 預設聲音大約每個字 0.156 秒；要穩定超過三分鐘，一章的旁白大約需要 1,200 字以上（`--check-only` 會列出每章字數）。
3. 遵守知識庫的內容規範：不出現書名、作者、頁碼與原文引用；數字與研究結果要能對應到筆記中標示【實測】【外部】的內容。
4. 執行建置，看輸出的 `asr_cer` 與 `<id>.json` 裡的 `worst`。錯誤率高的句子先聽一次：常見的是辨識模型的同音字（例如「型別」聽成「性別」），這不代表旁白唸錯。

## 已知限制（客觀說明）

- **聲音來源**：預設聲音是 Fish Audio 聲音庫裡由社群上傳的聲音，從建置環境查不到它的名稱與授權說明；台灣口音是用風格標籤要求的，效果取決於模型。上傳者日後可能移除這個聲音，屆時要換一個聲音 ID。離線 Kokoro 聲音的口音是中國大陸普通話。
- **音質**：這個聲音的 DNSMOS 整體分約 3.1，低於付費的 ElevenLabs 聲音（約 3.5–3.6）；是在免費前提下依試聽選定的。
- **資料外送**：使用雲端聲音時，旁白文字會送到 OpenRouter 與語音供應商。旁白是本專案自己寫的課程內容，不含機密；腳本裡不要放不該外送的資料。
- **可重現性**：雲端語音每次生成的結果不完全相同。快取保證同一份旁白重建時聲音不變；刪掉 `.cache/` 再重建，聲音會有些微差異。
- **錯誤率的意義**：`asr_cer` 是「另一個模型聽寫的結果」與旁白文字的差異，同時包含合成與辨識兩邊的錯誤，只能當作相對指標，不等於聽眾的理解程度。
- **字幕時間**：句子與投影片的切點對齊語音辨識的逐字時間戳；同一句拆成多段字幕時，依字數比例分配時間。換頁時刻因此取決於辨識結果，若某章對不齊，建置會直接報錯而不是產生錯位的影片。
- **瀏覽器**：影片是 H.264／AAC 的 MP4（High profile、yuv420p、faststart），Chrome、Edge、Safari、Firefox 都能播放；不含專有編解碼器的開源 Chromium 版本（例如 Playwright 內建的 Chromium）無法解碼 H.264。自動化測試時可以用 `page.route` 把 MP4 換成同內容的 VP9 轉檔，測播放器與字幕。
- **檔案大小**：投影片是靜態畫面，影片以 12 fps、CRF 30 與 64 kbps 單聲道 AAC 編碼，音量正規化到 -18 LUFS；每支約 2–4 MB，全部 commit 進版本庫，GitHub Pages 直接提供。
