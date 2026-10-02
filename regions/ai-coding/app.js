/* Learning City / AI Coding region — Week 1 */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

const ROADMAP = [
  ['W01', 'LLM 是什麼運算元件：token、取樣、快取、tool use', true],
  ['W02', 'AI 協作開發工作流：規劃、驗證、CLAUDE.md、hooks'],
  ['W03', 'Context Engineering：檢索、壓縮、subagent'],
  ['W04', '從零寫 coding agent（專案 1）'],
  ['W05', 'MCP 與工具生態：用 C++ 寫 MCP server（專案 3）'],
  ['W06', '安全與可靠性：prompt injection、sandbox'],
  ['W07', '多 agent 與長時間任務'],
  ['W08', '設計 eval：harness、pass@k、變異數（專案 2）'],
  ['W09', 'Eval 驅動迭代：error analysis、judge 校準'],
  ['W10', '推論系統：KV cache、batching、量化、llama.cpp'],
  ['W11', '系統設計模擬 ×4'],
  ['W12', '完整面試 loop 模擬'],
];

/* ---------- lessons ---------- */
const LESSONS = [];

/* L1 — Token & context */
LESSONS.push({
  id: 'tokens',
  title: 'Token 與 Context Window',
  kicker: 'LESSON 1 / 5',
  body: () => `
    <h1>模型看到的不是字，是 token</h1>
    <p class="lede">LLM 的輸入輸出單位是 <strong>token</strong>：一段由 tokenizer 切出的子字串，對應到整數 ID。計費、延遲、context 上限全部用 token 計算，所以「這個 prompt 多少 token」是你每天都要有直覺的數字。</p>

    <div class="callout cpp"><p>把 tokenizer 想成編譯器的 lexer：文字 → 整數 ID 序列。模型本身只吃整數序列，吐出的也是下一個整數的機率分佈。</p></div>

    <h2>1.1 Context window 是預算，不是記憶</h2>
    <p>Context window 是一次請求「輸入 + 輸出」能容納的 token 上限。它不是模型的長期記憶：模型本身無狀態，<strong>每一輪對話都是把整段歷史重新送一次</strong>。Agent 的「記憶」是 harness（你寫的程式）每輪重組 context 的結果。</p>
    <p>有兩件事必須分開：</p>
    <ul>
      <li><strong>容納得下</strong>：20 萬 token 可以塞進去。</li>
      <li><strong>用得好</strong>：塞得越滿，模型越可能漏掉中間的細節、被無關內容干擾。長 context 下的檢索品質通常會隨長度與位置而變化，這點必須用你自己的任務去量，不能只信規格表。</li>
    </ul>
    <div class="callout warn"><p>「context 夠大，整個 repo 丟進去就好」是 junior 的答案。Staff 的答案是：context 是稀缺預算，要決定放什麼、什麼時候壓縮、什麼交給 subagent。這是第 3 週的主題。</p></div>

    <h2>1.2 動手：感受 token 數</h2>
    <div class="lab">
      <p class="lab-title">TOKEN ESTIMATOR（粗估，非真實 tokenizer）</p>
      <textarea id="tok-input" rows="5">std::vector<int> v;
for (auto& x : v) { total += x; }
請幫我把這個迴圈改成 std::accumulate，並保持行為不變。</textarea>
      <div class="chips" id="tok-chips"></div>
      <div class="stat-row">
        <div class="stat"><span>估計 TOKEN 數</span><b id="tok-count">0</b></div>
        <div class="stat"><span>字元數</span><b id="tok-chars">0</b></div>
        <div class="stat"><span>佔 200K CONTEXT</span><b id="tok-pct">0%</b></div>
      </div>
      <p class="muted" style="font-size:12px;margin:10px 0 0">估算規則：每個中日韓字元 ≈ 1 token；英文字母串 ≈ 每 4 字元 1 token；數字、標點各自成 token。真實 tokenizer（BPE 類）會因模型而異，正式計算請用 API 的 token counting 功能。</p>
    </div>
    <p>觀察：中文與程式碼的 token 密度通常比英文散文高。程式碼裡的縮排、符號都會吃 token，這就是為什麼讀大檔案會很快吃光預算。</p>`,
  init(root) {
    const input = $('#tok-input', root);
    const palette = ['#b9f06d', '#8fc4d0', '#e6c86e', '#fc8268'];
    const tokenize = (text) => {
      const out = [];
      for (const m of text.matchAll(/[㐀-鿿぀-ヿ가-힯]|[A-Za-z_]+|\d+|\s+|[^\sA-Za-z_\d]/g)) {
        const s = m[0];
        if (/^[A-Za-z_]+$/.test(s)) for (let i = 0; i < s.length; i += 4) out.push(s.slice(i, i + 4));
        else out.push(s);
      }
      return out;
    };
    const update = () => {
      const toks = tokenize(input.value);
      $('#tok-chips', root).innerHTML = toks.map((t, i) => `<span class="chip" style="background:${palette[i % 4]}">${t.trim() === '' ? (t.includes('\n') ? '↵' : '·') : esc(t)}</span>`).join('');
      $('#tok-count', root).textContent = toks.length;
      $('#tok-chars', root).textContent = input.value.length;
      $('#tok-pct', root).textContent = (toks.length / 2000).toFixed(2) + '%';
    };
    input.addEventListener('input', update);
    update();
  },
  quiz: {
    q: '一個 agent 對話進行到第 40 輪，使用者說「你還記得我第一輪說的需求嗎？」模型答對了。最準確的解釋是？',
    options: [
      ['模型內部把對話存進長期記憶，每輪更新', 0],
      ['harness 每一輪都把包含第一輪在內的歷史重新送進 context，模型在當輪 context 中讀到它', 1],
      ['API server 會依 session ID 保存狀態，模型直接查詢', 0],
      ['模型權重在對話中被微調，學會了這個需求', 0],
    ],
    explain: '模型本身無狀態，權重在推論時不會改變。「記憶」來自 harness 每輪重送歷史。這也是為什麼 context 管理（截斷、摘要、檢索）是 agent 工程的核心，而且每輪重送也是 prompt caching 存在的原因（Lesson 4）。',
  },
  interview: {
    q: '面試題：為什麼不能「把整個 repo 丟進 context」就解決 coding agent 的問題？',
    ref: ['成本與延遲：每輪都要重送並重新處理（即使有快取，仍有讀取成本）。', '品質：context 越長，關鍵資訊越可能被稀釋；要用自己的任務量測，不能只信規格。', '規模：大型 monorepo 根本放不下，必須做檢索（grep / AST / LSP）。', '更新性：程式碼在變，靜態塞入的內容會過期；讓 agent 按需讀取更可靠。', '結論：把 context 當預算管理，並用 eval 驗證策略。'],
  },
});

