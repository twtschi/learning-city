---
id: taulli-debug-review-docs
title: 除錯、文件與程式碼審查：讓 AI 提出假設，由你做實驗
kind: lesson
week: 2
order: 140
minutes: 22
source: ai-assisted-programming p.47-51
---
第 9 章先談三件常被忽略的工作：除錯、文件與程式碼審查（p.47–51）。書的態度很務實：除錯**不要一開始就找 AI**，傳統做法通常就夠了（p.48）；文件與審查則是 AI 很能幫上忙的地方。這一篇的主線是：**AI 擅長提出假設與整理資訊，驗證仍然要靠實驗與工具**。

標示方式：**【書】** 書中的說法（附頁碼）；**【實測】** 我在沙箱實際執行的結果；**【判斷】** 我的工程判斷。

## 書的內容

**除錯（p.47–48）**

- **【書】** 開發者大約有 35% 到 50% 的時間花在除錯（書引用一項研究，p.47）。
- **【書】** 兩類錯誤：**語法錯誤**（規則不符，例如少了冒號），現代 IDE 通常能偵測與修正；**邏輯錯誤**（語意不對），例如要過濾成年人，卻把 18 歲以上的人排除，剩下一堆未成年人（p.47）。
- **【書】** 使用 AI 不該是除錯的起點，傳統做法通常足夠：VS Code 有斷點、逐行執行、查看變數值（p.48）。AI 適合的場景：解讀冗長或隱晦的錯誤訊息與堆疊追蹤，prompt 範例是「這是什麼意思？{錯誤訊息}」；或貼上程式碼，說明「這支程式應該做 X，但執行時沒有出現，問題在哪裡？」（p.48）。

**文件（p.48–50）**

- **【書】** 文件是黏著劑，卻常被擱置。書引用 Stack Overflow 的調查：68% 的開發者每週都會撞到知識障礙；GitHub 2021 年的報告說，在文件中分享資訊可以讓團隊生產力提升多達 55%（p.49）。
- **【書】** 能產生的文件類型：使用手冊、README、API 文件、FAQ、疑難排解指南（p.49）。寫 prompt 時要考慮的原則：了解讀者、保持簡單、風格一致、展示而不是只講、善用圖表，以及「為什麼」和「怎麼做」一樣重要（p.49–50）。

**程式碼審查（p.50–51）**

- **【書】** 審查是程式碼進入主幹前的試駕，也是團隊互相學習、落實風格與安全檢查的機會；自動化工具不一定抓得到所有問題，有時需要人的眼睛看出隱微的資安風險（p.50）。
- **【書】** prompt 範例：「針對下列程式碼寫一份審查，聚焦可維護性、潛在的安全問題與效能缺陷。{程式碼}」。作者刻意給了一個寫得很差的函式，ChatGPT 的審查指出：資料庫連線寫死、**直接串接使用者 ID 造成 SQL injection 的風險**、缺少輸入驗證，以及組 SQL 的效能問題（p.50–51）。

## 除錯：把 AI 放進科學方法【判斷】

好的除錯是一個迴圈，AI 只是其中幾個步驟的助手：

1. **重現**：先讓錯誤穩定重現，最好是一個會失敗的測試。沒有重現，就沒有「修好了」這件事。
2. **縮小**：用二分法、最小輸入、關閉功能，把範圍縮到最小。
3. **假設**：這一步最適合 AI。請它根據證據列出**幾個**可能原因，每個都附上「怎麼用一個實驗證明或推翻它」。
4. **實驗**：由你執行，並把結果貼回去。
5. **修正與防止復發**：修正後，把重現用的測試留下來。

**給 AI 一份好的錯誤回報**，遠比只貼一行錯誤訊息有用：

```text
目標：這個函式應該做什麼（一句話）
實際：發生了什麼（錯誤訊息、堆疊追蹤、錯誤的輸出）
預期：應該看到什麼
重現：最小的輸入或步驟，或一個會失敗的測試
環境：語言與函式庫版本、作業系統
已試過：做過哪些實驗、結果如何
限制：請先列出 3 個可能原因與各自的驗證方法，不要直接給修正
```

