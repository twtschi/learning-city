# 事務層與 TLP

## Transaction 的基本語法

Transaction Layer 接收裝置核心提出的操作，把目標、來源、命令、長度、屬性與資料組成 TLP。一次 Transaction 是一個 Request 加上它所需要的零個或多個 Completion。〔BOOK p.118-124、228-233〕

## Posted 與 Non-Posted

| Request | 類別 | Completion |
|---|---|---|
| Memory Write | Posted | 不得回 Completion |
| Message | Posted | 通常不回 Completion |
| Memory Read / Memory Read Lock | Non-Posted | 回一個或多個 Completion with Data，或錯誤 Completion |
| I/O Read / Write | Non-Posted | 必須回 Completion |
| Configuration Read / Write | Non-Posted | 必須回 Completion |
| AtomicOp | Non-Posted | 回含原值的 Completion with Data |

Memory Write 的 Posted 語意提高效能，但 Requester 不會收到端到端成功通知；逐跳 Data Link Ack 只證明每段 Link 已可靠交付，不等於最終裝置已完成寫入。I/O/Configuration Write 會直接改變裝置狀態，因此保留 Completion。〔BOOK p.119、128、208-209；BP p.5〕

## TLP 結構

```text
[Header: 3DW/4DW] [Data Payload: optional, 0-1024 DW] [ECRC: optional, 1DW]
```

- **Header**：12 或 16 bytes；定義 Fmt/Type、Length、TC、Attr、Requester/Completer ID、Tag、Address、Byte Enable 等。
- **Payload**：最大 1024 DW = 4096 bytes；實際可用大小還受 Max Payload Size 等設定限制。
- **ECRC/Digest**：可選的端到端 CRC，保護 Transaction Layer 視角的內容。
- Data Link Layer 之後另加 12-bit Sequence Number 與 32-bit LCRC；它們不是 TLP Header 的一部分。

〔BOOK p.231-242；BP p.5、9〕

## Fmt/Type 決定如何解碼

接收端先用 Fmt 判斷 3DW/4DW 及是否有 Data，再用 Type 判斷 Memory、I/O、Configuration、Completion 或 Message。相同欄位位置會依 TLP 類型有不同意義，所以封包解碼不可只看單一欄位。〔BOOK p.233-239〕

## Transaction Descriptor

跨多跳仍保持的關鍵資訊：

- **Transaction ID = Requester ID + Tag**：Requester 用它把 Completion 對回原始 Non-Posted Request。
- **Traffic Class (TC)**：由 Requester 指定，沿路保持；每個 Link 上再映射到某個 VC。
- **Attributes**：Relaxed Ordering、No Snoop、ID-based Ordering 等。

〔BOOK p.241-242〕

## Length、Byte Enable 與對齊

- Length 以 DW（4 bytes）為單位，`0000000000b` 編碼代表 1024 DW，而不是 0。
- Payload 第一個 byte 對應最低地址。
- First/Last DW Byte Enable 決定首尾 DW 的有效 byte。
- 中間 DW 必須完整有效；多 DW Request 的 Byte Enable 必須遵守連續性與對齊規則。
- Length 只計 payload，不包含 Header/ECRC。

〔BOOK p.237-242〕

## Read Request 與 Completion

Memory Read Request 沒有資料 payload，帶著 address、length、Requester ID 與 Tag。Completer 可把資料拆成多個 Completion with Data；Requester 依 Transaction ID、Byte Count、Lower Address 等欄位重組。單一 Read Request 不保證只回一個 Completion。〔BOOK p.124、255-261〕

常見 Completion Status：

- **SC**：Successful Completion。
- **UR**：Unsupported Request。
- **CRS**：Configuration Request Retry Status，只用於 Configuration。
- **CA**：Completer Abort。

## Memory Write 的完成語意

Memory Write 沒有 Completion，因此「TLP 已被 Ack」只代表該 Link 的接收端正確收到。若軟體需要確認先前 Posted Write 已在 ordering 規則下向前推進，通常要透過後續 Non-Posted Read/Completion 建立可觀察的 ordering point；不能把 Data Link Ack 當成 device-level commit。〔BOOK p.128-130、344-363〕

## Message TLP

Message 把原本的 sideband/特殊事件改成 in-band packet，可承載：

- Legacy INTx assert/deassert。
- Power Management event/handshake。
- Error Message（ERR_COR、ERR_NONFATAL、ERR_FATAL）。
- Set Slot Power Limit。
- Vendor-Defined Message。
- 其他規範定義訊息。

Message 多為 Posted，並可依 address、ID 或 implicit routing 傳送。〔BOOK p.262-272、222-224〕

## ECRC 與 LCRC 不同

| 項目 | ECRC | LCRC |
|---|---|---|
| 層級 | Transaction Layer | Data Link Layer |
| 範圍 | 端到端；中間 Switch 通常轉送 | 單一 Link；每跳重新產生/檢查 |
| 是否可選 | 可選能力 | TLP 逐跳可靠性核心機制 |
| 錯誤處理 | AER/ECRC error、可能丟棄或 poison/report | Nak/Replay 或 timeout replay |

Header 中合法可變的欄位不直接參與 ECRC 原值計算；書中以 Configuration Type bit 與 EP bit 為例。〔BOOK p.718〕

## 封包閱讀順序

拿到 analyzer trace 時，建議依序判讀：

1. Fmt/Type：這是哪種 TLP、是否帶資料、3DW 或 4DW？
2. Routing key：Address、Completer ID 或 implicit code？
3. Requester ID + Tag：能否與 Completion 配對？
4. Length、Byte Enable、Lower Address、Byte Count：資料範圍是否吻合？
5. TC/Attr：是否允許重排或映射到不同 VC？
6. Completion Status 或 EP/TD：是否有錯誤語意？
7. 再往下看 Sequence Number、LCRC、Ack/Nak；不要把不同層的錯誤混在一起。

