// Render one chapter's slides (JSON from build_videos.py) to 1280x720 PNGs with headless Chromium.
// usage: node render_slides.mjs <slides.json> <out_dir>
// env: PLAYWRIGHT_MODULE (path to the playwright package), CHROMIUM_PATH (optional executable)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const [, , specPath, outDir] = process.argv;
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
const bullets = (items, cls = 'b') => `<ul class="${cls}">${items.map((t) => `<li>${inline(t)}</li>`).join('')}</ul>`;

function body(s, i, n) {
  switch (s.type) {
    case 'title':
      return `<div class="title"><p class="kicker">${esc(spec.kicker)}</p><h1>${inline(s.heading)}</h1>${s.sub ? `<p class="sub">${inline(s.sub)}</p>` : ''}<p class="tag">影片導讀</p></div>`;
    case 'big':
      return `<div class="big"><h2>${inline(s.heading || '')}</h2><p class="statement">${inline(s.text)}</p>${s.note ? `<p class="note">${inline(s.note)}</p>` : ''}</div>`;
    case 'bullets':
      return `<h2>${inline(s.heading)}</h2>${bullets(s.items)}${s.note ? `<p class="note">${inline(s.note)}</p>` : ''}`;
    case 'steps':
      return `<h2>${inline(s.heading)}</h2><ol class="steps">${s.items.map((t, k) => `<li><span>${k + 1}</span><p>${inline(t)}</p></li>`).join('')}</ol>${s.note ? `<p class="note">${inline(s.note)}</p>` : ''}`;
    case 'compare':
      return `<h2>${inline(s.heading)}</h2><div class="cols">${s.columns.map((c, k) => `<div class="col c${k}"><h3>${inline(c.title)}</h3>${bullets(c.items, 'b small')}</div>`).join('')}</div>${s.note ? `<p class="note">${inline(s.note)}</p>` : ''}`;
    case 'table':
      return `<h2>${inline(s.heading)}</h2><table><thead><tr>${s.rows[0].map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${s.rows.slice(1).map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>${s.note ? `<p class="note">${inline(s.note)}</p>` : ''}`;
    case 'figure':
      return `<h2>${inline(s.heading)}</h2><figure><img src="file://${path.resolve(spec.figuresDir, s.src)}"/>${s.caption ? `<figcaption>${inline(s.caption)}</figcaption>` : ''}</figure>`;
    case 'code':
      return `<h2>${inline(s.heading)}</h2><pre class="code"><span class="lang">${esc(s.lang || 'text')}</span>${esc(s.code)}</pre>${s.note ? `<p class="note">${inline(s.note)}</p>` : ''}`;
    case 'quiz':
      return `<h2>${inline(s.heading || '檢查點')}</h2><p class="q">${inline(s.q)}</p><div class="opts">${s.options.map((o, k) => `<div class="opt ${o.ok ? 'ok' : ''}"><b>${'ABCD'[k]}</b><span>${inline(o.text)}</span>${o.ok ? '<i>✓</i>' : ''}</div>`).join('')}</div>`;
    case 'end':
      return `<h2>${inline(s.heading || '重點回顧')}</h2>${bullets(s.items)}<p class="next">${inline(s.next || '接下來：完成本章的檢查點與思考練習')}</p>`;
    default:
      throw new Error(`unknown slide type ${s.type}`);
  }
}

