/* Learning City — home. Reads each region's saved progress and builds the city from it. */
const $ = (sel) => document.querySelector(sel);
const NS = 'http://www.w3.org/2000/svg';

const readJSON = (key) => {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
};

/* Each region reports { done, total, next } from whatever it stores in localStorage. */
const REGIONS = [
  {
    id: 'pcie', theme: 'pcie', index: 'REGION 03', name: 'PCIe Fabric', href: 'regions/pcie/index.html',
    blurb: '從 Root Complex、Switch 到 Endpoint，用互動模擬與任務理解 PCI Express。',
    pos: [420, 300], progress() {
      const s = readJSON('learning-city-pcie-explorer-v2');
      const done = Array.isArray(s?.completed) ? Math.min(s.completed.length, 6) : 0;
      return { done, total: 6, unit: '任務', next: done >= 6 ? '全部任務完成' : `第 ${done + 1} / 6 個任務` };
    },
  },
  {
    id: 'ai-coding', theme: 'ai', index: 'REGION 06', name: 'AI Coding', href: 'regions/ai-coding/index.html',
    blurb: 'AI Coding 學習路徑。章節由知識庫即時組成：互動實驗、書籍筆記、思考練習。',
    pos: [690, 285], progress() {
      /* Same course the region builds: its hand-made lessons first, then every lesson-kind note in the
         knowledge-base catalog. Adding a note changes the total here with no edit to this file. */
      const core = [['tokens', 'Token 與 Context Window'], ['sampling', '取樣：temperature 與 top-p'], ['inference', 'Prefill 與 Decode'], ['caching', 'Prompt Caching 與成本模型'], ['toolbox', 'Tool Use']];
      const notes = (window.LC?.catalog?.notes || []).filter((n) => n.kind === 'lesson').sort((x, y) => x.week - y.week || x.order - y.order);
      const lessons = [...core, ...notes.map((n) => [`kb:${n.id}`, n.title])];
      const s = readJSON('learning-city:ai-coding:v2') || readJSON('learning-city:ai-coding:w1:v1');
      const isDone = (id) => s?.answers?.[id] === 1;
      const done = lessons.filter(([id]) => isDone(id)).length;
      const nextLesson = lessons.find(([id]) => !isDone(id));
      return { done, total: lessons.length, unit: '章', next: nextLesson ? `第 ${done + 1} 章：${nextLesson[1]}` : '目前章節全部完成，等待新的知識庫內容' };
    },
  },
  { id: 'kernel', theme: 'planned', index: 'REGION 01', name: 'Kernel Valley', blurb: '從程序、記憶體與系統呼叫理解作業系統如何維持城市運轉。', pos: [150, 340] },
  { id: 'data', theme: 'planned', index: 'REGION 02', name: 'Data Commons', blurb: '從位元、資料結構到資料庫，看資訊如何被整理與使用。', pos: [330, 440] },
  { id: 'network', theme: 'planned', index: 'REGION 04', name: 'Network Harbour', blurb: '探索封包如何離開一台電腦，穿過網路抵達另一個地方。', pos: [860, 410] },
  { id: 'systems', theme: 'planned', index: 'REGION 05', name: 'Systems Square', blurb: '把硬體、軟體與效能放在同一張城市地圖裡思考。', pos: [590, 445] },
].map((r) => {
  const p = r.progress ? r.progress() : { done: 0, total: 0, unit: '', next: '內容規劃中' };
  return { ...r, ...p, ratio: p.total ? p.done / p.total : 0, open: Boolean(r.href) };
});

const STAGES = [
  [0, '空地'], [0.01, '地基'], [0.34, '骨架'], [0.67, '外牆'], [1, '完工'],
];
const stageOf = (ratio) => STAGES.reduce((name, [min, label]) => (ratio >= min ? label : name), '空地');

/* ---------- isometric drawing ---------- */
const el = (name, attrs = {}, parent) => {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
};
const pts = (arr) => arr.map((p) => p.join(',')).join(' ');

const MAX_W = 80;          // half-width of the fully grown footprint
const MIN_W = 28;          // footprint at first brick
const FLOORS = 6;
const FLOOR_H = 21;

