import { parse } from 'parse5';

const hosts = new Set(['arxiv.org', 'ar5iv.labs.arxiv.org']);
const cache = new Map();
const inflight = new Map();
let upstreamQueue = Promise.resolve();
let lastRequest = 0;
const MAX_BYTES = 6 * 1024 * 1024;
const MAX_TEXT = 180000;

export function normalizeArxivId(value) {
  if (typeof value !== 'string') return null;
  const id = value.replace(/\.pdf$/i, '');
  return /^(?:\d{4}\.\d{4,5}|[a-z][a-z.-]+(?:\.[A-Z]{2})?\/\d{7})(?:v[1-9]\d*)?$/.test(id) ? id : null;
}
const baseId = id => id.replace(/v\d+$/, '');
const attr = (node, name) => node.attrs?.find(a => a.name === name)?.value || '';
const children = node => node.childNodes || [];
function find(node, predicate) {
  if (predicate(node)) return node;
  for (const child of children(node)) { const result = find(child, predicate); if (result) return result; }
}
const plain = node => node.nodeName === '#text' ? node.value : children(node).map(plain).join('');

export function extractArticle(html) {
  const document = parse(html);
  const article = find(document, n => n.tagName === 'article' && attr(n, 'class').split(/\s+/).includes('ltx_document'));
  if (!article) return null;
  const title = find(article, n => n.tagName === 'h1');
  const skip = new Set(['script', 'style', 'nav', 'form', 'button', 'input', 'textarea', 'select', 'noscript', 'svg']);
  const block = new Set(['p', 'div', 'section', 'article', 'figure', 'figcaption', 'table', 'tr', 'li', 'blockquote']);
  const text = node => {
    if (node.nodeName === '#text') return node.value;
    if (skip.has(node.tagName)) return '';
    if (node.tagName === 'math') {
      const annotation = find(node, n => n.tagName === 'annotation' && attr(n, 'encoding').includes('tex'));
      const latex = attr(node, 'alttext') || (annotation && plain(annotation));
      return latex ? (attr(node, 'display') === 'block' ? `\n$$${latex}$$\n` : `$${latex}$`) : plain(node);
    }
    if (node.tagName === 'img') return attr(node, 'alt') ? ` [图像替代文本：${attr(node, 'alt')}] ` : '';
    const content = children(node).map(text).join('');
    if (/^h[1-6]$/.test(node.tagName || '')) return `\n\n${'#'.repeat(Number(node.tagName[1]))} ${content}\n\n`;
    if (node.tagName === 'br') return '\n';
    if (node.tagName === 'td' || node.tagName === 'th') return ` ${content} | `;
    return block.has(node.tagName) ? `\n${content}\n` : content;
  };
  const body = text(article).replace(/[\t\r ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const sections = [];
  const collect = node => {
    if (/^h[2-6]$/.test(node.tagName || '')) sections.push(plain(node).trim());
    children(node).forEach(collect);
  };
  collect(article);
  if (body.length < 1200 || sections.length < 2) return null;
  return { title: title ? plain(title).replace(/\s+/g, ' ').trim() : '',
    text: body.slice(0, MAX_TEXT), totalChars: body.length, truncated: body.length > MAX_TEXT, sections: sections.slice(0, 80) };
}

async function limitedHtml(response) {
  if (!response.headers.get('content-type')?.toLowerCase().includes('text/html') || !response.body) {
    await response.body?.cancel(); throw new Error('not-html');
  }
  const reader = response.body.getReader(); const decoder = new TextDecoder();
  let bytes = 0; let html = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) throw new Error('too-large');
      html += decoder.decode(value, { stream: true });
    }
    return html + decoder.decode();
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}

async function fetchHtml(initialUrl, id, fetcher) {
  let url = initialUrl;
  for (let count = 0; count < 4; count++) {
    const parsed = new URL(url);
    const targetId = normalizeArxivId(decodeURIComponent(parsed.pathname.replace(/^\/html\//, '')));
    if (parsed.protocol !== 'https:' || !hosts.has(parsed.hostname) || !parsed.pathname.startsWith('/html/') || !targetId || baseId(targetId) !== baseId(id) || (/v\d+$/.test(id) && targetId !== id)) throw new Error('unsafe-redirect');
    const response = await fetcher(url, { redirect: 'manual', signal: AbortSignal.timeout(18000), headers: { Accept: 'text/html', 'User-Agent': 'RAVEN-Reader/1.0 (HTML-only personal research reader)' } });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location'); await response.body?.cancel();
      if (!location) throw new Error('redirect-without-location');
      url = new URL(location, url).href; continue;
    }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`upstream-${response.status}`); }
    return { html: await limitedHtml(response), url };
  }
  throw new Error('redirect-limit');
}

export async function retrievePaper(id, fetcher = fetch, { throttle = true } = {}) {
  if (!normalizeArxivId(id)) throw new Error('invalid-id');
  for (const host of ['arxiv.org', 'ar5iv.labs.arxiv.org']) {
    try {
      if (throttle) {
        const task = upstreamQueue.then(async () => {
          const wait = Math.max(0, 3000 - (Date.now() - lastRequest));
          if (wait) await new Promise(resolve => setTimeout(resolve, wait));
          lastRequest = Date.now();
        });
        upstreamQueue = task.catch(() => undefined); await task;
      }
      const result = await fetchHtml(`https://${host}/html/${id}`, id, fetcher);
      const article = extractArticle(result.html);
      if (article) return { status: 'available', id, sourceUrl: result.url, retrievedAt: new Date().toISOString(), ...article };
    } catch { /* A missing HTML rendition is not proof that the arXiv ID is invalid. */ }
  }
  return { status: 'unavailable', id, reason: '未取得可用的 HTML 原文：可能未提供网页版本，或来源暂时不可达。不能据此判断 arXiv 编号无效。' };
}

export function paperTextPlugin() {
  const middleware = async (req, res, next) => {
    const request = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (request.pathname !== '/api/paper-text') return next();
    res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method !== 'GET') { res.statusCode = 405; res.end(JSON.stringify({ error: '只支持读取请求。' })); return; }
    if (req.headers.origin) {
      try {
        if (new URL(req.headers.origin).host !== req.headers.host) { res.statusCode = 403; res.end('{}'); return; }
      } catch { res.statusCode = 403; res.end('{}'); return; }
    }
    const id = normalizeArxivId(request.searchParams.get('id'));
    if (!id) { res.statusCode = 400; res.end(JSON.stringify({ error: '不支持的 arXiv 编号格式。' })); return; }
    try {
      let entry = cache.get(id);
      if (!entry || entry.expires < Date.now()) {
        let pending = inflight.get(id);
        if (!pending) {
          pending = retrievePaper(id).then(data => {
            cache.delete(id); cache.set(id, { data, expires: Date.now() + (data.status === 'available' ? 3600000 : 60000) });
            while (cache.size > 24) cache.delete(cache.keys().next().value);
            return data;
          }).finally(() => inflight.delete(id));
          inflight.set(id, pending);
        }
        entry = { data: await pending };
      }
      if (!res.destroyed) res.end(JSON.stringify(entry.data));
    } catch { res.statusCode = 502; res.end(JSON.stringify({ error: '网页原文读取暂时失败。' })); }
  };
  return { name: 'raven-html-paper-reader', configureServer(server) { server.middlewares.use(middleware); }, configurePreviewServer(server) { server.middlewares.use(middleware); } };
}
