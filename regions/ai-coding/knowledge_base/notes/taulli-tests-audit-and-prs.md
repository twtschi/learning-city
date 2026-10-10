---
id: taulli-tests-audit-and-prs
title: 稽核 AI 寫的單元測試，以及怎麼寫好 PR 描述
kind: lesson
week: 2
order: 150
minutes: 25
source: ai-assisted-programming p.51-55
---
這一篇延續〈用 AI 產生單元測試，以及它的盲點〉（Morgan 那本書的整理），但用 Taulli 第 9 章的具體例子做一次**完整的稽核**：書中那份 AI 產生的測試，其實有幾個在原本的函式上就會失敗。這個例子很適合用來練習「測試本身也要被驗證」。後半談 PR 描述與 AI 摘要（p.54–55）。

標示方式：**【書】** 書中的說法（附頁碼）；**【實測】** 我在沙箱實際執行的結果；**【判斷】** 我的工程判斷。

## 書的內容

- **【書】** 單元測試是對程式一小部分（幾個函式或方法）的迷你評估，常用 JUnit（Java）、NUnit（.NET）、pytest（Python）。好處：減少 bug、更容易修改、也像是軟體的使用說明；測試通常自動化、執行快、要頻繁跑（p.51）。
- **【書】** 範例是一支小費計算器：`tip_calculator(bill_amount, tip_percentage)` 回傳含小費的總額（p.51）。作者請 ChatGPT 針對典型與邊界案例（零、負的帳單、高小費、無效輸入）建議單元測試，結果是 Fig 9-1 的 `run_tests()`，用一連串 `assert` 寫成（p.52–53）。
- **【書】** 如果要用測試框架，可以請它用 `unittest`；也可以把既有的測試檔給它，問「還缺哪些測試」（p.52）。
- **【書】** David Lee 的提醒：涉及真實資料庫與 Docker 的測試，難度會升高；他認為 ChatGPT 可能無法完全理解，你多半得先手寫幾個測試，尤其是資料庫連線的部分，讓它學會怎麼寫其他的（p.52）。
- **【書】** 作者的結論：AI 可以幫忙寫單元測試，但遠非萬無一失，大型程式碼庫的結果可能偏離（p.52）。

## Lab 1：把書中 AI 測試的七個案例，真的跑一次

先照書中的函式（三行）與 Fig 9-1 的七個案例，用一個表格重寫並執行：

```python
def tip_calculator(bill_amount, tip_percentage):
    tip_amount = bill_amount * (tip_percentage / 100)
    total_amount = bill_amount + tip_amount
    return total_amount

cases = [
    ("typical",        (50, 20),       60),
    ("zero bill",      (0, 15),        0),
    ("negative bill",  (-50, 20),      0),
    ("100% tip",       (50, 100),      100),
    ("tiny boundary",  (0.01, 0.01),   0.01),
    ("large",          (100000, 50),   150000),
]
for name, args, expected in cases:
    got = tip_calculator(*args)
    print(f"{name:14s} expected={expected!r:8} got={got!r:22} {'PASS' if got == expected else 'FAIL'}")
try:
    tip_calculator("fifty", 20)
    print("invalid input: no exception")
except ValueError:
    print("invalid input: ValueError (matches the AI test's expectation)")
except Exception as e:
    print("invalid input: raised", type(e).__name__, "-", e, "(NOT ValueError)")
```

**【實測】** 輸出：

```text
typical        expected=60       got=60.0                   PASS
zero bill      expected=0        got=0.0                    PASS
negative bill  expected=0        got=-60.0                  FAIL
100% tip       expected=100      got=100.0                  PASS
tiny boundary  expected=0.01     got=0.010001               FAIL
large          expected=150000   got=150000.0               PASS
invalid input: raised TypeError - can't multiply sequence by non-int of type 'float' (NOT ValueError)
```

七個案例裡，**三個對這個函式本身就不成立**，而且三個是不同種類的錯：

| 案例 | AI 的期望 | 實際 | 問題類型 |
|---|---|---|---|
| 負的帳單 | 0 | -60.0 | **規格未定義**：函式沒有說負數該怎麼辦，AI 猜了一個期望值。圖中 AI 自己的註解也提醒「依函式的預期行為更新期望值」 |
| 0.01 的帳單、0.01% 小費 | 0.01 | 0.010001 | **期望值算錯**：忘了還有 0.01% 的小費；這也示範了用 `==` 比較浮點數的風險 |
| 無效輸入（字串） | `ValueError` | `TypeError` | **對例外型別的假設錯**，函式本來就沒有任何驗證；圖中 AI 的註解也說這需要在函式裡加例外處理 |

另外還有一個結構性的問題：書中無效輸入的測試是用 `try` 包起來，**沒有拋例外時只是印出一行文字**，並不會讓測試失敗。這種**永遠不會失敗的測試**，比沒有測試更糟，因為它製造安全感。

**【判斷】** 這個例子的教訓：

