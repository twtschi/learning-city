---
id: deep-tokenizer
title: Tokenizer 為什麼會影響成本與行為
kind: deepdive
attach: tokens
week: 1
order: 10
minutes: 5
---
多數 LLM 使用 subword tokenizer（常見是 byte-level BPE 一類的演算法）：先從單一位元組出發，反覆把最常一起出現的相鄰片段合併成新的 token，直到詞表達到目標大小。結果是常見字串變成單一 token，罕見字串被拆成很多小片段。

用一個極小的例子看 BPE 合併在做什麼（示意，真實的訓練在位元組層級、詞表有數萬到數十萬項）：

```python
# 起點：每個字元一個 token
tokens = list("low lower lowest")
# 統計最常出現的相鄰配對，把它合併成新 token，重複直到詞表夠大
#   第 1 輪：("l","o") 最常見 → 合併成 "lo"
#   第 2 輪：("lo","w") 最常見 → 合併成 "low"
#   ……
# 結果：常見片段 "low" 變成單一 token；罕見的 "est" 可能仍被拆成多個
```

對工程的直接影響：

- **不同模型的 tokenizer 不同**：同一段文字在不同模型下 token 數可能差很多。比較成本時要用各自的 token 計數，不能只比單價。
- **程式碼與非英文通常比較「貴」**：縮排、符號、識別字、中日韓字元都可能被切得更碎。大檔案很快吃光預算。
- **罕見字串容易出怪事**：很長的雜湊值、UUID、base64 不但佔 token，模型逐字複製時也更容易出錯。能用參照（路徑、ID）就不要整段貼。
- **計算要用官方的計數方式**：API 通常提供 token counting。自己用字元數除以 4 只能粗估。

C++ 類比：tokenizer 是一個「訓練出來的」lexer，詞表像是 interning 之後的 symbol table，只是邊界由資料統計決定，不是由文法決定。