三個常見的陷阱：

- **修症狀，不修原因**：AI 很容易提出「加一個 try/except」「加一個 null 檢查」，讓錯誤消失但原因還在。要追問「為什麼會是 null」。
- **貼上含祕密的日誌**：堆疊追蹤與日誌可能包含金鑰、使用者資料。貼進外部服務前先去識別化（見 Week 6 的風險登記表）。
- **接受第一個答案**：書也說，如果 ChatGPT 沒找到問題，要補充更多指示（p.48）。AI 找不到時，最好的補充是**新的證據**（更小的重現、更多日誌），不是同一句話再問一次。

## 程式碼審查：先定義威脅模型，再讓 AI 當第一輪【判斷】

書的 prompt 很通用（p.50）。把審查的範圍說清楚，結果會好很多：

- 這段程式碼處理什麼資料？資料從哪裡來、誰能控制？
- 要看哪些類別：注入、授權、錯誤處理、資源洩漏、併發、相容性？
- 輸出要附**位置與可重現的輸入**，而不是泛泛的建議。

AI 審查適合當**第一輪篩選**：它便宜、不累、能涵蓋風格與常見弱點；但它會漏掉、也會誤報，而且無法承擔責任。核准與責任仍然在人身上。把它和靜態分析工具（SAST）、型別檢查、測試放在一起用，各自抓不同類型的問題。

## Lab 1：書中那個 SQL injection，實際看它怎麼發生

書沒有給出那個「寫得很差的函式」的程式碼，只描述它直接串接使用者 ID（p.51）。下面是依這個描述寫的最小示範，加上用 `unittest` 寫成的回歸測試：

```python
import io, sqlite3, unittest

con = sqlite3.connect(":memory:")
con.executescript("create table users(id integer primary key, name text, secret text);"
                  "insert into users values (1,'alice','a-token'),(2,'bob','b-token'),(3,'carol','c-token');")

def get_user_unsafe(user_id):
    return con.execute(f"SELECT id, name FROM users WHERE id = {user_id}").fetchall()

def get_user_safe(user_id):
    return con.execute("SELECT id, name FROM users WHERE id = ?", (user_id,)).fetchall()

print("unsafe  '1'                 ->", get_user_unsafe("1"))
print("unsafe  '1 OR 1=1'          ->", get_user_unsafe("1 OR 1=1"))
print("unsafe  UNION 竊取 secret   ->", get_user_unsafe("0 UNION SELECT id, secret FROM users"))
print("safe    '1'                 ->", get_user_safe("1"))
print("safe    '1 OR 1=1'          ->", get_user_safe("1 OR 1=1"))

class InjectionRegression(unittest.TestCase):
    impl = None
    def test_normal(self):  self.assertEqual(type(self).impl("1"), [(1, "alice")])
    def test_or(self):      self.assertEqual(type(self).impl("1 OR 1=1"), [])
    def test_union(self):   self.assertEqual(type(self).impl("0 UNION SELECT id, secret FROM users"), [])

for label, fn in [("unsafe", get_user_unsafe), ("safe", get_user_safe)]:
    cls = type("T_" + label, (InjectionRegression,), {"impl": staticmethod(fn)})
    res = unittest.TextTestRunner(stream=io.StringIO()).run(unittest.defaultTestLoader.loadTestsFromTestCase(cls))
    print(f"{label:7s} ran={res.testsRun} failures={len(res.failures)} errors={len(res.errors)}")
```

**【實測】** 輸出：

```text
unsafe  '1'                 -> [(1, 'alice')]
unsafe  '1 OR 1=1'          -> [(1, 'alice'), (2, 'bob'), (3, 'carol')]
unsafe  UNION 竊取 secret   -> [(1, 'a-token'), (2, 'b-token'), (3, 'c-token')]
safe    '1'                 -> [(1, 'alice')]
safe    '1 OR 1=1'          -> []
unsafe  ran=3 failures=2 errors=0
safe    ran=3 failures=0 errors=0
```

