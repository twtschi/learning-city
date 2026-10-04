# Learning City

一座可以走進去的學習城市。每個技術主題是一個「區域」，你的學習進度會在城市地圖上蓋出自己的建築：進度越多，樓越高、地基越大。

首頁的主題是「今天，你想看什麼？」：依你的進度推薦今天該去哪個工地，並提供「繼續進行中／開一塊新地／回頭複習」三種意圖。

純靜態網站（HTML／CSS／JS），沒有建置步驟、沒有後端，進度只存在你的瀏覽器。

## 區域

| 區域 | 狀態 | 內容 |
|---|---|---|
| [PCIe Fabric](regions/pcie/index.html) | 開放 | 以互動模擬與任務理解 PCI Express：Root Complex、Switch、Endpoint、TLP。附 [PCIe 知識庫](regions/pcie/knowledge_base/README.md) |
| [AI Coding](regions/ai-coding/index.html) | 開放 | AI Coding 學習路徑。互動實驗、書籍筆記、檢查題、思考練習，章節由[知識庫](regions/ai-coding/knowledge_base/README.md)動態組成 |
| Kernel Valley / Data Commons / Network Harbour / Systems Square | 規劃中 | 在地圖上以空地呈現 |

## 在本機執行

在專案根目錄啟動任何靜態伺服器即可，例如：

```bash
python -m http.server 8000
```

然後開啟 <http://localhost:8000>。

建議用伺服器而不是直接開 `file://`：各頁面的進度存在 `localStorage`，同一個網站來源才讀得到彼此的進度（城市首頁要讀各區域的進度才能蓋樓）。`file://` 下不同瀏覽器的行為不一致，首頁可能一直顯示空地。

## 城市怎麼知道你的進度

每個區域把進度存在 `localStorage`，首頁的 [home.js](home.js) 讀取後換算成建築的樣子：

| 階段 | 進度 | 地圖上的樣子 |
|---|---|---|
| 空地 | 0% | 虛線地塊 |
| 地基 | 1–33% | 出現底座 |
| 骨架 | 34–66% | 樓層以鷹架線框呈現 |
| 外牆 | 67–99% | 樓層蓋好、窗戶亮起 |
| 完工 | 100% | 屋頂與信標燈 |

底座會從小擴大到虛線標示的最終範圍，高度最多 6 層。

| 區域 | 儲存位置（key） | 進度怎麼算 |
|---|---|---|
| PCIe Fabric | `learning-city-pcie-explorer-v2` | 完成的任務數 ÷ 6 |
| AI Coding | `learning-city:ai-coding:v2` | 答對或標記完成的章節數 ÷ 知識庫決定的總章數 |

清除網站資料，城市就會回到空地。

## 專案結構

```text
index.html, home.css, home.js     城市首頁（意圖、地圖、區域卡片）
regions/
  pcie/                           PCIe 區域（互動模擬、任務、測驗）
    knowledge_base/               PCIe 知識庫（Markdown、檢索索引、建置工具）
  ai-coding/                      AI Coding 區域
    index.html, app.js, ...       區域介面（互動章節＋知識庫章節）
    markdown.js                   筆記用的簡易、安全的 Markdown 渲染器
    knowledge_base/               AI Coding 知識庫（見下）
LEARNING_PLAN.md                  PCIe 區域的學習與改善計畫
.github/workflows/                GitHub Pages 部署
```

## AI Coding 區域的內容怎麼長出來

課程不是寫死在程式裡，而是由知識庫決定：

```text
notes/*.md ──build_knowledge_base.py──▶ web/catalog.js + web/notes/*.js ──▶ 區域頁與首頁讀取
```

新增或修改一篇筆記：

```bash
# 1. 在 regions/ai-coding/knowledge_base/notes/ 新增或編輯 .md
# 2. 重建網站目錄（會驗證筆記格式、頁碼、圖片）
python regions/ai-coding/knowledge_base/tools/build_knowledge_base.py --only web
# 3. 重新整理頁面：章節、週次、進度分母與首頁的建築都會跟著變
```

筆記格式、如何加入新的來源書、如何查詢原文，請看[知識庫 README](regions/ai-coding/knowledge_base/README.md)。

重點規則：

- `web/` 是**會 commit 的建置產物**。改了筆記卻忘記重建，網站就會是舊內容。
- 書籍原文只存在本機的 `rag/`（已加入 `.gitignore`），不進版本庫、不上網站。網站上是自己整理的筆記，附頁碼出處。

## 新增一個區域

1. 建立 `regions/<id>/index.html`，讓它把進度存進 `localStorage`，並提供回到 `../../index.html` 的連結。
2. 在 [home.js](home.js) 的 `REGIONS` 加一筆：`id`、名稱、`href`、地圖座標 `pos`，以及一個 `progress()` 函式，回傳 `{ done, total, unit, next }`。沒有 `href` 的項目會顯示為規劃中的空地。
3. 區域若有自己的知識庫，建議仿照 AI Coding 的做法：內容放資料檔，由建置工具產生給 UI 讀的目錄。這樣新增內容時不用改介面。

## 部署

推送到 `main` 會觸發 [GitHub Pages 部署](.github/workflows/deploy-pages.yml)，直接把整個 repo 當成靜態網站發布，不執行建置。因此任何產生的檔案（例如 `knowledge_base/web/`）都必須先在本機建置並 commit。

## 版權與資料

- 各區域知識庫的來源與授權由各自的 README 說明。
- AI Coding：書籍原文、PDF 與本機路徑（`rag/`、`sources/`、`sources.local.json`）都被忽略，不要加進版本控制，也不要把書中的長段原文貼進筆記。
- 筆記中的圖由本專案自行繪製；引用書中的數據或說法時，會標明是作者的個人經驗或需要校正。

## 已知限制

- 進度只存在單一瀏覽器的 `localStorage`，不跨裝置、不同步。
- AI Coding 的書籍來源是 Python 加各種 AI 工具的入門實作書，只涵蓋 Week 1–2 的主題；eval、agent 架構、MCP、安全、推論效能等後續週次還需要其他內容。
- PCIe 區域單獨使用只能建立入門的心智模型，尚不足以培養實務除錯能力，詳見 [LEARNING_PLAN.md](LEARNING_PLAN.md)。

## 授權

見 [LICENSE](LICENSE)。