/* L2 — Sampling */
LESSONS.push({
  id: 'sampling',
  title: '取樣：temperature 與 top-p',
  kicker: 'LESSON 2 / 5',
  body: () => `
    <h1>模型輸出的是機率分佈，不是答案</h1>
    <p class="lede">每一步，模型對詞表中每個 token 算出一個分數（logit），經過 softmax 變成機率，再由<strong>取樣器</strong>選出下一個 token。取樣策略是你可以調的旋鈕，不是模型的一部分。</p>

    <div class="callout cpp"><p>想成一個 <code>argmax</code> 與 <code>std::discrete_distribution</code> 之間的連續旋鈕。temperature 控制分佈有多「尖」，top-p 決定只在機率質量前 p 的候選裡抽。</p></div>

    <h2>2.1 動手：調旋鈕</h2>
    <p class="muted" style="font-size:13px">情境：模型剛寫完 <code>v.</code>，下一個 token 的候選與假設的 logit 如下（數字為教學用的假資料）。</p>
    <div class="lab">
      <p class="lab-title">SAMPLING LAB</p>
      <div class="controls">
        <div class="control"><label>TEMPERATURE <b id="temp-v">1.0</b></label><input id="temp" type="range" min="0" max="2" step="0.05" value="1" /></div>
        <div class="control"><label>TOP-P <b id="topp-v">1.00</b></label><input id="topp" type="range" min="0.1" max="1" step="0.05" value="1" /></div>
      </div>
      <div class="bars" id="samp-bars"></div>
      <div style="margin-top:14px"><button class="btn" id="samp-draw" type="button">抽一次樣</button> <span class="mono" id="samp-result" style="margin-left:10px"></span></div>
    </div>
    <ul>
      <li><strong>temperature → 0</strong>：分佈極尖，近似 greedy（永遠選機率最高）。</li>
      <li><strong>temperature 高</strong>：分佈變平，冷門 token（如 <code>banana</code>）被抽中的機會上升。</li>
      <li><strong>top-p</strong>：由高到低累加機率直到 ≥ p，只保留這些候選，其餘截斷後重新正規化。</li>
    </ul>

    <h2>2.2 temperature = 0 就完全確定嗎？不。</h2>
    <div class="callout warn"><p>實務上，即使 temperature = 0，輸出仍可能因為：浮點加法順序不同（批次大小、kernel 選擇不同導致結果有微小差異）、多 GPU 並行歸約順序、服務端 batching 的變動，而出現不同輸出。兩個機率非常接近的 token，微小數值差就會翻轉選擇，之後整段文字就分岔。部分 API 也限制或不開放某些取樣參數，要以官方文件為準。</p></div>
    <p>這對你有直接意義：<strong>agent 的 eval 不能假設單次執行可重現</strong>。同一題要跑多次、報告變異（第 8 週）。</p>`,
  init(root) {
    const cands = [['push_back', 4.0], ['emplace_back', 3.2], ['size', 2.0], ['begin', 1.5], ['reserve', 1.0], ['banana', -2.0]];
    const tEl = $('#temp', root), pEl = $('#topp', root);
    let probs = [];
    const compute = () => {
      const T = +tEl.value, P = +pEl.value;
      $('#temp-v', root).textContent = T.toFixed(1);
      $('#topp-v', root).textContent = P.toFixed(2);
      let p;
      if (T < 0.05) { p = cands.map((_, i) => (i === 0 ? 1 : 0)); }
      else {
        const m = Math.max(...cands.map((c) => c[1]));
        const e = cands.map((c) => Math.exp((c[1] - m) / T));
        const z = e.reduce((a, b) => a + b, 0);
        p = e.map((x) => x / z);
      }
      const order = p.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
      const keep = new Set(); let cum = 0;
      for (const [v, i] of order) { keep.add(i); cum += v; if (cum >= P - 1e-9) break; }
      const zk = [...keep].reduce((a, i) => a + p[i], 0);
      probs = p.map((v, i) => (keep.has(i) ? v / zk : 0));
      $('#samp-bars', root).innerHTML = cands.map((c, i) => `<div class="bar ${keep.has(i) ? '' : 'cut'}" data-i="${i}"><span>${c[0]}</span><span class="track"><span class="fill" style="display:block;width:${(probs[i] * 100).toFixed(1)}%"></span></span><span>${(probs[i] * 100).toFixed(1)}%</span></div>`).join('');
    };
    tEl.addEventListener('input', compute); pEl.addEventListener('input', compute);
    $('#samp-draw', root).addEventListener('click', () => {
      let r = Math.random(), pick = 0;
      for (let i = 0; i < probs.length; i++) { r -= probs[i]; if (r <= 0) { pick = i; break; } }
      $('#samp-result', root).textContent = 'v.' + cands[pick][0];
      $$('.bar', root).forEach((b) => b.classList.toggle('pick', +b.dataset.i === pick));
    });
    compute();
  },
  quiz: {
    q: '你的 coding agent 在同一個 prompt、temperature = 0 下，連續兩次產出了不同的 patch。最合理的第一個判斷是？',
    options: [
      ['API 有 bug，應該向供應商回報', 0],
      ['temperature = 0 在實務上不保證逐 token 可重現；評估時應多次執行並看分佈，而不是依賴單次結果', 1],
      ['必須把 temperature 設成負數才能確定', 0],
      ['代表模型沒有收斂，需要重新訓練', 0],
    ],
    explain: '浮點運算順序、batching、並行歸約等會讓近似平手的 token 翻轉。工程上的結論是：把 agent 當成隨機系統，用多次試驗與統計方法評估，並在系統層加上驗證（跑測試）而不是期待重現。',
  },
  interview: {
    q: '面試題：Coding agent 該用多高的 temperature？為什麼？',
    ref: ['沒有放諸四海皆準的答案，先講原則：需要精確、可驗證的產出（改 code）偏低；需要多樣性（brainstorm、產生多個候選再挑）偏高。', '更重要的是：把「可靠性」建在驗證層（測試、型別檢查、linter），不要靠把 temperature 壓到 0。', '若採 best-of-N 策略，反而需要適度 temperature 來產生多樣候選，再用測試挑選。', '用 eval 決定參數：在你的任務集上掃參數、看通過率與成本，而不是憑感覺。'],
  },
});

