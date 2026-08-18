# 流量控制、QoS 與排序

## Credit-Based Flow Control

PCIe 不先送 TLP 再等對方說「buffer 滿了」，而是接收端先公告可用 buffer credits；傳送端只有在 credits 足夠時才可送。這避免 receive buffer overflow，也避免 PCI 式 wait-state、disconnect、retry。Flow Control 是每個 Link、每個方向、每個 VC 分別管理。〔BOOK p.274-303；BP p.8〕

## 六類 Credit

每個 VC 的 TLP buffer 分為三種 traffic category，且 Header/Data 分開：

| 類別 | Header Credit | Data Credit | 例子 |
|---|---|---|---|
| Posted | PH | PD | Memory Write、Message |
| Non-Posted | NPH | NPD | Memory Read、Configuration、I/O |
| Completion | CPLH | CPLD | Completion / Completion with Data |

Read Request 只消耗 NPH；Memory Write 同時消耗 PH 與 PD。傳送前必須確認該 TLP 所需的所有 credit 均足夠。〔BOOK p.277〕

## Credit 的生命週期

1. Link 初始化時以 InitFC1/InitFC2 類 DLLP 公告初始容量。
2. Transmitter 以本地計數器追蹤已公告上限與已消耗 credit。
3. Receiver 取走/處理 buffer 內容後，發送 UpdateFC DLLP 公告新的可用量。
4. 計數器使用模數運算並允許 rollover，不能用普通大小比較解讀。

DLLP 本身不受 Flow Control，否則更新 credit 的封包可能被 credit 卡住而形成自我死結。〔BOOK p.286-303、368；BP p.8〕

## Flow Control 不等於 Ack/Nak

- Flow Control 回答：「對方有空間收這個類別的 TLP 嗎？」
- Ack/Nak 回答：「剛才送出的 TLP 在這一跳是否正確到達？」
- Completion 回答：「Non-Posted Request 的端到端操作結果是什麼？」

三者位於不同責任層，任何除錯都應先辨識卡在哪一個回饋迴路。

## QoS：TC、VC、仲裁

### Traffic Class (TC)

Requester 在 TLP Header 指定 3-bit TC（TC0-TC7）。TC 表示端到端的流量類別，不等同於實體佇列。〔BOOK p.304-343；BP p.7〕

### Virtual Channel (VC)

每一跳以 TC-to-VC Mapping 把 TC 映射到該 Link 的 VC。VC 有獨立 Flow Control 資源，可隔離流量並降低 head-of-line blocking。VC0 必須存在；其他 VC 是否實作與啟用取決於裝置能力與軟體設定。〔BOOK p.304-343〕

### VC Arbitration

當多個 VC 同時要使用同一 Physical Link，Port 需仲裁。可採 strict priority 或 weighted round robin 等機制。Strict priority 延遲低但可能餓死低優先流；WRR 可分配頻寬但增加排程複雜度。〔BP p.7；BOOK Ch.7〕

> TC 是封包的端到端分類；VC 是每一 Link 的本地資源與傳送路徑。兩者不可互換。

## Transaction Ordering

Ordering 規則主要適用於相同 TC 的交易；不同 TC 沒有彼此 ordering 關係。不同 VC 也沒有必須維持的 ordering。實作可能為簡化而對整個 VC 採更保守的排序。〔BOOK p.344-346〕

### Producer/Consumer 動機

典型流程：Producer 先 Posted Write 資料，再寫一個 flag；Consumer 讀 flag，看到更新後才讀資料。若 fabric 讓 flag write 越過 data write，Consumer 可能看到新 flag 卻讀到舊資料。因此某些 Posted Write 之間必須維持順序。〔BOOK p.344-355；BP p.11〕

### 為何有些封包必須越過前方封包

若所有封包都嚴格 FIFO，Non-Posted Request 或 Completion 可能被前方等待中的 Posted/Non-Posted traffic 卡住，形成 protocol deadlock。PCIe ordering table 同時在「維持程式語意」與「允許必要繞行」間取得平衡。〔BOOK p.344-363〕

### 效能放寬

- **Relaxed Ordering (RO)**：Requester 宣告此交易允許更多重排，以降低阻塞。
- **ID-Based Ordering (IDO)**：在允許條件下，把不同 Requester/Completer ID 的交易視為彼此無依賴。
- **No Snoop (NS)**：描述 cache coherency/snoop 屬性，不是單純「可以亂序」的同義詞。

這些 bit 是效能承諾，也是正確性承諾。只有當軟體、裝置與系統確定沒有資料相依時才可設定。〔BOOK p.242、344-363〕

## 常見效能瓶頸判讀

| 症狀 | 優先檢查 |
|---|---|
| Link utilization 低、TLP 間大量空洞 | 對端 credits、UpdateFC、Replay、L-state 進出 |
| Read latency 高但 Write throughput 正常 | Outstanding tags、Completion latency、RCB/MRRS、CPL credits |
| 某流量類別長期飢餓 | TC-to-VC mapping、VC arbitration、strict priority |
| 多流合併後吞吐急降 | Head-of-line blocking、是否只有 VC0、ordering 過度保守 |
| 週期性吞吐崩落 | Replay timeout、LCRC error、credit update 週期或電源狀態切換 |