function drawLot(svg, r) {
  const [cx, cy] = r.pos;
  const g = el('g', { class: `lot theme-${r.theme} ${r.open ? 'link' : 'planned'}`, tabindex: r.open ? 0 : -1, role: r.open ? 'link' : 'img', 'aria-label': `${r.name}，${stageOf(r.ratio)}，${Math.round(r.ratio * 100)}%` }, svg);
  const d = (w) => w / 2;

  // the footprint the building will eventually fill
  el('polygon', { class: 'lot-plot', points: pts([[cx, cy - d(MAX_W)], [cx + MAX_W, cy], [cx, cy + d(MAX_W)], [cx - MAX_W, cy]]) }, g);

  if (r.ratio > 0) {
    const w = MIN_W + (MAX_W - MIN_W) * r.ratio;
    const dd = d(w);
    // foundation slab
    el('polygon', { class: 'found', points: pts([[cx, cy - dd], [cx + w, cy], [cx, cy + dd], [cx - w, cy]]) }, g);

    const built = Math.floor(r.ratio * FLOORS + 1e-9);          // finished floors
    const partial = r.ratio * FLOORS - built > 1e-9 && built < FLOORS; // floor under construction
    const faces = (level, h, solid) => {
      const y0 = cy - level * FLOOR_H, y1 = y0 - h;
      const L = [[cx - w, y0], [cx, y0 + dd], [cx, y1 + dd], [cx - w, y1]];
      const R = [[cx, y0 + dd], [cx + w, y0], [cx + w, y1], [cx, y1 + dd]];
      if (solid) {
        el('polygon', { class: 'b-left', points: pts(L) }, g);
        el('polygon', { class: 'b-right', points: pts(R) }, g);
        // two lit windows per face, placed by bilinear interpolation on the face quad
        for (const face of [L, R]) {
          const [p00, p10, , p01] = face;
          const at = (u, v) => [p00[0] + (p10[0] - p00[0]) * u + (p01[0] - p00[0]) * v, p00[1] + (p10[1] - p00[1]) * u + (p01[1] - p00[1]) * v];
          for (const u of [0.18, 0.56]) {
            el('polygon', { class: 'win lit', points: pts([at(u, 0.3), at(u + 0.26, 0.3), at(u + 0.26, 0.75), at(u, 0.75)]) }, g);
          }
        }
        el('polyline', { class: 'b-line', points: pts([L[3], L[2], R[3]]) }, g);
      } else {
        // scaffolding: outline + corner posts
        el('polygon', { class: 'frame', points: pts(L) }, g);
        el('polygon', { class: 'frame', points: pts(R) }, g);
        for (const x of [cx - w, cx, cx + w]) {
          const yb = x === cx ? y0 + dd : y0;
          el('line', { class: 'post', x1: x, y1: yb, x2: x, y2: yb - h }, g);
        }
      }
    };

    for (let f = 0; f < built; f++) faces(f, FLOOR_H, true);
    if (partial) faces(built, FLOOR_H, false);

    // roof only when the whole building is done; otherwise an open top
    if (built > 0 && !partial) {
      const topY = cy - built * FLOOR_H;
      el('polygon', { class: 'b-top', points: pts([[cx, topY - dd], [cx + w, topY], [cx, topY + dd], [cx - w, topY]]) }, g);
      if (r.ratio >= 1) el('circle', { class: 'beacon', cx, cy: topY - 6, r: 4 }, g);
    }
  } else {
    el('text', { class: 'lot-sub', x: cx, y: cy + 4 }, g).textContent = '+';
  }

  const label = cy + MAX_W / 2 + 20;
  el('text', { class: 'lot-name', x: cx, y: label }, g).textContent = r.name;
  const sub = el('text', { class: r.open ? 'lot-pct' : 'lot-sub', x: cx, y: label + 15 }, g);
  sub.textContent = r.open ? `${stageOf(r.ratio)} · ${Math.round(r.ratio * 100)}%` : '空地 · 規劃中';

  if (r.open) {
    const go = () => { window.location.href = r.href; };
    g.addEventListener('click', go);
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  }
}