/* L3 — Prefill / decode */
LESSONS.push({
  id: 'inference',
  title: 'Prefill 與 Decode：你的主場',
  kicker: 'LESSON 3 / 5',
  body: () => `
    <h1>推論有兩個性質完全不同的階段</h1>
    <p class="lede">一次生成分成 <strong>prefill</strong>（一次處理整段輸入 prompt）與 <strong>decode</strong>（一個 token 一個 token 地生成輸出）。兩者的效能瓶頸不同，這正是 C++ / 系統背景最能發揮的地方。</p>

    <h2>3.1 Roofline 直覺</h2>
    <div class="callout cpp"><p>這就是你熟悉的 roofline model。算術強度（arithmetic intensity）= FLOPs ÷ 搬運的 bytes。低於硬體的「脊點」（峰值算力 ÷ 記憶體頻寬）就是 memory-bound，高於就是 compute-bound。</p></div>
    <ul>
      <li><strong>Prefill</strong>：整段 prompt 的 N 個 token 同時過一次模型，權重只讀一次卻做 N 份矩陣乘法 → 算術強度高 → <strong>compute-bound</strong>。</li>
      <li><strong>Decode</strong>：每生成 1 個 token 就要把<strong>全部權重</strong>從 HBM 讀一遍，卻只做約 2×參數量 的 FLOPs（batch = 1 時像矩陣×向量）→ 算術強度很低 → <strong>memory-bound</strong>。</li>
    </ul>
    <p>推論：decode 的速度上限約為「記憶體頻寬 ÷ 權重位元組數」。<strong>增加 batch</strong> 讓同一次權重讀取服務多個請求，這就是 continuous batching 的價值；<strong>量化</strong>縮小權重位元組，也直接提升 decode 速度。</p>

    <h2>3.2 動手：算一次上限</h2>
    <div class="lab">
      <p class="lab-title">DECODE ROOFLINE CALCULATOR（教學用簡化模型）</p>
      <div class="controls">
        <div class="control"><label>參數量（B） <b id="p-v">70</b></label><input id="p" type="range" min="7" max="405" step="1" value="70" /></div>
        <div class="control"><label>權重精度</label><select id="bits"><option value="2">FP16 / BF16（2 bytes）</option><option value="1">INT8 / FP8（1 byte）</option><option value="0.5">INT4（0.5 byte）</option></select></div>
        <div class="control"><label>Batch size <b id="b-v">1</b></label><input id="b" type="range" min="1" max="512" step="1" value="1" /></div>
        <div class="control"><label>記憶體頻寬（GB/s） <b id="bw-v">3350</b></label><input id="bw" type="range" min="400" max="8000" step="50" value="3350" /></div>
        <div class="control"><label>峰值算力（TFLOPS） <b id="fl-v">990</b></label><input id="fl" type="range" min="50" max="2500" step="10" value="990" /></div>
      </div>
      <div class="stat-row">
        <div class="stat"><span>權重大小</span><b id="o-w">–</b></div>
        <div class="stat"><span>每步 DECODE 時間</span><b id="o-t">–</b></div>
        <div class="stat"><span>單一使用者 TOK/S</span><b id="o-u">–</b></div>
        <div class="stat"><span>整機總 TOK/S</span><b id="o-a">–</b></div>
        <div class="stat"><span>瓶頸</span><b id="o-bn">–</b></div>
      </div>
      <p class="muted" style="font-size:12px;margin:12px 0 0">預設值近似單張高階資料中心 GPU 的量級，僅為教學。簡化假設：每 token 約 2×參數量 FLOPs，忽略 attention 與 KV cache 讀取、通訊與排程開銷。實際值請以硬體規格與實測為準。</p>
    </div>
    <p>試試看：把 batch 從 1 拉到 256，觀察單一使用者速度與整機吞吐的變化；再把精度改成 INT4。你會看到<strong>「為什麼服務端要 batching」與「為什麼量化有用」</strong>都是同一條 roofline 的結果。</p>

    <div class="callout warn"><p>KV cache 也要佔記憶體並被每步讀取：context 越長、batch 越大，KV cache 越成為容量與頻寬壓力。這是第 10 週要深入的內容；現在只要記得「長 context 不是免費的」。</p></div>`,
  init(root) {
    const g = (id) => $('#' + id, root);
    const calc = () => {
      const P = +g('p').value * 1e9, bytes = +g('bits').value, B = +g('b').value, BW = +g('bw').value * 1e9, FL = +g('fl').value * 1e12;
      g('p-v').textContent = g('p').value; g('b-v').textContent = B; g('bw-v').textContent = g('bw').value; g('fl-v').textContent = g('fl').value;
      const wBytes = P * bytes;
      const tMem = wBytes / BW;
      const tCmp = (2 * P * B) / FL;
      const t = Math.max(tMem, tCmp);
      g('o-w').textContent = (wBytes / 1e9).toFixed(0) + ' GB';
      g('o-t').textContent = (t * 1e3).toFixed(1) + ' ms';
      g('o-u').textContent = (1 / t).toFixed(1);
      g('o-a').textContent = (B / t).toFixed(0);
      const bn = g('o-bn');
      bn.textContent = tMem >= tCmp ? 'MEMORY' : 'COMPUTE';
      bn.className = tMem >= tCmp ? 'bad' : '';
    };
    $$('input,select', root).filter((e) => ['p', 'bits', 'b', 'bw', 'fl'].includes(e.id)).forEach((e) => e.addEventListener('input', calc));
    calc();
  },
  quiz: {
    q: '單一使用者、batch = 1 的 decode，把權重從 FP16 量化到 INT4（其他不變），速度為何會明顯提升？',
    options: [
      ['INT4 的乘法指令比 FP16 快 4 倍', 0],
      ['decode 是 memory-bound，每步要讀的權重位元組變成約 1/4，所以受限於頻寬的時間縮短', 1],
      ['量化後模型參數變少，所以 FLOPs 減少', 0],
      ['量化會降低 context 長度，所以更快', 0],
    ],
    explain: 'batch = 1 的 decode 算術強度極低，時間約等於「讀權重的時間」。INT4 讓權重位元組縮為約 1/4，頻寬受限的時間隨之縮短。參數個數沒變，也不是因為乘法更快（雖然低精度運算單元也可能有加成，但主因是頻寬）。',
  },
  interview: {
    q: '面試題：用一句話與一個數字，解釋為什麼 LLM 服務要做 continuous batching？',
    ref: ['Decode 是 memory-bound：每步都要讀整份權重，batch=1 時算力幾乎閒置。', '把多個請求湊成一批，讀一次權重服務多個請求，吞吐近似隨 batch 線性成長，直到轉為 compute-bound（脊點）。', 'Continuous（in-flight）batching 讓請求隨時加入、完成就退出，避免傳統 static batching 等最慢請求的浪費。', '代價：單一請求延遲可能上升、KV cache 記憶體成為上限，需要做排程取捨。'],
  },
});

