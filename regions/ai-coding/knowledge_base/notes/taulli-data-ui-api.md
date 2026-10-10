---
id: taulli-data-ui-api
title: 資料、前端與 API：讓 AI 產生「產生器」，而不是產物
kind: lesson
week: 2
order: 130
minutes: 22
source: ai-assisted-programming p.37-45
---
第 8 章的後半談三類日常工作：資料（資料庫、範例資料、格式轉換）、前端（CSS、圖像、設計稿轉程式碼）與 API（p.37–45）。書給了大量可直接使用的 prompt。這一篇把它們整理成一個共通原則：**請 AI 產生「能產生結果的東西」並且附上驗證方式，而不是直接產生結果本身**，因為前者可重複、可審查、可驗證。

標示方式：**【書】** 書中的說法（附頁碼）；**【實測】** 我在沙箱實際執行的結果；**【判斷】** 我的工程判斷。

## 書的內容

**資料（p.37–39）**

- **【書】** 作者列出幾組 prompt：評估該用哪種資料庫（依資料型態、流量、預算、維護難度）；設計 schema 與資料表關係、主鍵與外鍵、正規化、NoSQL 的文件結構、索引策略、遷移到新 schema；資料庫的安裝、初始設定、安全性與效能（p.37–38）。
- **【書】** 範例資料：請 AI「建立 100 筆 ID 與 email 的 demo 資料並存成 CSV」「150 筆訂單」「100 位員工」等，再用 prompt 產生 SQL insert 語句（p.38）。
- **【書】** 資料轉換：CSV 轉 XML、JSON 轉 SQL 表、TOML 轉 YAML 等（p.39）。

**前端（p.39–44）**

- **【書】** 前端的難處包括瀏覽器與裝置差異、框架更新頻繁，以及它不只是寫程式，還需要 UX 與 UI 設計的能力（p.39）。CSS 的 prompt 例子有響應式導覽列、flexbox 對不齊、hover 效果、淡入動畫（p.40）。
- **【書】** 圖像生成工具：Canva、Stable Diffusion、DALL·E 3、Adobe Firefly、Midjourney；作者請 ChatGPT 為虛構的烘焙店產生 logo（p.40–41）。
- **【書】** 從 prompt 或圖片產生網站的工具：TeleportHQ、Anima、Locofy、Vercel 的 v0。v0 一次產生三個版本，可以用 prompt 調整，最後輸出以 shadcn/ui 與 Tailwind CSS 為基礎的 React 程式碼（p.41–42）。開源的 Screenshot to Code 支援 React、Bootstrap、HTML 加 Tailwind CSS；作者引用其開發者說，大約可以自動化 90% 的工作（p.42–43）。
- **【書】** 把 iPhone 計算機的截圖給 ChatGPT，它產生了 Python 程式，作者的評價是外觀不太對，但整體還不錯（p.43–44）。

**API（p.44–45）**

- **【書】** 學新 API 的困難：文件品質不一、驗證（API key、OAuth token）、回應格式、錯誤處理、API 版本異動。以 OpenWeather 為例，ChatGPT 給出的步驟是：匯入 `requests`、定義 API key、組出目前天氣的端點網址、發出請求並處理回應、檢查是否成功（p.44–45）。

## 共通原則：要「產生器」，不要「產物」【判斷】

| 工作 | 直接要產物的問題 | 要產生器與驗證 |
|---|---|---|
| 範例資料 | 數量一多就會省略、重複、不一致；無法重現；token 成本高 | 一支用固定 seed 產生資料的腳本，加上完整性檢查 |
| 格式轉換 | 手寫的轉換容易在型別與跳脫字元出錯 | 用解析器與序列化器轉換，並做 round trip 比對 |
| Schema | 看起來合理，但缺約束、缺索引、遷移不可逆 | 用清單審查，並在真實資料庫引擎上執行 |
| API 客戶端 | 只寫成功路徑，沒有逾時、重試與錯誤處理 | 在假伺服器上測試失敗路徑 |
| UI | 外觀接近但互動與無障礙缺失 | 以截圖比對與自動化檢查把關 |

## Lab 1：範例資料用產生器，並驗證完整性

