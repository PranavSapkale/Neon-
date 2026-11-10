const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inline = value => escapeHTML(value).replace(/\*\*(.+?)\*\*/g, '<mark>$1</mark>').replace(/(^|\s)(\d{4}[-/]\d{1,2}[-/]\d{1,2})(?=\s|[.,]|$)/g, '$1<time>$2</time>');
function parseNotes(raw) {
  const lines = raw.split(/\r?\n/), sections = [], toc = [], cards = [], push = (type, content, extra = {}) => sections.push({ type, content, ...extra });
  let i = 0, title = (lines.find(l => l.trim()) || 'UNTITLED NOTE').replace(/^#\s*/, '').trim();
  while (i < lines.length) {
    const line = lines[i], trimmed = line.trim();
    if (!trimmed) { i++; continue; }
    if (trimmed.startsWith('```')) { const lang = trimmed.slice(3).trim(), code = []; i++; while (i < lines.length && !lines[i].trim().startsWith('```')) code.push(lines[i++]); i++; push('code', escapeHTML(code.join('\n')), { lang }); continue; }
    let m = trimmed.match(/^(#{1,6})\s+(.+)/) || trimmed.match(/^(\d+(?:\.\d+)*)[.)]\s+(.+)/);
    if (m) { const text = m[2], id = `section-${toc.length}`; toc.push({ id, text }); push('heading', inline(text), { level: m[1].length || 2, id }); if (lines[i + 1]?.trim().match(/^[-*]\s+/)) cards.push({ front: text, back: lines[i + 1].replace(/^[-*]\s+/, ''), source: 'heading' }); i++; continue; }
    if (/^[A-Z][A-Z\s\d-]{3,}:?$/.test(trimmed) || /^\d+(?:\.\d+)*[.)]\s+/.test(trimmed)) { const id = `section-${toc.length}`; toc.push({ id, text: trimmed.replace(/:$/, '') }); push('heading', inline(trimmed), { level: 2, id }); i++; continue; }
    m = trimmed.match(/^(Note|Important|Remember|Tip|Warning):\s*(.+)/i); if (m) { push('callout', inline(m[2]), { label: m[1] }); i++; continue; }
    m = trimmed.match(/^Q:\s*(.+)/i); if (m && lines[i + 1]?.match(/^\s*A:\s*/i)) { push('qa', inline(m[1]), { answer: inline(lines[i + 1].replace(/^\s*A:\s*/i, '')) }); cards.push({ front: m[1], back: lines[i + 1].replace(/^\s*A:\s*/i, ''), source: 'qa' }); i += 2; continue; }
    m = trimmed.match(/^\?\?\s*(.+?)\s*::\s*(.+)$/); if (m) { cards.push({ front: m[1], back: m[2], source: 'manual' }); i++; continue; }
    if (trimmed.startsWith('|') || (lines[i + 1] && /^\s*[-,|]+\s*$/.test(lines[i + 1]))) { const rows = []; while (i < lines.length && lines[i].includes('|')) { rows.push(lines[i].split('|').slice(1, -1).map(x => inline(x.trim()))); i++; } push('table', rows); continue; }
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) { const items = []; while (i < lines.length && /^\s*(?:[-*]|\d+[.)])\s+/.test(lines[i])) { items.push({ depth: lines[i].match(/^\s*/)[0].length, text: inline(lines[i].replace(/^\s*(?:[-*]|\d+[.)])\s+/, '') ) }); i++; } push('list', items); continue; }
    m = trimmed.match(/^([^:]{2,40}):\s+(.+)$/) || trimmed.match(/^(.+?)\s+-\s+(.+)$/); if (m) { push('definition', `<strong>${inline(m[1])}</strong> — ${inline(m[2])}`); cards.push({ front: m[1], back: m[2], source: 'definition' }); i++; continue; }
    push('paragraph', inline(trimmed)); i++;
  }
  return { title, sections, toc, cards };
}
function renderPage(doc) {
  return `<article class="document"><h1 class="glitch" data-text="${escapeHTML(doc.title)}">${inline(doc.title)}</h1>${doc.sections.map((s, n) => {
    if (s.type === 'heading') return `<section class="doc-section" id="${s.id}"><h${Math.min(6, s.level + 1)}>${s.content}</h${Math.min(6, s.level + 1)}></section>`;
    if (s.type === 'paragraph') return `<p>${s.content}</p>`;
    if (s.type === 'definition') return `<div class="definition">${s.content}</div>`;
    if (s.type === 'callout') return `<aside class="callout ${s.label.toLowerCase()}"><b>${escapeHTML(s.label)}</b>${s.content}</aside>`;
    if (s.type === 'code') return `<div class="code-wrap"><button class="copy-code" data-code="${escapeHTML(s.content)}">COPY</button><pre><code>${s.content}</code></pre></div>`;
    if (s.type === 'list') return `<ul>${s.content.map(x => `<li style="margin-left:${Math.min(x.depth, 8)}ch">${x.text}</li>`).join('')}</ul>`;
    if (s.type === 'qa') return `<details class="qa"><summary>${s.content}</summary><p>${s.answer}</p></details>`;
    if (s.type === 'table') return `<div class="table-scroll"><table>${s.content.map((r, i) => `<tr>${r.map(c => i === 0 ? `<th>${c}</th>` : `<td>${c}</td>`).join('')}</tr>`).join('')}</table></div>`;
    return '';
  }).join('')}</article>`;
}
