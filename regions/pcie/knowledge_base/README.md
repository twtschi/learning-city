# PCI Express 3.0 知識庫

本知識庫以兩份指定文件為唯一內容來源，將 1,057 頁的 MindShare 教材與 15 頁的架構藍圖整理成「可閱讀、可追溯、可機器檢索」的資料集。

## 快速入口

| 想了解的問題 | 入口 |
|---|---|
| PCIe 為何從 PCI/PCI-X 演進而來？系統由哪些元件組成？ | [01_架構與拓撲.md](01_架構與拓撲.md) |
| BDF、Configuration Space、Enumeration、BAR、三種路由如何串起來？ | [02_組態定址與路由.md](02_組態定址與路由.md) |
| TLP 的結構、Request/Completion、Posted/Non-Posted 是什麼？ | [03_事務層與TLP.md](03_事務層與TLP.md) |
| Credit、TC/VC、仲裁與 Ordering 如何影響效能和死結？ | [04_流量控制_QoS與排序.md](04_流量控制_QoS與排序.md) |
| LCRC、Sequence Number、Ack/Nak、Replay 如何保證逐跳可靠？ | [05_資料連結層.md](05_資料連結層.md) |
| Gen1/2 與 Gen3 編碼差異、Lane、LTSSM、Equalization 是什麼？ | [06_實體層與LTSSM.md](06_實體層與LTSSM.md) |
| Error、Power、Interrupt、Reset、Hot Plug 如何處理？ | [07_系統主題.md](07_系統主題.md) |
| 如何從症狀沿層級除錯？ | [08_除錯手冊.md](08_除錯手冊.md) |
| 縮寫、術語、常見問答 | [09_術語與FAQ.md](09_術語與FAQ.md) |
| 章節與原始 PDF 頁碼如何對照？ | [10_來源地圖.md](10_來源地圖.md) |

## 建議學習路徑

1. 先讀「架構與拓撲」，建立 Root Complex - Switch - Endpoint 的倒樹狀模型。
2. 再讀「組態定址與路由」，理解軟體如何先發現裝置，再讓封包有路可走。
3. 依序讀「事務層」「流量控制/QoS/排序」「資料連結層」「實體層」。
4. 最後讀系統主題與除錯手冊，把協定知識轉成定位問題的流程。

## 引用規則

- `〔BOOK p.N〕`：MindShare《PCI Express Technology 3.0》的 PDF 實體頁碼。
- `〔BP p.N〕`：`PCIe_3.0_Architecture_Blueprint.pdf` 的 PDF 實體頁碼。
- 頁碼是 PDF 檔案中的頁序，不是書頁下方的印刷頁碼；MindShare 書的印刷頁碼大致比 PDF 頁碼少 59。
- `BP` 是視覺化摘要；精確協定細節以 `BOOK` 對應章節為主。

## 機器檢索資料

`rag/pcie3_chunks.jsonl` 包含逐頁切分的原文、章節/小節、來源檔名與 PDF 頁碼，可匯入 RAG 管線。`search_kb.py` 提供不需 API key 的本機搜尋：

```powershell
cd E:\docs\learning-city\regions\pcie\knowledge_base
& python .\search_kb.py "Ack Nak replay"
```

中文問題可先查本知識庫的中文整理；要搜尋原書逐字內容時，使用英文術語效果較好。

## 範圍與限制

- 僅整理指定的 PCIe 3.0 時代資料，不推論 PCIe 4.0 以後新增的速度、編碼或功能。
- 本知識庫用於學習、設計溝通與除錯導引，不取代 PCI-SIG 正式規範、ECN 或產品 datasheet。
- 原書中的工具、產品與軟體環境屬 2012 年上下文；核心協定概念可用，產品資訊不應視為現況。