這支腳本只用標準庫：同一個 seed 得到同一份資料；外鍵完整性由資料庫引擎強制；三種格式轉換後都要與原資料一致。電子郵件用保留網域 `example.test`，避免寫出真實的地址。

```python
import csv, hashlib, io, json, random, sqlite3
import xml.etree.ElementTree as ET

def make_data(seed: int, n_emp=50, n_orders=120):
    rng = random.Random(seed)
    depts = ["Eng", "Ops", "Sales", "Finance"]
    emps = [{"id": i, "name": f"user{i:03d}", "dept": rng.choice(depts), "email": f"user{i:03d}@example.test"}
            for i in range(1, n_emp + 1)]
    orders = [{"order_id": k, "employee_id": rng.randint(1, n_emp),
               "amount_cents": rng.randint(500, 250_000),
               "order_date": f"2025-{rng.randint(1,12):02d}-{rng.randint(1,28):02d}"}
              for k in range(1, n_orders + 1)]
    return emps, orders

digest = lambda obj: hashlib.sha256(json.dumps(obj, sort_keys=True).encode()).hexdigest()[:12]
e1, o1 = make_data(42); e2, o2 = make_data(42); e3, o3 = make_data(43)
print("同 seed 可重現:", digest((e1, o1)) == digest((e2, o2)), "| 換 seed 不同:", digest((e1, o1)) != digest((e3, o3)))

con = sqlite3.connect(":memory:")
con.execute("PRAGMA foreign_keys = ON")
con.executescript("""
create table emp(id integer primary key, name text not null, dept text not null, email text unique not null);
create table orders(order_id integer primary key, employee_id integer not null references emp(id),
                    amount_cents integer not null check (amount_cents > 0), order_date text not null);
""")
con.executemany("insert into emp values (:id,:name,:dept,:email)", e1)
con.executemany("insert into orders values (:order_id,:employee_id,:amount_cents,:order_date)", o1)
print("列數:", con.execute("select count(*) from emp").fetchone()[0], con.execute("select count(*) from orders").fetchone()[0],
      "| foreign_key_check 違規數:", len(con.execute("PRAGMA foreign_key_check").fetchall()))
try:
    con.execute("insert into orders values (999, 9999, 100, '2025-01-01')")
except sqlite3.IntegrityError as e:
    print("孤兒訂單被擋下:", e)

# 格式轉換 round trip：轉過去再轉回來，必須等於原資料
buf = io.StringIO(); w = csv.DictWriter(buf, fieldnames=e1[0].keys()); w.writeheader(); w.writerows(e1)
back_csv = [{**r, "id": int(r["id"])} for r in csv.DictReader(io.StringIO(buf.getvalue()))]
root = ET.Element("employees")
for r in e1:
    ET.SubElement(root, "employee", {k: str(v) for k, v in r.items()})
back_xml = [{**a, "id": int(a["id"])} for a in (el.attrib for el in ET.fromstring(ET.tostring(root)))]
print("CSV round trip:", back_csv == e1, "| XML round trip:", back_xml == e1, "| JSON round trip:", json.loads(json.dumps(e1)) == e1)
```

**【實測】** 輸出：

```text
同 seed 可重現: True | 換 seed 不同: True
列數: 50 120 | foreign_key_check 違規數: 0
孤兒訂單被擋下: FOREIGN KEY constraint failed
CSV round trip: True | XML round trip: True | JSON round trip: True
```

注意 CSV 與 XML 轉回來時，數字欄位**變成字串**，程式裡必須手動轉回 `int`，這就是「轉換是有損的」的例子。AI 手寫的轉換常常漏掉這一步，而 round trip 比對會直接指出來。

## Lab 2：格式轉換最容易出錯的地方（TOML 轉 YAML）

書的 prompt 之一是把 TOML 設定轉成 YAML（p.39）。手寫轉換看似無害，卻有典型陷阱。這段需要 PyYAML（`pip install pyyaml`）：

```python
import tomllib, yaml

toml_text = 'country = "NO"\nversion = "1.10"\nenabled = true\n'
yaml_by_hand = 'country: NO\nversion: 1.10\nenabled: true\n'       # 常見的「手寫轉換」

source = tomllib.loads(toml_text)
converted = yaml.safe_load(yaml_by_hand)
print("TOML 解析 :", source)
print("YAML 解析 :", converted)
print("一致:", source == converted)
print("改用序列化器輸出 YAML：")
print(yaml.safe_dump(source, allow_unicode=True))
print("一致:", yaml.safe_load(yaml.safe_dump(source)) == source)
```

