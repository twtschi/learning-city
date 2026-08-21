# Learning City：PCIe 初學者學習與改善計畫

## 結論與範圍

Learning City 目前適合建立 PCIe 的正確入門心智模型，尚不足以單獨培養可在實務工作中分析與除錯的專業能力。現階段唯一開放的 PCIe Fabric 區域應定位為「互動地圖與第一堂課」：先建立拓撲、封包與通道的直覺，再接往規格、實機觀察和故障案例。

## 初學者使用計畫

### 第一階段：建立地圖，不背縮寫（30 分鐘）

1. 進入 **PCIe Fabric**。
2. 閱讀「先懂城市，再看封包」：
   - Link 是路。
   - Device 是角色。
   - TLP 是帶地址的包裹。
3. 以自己的話回答：
   - PCIe 在電腦內連接誰和誰？
   - Root Complex、Switch、Endpoint 各做什麼？
   - 為什麼資料需要封裝成 TLP？

**完成標準：**不看頁面也能解釋 Root Complex 連接 CPU／記憶體世界、Switch 依目的地分流、Endpoint 提供實際功能。

### 第二階段：走一次拓撲路徑（20–30 分鐘）

1. 開啟 **Gate 00: Find the Root**。
2. 依序觀察 Root Complex、Fabric Switch、GPU Foundry 或 NVMe Storage。
3. 在節點檢視器記下 Address、Link Width、TX Rate、Latency。
4. 畫出：

```text
CPU / Memory → Root Complex → Switch → GPU / NVMe / NIC
```

**完成標準：**能指出 GPU 並不直接「住在」CPU 裡，而是經由 PCIe Link 與可能存在的 Switch 相連。

### 第三階段：觀察請求與回覆（20 分鐘）

1. 發送一個 TLP。
2. 在 Packet Stream 找到 `MRd` 和 `CPL`。
3. 點選 GPU 或 NVMe，確認它是 Endpoint。
4. 用一句話描述：Root Complex 發出讀取請求，Switch 導向目標 Endpoint；目標用 Completion 回覆。

**完成標準：**能分辨請求與回覆，不把 TLP 誤認成裝置或實體線路。

### 第四階段：名詞接回圖上（20–30 分鐘）

1. 在名詞圖鑑先看「城市角色」：Root Complex、Switch、Endpoint。
2. 再看「封包與通道」：Lane、Link Width、TLP、Completion。
3. 每張卡都回到城市中的對應節點。

**完成標準：**能正確配對 Lane、Link Width x8、TLP、Completion 的白話定義。

### 第五階段：用測驗驗收（10–15 分鐘）

完成五題測驗，目標 5／5。答錯時先回到對應名詞卡或節點，能解釋原因後再答，不靠猜測。

### 第六階段：觀察流量控制（15 分鐘）

切換 Balanced、Burst、Quiet，觀察封包數量、Fabric Load、Flow Credits。只把數字當作概念模擬：流量增加時需要流量控制；Credits 用來避免接收端被資料淹沒。

**注意：**頁面中的流量、延遲與百分比是教學模擬，不是實際電腦 PCIe 匯流排量測。

## 專業能力路徑

| 層級 | 能力目標 | 可驗證產出 |
| --- | --- | --- |
| 入門 | 看懂拓撲與封包角色 | 畫出 Root → Switch → Endpoint |
| 基礎 | 理解 Configuration Space、Enumeration、BAR、Memory Read/Write | 判讀簡化 `lspci -vv` 輸出 |
| 實務 | 理解 Link Training、ASPM、AER、MPS/MRRS、IOMMU | 定位常見裝置或連線問題 |
| 進階 | 理解 Transaction、Data Link、Physical Layer、ordering、flow control、bandwidth | 分析效能或錯誤案例 |

## 產品改善原則

1. 任務必須有指定觀察、出口題與正確完成條件；不得只因點擊而取得 XP。
2. 保存任務結果、測驗作答、錯誤概念與複習項目。
3. 以固定可重播的情境取代純隨機流量，例如 GPU Read、NVMe Completion、Link 降速與 Credit 不足。
4. 所有模擬數字須明確標記為模擬；另以實機輸出與公開技術來源建立證據鏈。
5. 每課標示目標、前置知識、時間、驗收條件、延伸資料與實作練習。