1. AI 產生的測試是**對規格的猜測**，不是規格本身。規格不清楚時，它會替你決定，而且決定得很自信。
2. 測試產生後**一定要先對著現有程式跑一次**，每個失敗都要分類：是程式錯、期望值錯，還是規格沒定義？
3. 檢查測試**會不會失敗**：拿掉某個行為、故意破壞程式，看它是否變紅。

## 先寫規格，再寫測試與實作

把「規格未定義」補起來。**以下是我為示範設定的規格**（不是書中的）：

| 輸入 | 規則 |
|---|---|
| 帳單 | 必須是有限的數字（不含布林）；小於 0 拋 `ValueError`；非數字拋 `TypeError` |
| 小費百分比 | 必須是有限的數字；範圍 0 到 100（含）；超出拋 `ValueError` |
| 輸出 | 以 `Decimal` 表示，四捨五入（0.005 進位）到分 |

## Lab 2：用突變測試檢查「測試的強度」

突變測試的想法：**故意在程式裡放一個小錯誤（突變體），如果測試仍然全綠，這組測試就沒有抓到那個錯。**下面是一個最小的實作：依上面的規格寫函式，準備三組測試與八個突變體，統計每組測試「擊殺」了幾個。

```python
SRC = '''
from decimal import Decimal, ROUND_HALF_UP, ROUND_DOWN
def _num(x, name):
    if isinstance(x, bool) or not isinstance(x, (int, float, Decimal)):
        raise TypeError(f"{name} must be a number")
    d = Decimal(str(x))
    if not d.is_finite():
        raise ValueError(f"{name} must be finite")
    return d

def tip_total(bill, tip_pct):
    bill, pct = _num(bill, "bill"), _num(tip_pct, "tip_pct")
    if bill < 0:
        raise ValueError("bill must be >= 0")
    if not (0 <= pct <= 100):
        raise ValueError("tip_pct must be within 0..100")
    return (bill + bill * pct / 100).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
'''
from decimal import Decimal as D

def raises(exc, fn, *a):
    try: fn(*a)
    except exc: return
    except Exception as e: raise AssertionError(f"expected {exc.__name__}, got {type(e).__name__}")
    raise AssertionError(f"expected {exc.__name__}, got no exception")

def t_happy(f):    assert f(50, 20) == D("60.00") and f(0, 15) == D("0.00")
def t_rounding(f): assert f(10.05, 15) == D("11.56") and f(0.1, 5) == D("0.11")      # 0.105 進位成 0.11
def t_pct_edges(f):
    assert f(10, 0) == D("10.00") and f(10, 100) == D("20.00")
    raises(ValueError, f, 10, 100.01); raises(ValueError, f, 10, -0.01)
def t_bill_edges(f):
    assert f(0, 10) == D("0.00"); raises(ValueError, f, -0.01, 10)
def t_types(f):
    for bad in ("fifty", None, True): raises(TypeError, f, bad, 10)
    for bad in (float("nan"), float("inf")): raises(ValueError, f, bad, 10)

SETS = {"AI 常見的「典型案例」": [t_happy], "加上捨入與型別": [t_happy, t_rounding, t_types],
        "完整（含邊界）": [t_happy, t_rounding, t_pct_edges, t_bill_edges, t_types]}
MUTANTS = [
  ("bill < 0 → bill <= 0",            "if bill < 0:", "if bill <= 0:"),
  ("pct 上界 <= 100 → < 100",         "0 <= pct <= 100", "0 <= pct < 100"),
  ("pct 下界 0 <= → 0 <",             "0 <= pct <= 100", "0 < pct <= 100"),
  ("捨入 HALF_UP → DOWN",             "rounding=ROUND_HALF_UP", "rounding=ROUND_DOWN"),
  ("/ 100 → / 10",                    "pct / 100", "pct / 10"),
  ("拿掉 bool 檢查",                  "isinstance(x, bool) or ", ""),
  ("拿掉有限值檢查",                  "if not d.is_finite():", "if False:"),
  ("/ 100 → // 100",                  "pct / 100", "pct // 100"),
]
def load(src):
    ns = {}; exec(src, ns); return ns["tip_total"]
def survives(fn, tests):
    for t in tests:
        try: t(fn)
        except Exception: return False
    return True
base = load(SRC)
for name, tests in SETS.items():
    assert survives(base, tests), f"baseline 必須全綠: {name}"
print(f"{'測試集':24s} 擊殺 / 突變體")
for name, tests in SETS.items():
    killed = [m for m, old, new in MUTANTS if not survives(load(SRC.replace(old, new)), tests)]
    alive = [m for m, *_ in MUTANTS if m not in killed]
    print(f"{name:24s} {len(killed)} / {len(MUTANTS)}   存活: {alive}")
```

**【實測】** 輸出：

