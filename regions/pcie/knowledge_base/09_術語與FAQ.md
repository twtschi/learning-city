# 術語與 FAQ

## 術語表

| 術語 | 中文解釋 |
|---|---|
| Ack / Nak | Data Link Layer 對 TLP 接收結果的正/負確認 DLLP |
| AER | Advanced Error Reporting，進階錯誤狀態、遮罩、嚴重度與記錄能力 |
| ASPM | Active State Power Management，Link 在 active/idle 間自動進低功耗 |
| BAR | Base Address Register，Function 宣告並接受 MMIO/I/O 範圍的設定欄位 |
| BDF | Bus/Device/Function，Function 在 PCI 拓撲中的邏輯 ID |
| Byte Enable | 指定 TLP 首尾 DW 中哪些 byte 有效 |
| Completion | 回應 Non-Posted Request 的 TLP，可帶資料或只帶狀態 |
| CPLH/CPLD | Completion Header/Data credit |
| CRS | Configuration Request Retry Status，Function 暫時未能回應設定存取 |
| DLLP | Data Link Layer Packet，只在相鄰 Port 間，承載 Ack/Nak、FC、PM 等 |
| DW | Doubleword，4 bytes |
| ECRC | End-to-End CRC / TLP Digest，可選的 Transaction Layer 完整性保護 |
| Endpoint | 位於 PCIe 拓撲葉節點的功能裝置 |
| FLR | Function-Level Reset，只重設指定 Function |
| Flow Control Credit | Receiver 公告的可用 buffer 資源計數 |
| LCRC | Link CRC，單一 Link 上保護 TLP Data Link 封裝 |
| Link | 兩個 PCIe Port 間的點對點連線，由一條或多條 Lane 組成 |
| LTSSM | Link Training and Status State Machine |
| MPS | Max Payload Size，單一帶資料 TLP 可用的最大 payload 設定 |
| MRRS | Max Read Request Size，Requester 單一 Memory Read 可要求的最大資料量 |
| MSI/MSI-X | 以 Memory Write TLP 傳送的 in-band interrupt 機制 |
| NPH/NPD | Non-Posted Header/Data credit |
| Ordered Set | Physical Layer 的 training/clock/power/control 序列，不跨 Link 路由 |
| PH/PD | Posted Header/Data credit |
| Posted | 不期待 Completion 的 Request；典型為 Memory Write |
| Non-Posted | 需要 Completion 的 Request；典型為 Read/Configuration/I/O |
| Replay Buffer | 保存尚未 Ack 的 TLP，以便 Nak 或 timeout 後重送 |
| Root Complex | CPU/Memory 與 PCIe hierarchy 的介面 |
| Root Port | Root Complex 對外連接一條 PCIe Link 的 Port |
| Switch | 以多個 PCI-to-PCI Bridge/Port 呈現、負責 TLP fan-out/routing 的元件 |
| Tag | Requester 分配給 Non-Posted Request，用於配對 Completion |
| TC | Traffic Class，TLP 的端到端流量類別 |
| TLP | Transaction Layer Packet，承載 Memory/I/O/Configuration/Message 交易 |
| UR | Unsupported Request |
| VC | Virtual Channel，每一 Link 的本地虛擬流量/Flow Control 資源 |

## FAQ

### PCIe 是 bus 還是 network？

軟體模型延續 PCI bus hierarchy，但實體/協定行為更像點對點 switched fabric。把它只看成共享 bus 會誤解頻寬、路由與可靠性。〔BOOK p.98-107〕

### x16 是否代表每一 Lane 都有 16 bits？

不是。x16 表示 16 條 Lane；每條 Lane 是一組 Tx 差動對與一組 Rx 差動對。〔BOOK p.105〕

### GT/s 為何不等於 GB/s？

GT/s 是每秒傳輸符號/bit interval；有效 bytes 還要扣 encoding overhead。Gen1/2 用 8b/10b，Gen3 用 128b/130b，且單向與雙向合計必須分清楚。〔BOOK p.102；BP p.13〕

### Switch 會轉送 Ack/Nak 嗎？

不會。Ack/Nak 是 DLLP，只屬於單一 Link。Switch 接收 TLP 後在下一條 Link 重新封裝並使用另一組 Sequence/LCRC/Ack/Nak。〔BOOK p.225、376-417〕

### Memory Write 收到 Ack 是否代表資料已寫入最終裝置？

不代表。Ack 只確認一跳正確接收；Memory Write 是 Posted，沒有端到端 Completion。〔BOOK p.119、128〕

### 為什麼 I/O Write 和 Configuration Write 仍需要 Completion？

這些操作通常直接改變裝置行為，需要確認是否成功；所以它們是 Non-Posted。〔BOOK p.119、209〕

### BAR 與 Bridge Base/Limit 有何差別？

BAR 讓 Function 宣告/接受自己的地址；Base/Limit window 讓每個上游 Bridge 知道哪些地址要往該下游子樹轉發。兩者缺一不可。〔BOOK p.185-203〕

### Vendor ID 讀到 FFFFh 一定是硬體壞掉嗎？

不一定。Enumeration 探測不存在的 BDF 時，Root 會把 UR 轉成全 1，這是正常的「不存在」表示。若預期裝置存在，再往 Link、bus number、reset/power 與 routing 查。〔BOOK p.164-165〕

### CRS 與 UR 有何不同？

UR 常表示目標不存在或不支援該 Request；CRS 表示 Configuration 目標存在但暫時未就緒，軟體/Root 應按規則稍後重試。〔BOOK p.165-166〕

### Flow Control 和 Replay 是否都在處理「重送」？

不是。Flow Control 在送出前確認 buffer 空間；Replay 是送出後偵測傳輸錯誤或 Ack timeout 才重送。〔BOOK p.274-303、376-417〕

### TC 和 VC 是同一個優先權嗎？

不是。TC 是 TLP 上的端到端分類；每一條 Link 再以 TC-to-VC Mapping 映射到本地 VC。VC 擁有各自 credits 與 arbitration。〔BOOK Ch.7；BP p.7〕

### Gen3 為何只到 8 GT/s 卻接近 Gen2 兩倍有效資料率？

因為 Gen3 把 8b/10b 的 20% overhead 改為 128b/130b 約 1.54% overhead。〔BOOK p.102、466-469；BP p.13〕

### Link 為何上電先跑 Gen1？

為相容性，training 先以 2.5 GT/s 建立；若雙方支援更高速度，再進 Recovery 升速。〔BOOK p.466、630〕

### L0s/L1 與 D0/D3 怎麼分？

L-state 是 Link；D-state 是 Function。裝置可處於某個 D-state，同時 Link 有另一個 L-state，兩者由規範限制合法組合。〔BOOK Ch.14、Ch.16〕

### LCRC 正常是否表示資料端到端沒有被破壞？

只表示本 Link 的 Data Link 封裝通過檢查。跨 Switch 的內部錯誤或端到端內容問題需依 ECRC、poison、AER 與 Completion 語意判斷。〔BOOK p.718〕

### 大量 Correctable Error 可以忽略嗎？

硬體雖已恢復，但持續增加通常代表 channel margin、clock/power noise、connector 或 equalization 問題，且 Replay 會傷害效能；應看趨勢、位置與速度/寬度關聯。〔BOOK Ch.15〕