/* L4 — Prompt caching */
LESSONS.push({
  id: 'caching',
  title: 'Prompt Caching 與成本模型',
  kicker: 'LESSON 4 / 5',
  body: () => `
    <h1>快取命中取決於「前綴」完全相同</h1>
    <p class="lede">既然每輪都要重送整段歷史，服務端可以把「已處理過的前綴」的內部狀態（KV cache）保存起來，下次遇到<strong>完全相同的前綴</strong>就直接重用，只處理新增的尾巴。結果是：輸入便宜很多、延遲更低。</p>

    <div class="callout cpp"><p>這就像 trie / 前綴樹查表：從第一個 token 開始比對，<strong>第一個不同的 token 之後的所有內容都無法重用</strong>。順序因此決定一切。</p></div>

    <h2>4.1 排列原則</h2>
    <ul>
      <li>由穩定到易變排列：<strong>工具定義 → system prompt → 長期文件 → 歷史對話 → 本輪新訊息</strong>。</li>
      <li>任何每輪都會變的東西（時間戳、隨機 ID、使用者名稱）放在前面，會讓快取<strong>每輪都失效</strong>。</li>
      <li>在 prompt 中途修改歷史、改工具清單、改 system prompt，後面的內容全部失效。</li>
      <li>成本結構（以 Anthropic 公開機制為例，數字請以官方定價頁為準）：寫入快取略貴於一般輸入（約 1.25×），命中讀取很便宜（約 0.1×）。<strong>所以只寫不讀的快取是虧的</strong>。</li>
    </ul>

    <h2>4.2 動手：模擬 8 輪 agent 對話</h2>
    <div class="lab">
      <p class="lab-title">CACHE SIMULATOR（相對成本，輸入 token 以 1.0 為單位）</p>
      <div class="controls">
        <div class="control"><label>快取</label><div class="seg" id="seg-cache"><button data-v="on" class="on" type="button">開</button><button data-v="off" type="button">關</button></div></div>
        <div class="control"><label>時間戳放在</label><div class="seg" id="seg-ts"><button data-v="start" type="button">system prompt 開頭</button><button data-v="end" class="on" type="button">最新訊息尾端</button></div></div>
      </div>
      <div class="turns" id="turns"></div>
      <div class="legend"><span><i style="background:#8fc4d0"></i>命中（0.1×）</span><span><i style="background:#e6c86e"></i>寫入（1.25×）</span><span><i style="background:#fc8268"></i>一般輸入（1×）</span></div>
      <div class="stat-row">
        <div class="stat"><span>8 輪總成本（相對）</span><b id="c-total">–</b></div>
        <div class="stat"><span>相對於「不快取」</span><b id="c-vs">–</b></div>
      </div>
      <p class="muted" style="font-size:12px;margin:12px 0 0">模型：工具 + system = 3,500 tokens，每輪新增 900 tokens 歷史；有快取時每輪的新增部分被寫入快取。忽略 TTL 過期與輸出 token，只展示前綴結構的影響。</p>
    </div>
    <p>把時間戳切到「開頭」：你會看到快取開著反而比關掉更貴，因為每輪都付寫入的溢價卻從不命中。</p>
    <div class="callout warn"><p>快取有存活時間（TTL）。若兩次請求間隔超過 TTL，快取過期，就得重新付寫入成本。對於人類使用者慢速互動的 agent，這是真實的成本因子。</p></div>`,
  init(root) {
    const state = { cache: 'on', ts: 'end' };
    const SYS = 3500, STEP = 900, TURNS = 8;
    const render = () => {
      let total = 0, base = 0;
      const rows = [];
      for (let t = 1; t <= TURNS; t++) {
        const T = SYS + STEP * t;
        base += T;
        let hit = 0, write = 0, plain = 0;
        if (state.cache === 'off') plain = T;
        else if (state.ts === 'start' || t === 1) { write = T; }
        else { hit = SYS + STEP * (t - 1); write = STEP; }
        const cost = plain + write * 1.25 + hit * 0.1;
        total += cost;
        rows.push({ t, T, hit, write, plain });
      }
      const maxT = SYS + STEP * TURNS;
      $('#turns', root).innerHTML = rows.map((r) => `<div class="turn-row"><span>TURN ${r.t}</span><span class="stack" style="width:${(r.T / maxT) * 100}%"><i style="width:${(r.hit / r.T) * 100}%;background:#8fc4d0"></i><i style="width:${(r.write / r.T) * 100}%;background:#e6c86e"></i><i style="width:${(r.plain / r.T) * 100}%;background:#fc8268"></i></span><span>${r.T.toLocaleString()} tok</span></div>`).join('');
      $('#c-total', root).textContent = Math.round(total).toLocaleString();
      const ratio = total / base;
      const vs = $('#c-vs', root);
      vs.textContent = (ratio * 100).toFixed(0) + '%';
      vs.className = ratio > 1 ? 'bad' : '';
    };
    $$('.seg', root).forEach((seg) => seg.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      state[seg.id === 'seg-cache' ? 'cache' : 'ts'] = b.dataset.v;
      $$('button', seg).forEach((x) => x.classList.toggle('on', x === b));
      render();
    }));
    render();
  },
  quiz: {
    q: '你的 agent 的 system prompt 開頭加了一行「Current time: 2026-10-03 14:07:22」。上線後帳單暴增。最可能的原因？',
    options: [
      ['時間戳讓 prompt 變長，所以每輪貴了一點點', 0],
      ['時間戳每輪都不同，位於前綴最前端，導致整段前綴都無法命中快取；每輪都付寫入溢價而沒有讀取折扣', 1],
      ['模型看到日期會自動多生成輸出 token', 0],
      ['快取只支援 ASCII 字元，數字會讓它失效', 0],
    ],
    explain: '前綴比對從第一個 token 開始，第一個不同處之後全部失效。解法：把易變資訊放到最後（例如附在最新的 user 訊息），讓穩定部分維持位元組級相同。順帶：不要在中途重排工具清單，這也會破壞前綴。',
  },
  interview: {
    q: '面試題：為什麼 agent 的 system prompt 與工具定義不該每一輪都動？上線後你會監控什麼指標？',
    ref: ['前綴快取：只要前綴逐 token 相同就能重用，任何變動都使其後內容失效。', '把穩定內容放前面、易變內容放最後；工具清單排序固定；動態資訊以附加訊息方式注入。', '監控：快取命中率（讀取 token ÷ 總輸入 token）、每任務成本、首 token 延遲（TTFT）。命中率突然下降是 prompt 變動 bug 的強訊號。', '要把「prompt 變更」當作需要 review 與 eval 的程式碼變更：它同時影響品質與成本。'],
  },
});

