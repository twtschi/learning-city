---
id: glossary
title: 術語表
kind: lesson
week: 1
order: 90
minutes: 5
---
- **Token**：tokenizer 切出的子字串，對應詞表中的整數 ID，是計費與 context 的單位。
- **Context window**：單次請求輸入加輸出的 token 上限。
- **Logit / Softmax**：模型輸出的原始分數／把分數轉成機率分佈的函數。
- **Temperature**：取樣前對 logit 的縮放，越低分佈越尖，越高越平。
- **Top-p（nucleus）**：只在累積機率達 p 的最小候選集合中取樣。
- **Prefill / Decode**：處理輸入的階段／逐 token 生成輸出的階段。
- **KV cache**：保留每個已處理 token 的 key 與 value，避免重算。
- **TTFT / TPOT**：首 token 延遲／之後每個 token 的間隔。
- **GQA / MQA**：多個 query head 共享較少的 KV head，以降低 KV cache 大小。
- **Continuous batching**：請求隨時加入與離開批次，提高硬體使用率。
- **Prompt caching**：重用相同前綴的處理結果以降低成本與延遲。
- **Tool use**：模型以結構化區塊請求呼叫工具，由 harness 驗證並執行。
- **Harness**：包住模型的程式：組 context、執行工具、做驗證與限額。
- **Eval**：用可重複的測試集與指標衡量系統好壞。
