---
id: deep-tool-interface-design
title: 工具介面設計：給模型看的 API
kind: deepdive
attach: toolbox
week: 1
order: 10
minutes: 7
---
模型只看得到工具的名稱、描述與參數 schema，所以它們就是「API 文件」。幾條實用原則：

1. **名稱與描述要說「何時該用」**，而不只是「做什麼」。兩個功能相近的工具要在描述中說明差異，否則模型會亂選。
2. **參數越少越好，型別越窄越好**：用 enum 取代自由字串；必填與選填分清楚；給預設值。
3. **回傳精簡且可行動**：回傳模型下一步需要的資訊，不要整包 JSON 倒回去。長結果要分頁或截斷，並說明如何取得下一段。
4. **錯誤訊息要教模型怎麼修**：「path 必須在 repo 內，收到 `../x`」比「invalid argument」有用得多。
5. **以路徑與 ID 為單位，而非整段內容**：讓模型引用，不要複誦。
6. **編輯工具的設計影響成功率**：精確字串取代（要求 old 字串唯一）通常比讓模型輸出整份檔案或行號 diff 更不容易出錯，因為失敗時能明確報錯而不是靜默改壞。
7. **危險操作要分級**：唯讀、可逆寫入、不可逆操作各自不同的權限與確認流程。權限放在 harness，不要放在 prompt。

一個設計良好的工具定義長這樣（示意）：名稱與描述說明「何時該用」，參數窄而具體：

```json
{
  "name": "read_file",
  "description": "讀取 repo 內的文字檔。要找內容請先用 search_code；只想看符號定義請用 find_symbol。",
  "input_schema": {
    "type": "object",
    "properties": {
      "path":  {"type": "string", "description": "相對於 repo 根目錄的路徑，不可含 .."},
      "start": {"type": "integer", "minimum": 1, "description": "起始行，預設 1"},
      "limit": {"type": "integer", "minimum": 1, "maximum": 400, "description": "最多回傳幾行，預設 200"}
    },
    "required": ["path"]
  }
}
```

而錯誤訊息要教模型怎麼修，而不是只說失敗：

```text
錯誤：path "../x" 不在 repo 內。請使用相對於 repo 根目錄的路徑，例如 "src/net/client.cc"。
```

平行工具呼叫：模型可能在一次回應中提出多個彼此獨立的工具呼叫。harness 可以平行執行，但回傳 tool_result 時要與各自的 id 一一對應；有相依性的呼叫則必須循序進行。
