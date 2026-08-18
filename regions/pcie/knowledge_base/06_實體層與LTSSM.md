# 實體層與 LTSSM

## Physical Layer 的工作

Physical Layer 分成 Logical 與 Electrical 觀念區塊，負責：

- TLP/DLLP framing 與 Ordered Set 插入。
- 多 Lane byte striping、接收端 un-striping/de-skew。
- Scrambling/descrambling。
- Gen1/2 的 8b/10b 或 Gen3 的 128b/130b。
- Serialization/deserialization、clock data recovery、elastic buffer。
- Link detection、training、速度/寬度協商、polarity inversion、可選 lane reversal。
- 電氣訊號、通道損耗、equalization 與眼圖裕量。

〔BOOK p.420-703；BP p.12-13〕

## 傳送與接收管線

```text
Tx: packet bytes -> framing -> byte striping -> scrambling -> encoding -> serializer -> differential link
Rx: differential link -> CDR/deserializer -> decoding -> descrambling -> de-skew/un-striping -> packet filtering
```

實際順序與細節依 Gen1/2 或 Gen3 而異；規範定義行為責任，不強迫某一微架構。〔BOOK p.423-431〕

## Gen1/Gen2 與 Gen3

| 特性 | Gen1/Gen2 | Gen3 |
|---|---|---|
| Signaling rate | 2.5 / 5.0 GT/s | 8.0 GT/s |
| Encoding | 8b/10b | 128b/130b |
| 編碼 overhead | 20% | 約 1.54% |
| 邊界/控制 | K-code control characters | 2-bit Sync Header、Data/Ordered-Set Blocks、Framing Tokens |
| 鎖定 | Bit + Symbol Lock | Bit + Block Alignment |
| Equalization | 較固定的 Tx de-emphasis | 更完整的 Tx/Rx Equalization 與 training phases |

Gen3 沒把速率直接拉到 10 GT/s，而是以 8 GT/s 配合低 overhead 編碼，達到接近 Gen2 兩倍的有效頻寬，同時需要更強的信號補償。〔BOOK p.102、440、466-474；BP p.13〕

## 8b/10b 的目的

8b/10b 不只是浪費 20% 頻寬；它提供 transition density、DC balance、control character 與非法碼檢出能力。Receiver 用 COM character 找到 10-bit Symbol 邊界；running disparity 協助維持 DC balance。〔BOOK p.440-455〕

## Gen3 128b/130b

每 Lane 的 Block 是 2-bit Sync Header + 128 bits payload。Sync Header 區分 Data Block 與 Ordered Set Block；Data Block 內用 Token 表示 STP、SDP、END/EDB、IDL 等 framing 語意。Scrambling 仍用來改善頻譜特性，但不再靠 8b/10b K-code。〔BOOK p.466-505〕

## Multi-Lane

- Byte Striping 把連續 bytes 依序分配到各 Lane，提高並行頻寬。
- 接收端需做 Lane-to-Lane de-skew 後才能還原原始順序。
- Lane polarity inversion 必須由 Receiver 自動偵測並校正。
- Lane reversal 是可選能力；板級設計不能假設兩端必定支援。
- Link 可降寬運作，但需透過 LTSSM 協商。

〔BOOK p.431、564-575；BP p.12〕

## Ordered Sets

Ordered Set 由 Physical Layer 產生與消耗，常見用途：

- TS1/TS2：Link training、Link/Lane number、速度能力、控制資訊。
- SKP Ordered Set：clock tolerance compensation，避免 elastic buffer overflow/underflow。
- FTS：從 L0s 回 L0 時協助快速重新取得 lock。
- EIOS/EIEOS：進出 Electrical Idle。
- Compliance patterns：電氣量測與符合性測試。

Ordered Set 不上交 Data Link Layer，也不跨 Switch 路由。〔BOOK p.448、564-703〕

## LTSSM 高層地圖

```text
Detect -> Polling -> Configuration -> L0
                         ^            |
                         |            +-> Recovery -> L0 / Configuration
                         +------------------------------

L0 <-> L0s
L0 <-> L1
L0 -> L2 -> Detect
Disabled / Loopback / Hot Reset / Compliance 為特殊分支
```

- **Detect**：偵測對端 receiver termination。
- **Polling**：建立 bit/symbol/block lock，交換 training ordered sets。
- **Configuration**：協商 Link/Lane number 與最終 width。
- **L0**：正常 TLP/DLLP 流量。
- **Recovery**：重新取得 lock、重訓、變更速度/寬度、Gen3 equalization。
- **L0s/L1/L2**：逐漸更深的低功耗 Link state，退出延遲與保存內容不同。

〔BOOK p.564-703〕

### 上電一定先從 Gen1 開始

Link training 為相容性先以 2.5 GT/s 建立；若兩端宣告更高速率，進入 Recovery 嘗試升至共同支援的最高速度。看到裝置先 Gen1 後進 Recovery 不一定是錯誤，而是正常升速流程。〔BOOK p.466、630〕

## Gen3 Equalization

Gen3 在 Recovery.Equalization 交換 preset/coefficient，分 phase 協調兩端 transmitter 設定並由 receiver 評估。若通道條件或設定不合適，可能停在較低速度、重複 Recovery，或發生 correctable errors/replay。〔BOOK p.469、630-656〕

## 電氣與協定症狀的連結

| 觀察 | 可能層級 |
|---|---|
| Detect 反覆失敗 | termination、連接器、電源/Reset、Lane wiring |
| Polling/Configuration 反覆 | TS1/TS2、lock、Lane numbering、polarity、width negotiation |
| Gen1/2 正常但 Gen3 失敗 | insertion loss、equalization、jitter、preset/coefficient、通道裕量 |
| L0 中 LCRC/Nak 增加 | BER、crosstalk、clock/power noise、邊界條件 |
| 進出 L0s/L1 後才失敗 | electrical idle exit、FTS/EIEOS、ASPM timing |