/* L5 — Tool use */
LESSONS.push({
  id: 'toolbox',
  title: 'Tool Use：誰真正執行了工具',
  kicker: 'LESSON 5 / 5',
  body: () => `
    <h1>模型只提出請求，執行與驗證都在你的程式</h1>
    <p class="lede">Tool use 的本質是一個<strong>協議</strong>：你在請求中宣告工具（名稱、描述、參數的 JSON Schema），模型在回應中以結構化區塊表示「我想呼叫工具 X，參數是 Y」，然後由<strong>你的程式（harness）</strong>決定要不要執行、怎麼執行，再把結果送回去。</p>

    <div class="callout cpp"><p>模型像一個沒有權限的遠端呼叫者，harness 是 RPC server 加上 policy engine。你不會信任 client 傳來的參數，同樣不該信任模型產生的參數。</p></div>

    <h2>5.1 一次完整往返（逐步播放）</h2>
    <div class="lab">
      <p class="lab-title">TOOL CALL SEQUENCE</p>
      <div class="seq" id="seq"></div>
      <div style="margin-top:14px"><button class="btn" id="seq-next" type="button">下一步 →</button> <button class="btn ghost" id="seq-reset" type="button">重來</button></div>
    </div>

    <h2>5.2 責任分工</h2>
    <ul>
      <li><strong>模型</strong>：根據工具描述與當前 context，決定是否呼叫、產生參數。它不執行任何東西。</li>
      <li><strong>Harness</strong>：解析工具呼叫、<strong>驗證參數</strong>（schema、路徑是否在允許範圍、危險指令）、取得授權、<strong>真正執行</strong>、把結果（或錯誤）作為 tool_result 送回。</li>
      <li><strong>參數不合 schema</strong>：就算啟用了結構化輸出的約束，也要在 harness 端驗證；驗證失敗時，把<strong>清楚的錯誤訊息</strong>回傳給模型，它通常能自行修正重試。</li>
    </ul>
    <div class="callout warn"><p>工具的「描述」就是模型看到的 API 文件。名稱含糊、描述不清、回傳一大坨雜訊，都會直接降低 agent 成功率。工具介面設計是第 4 週的重點。另外，tool_result 的內容（檔案、網頁、issue）可能含有惡意指令：它是資料，不是指令。第 6 週會專門處理 prompt injection。</p></div>`,
  init(root) {
    const steps = [
      ['user', 'USER', '請把 src/util.cpp 裡的 parse() 的錯誤處理改成回傳 std::expected。', null],
      ['harness', 'HARNESS', '組裝請求：system prompt + 工具定義（read_file、edit_file、run_tests）+ 使用者訊息，送給模型 API。', null],
      ['model', 'MODEL', '決定先讀檔案。回傳一個結構化的 tool_use 區塊（stop_reason 為 tool_use）：', '{ "type": "tool_use", "id": "toolu_01", "name": "read_file",\n  "input": { "path": "src/util.cpp" } }'],
      ['harness', 'HARNESS', '解析區塊 → 驗證 path 在 repo 內且符合 schema → 執行（模型沒有執行任何東西）。', null],
      ['tool', 'TOOL', '實際讀檔，回傳內容或錯誤。', null],
      ['harness', 'HARNESS', '把結果包成 tool_result 附加到對話，再次呼叫模型（整段歷史重送，前綴可被快取）。', '{ "type": "tool_result", "tool_use_id": "toolu_01",\n  "content": "…file contents…" }'],
      ['model', 'MODEL', '讀完後提出 edit_file；接著再提出 run_tests。這個迴圈持續到模型回傳純文字（stop_reason 為 end_turn）。', null],
      ['harness', 'HARNESS', '迴圈結束條件、最大步數、成本上限、危險操作的人工確認，全都是 harness 的責任，不是模型的。', null],
    ];
    let cur = -1;
    const seq = $('#seq', root);
    const paint = () => {
      seq.innerHTML = steps.map((s, i) => `<div class="seq-step ${i <= cur ? 'show' : ''} ${i === cur ? 'cur' : ''}"><span class="who ${s[0]}">${s[1]}</span><div><p>${s[2]}</p>${s[3] ? `<pre>${esc(s[3])}</pre>` : ''}</div></div>`).join('');
      $('#seq-next', root).disabled = cur >= steps.length - 1;
    };
    $('#seq-next', root).addEventListener('click', () => { cur++; paint(); });
    $('#seq-reset', root).addEventListener('click', () => { cur = -1; paint(); });
    paint();
  },
  quiz: {
    q: '模型回傳的 tool_use 參數是 { "path": "../../etc/passwd" }。誰該負責擋下它？',
    options: [
      ['模型，因為它應該知道這很危險', 0],
      ['harness：工具執行前必須驗證參數與權限（路徑限制在 repo 內），模型輸出必須被當成不可信輸入', 1],
      ['API 供應商，會自動過濾所有危險路徑', 0],
      ['使用者，應該在 prompt 裡叮嚀模型不要這樣做', 0],
    ],
    explain: 'Prompt 裡的叮嚀只是「請求」，不是安全邊界。真正的邊界在 harness 與 sandbox：路徑白名單、唯讀掛載、網路隔離、權限提示。這就是 Staff 等級與 Senior 的分界之一：用系統設計而非祈禱來保證安全。',
  },
  interview: {
    q: '面試題：描述一次完整的 tool call 往返，並說明參數不合 schema 時系統該怎麼做。',
    ref: ['請求帶工具定義 → 模型回傳 tool_use 區塊 → harness 驗證並執行 → 以 tool_result 回送 → 模型繼續；直到 end_turn。', '模型不執行任何東西；harness 負責驗證、授權、執行、限額與終止條件。', '參數錯誤：harness 端一律再驗證，失敗就回傳具體、可行動的錯誤訊息（說明哪個欄位、期望什麼），讓模型重試；並設定重試上限，避免死循環。', '補充：記錄每次工具呼叫與結果，供之後的 eval 與除錯。'],
  },
});