**【實測】** 輸出（使用 PyYAML 6.0.1，它依 YAML 1.1 的規則解析）：

```text
TOML 解析 : {'country': 'NO', 'version': '1.10', 'enabled': True}
YAML 解析 : {'country': False, 'version': 1.1, 'enabled': True}
一致: False
改用序列化器輸出 YAML：
country: 'NO'
enabled: true
version: '1.10'

一致: True
```

手寫的 YAML 把挪威的國碼 `NO` 變成布林值 `False`，把版本號 `1.10` 變成數字 `1.1`，兩個都是**靜默的資料損毀**。用序列化器輸出時，字串會被加上引號，round trip 也一致。結論：**讓程式（序列化器）寫格式，不要讓模型手寫格式；並且永遠做 round trip 比對。**

## Schema 與資料庫選擇：審查清單【判斷】

書的 prompt（p.37–38）能幫你快速得到 schema 草稿。審查草稿時逐項檢查：

1. **約束**：主鍵、外鍵、`NOT NULL`、`CHECK`、唯一性。AI 草稿常漏掉約束，只留下「欄位名稱與型別」。
2. **型別**：金額用整數（分）或定點小數，不用浮點數；時間存 UTC；ID 型別與外鍵一致。
3. **索引**：對照實際查詢（`WHERE`、`JOIN`、`ORDER BY`），用資料庫的 `EXPLAIN` 看執行計畫，而不是憑感覺。
4. **遷移**：可不可以還原？大表加欄位會不會鎖表？先擴充、再遷移資料、最後才收斂。
5. **方言差異**：用 SQLite 測試通過，不代表在 PostgreSQL 或 MySQL 一樣：型別嚴格度、並行行為與 SQL 方言都不同。
6. **資料分級**：欄位裡有沒有個資？有的話，範例資料絕不能用真實資料產生。

## 前端：把 AI 輸出當成鷹架【判斷】

- **【書】** 書中計算機的例子，作者說外觀不對、但整體不錯（p.43–44）；「約 90%」是 Screenshot to Code 開發者的說法（p.43），不是量測結果。
- 設計稿轉程式碼的輸出，通常**外觀接近、結構與互動不完整**。要驗證的是：響應式斷點、鍵盤操作與焦點順序、色彩對比與無障礙屬性、與你的設計系統元件是否一致。
- 驗證方式：視覺迴歸（截圖比對）、自動化的無障礙檢查、在真實裝置與多種視窗大小下手動看。
- 圖像素材：產生圖像的授權與使用條款，要在使用前確認（書未討論，屬於我的補充）。

## Lab 3：AI 寫的 API 客戶端，要用假伺服器測失敗路徑

書的 OpenWeather 步驟（p.45）是成功路徑。真實世界的客戶端還需要：逾時、只對暫時性錯誤重試、4xx 不重試、驗證回應結構、不把金鑰寫死。下面是一個標準庫版本，並用本機假伺服器測出每一種結果：