```text
測試集                      擊殺 / 突變體
AI 常見的「典型案例」             2 / 8   存活: ['pct 上界 <= 100 → < 100', 'pct 下界 0 <= → 0 <', '捨入 HALF_UP → DOWN', '拿掉 bool 檢查', '拿掉有限值檢查', '/ 100 → // 100']
加上捨入與型別                  6 / 8   存活: ['pct 上界 <= 100 → < 100', 'pct 下界 0 <= → 0 <']
完整（含邊界）                  8 / 8   存活: []
```

- 只有「典型案例」的測試，**八個突變體只抓到兩個**：全綠，但幾乎沒有保護力。
- 補上捨入與型別檢查後，抓到六個；剩下兩個存活的，都是**邊界**：`<=` 與 `<` 的差別，只有在輸入正好是 0 或 100 的時候才看得出來。
- 邊界測試補上之後，八個全部被擊殺。

**這就是「AI 產生的測試」最典型的弱點：** 它擅長典型案例，常常漏掉恰好落在邊界上的輸入。實務上用現成的突變測試工具（Python 的 mutmut、JavaScript 與 C# 的 Stryker、Java 的 PIT），並把「測試對關鍵模組的突變分數」當作品質關卡之一，用法請看各工具文件。注意：突變測試很耗時，通常只對關鍵模組或變更的部分執行。

## 資料庫與容器的測試（p.52）

**【書】** David Lee 建議先手寫幾個資料庫連線的測試，讓 AI 學會模式，再產生其他的（p.52）。**【判斷】** 補充兩點：

- 用記憶體內的 SQLite 跑測試，不等於在 PostgreSQL 或 MySQL 上正確：型別嚴格度、交易與鎖定行為、SQL 方言都不同。重要的資料存取要用與正式環境同款的資料庫（例如以容器啟動）做整合測試。
- 這類測試的 fixture（建立與清理資料、隔離性）是最容易被 AI 寫錯的部分，通常值得由人先寫一個「範本」，再讓 AI 照著擴充。

## PR 描述（p.54–55）

- **【書】** 好的 PR 描述要交代：要解決的問題、變更如何解決、哪些檔案動了、跑了哪些測試，以及你不確定、想請審查者特別看的地方；它能加速審查，也是日後的資料庫（p.54）。作者列了一系列 prompt，例如描述新增搜尋功能、修復特殊字元造成的當機、重構認證模組、解決合併衝突等（p.54）。
- **【書】** Copilot 有「Generated Commit Message」功能，在原始碼控制面板按下閃光按鈕就會根據載入的儲存庫產生描述（p.55，Fig 9-2）。What The Diff 這類新創的產品，會把 PR 摘要成白話英文，也能產生給產品經理等非技術人員看的版本，讓他們檢查變更是否符合規格（p.55）。

**【判斷】** AI 摘要的限制：它**讀的是 diff，不是你的意圖**。它能說出「改了什麼」，但說不出「為什麼」，也不知道你做了哪些驗證。所以 PR 描述的骨架要由人填，AI 只負責潤飾與檢查是否漏項：

```text
## 變更內容（What）
## 動機（Why）：連結問題或需求
## 做法與取捨（How）：為什麼這樣做、考慮過哪些替代方案
## 驗證：跑了哪些測試、如何手動驗證、結果
## 風險與回滾：影響範圍、如何還原
## 請審查者特別注意
## AI 使用說明：用了什麼工具、哪些部分由它產生、我如何驗證
```

最後一項不是為了責備，而是讓審查者知道**該把注意力放在哪裡**：AI 產生的部分，審查者可以更積極地找邊界與假設。

## 檢查點

Q: AI 為你的函式產生了一組測試，其中三個在原本的函式上就失敗。最合理的處理方式是？
- [ ] 修改函式，讓這三個測試通過
- [ ] 刪掉失敗的三個測試
- [x] 逐一分類失敗的原因：函式錯、期望值錯，還是規格未定義，先決定規格，再修正對應的一邊，並確認測試真的會因為程式被破壞而失敗
- [ ] 請 AI 重新產生一組，直到全部通過
解釋: 失敗的原因不同，處理也不同。盲目讓測試通過，會把 AI 的猜測固化成行為；刪掉失敗的測試，則丟掉了本來可以暴露規格缺口的線索。實驗中的三個失敗分別是規格未定義、期望值算錯、例外型別假設錯。

## 思考練習

Q: 團隊要求每個 PR 都附上測試。有人用 AI 產生了 30 個測試，全部通過，覆蓋率 95%。你還需要確認什麼，才願意核准？
- 斷言的強度：是否只檢查「不為空」「沒有拋例外」；對關鍵行為是否有具體的期望值。
- 邊界與錯誤路徑：零、空、最大、最小、型別錯誤、剛好落在條件邊界上的輸入。
- 用突變測試或手動破壞程式，確認測試會變紅；全綠加高覆蓋率不等於有保護力。
- 測試與程式是否出自同一個模型、同一份對需求的理解，如果是，錯誤可能相關，需要人另外檢查需求。
- 規格是否寫在某處：測試期望值的來源是需求，而不是對現有程式行為的複製。
