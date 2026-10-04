# AI Coding Knowledge Base

這個資料夾是 AI Coding 區域的內容來源，做法仿照 PCIe 的 `knowledge_base`，但有兩個刻意的差異：

1. **課程由知識庫決定**。UI 只讀 `web/catalog.js`：新增筆記、重建，章節、週次、進度分母、城市首頁的建築大小都會跟著變，不用改任何 UI 程式碼。
2. **書的原文不進 git、不進網站**。原文只存在本機的檢索索引；網站顯示的是用自己的話寫的筆記，附印刷頁碼出處。

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
source: coding-with-ai p.8-15   # 可選：來源 id 與印刷頁碼
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

4. 用自己的話寫成 `notes/*.md`，`source:` 填書的 id 與頁碼。

PDF 需要有文字層。掃描檔要先 OCR，這個工具不做 OCR。索引使用 `pypdf`（若已安裝）或 `pdftotext`。

## 目前收錄

| 來源 | 狀態 |
|---|---|
| Jeremy C. Morgan，*Coding with AI: Examples in Python*（Manning，2025） | 第 1–4、8、9、10 章已整理成 9 篇筆記；第 5–7 章只用於歸納失敗案例 |
| 原創補充筆記 | 7 篇「延伸閱讀」＋術語表，掛在 Week 1 的互動章節下 |

## 這份教材的邊界（誠實說明）

- 這本書是 **Python + Copilot/ChatGPT/Cursor 等工具的實作入門**。它對 Week 1–2（工具、context、prompt、測試、vibe coding）有用，但**幾乎不涉及** eval、agent 架構、MCP、安全與 prompt injection、推論效能。那些週次的內容需要其他來源，或原創筆記。
- 書中不少數字（例如節省 30% 時間、80% 完成度、「90% 會更好」）是**作者個人經驗**，筆記裡已標明，引用時不要當作實驗結果。
- 每篇書籍筆記的「進階觀點」段落是**我的補充與校正**，不是書的內容。
- 筆記引用的頁碼已用本機索引逐一核對；工具名稱與功能會過期，請以官方文件為準。

## 版權

書的原文只存在 `rag/`（已加入 `.gitignore`）。請不要把 `rag/`、PDF 或 `sources.local.json` 加進版本控制，也不要把書中的長段原文貼進 `notes/`。筆記應該是你自己的整理，附上頁碼讓人可以回頭查證。
