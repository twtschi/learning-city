# AI Coding Knowledge Base

這個資料夾是 AI Coding 區域的內容來源，做法仿照 PCIe 的 `knowledge_base`，但有兩個刻意的差異：

1. **課程由知識庫決定**。UI 只讀 `web/catalog.js`：新增筆記、重建，章節、週次、進度分母、城市首頁的建築大小都會跟著變，不用改任何 UI 程式碼。
2. **書的原文不進 git、不進網站**。原文只存在本機的檢索索引；網站只顯示用自己的話寫的筆記，**不顯示書名、頁碼與出處**（見下方〈內容規範〉）。

## 結構

```text
knowledge_base/
  README.md
  course.json              週次標題與 core lessons（互動章節）的 id
  sources.json             來源登錄：書名、頁碼對照、章節範圍（不含 PDF 本身）
  loader.js                UI 與首頁共用的載入器（讀 catalog、按需載入筆記）
  notes/                   ★ 筆記（Markdown + 前置資料），進 git
    figures/               筆記用的圖（自己畫的 SVG），進 git
  web/                     ★ 建置輸出（catalog.js、notes/*.js、figures/），進 git
  tools/build_knowledge_base.py   一個指令產生 web/ 與 rag/
  tools/verify_lab_outputs.py     重跑筆記裡的程式碼，核對筆記標為「實測」的輸出
  search_kb.py             查詢本機索引（BM25，無相依套件）
  rag/                     ✗ 本機檢索索引（含原文），gitignored
  sources/                 ✗ 可選：把 PDF 丟在這裡，gitignored
  sources.local.json       ✗ 記住 PDF 的本機路徑，gitignored
```

## 日常流程

### 新增或修改一篇筆記（最常用）

1. 在 `notes/` 新增 `xxx.md`，加上前置資料與內容（格式見下）。
2. 重建網站目錄：

   ```bash
   python regions/ai-coding/knowledge_base/tools/build_knowledge_base.py --only web
   ```

3. 重新整理頁面。章節出現在對應的週次下；若是補充閱讀，會掛在它 `attach` 的章節底下。

建置時會檢查：id 不可重複、`kind` 合法、`attach` 的目標存在、檢查題恰有一個正確選項、引用的頁碼在來源範圍內、圖片存在於 `notes/figures/` 且有說明文字。有錯會直接中止並指出哪個檔案。

### 驗證筆記裡的實驗輸出

筆記裡的實驗（lab）會把程式碼與輸出一起寫出來。輸出前面標 **【實測】** 的，必須是真的執行結果。改了程式碼或數字之後執行：

```bash
python regions/ai-coding/knowledge_base/tools/verify_lab_outputs.py                # 全部
python regions/ai-coding/knowledge_base/tools/verify_lab_outputs.py data-ui-api
```

它會依序執行筆記裡的 `python` 區塊（以及 `bash` 區塊），再逐行比對【實測】輸出；耗時（`0.15s`、`215.1 ms`）會被遮罩。需要 Python 3.11 以上、PyYAML 與 Node.js。它會**執行筆記裡的程式碼**，只對你信任的筆記使用。

### 筆記格式

```markdown
---
id: my-note                  # 唯一，[a-z0-9-]
title: 章節標題
kind: lesson                 # lesson＝獨立章節；deepdive＝掛在別的章節底下的補充閱讀
week: 2                      # 出現在第幾週
order: 30                    # 同一週內的排序
attach: tokens               # 只有 deepdive 需要：目標章節（互動章節 id 或另一篇筆記 id）
minutes: 12
source: coding-with-ai p.8-15   # 可選：來源 id 與印刷頁碼（只供維護，不會顯示在網站上）
---
內文。支援 ##/### 標題、清單、表格、**粗體**、`行內程式碼`。

![圖的說明文字](figures/my-figure.svg)

```cpp
// 程式碼區塊，UI 會附上「複製」按鈕
```

## 檢查點
Q: 題目？
- [ ] 錯誤選項
- [x] 正確選項（只能有一個）
- [ ] 錯誤選項
解釋: 為什麼對、為什麼其他選項容易混淆。

## 思考練習
Q: 思考題？
- 參考要點一
- 參考要點二
```

`## 檢查點` 與 `## 思考練習` 都可省略；沒有檢查點的章節會顯示「標記為已讀」。

筆記內文只支援標題、清單、表格、粗體、行內程式碼、程式碼區塊與 `figures/` 內的圖，**沒有連結與引用區塊**；表格儲存格內不能出現 `|`。

### 內容規範：網站上不呈現出處