- 串接版本在正常輸入下完全正常，這就是為什麼它能通過「典型案例」測試。
- 惡意輸入讓條件恆真，回傳所有人；用 `UNION` 甚至讀到不該回傳的欄位。
- 參數化查詢把輸入當成**資料**而不是 SQL 的一部分，所以同樣的輸入只會得到「找不到」。
- **回歸測試把審查意見變成永久的防線**：串接版本讓兩個測試失敗，參數化版本全部通過。審查指出的每個弱點，都應該留下一個這樣的測試。

## 文件：從程式碼產生的文件，記錄的是「程式碼做了什麼」，不是「應該做什麼」【判斷】

AI 從程式碼產生文件很快，但這裡有一個結構性的風險：文件是由實作推導出來的，所以**實作的錯誤會被忠實地寫進文件**，看起來還很專業。書強調「為什麼」和「怎麼做」一樣重要（p.50），這正是 AI 從程式碼最推不出來的部分。

| 文件 | 適合 AI 起草 | 必須由人提供或確認 |
|---|---|---|
| API 參考 | 是，最好從型別或 OpenAPI 產生 | 行為保證、錯誤碼的語意 |
| README 與快速上手 | 是 | 步驟是否真的能跑 |
| 設計決策與取捨 | 不適合 | 動機、替代方案、為什麼這樣選 |
| 疑難排解指南 | 可以起草 | 真實發生過的案例與解法 |

**讓文件可以被驗證**，是防止文件腐爛的最便宜辦法。Python 的 `doctest` 會執行文件字串裡的範例；範例與實作不一致時就會失敗：

```python
def clamp(x, lo, hi):
    """Return x limited to [lo, hi].

    >>> clamp(5, 0, 3)
    3
    >>> clamp(-1, 0, 3)
    0
    >>> clamp(7, 0, 3)
    7
    """
    return max(lo, min(x, hi))

if __name__ == "__main__":
    import doctest
    print(doctest.testmod())
```

**【實測】** 第三個範例是故意寫錯的「AI 常見的錯誤文件」，執行 `doctest` 會報告：

```text
Failed example:
    clamp(7, 0, 3)
Expected:
    7
Got:
    3
TestResults(failed=1, attempted=3)
```

把文件裡的範例當成測試跑，AI 寫出的錯誤範例就會在 CI 裡被攔下，而不是在讀者身上才發現。

## 檢查點

Q: 一位開發者把一個 AI 產生的 SQL 查詢函式交給 AI 審查，AI 回覆「沒有發現問題」。最合理的處理是？
- [ ] 通過了審查，可以合併
- [ ] 換另一個 AI 工具重複審查，兩個都通過就合併
- [x] 把它當作第一輪篩選：由人依威脅模型檢查輸入來源，並用惡意輸入寫成回歸測試，再搭配靜態分析或參數化查詢的規範
- [ ] 完全不要使用 AI 審查
解釋: AI 審查有誤報也有漏報，沒有發現問題不等於沒有問題。把已知的攻擊輸入寫成測試，可以把審查意見變成永久的防線；多個 AI 同時漏掉，也不代表真的沒有，因為它們可能犯相關的錯誤。

## 思考練習

Q: 團隊成員習慣一遇到錯誤就把錯誤訊息貼給 AI，再直接套用它的修正。請設計一個更可靠的除錯流程，並說明 AI 的角色。
- 先重現：寫一個會失敗的測試，這也是修正完成的證據。
- 縮小範圍：二分法或最小輸入，並記錄已做過的實驗。
- 讓 AI 列出多個假設與各自的驗證實驗，而不是直接給修正；由人執行實驗並回報結果。
- 追問根因，避免用 try/except 或 null 檢查掩蓋症狀。
- 貼給外部服務前去除祕密與個資；修正後保留重現測試。