const css = `
${(spec.fontCss || []).map((f) => `@import url("file://${f}");`).join('\n')}
:root{--bg:#091719;--ink:#e9f0e7;--muted:#9db4ac;--mint:#b9f06d;--coral:#fc8268;--sky:#8fc4d0;--line:rgba(209,231,211,.22)}
*{box-sizing:border-box}
html,body{margin:0;width:1280px;height:720px;background:var(--bg);color:var(--ink);font-family:'Noto Sans TC','WenQuanYi Zen Hei',sans-serif;-webkit-font-smoothing:antialiased}
.slide{position:relative;width:1280px;height:720px;padding:84px 92px 92px;overflow:hidden;
  background:radial-gradient(900px 520px at 88% -8%,rgba(185,240,109,.11),transparent 60%),radial-gradient(700px 500px at -10% 110%,rgba(143,196,208,.08),transparent 60%),linear-gradient(180deg,#0d1f22,#091719)}
.top,.foot{position:absolute;left:92px;right:92px;display:flex;justify-content:space-between;font:500 14px 'DM Mono',monospace;letter-spacing:.14em;color:var(--muted)}
.top{top:32px}.top b{color:var(--mint);font-weight:500}.foot{bottom:30px;letter-spacing:.06em}
.content{transform-origin:top left}
h1{font-size:58px;line-height:1.25;margin:0 0 22px;font-weight:700}
h2{font-size:40px;line-height:1.3;margin:0 0 30px;font-weight:700}
h3{font-size:26px;margin:0 0 16px}
strong{color:var(--mint);font-weight:700}
code{font-family:'DM Mono',monospace;font-size:.86em;color:#d6e8c8;background:rgba(0,0,0,.3);padding:1px 8px;border:1px solid var(--line)}
.title{position:absolute;left:92px;right:92px;top:170px}
.title .kicker{font:500 20px 'DM Mono',monospace;letter-spacing:.18em;color:var(--mint);margin:0 0 26px}
.title .sub{font-size:28px;color:var(--muted);line-height:1.6;margin:0;max-width:980px}
.title .tag{position:absolute;top:-70px;right:0;margin:0;font:500 16px 'DM Mono',monospace;letter-spacing:.2em;color:#08181b;background:var(--mint);padding:6px 14px}
ul.b{list-style:none;padding:0;margin:0}
ul.b li{font-size:29px;line-height:1.55;margin:0 0 18px;padding-left:38px;position:relative}
ul.b li::before{content:'';position:absolute;left:2px;top:.62em;width:13px;height:13px;background:var(--mint)}
ul.b.small li{font-size:24px;margin-bottom:12px;padding-left:30px}ul.b.small li::before{width:10px;height:10px}
ol.steps{list-style:none;padding:0;margin:0;counter-reset:s}
ol.steps li{display:flex;gap:22px;align-items:flex-start;margin:0 0 18px}
ol.steps li span{flex:0 0 46px;height:46px;display:grid;place-items:center;font:700 22px 'DM Mono',monospace;color:#08181b;background:var(--mint)}
ol.steps li p{margin:4px 0 0;font-size:28px;line-height:1.5}
.cols{display:flex;gap:28px}.col{flex:1;border:1px solid var(--line);padding:22px 24px;background:rgba(0,0,0,.18)}
.col.c0 h3{color:var(--mint)}.col.c1 h3{color:var(--coral)}.col.c2 h3{color:var(--sky)}
table{border-collapse:collapse;width:100%;font-size:23px}th,td{border-bottom:1px solid var(--line);padding:12px 14px;text-align:left;line-height:1.45;vertical-align:top}
th{color:var(--mint);font-weight:700;font-size:21px;letter-spacing:.04em}
figure{margin:0;text-align:center}figure img{max-width:100%;max-height:430px;border:1px solid var(--line);background:rgba(0,0,0,.25)}
figcaption{margin-top:14px;font-size:21px;color:var(--muted)}
pre.code{position:relative;margin:0;padding:26px 28px 22px;background:#06141a;border:1px solid var(--line);font:20px/1.55 'DM Mono',monospace;color:#d6e8c8;white-space:pre}
pre.code .lang{position:absolute;top:6px;right:12px;font-size:12px;letter-spacing:.14em;color:var(--muted);text-transform:uppercase}
.note{margin-top:24px;font-size:23px;color:var(--muted);line-height:1.6;border-left:4px solid var(--coral);padding-left:18px}
.big{position:absolute;left:92px;right:92px;top:150px}.big h2{color:var(--muted);font-size:28px;font-weight:500;letter-spacing:.06em}
.statement{font-size:46px;line-height:1.5;font-weight:700;margin:0}
.q{font-size:29px;line-height:1.55;margin:0 0 22px}
.opts{display:grid;gap:12px}.opt{display:flex;gap:16px;align-items:flex-start;border:1px solid var(--line);padding:12px 18px;font-size:22px;line-height:1.5;background:rgba(0,0,0,.18)}
.opt b{font-family:'DM Mono',monospace;color:var(--muted)}.opt.ok{border-color:var(--mint);background:rgba(185,240,109,.10)}.opt.ok b{color:var(--mint)}.opt i{margin-left:auto;color:var(--mint);font-style:normal;font-weight:700}
.next{margin-top:30px;font-size:24px;color:#08181b;background:var(--mint);display:inline-block;padding:10px 18px}
`;

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const n = spec.slides.length;
for (let i = 0; i < n; i++) {
  const s = spec.slides[i];
  const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><style>${css}</style></head><body>
    <div class="slide"><div class="top"><span><b>AI CODING</b> · ${esc(spec.week)}</span><span>${String(i + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}</span></div>
    <div class="content">${body(s, i, n)}</div>
    <div class="foot"><span>${esc(spec.title)}</span><span>LEARNING CITY</span></div></div></body></html>`;
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(async () => {
    const text = document.body.innerText;
    await Promise.all(['400', '700'].map((w) => document.fonts.load(`${w} 40px "Noto Sans TC"`, text)));
    await document.fonts.load('500 20px "DM Mono"', text);
    await document.fonts.ready;
  });
  // shrink-to-fit: keep the content inside the safe area above the footer
  const over = await page.evaluate(() => {
    const c = document.querySelector('.content'); const avail = 720 - 84 - 92;
    const h = c.scrollHeight; const w = c.scrollWidth; const aw = 1280 - 184;
    const k = Math.min(1.22, avail / h, aw / w);          // shrink to fit, or enlarge sparse slides a little
    if (Math.abs(k - 1) > 0.02) c.style.transform = `scale(${k})`;
    return k;
  });
  if (over < 0.8) console.error(`warn: slide ${i + 1} scaled to ${over.toFixed(2)} (too much content)`);
  await page.screenshot({ path: path.join(outDir, `slide-${String(i + 1).padStart(2, '0')}.png`) });
}
await browser.close();