學習者看到的內容（筆記內文、章節標頭、圖、建置產物 `web/`）**不出現書名、作者、頁碼、圖號，也不引用書中受訪者的話**。書中的觀點改寫成一般性的說明；只有書以外也能查證的事實才寫進來。

來源只留給維護者：筆記前置資料的 `source:`（建置時驗證頁碼範圍，**不會輸出到 `web/`**）與 `sources.json`。這是為了核對內容與追蹤版權，不是給讀者看的。

內文用三種標記，讓讀者分得出「驗證過的」與「判斷的」：

| 標記 | 意思 |
|---|---|
| **【實測】** | 在沙箱實際執行的結果；由 `verify_lab_outputs.py` 核對 |
| **【外部】** | 可查證的外部研究或公開資訊，只寫摘要層級、能交叉確認的事實 |
| **【判斷】** | 工程判斷，可以反駁，不是事實 |

沒有標記的內容，是業界常見的做法或說法。

### 新增一本書（PDF）

1. 在 `sources.json` 加一筆：`id`、書名、`page_offset`（PDF 頁碼 = 印刷頁碼 + offset）、`printed_pages`、`chapters`。
2. 建本機檢索索引（路徑會被記在 `sources.local.json`，之後不用再傳）：

   ```bash
   python regions/ai-coding/knowledge_base/tools/build_knowledge_base.py --only rag --source <id>=<PDF 路徑>
   ```

3. 查原文來寫筆記、核對頁碼：

   ```bash
   python regions/ai-coding/knowledge_base/search_kb.py "prompt caching" -k 5
   python regions/ai-coding/knowledge_base/search_kb.py "pytest fixture" --chapter ch08 --full
   ```

4. 用自己的話寫成 `notes/*.md`，`source:` 填書的 id 與頁碼；內文不要寫書名、頁碼與書中人物的引述。

PDF 需要有文字層。掃描檔要先 OCR，這個工具不做 OCR。索引使用 `pypdf`（若已安裝）或 `pdftotext`。

## 目前收錄

| 來源 | 狀態 |
|---|---|
| Jeremy C. Morgan，*Coding with AI: Examples in Python*（Manning，2025） | 第 1–4、8、9、10 章已整理成 9 篇筆記；第 5–7 章只用於歸納失敗案例 |
| Tom Taulli，*AI-Assisted Programming*（O'Reilly，2024），**第 1、8、9 章節錄**（Coder 贈閱版，59 頁） | 作為素材之一，整理成 12 篇章節與 2 篇延伸閱讀，面向 staff engineer：抽象階梯與術語地圖（Week 1）；審查生成的程式碼、安全重構、遺留系統移植、資料／前端／API、除錯與審查、稽核 AI 測試、部署與回饋、任務放置矩陣（Week 2）；風險登記表與兩篇延伸閱讀（Week 6）；判讀生產力證據（Week 8）。頁碼是**節錄本的印刷頁碼**，與完整書籍不同 |
| 原創補充筆記 | 7 篇「延伸閱讀」＋術語表，掛在 Week 1 的互動章節下 |

## 這份教材的邊界（誠實說明）

- 兩個書籍素材都是**入門導向的實作書**（以 Python 與 Copilot、ChatGPT、Cursor 等工具為主），對 Week 1–2（工具、context、prompt、測試、vibe coding、審查與交付）有用，但**幾乎不涉及** eval 設計、agent 架構、MCP、提示注入、推論效能。Week 6 與 Week 8 目前只有風險登記表與生產力證據判讀，其餘週次需要其他來源或原創筆記。
- staff 層級的內容（差分測試、突變測試、任務放置矩陣、agent 風險等）是**補充的工程判斷**，在內文標成【判斷】。
- 【外部】的數字只用能交叉確認的摘要層級事實。**Fu et al. 的 35.8% 是論文第一版的數字，後續版本已調整**，筆記中已標明；DORA 2024 的具體數字在二手來源之間互相矛盾，**所以不引用**。要引用任何外部數字，請先讀原文。
- 「節省 30% 時間」「AI 寫了 80%」這類說法多半是個人經驗，筆記中已標明，不要當作實驗結果。
- 前置資料的頁碼已用本機索引核對；工具名稱與功能會過期，請以官方文件為準。

## 版權

書的原文只存在 `rag/`（已加入 `.gitignore`）。請不要把 `rag/`、PDF 或 `sources.local.json` 加進版本控制，也不要把書中的長段原文貼進 `notes/`。筆記應該是你自己的整理；頁碼只記在前置資料，讓維護者可以回頭查證。