/* ---------- state & rendering ---------- */
const KEY = 'learning-city:ai-coding:w1:v1';
let state;
try { state = { index: 0, answers: {}, drafts: {}, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { state = { index: 0, answers: {}, drafts: {} }; }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage may be unavailable */ } };

function renderSteps() {
  const done = LESSONS.filter((l) => state.answers[l.id] !== undefined).length;
  $('#progress').textContent = `${done} / ${LESSONS.length}`;
  $('#steps').innerHTML = LESSONS.map((l, i) => `<button class="step ${i === state.index ? 'active' : ''} ${state.answers[l.id] === 1 ? 'done' : ''}" data-i="${i}" type="button"><span>${state.answers[l.id] === 1 ? '✓' : String(i + 1).padStart(2, '0')}</span>${l.title}</button>`).join('');
}

function renderLesson() {
  const L = LESSONS[state.index];
  const root = $('#lesson');
  const ans = state.answers[L.id];
  const opts = L.quiz.options.map(([text, ok], i) => {
    const picked = state.picked && state.picked[L.id];
    const cls = picked === undefined ? '' : ok ? 'correct' : picked === i ? 'wrong' : '';
    return `<button class="answer ${cls}" data-pick="${i}" type="button" ${ans !== undefined && picked !== undefined && ok === 1 && ans === 1 ? 'disabled' : ''}><span class="l">${'ABCD'[i]}</span><span>${text}</span></button>`;
  }).join('');
  const fb = ans === undefined ? '' : ans === 1 ? `<p class="feedback ok">正確。${L.quiz.explain}</p>` : `<p class="feedback">這個選項不對，容易混淆的地方：${L.quiz.explain}</p>`;
  root.innerHTML = `
    <p class="kicker">${L.kicker} · WEEK 01</p>
    ${L.body()}
    <section class="quiz">
      <p class="kicker">CHECKPOINT</p>
      <h2 style="margin-top:0">${L.quiz.q}</h2>
      <div class="answers" id="answers">${opts}</div>
      <div id="feedback">${fb}</div>
    </section>
    <section class="interview">
      <p class="kicker">INTERVIEW DRILL</p>
      <h2 style="margin-top:0">${L.interview.q}</h2>
      <p class="muted" style="font-size:13px">先用自己的話寫 3–5 句，再看參考要點。Staff 面試看的是你能不能有結構地講清楚，並主動帶出取捨。</p>
      <div class="lab"><textarea id="draft" rows="5" placeholder="在這裡寫下你的回答…">${esc(state.drafts[L.id] || '')}</textarea>
      <div style="margin-top:12px"><button class="btn ghost" id="reveal-btn" type="button">看參考要點</button></div>
      <div class="reveal" id="reveal" hidden><strong>參考要點</strong><ul>${L.interview.ref.map((r) => `<li>${r}</li>`).join('')}</ul></div></div>
    </section>
    <div class="nav-row">
      <button class="btn ghost" id="prev" type="button" ${state.index === 0 ? 'disabled' : ''}>← 上一章</button>
      <button class="btn" id="next" type="button">${state.index === LESSONS.length - 1 ? '完成第 1 週 ✓' : '下一章 →'}</button>
    </div>`;
  root.scrollTop = 0;
  L.init(root);
  state.picked = state.picked || {};

  $$('[data-pick]', root).forEach((b) => b.addEventListener('click', () => {
    const i = +b.dataset.pick;
    state.picked[L.id] = i;
    state.answers[L.id] = L.quiz.options[i][1];
    save(); renderSteps();
    const scroll = root.scrollTop; renderLesson(); root.scrollTop = scroll;
  }));
  $('#draft', root).addEventListener('input', (e) => { state.drafts[L.id] = e.target.value; save(); });
  $('#reveal-btn', root).addEventListener('click', () => { $('#reveal', root).hidden = false; });
  $('#prev', root).addEventListener('click', () => go(state.index - 1));
  $('#next', root).addEventListener('click', () => {
    if (state.index < LESSONS.length - 1) go(state.index + 1);
    else {
      const wrong = LESSONS.filter((l) => state.answers[l.id] !== 1).map((l) => l.title);
      alert(wrong.length ? `第 1 週完成。以下章節的檢查點還沒答對，建議回頭複習：\n- ${wrong.join('\n- ')}` : '第 1 週全部檢查點通過。下一步：做週作業（快取成本比較 CLI），然後進入第 2 週。');
    }
  });
}

function go(i) { state.index = Math.max(0, Math.min(LESSONS.length - 1, i)); save(); renderSteps(); renderLesson(); }

$('#steps').addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) go(+b.dataset.i); });
$('#reset').addEventListener('click', () => { if (confirm('清除本週的進度與你寫的回答？')) { try { localStorage.removeItem(KEY); } catch { /* ignore */ } state = { index: 0, answers: {}, drafts: {}, picked: {} }; renderSteps(); renderLesson(); } });

const dlg = $('#roadmap');
$('#roadmap-list').innerHTML = ROADMAP.map(([w, t, open]) => `<li class="${open ? 'open' : ''}"><span>${w}</span><span>${t}</span><em>${open ? 'OPEN' : 'PLANNED'}</em></li>`).join('');
$('#open-roadmap').addEventListener('click', () => dlg.showModal());
$('#close-roadmap').addEventListener('click', () => dlg.close());

state.picked = state.picked || {};
renderSteps();
renderLesson();