```python
import json, threading, time, urllib.error, urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

def get_json(url, *, timeout=2.0, retries=2, backoff=0.05, required=()):
    last = None
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(url, timeout=timeout) as resp:
                data = json.load(resp)
            missing = [k for k in required if k not in data]
            if missing:
                raise ValueError(f"回應缺少欄位: {missing}")      # 契約錯誤：重試沒有用
            return data
        except urllib.error.HTTPError as e:
            if e.code < 500:
                raise                                          # 4xx：呼叫端的問題，不重試
            last = e
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            last = e
        time.sleep(backoff * 2 ** attempt)
    raise RuntimeError(f"{retries + 1} 次嘗試後失敗: {last!r}")

hits = {"flaky": 0}
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def send(self, code, body):
        try:
            self.send_response(code); self.end_headers(); self.wfile.write(body.encode())
        except (BrokenPipeError, ConnectionResetError):
            pass                                              # 客戶端已逾時離開
    def do_GET(self):
        p = self.path
        if p == "/ok":        self.send(200, '{"city":"X","temp":21.5}')
        elif p == "/flaky":
            hits["flaky"] += 1
            self.send(500, "boom") if hits["flaky"] <= 2 else self.send(200, '{"city":"X","temp":20.0}')
        elif p == "/bad-json": self.send(200, "not json")
        elif p == "/missing":  self.send(200, '{"city":"X"}')
        elif p == "/notfound": self.send(404, "no")
        elif p == "/slow":     time.sleep(1.0); self.send(200, '{"city":"X","temp":1}')

srv = HTTPServer(("127.0.0.1", 0), H); base = f"http://127.0.0.1:{srv.server_port}"
threading.Thread(target=srv.serve_forever, daemon=True).start()

def case(name, path, **kw):
    t0 = time.time()
    try:    out = get_json(base + path, required=("temp",), **kw); res = f"OK {out}"
    except Exception as e: res = f"{type(e).__name__}: {str(e)[:70]}"
    print(f"{name:22s} {time.time()-t0:4.2f}s  {res}")
case("正常", "/ok")
case("500 兩次後成功", "/flaky")
case("404（不重試）", "/notfound")
case("非 JSON", "/bad-json")
case("缺欄位", "/missing")
case("逾時（0.3s，重試1次）", "/slow", timeout=0.3, retries=1)
print("flaky 端點實際被打了", hits["flaky"], "次")
srv.shutdown()
```

**【實測】** 輸出（耗時欄位每次會略有不同）：

```text
正常                     0.03s  OK {'city': 'X', 'temp': 21.5}
500 兩次後成功              0.15s  OK {'city': 'X', 'temp': 20.0}
404（不重試）               0.00s  HTTPError: HTTP Error 404: Not Found
非 JSON                 0.00s  JSONDecodeError: Expecting value: line 1 column 1 (char 0)
缺欄位                    0.00s  ValueError: 回應缺少欄位: ['temp']
逾時（0.3s，重試1次）          0.75s  RuntimeError: 2 次嘗試後失敗: TimeoutError('timed out')
flaky 端點實際被打了 3 次
```

- 暫時性錯誤（500）會用指數退避重試，結果成功；永久性錯誤（404）與契約錯誤（缺欄位、非 JSON）不重試，直接失敗。
- 逾時時總耗時是兩次 0.3 秒加上退避，**呼叫端必須知道最壞情況要等多久**。
- 金鑰：書的步驟「定義 API key」（p.45）若寫成原始碼裡的字串，就會被提交進版本庫。改成從環境變數或祕密管理服務讀取，並且把金鑰檢查放進 CI 的祕密掃描。
- 若供應商提供 OpenAPI 規格，**把規格放進 prompt**，可以大幅降低編造端點與參數的機會；並用契約測試固定你依賴的欄位。

## 檢查點

Q: 你要為整合測試準備 5 萬筆有外鍵關係的假資料。哪種做法最可靠？
- [ ] 請 AI 直接輸出 5 萬筆資料，貼進測試檔
- [ ] 請 AI 輸出 500 筆，再手動複製貼上到 5 萬筆
- [x] 請 AI 寫一支使用固定 seed 的資料產生腳本，由資料庫引擎強制約束，並加上外鍵與格式的驗證
- [ ] 直接複製正式環境的資料，反正是內部測試
解釋: 產生器可以重現、可以調整規模、可以被審查，約束由資料庫引擎強制，驗證才有意義。AI 直接輸出大量資料既昂貴又不可靠；複製正式資料則牽涉隱私與合規。

## 思考練習

Q: 同事用 AI 把 20 份 TOML 設定檔轉成 YAML，並且說「看起來都對」。你要求他補哪些驗證，為什麼？
- 用解析器載入來源與轉換後的檔案，比對結構與型別，也就是 round trip 比對。
- 特別檢查會被誤判型別的值：國碼、版本號、`yes` 或 `no`、八進位樣式的數字、日期樣式的字串。
- 轉換改由序列化器程式輸出，不要讓模型手寫格式；程式與驗證都放進版本庫，下次還能重跑。
- 用實際的應用程式載入轉換後的設定，跑冒煙測試。
- 把差異清單與已確認的項目記進 PR 描述，方便審查者核對。
