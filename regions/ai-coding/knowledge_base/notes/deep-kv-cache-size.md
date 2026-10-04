---
id: deep-kv-cache-size
title: KV cache 到底多大
kind: deepdive
attach: inference
week: 1
order: 10
minutes: 7
---
自回歸解碼時，每個已處理的 token 在每一層都要保留它的 key 與 value，後續 token 才能對它做 attention，這份資料就是 KV cache。每個 token 的 KV cache 大小：

`2 × 層數 × KV head 數 × head 維度 × 每元素位元組數`

用 C++ 寫成一個編譯期就能檢查的小函式最直觀：

```cpp
constexpr std::size_t kv_bytes_per_token(int layers, int kv_heads,
                                         int head_dim, int bytes_per_elem) {
  return 2ull * layers * kv_heads * head_dim * bytes_per_elem;  // K 與 V 各一份
}

// 假設值：80 層、8 個 KV head（GQA）、head_dim 128、FP16
static_assert(kv_bytes_per_token(80, 8, 128, 2) == 327'680);
// 10 萬 token 的單一請求：327'680 * 100'000 ≈ 32.8e9 bytes ≈ 33 GB
```

範例（假設值，僅供算數練習）：80 層、8 個 KV head（使用 GQA）、head 維度 128、FP16（2 bytes）：

`2 × 80 × 8 × 128 × 2 = 327,680 bytes ≈ 320 KiB / token`

- 10 萬 token 的單一請求約需 **33 GB** 的 KV cache（十進位約 32.8 GB）。
- 若沒有 GQA 而是每個 attention head 都有自己的 KV（例如 64 個 head），同樣的算式會是 8 倍。
- 因此**長 context 與大 batch 會直接爭奪顯存**，這是服務端限制併發量的主因之一。

降低 KV cache 壓力的常見手段：GQA / MQA（共享 KV head）、KV cache 量化、分頁管理（PagedAttention 一類的做法，減少碎片）、限制或淘汰長 context。每一項都有品質、複雜度或延遲上的取捨。

另外，decode 每一步都要讀取整份 KV cache，所以 context 越長，每個 token 的 decode 越慢，不只是容量問題。
