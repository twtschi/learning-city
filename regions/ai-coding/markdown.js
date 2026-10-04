/* A deliberately small, safe Markdown renderer for knowledge-base notes.
 * Supports: ##/###/#### headings, paragraphs, bullet and numbered lists (one nested level),
 * pipe tables, fenced code blocks (with a copy button), images from figures/ only, **bold**, `code`.
 * Everything is HTML-escaped first, so note content can never inject markup. */
(function () {
  const LC = (window.LC = window.LC || {});
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const inline = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  const isCJK = (ch) => /[　-鿿＀-￯]/.test(ch || '');

  const BULLET = /^(\s*)([-*]|\d+\.)\s+(.*)$/;
  const FENCE = /^```\s*([\w+-]*)\s*$/;
  const IMAGE = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/;
  const HEADING = /^(#{2,4})\s+(.*)$/;
  const TABLE_SEP = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

  const cells = (line) => line.replace(/^\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());

  function renderList(lines) {
    const ordered = /^\d+\./.test(lines[0].match(BULLET)[2]);
    const items = [];
    for (const line of lines) {
      const m = line.match(BULLET);
      if (m && m[1].length === 0) items.push({ text: m[3], children: [], extra: [] });
      else if (m && items.length) items[items.length - 1].children.push(m[3]);
      else if (items.length) items[items.length - 1].extra.push(line.trim());
    }
    const tag = ordered ? 'ol' : 'ul';
    const li = (it) => `<li>${inline([it.text, ...it.extra].join(' '))}${it.children.length ? `<ul>${it.children.map((c) => `<li>${inline(c)}</li>`).join('')}</ul>` : ''}</li>`;
    return `<${tag}>${items.map(li).join('')}</${tag}>`;
  }

  LC.mdInline = inline;

  LC.md = function md(src) {
    const lines = String(src).replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }

      let m = line.match(FENCE);
      if (m) {
        const lang = m[1] || 'text';
        const buf = [];
        i++;
        while (i < lines.length && !FENCE.test(lines[i])) buf.push(lines[i++]);
        i++;
        out.push(`<figure class="code"><figcaption><span>${esc(lang)}</span><button type="button" class="copy" data-copy>複製</button></figcaption><pre><code>${esc(buf.join('\n'))}</code></pre></figure>`);
        continue;
      }

      m = line.match(IMAGE);
      if (m && /^figures\/[\w.-]+$/.test(m[2])) {
        out.push(`<figure class="fig"><img src="${esc(LC.figureUrl ? LC.figureUrl(m[2]) : m[2])}" alt="${esc(m[1])}" loading="lazy" /><figcaption>${inline(m[1])}</figcaption></figure>`);
        i++;
        continue;
      }

      m = line.match(HEADING);
      if (m) { const level = m[1].length; out.push(`<h${level}>${inline(m[2])}</h${level}>`); i++; continue; }

      if (line.trim().startsWith('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1].trim())) {
        const head = cells(line);
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(cells(lines[i++]));
        out.push(`<div class="table-wrap"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
        continue;
      }

      if (BULLET.test(line)) {
        const buf = [];
        while (i < lines.length && lines[i].trim() && !FENCE.test(lines[i]) && (BULLET.test(lines[i]) || /^\s+\S/.test(lines[i]))) buf.push(lines[i++]);
        out.push(renderList(buf));
        continue;
      }

      const para = [];
      while (i < lines.length && lines[i].trim() && !FENCE.test(lines[i]) && !HEADING.test(lines[i]) && !BULLET.test(lines[i]) && !IMAGE.test(lines[i]) && !lines[i].trim().startsWith('|')) para.push(lines[i++].trim());
      out.push(`<p>${para.map((p, k) => (k && !(isCJK(para[k - 1].slice(-1)) || isCJK(p[0])) ? ' ' : '') + inline(p)).join('')}</p>`);
    }
    return out.join('\n');
  };
})();