function drawCity() {
  const svg = $('#city');
  svg.innerHTML = '';
  el('title', { id: 'city-title' }, svg).textContent = 'Learning City 建設地圖';
  el('desc', { id: 'city-desc' }, svg).textContent = '每個區域的建築高度與底座大小代表你的學習進度。';
  el('path', { class: 'ground', d: 'M0 250L500 110 1000 250V560H0Z' }, svg);
  const roads = el('g', {}, svg);
  for (const d of ['M60 400L500 360 940 440', 'M420 300L330 440', 'M690 285L590 445', 'M690 285L860 410']) {
    el('path', { class: 'road', d }, roads);
    el('path', { class: 'road-lane', d }, roads);
  }
  // painter's order: back (small y) first
  [...REGIONS].sort((a, b) => a.pos[1] - b.pos[1]).forEach((r) => drawLot(svg, r));
}

/* ---------- today's pick ---------- */
function choose(intent) {
  const open = REGIONS.filter((r) => r.open);
  const inProgress = open.filter((r) => r.ratio > 0 && r.ratio < 1).sort((a, b) => b.ratio - a.ratio);
  const fresh = open.filter((r) => r.ratio === 0);
  const done = open.filter((r) => r.ratio >= 1);
  if (intent === 'new') return { region: fresh[0] || inProgress[0] || done[0], why: fresh[0] ? '還沒動工的區域，第一塊地基從這裡開始。' : '沒有未動工的開放區域，先回到進行中的工地。' };
  if (intent === 'review') return { region: done[0] || [...open].sort((a, b) => b.ratio - a.ratio)[0], why: done[0] ? '已完工的區域，花 15 分鐘檢查自己還記得多少。' : '還沒有完工的區域，先回頭看進度最高的那塊。' };
  return { region: inProgress[0] || fresh[0] || done[0], why: inProgress[0] ? '這是你進度最高、還沒蓋完的工地。' : fresh[0] ? '目前沒有進行中的工地，從一塊新地開始。' : '所有開放區域都完工了，可以複習或等待新區域。' };
}

let currentIntent = 'continue';
function renderPick() {
  const { region: r, why } = choose(currentIntent);
  const pct = Math.round(r.ratio * 100);
  $('#pick').innerHTML = `
    <span class="tag">TODAY'S PICK · ${r.index}</span>
    <h3>${r.name}</h3>
    <p>${why}<br />下一步：${r.next}</p>
    <div class="row"><a class="cta" href="${r.href}">${r.ratio >= 1 ? '回去複習 →' : r.ratio > 0 ? '繼續建設 →' : '開始動工 →'}</a><span class="stage">${stageOf(r.ratio)} · ${pct}%（${r.done} / ${r.total} ${r.unit}）</span></div>`;
  document.querySelectorAll('.card').forEach((c) => c.classList.toggle('recommended', c.dataset.id === r.id));
}

function renderCards() {
  $('#grid').innerHTML = REGIONS.map((r) => {
    const pct = Math.round(r.ratio * 100);
    const body = r.open
      ? `<div><div class="bar-label"><span>${stageOf(r.ratio)}</span><b>${pct}%（${r.done}/${r.total} ${r.unit}）</b></div><div class="bar"><i style="width:${pct}%"></i></div></div><a class="go" href="${r.href}">${r.ratio >= 1 ? '複習' : r.ratio > 0 ? '繼續' : '開始'} →</a>`
      : '<span class="soon">空地 · 內容規劃中</span>';
    return `<article class="card ${r.open ? 'open' : 'planned'}" data-id="${r.id}"><div class="card-top"><span>${r.index}</span><span class="badge">${r.open ? 'OPEN' : 'PLANNED'}</span></div><h3>${r.name}</h3><p>${r.blurb}</p>${body}</article>`;
  }).join('');
}

function renderMeter() {
  const total = Math.round((REGIONS.reduce((s, r) => s + r.ratio, 0) / REGIONS.length) * 100);
  $('#city-pct').textContent = `${total}%`;
  requestAnimationFrame(() => { $('#city-fill').style.width = `${total}%`; });
}

function renderGreeting() {
  const h = new Date().getHours();
  $('#greeting').textContent = h < 5 ? '夜深了' : h < 12 ? '早安' : h < 18 ? '午安' : '晚安';
  $('#today').textContent = new Date().toLocaleDateString('zh-Hant', { month: 'long', day: 'numeric', weekday: 'long' });
}

document.querySelectorAll('.intent').forEach((b) => b.addEventListener('click', () => {
  currentIntent = b.dataset.intent;
  document.querySelectorAll('.intent').forEach((x) => x.classList.toggle('on', x === b));
  renderPick();
}));

renderGreeting();
drawCity();
renderCards();
renderPick();
renderMeter();
