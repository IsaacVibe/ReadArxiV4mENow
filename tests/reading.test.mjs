import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { extractArticle, normalizeArxivId, retrievePaper } from '../server/paper-text.mjs';

const temporary = await mkdtemp(join(tmpdir(), 'raven-reading-tests-'));
after(() => rm(temporary, { recursive: true, force: true }));
async function compile(name) {
  const source = await readFile(new URL(`../src/utils/${name}.ts`, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const file = join(temporary, `${name}.mjs`); await writeFile(file, output); return import(pathToFileURL(file).href);
}
const { callLLM } = await compile('llm');
const { normalizeWorkspace } = await compile('workspace');
const { arxivIdentifier, preparePapers, referenceDocuments } = await compile('paperText');
const html = `<html><body><nav>navigation</nav><article class="ltx_document"><h1>Public fixture</h1><h2>Introduction</h2><p>${'Synthetic public test paragraph. '.repeat(60)}</p><h2>Results</h2><p><math alttext="E=mc^2">duplicate math</math></p><script>untrusted()</script></article></body></html>`;

test('accept modern, old and versioned IDs without a training-date cutoff; reject non-arXiv URLs', () => {
  assert.equal(normalizeArxivId('2604.22917v1'), '2604.22917v1');
  assert.equal(normalizeArxivId('astro-ph/0601001'), 'astro-ph/0601001');
  assert.equal(normalizeArxivId('../pdf/x'), null);
  assert.equal(arxivIdentifier('https://arxiv.org/pdf/2604.22917v1.pdf'), '2604.22917v1');
  assert.equal(arxivIdentifier('https://example.com/abs/2604.22917'), null);
});
test('extract article text and LaTeX, excluding navigation/scripts and non-article error pages', () => {
  const article = extractArticle(html);
  assert.ok(article.text.includes('$E=mc^2$'));
  assert.ok(article.text.includes('Results'));
  assert.ok(!article.text.includes('untrusted()'));
  assert.ok(!article.text.includes('navigation'));
  assert.equal(extractArticle('<html><p>not found</p></html>'), null);
});
test('fallback to ar5iv HTML without requesting PDF or following PDF redirects', async () => {
  const requests = [];
  const result = await retrievePaper('2604.22917', async url => {
    requests.push(url);
    return url.includes('ar5iv') ? new Response(html, { headers: { 'content-type': 'text/html' } })
      : new Response(null, { status: 302, headers: { location: 'https://arxiv.org/pdf/2604.22917' } });
  }, { throttle: false });
  assert.equal(result.status, 'available');
  assert.ok(result.sourceUrl.includes('ar5iv'));
  assert.ok(requests.every(url => new URL(url).pathname.startsWith('/html/')));
});
test('PDF-only or unavailable sources never masquerade as available HTML', async () => {
  const result = await retrievePaper('2604.22917', async () => new Response('%PDF not used', { headers: { 'content-type': 'application/pdf' } }), { throttle: false });
  assert.equal(result.status, 'unavailable');
});
test('stream parser preserves Chinese content across byte and SSE line boundaries', async t => {
  const wire = new TextEncoder().encode('data: {"choices":[{"delta":{"content":"中文公式"}}]}\r\n\r\ndata: {"choices":[{"delta":{"content":" E=mc^2"}}]}\n\ndata: [DONE]\n\n');
  t.mock.method(globalThis, 'fetch', async () => new Response(new ReadableStream({ start(controller) { for (const byte of wire) controller.enqueue(new Uint8Array([byte])); controller.close(); } })));
  let answer = ''; await callLLM([], '', 'https://example.com/v1', 'test', part => { answer += part; });
  assert.equal(answer, '中文公式 E=mc^2');
});
test('upstream errors provide actionable messages and cancellation reaches fetch', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('raw provider details', { status: 503 }));
  await assert.rejects(callLLM([], '', 'https://example.com/v1', 'test', () => {}), /服务暂时不可用/);
  const controller = new AbortController(); controller.abort();
  t.mock.method(globalThis, 'fetch', async (_url, options) => { options.signal.throwIfAborted(); });
  await assert.rejects(callLLM([], '', 'https://example.com/v1', 'test', () => {}, controller.signal), error => error.name === 'AbortError');
});
test('actual retrieved text enters the reference payload with provenance and honest coverage', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ status: 'available', text: 'BODY_NOT_PRESENT_IN_ABSTRACT', sourceUrl: 'https://arxiv.org/html/2604.22917', retrievedAt: '2026-10-26T00:00:00Z', truncated: false }), { headers: { 'content-type': 'application/json' } }));
  const paper = { title: 'Public test', url: 'https://arxiv.org/abs/2604.22917', authors: [], categories: [], summary: 'Abstract only' };
  const prepared = await preparePapers([paper], new AbortController().signal, () => {});
  assert.equal(prepared[0].source.status, 'full');
  assert.ok(referenceDocuments(prepared).includes('BODY_NOT_PRESENT_IN_ABSTRACT'));
  assert.ok(referenceDocuments(prepared).includes('https://arxiv.org/html/2604.22917'));
});
test('legacy workspace objects preserve conversation order and provenance on import', () => {
  const workspace = normalizeWorkspace({ date: '2026-10-26', papers: [], conversations: { a: { id: 'a', paperUrls: ['second', 'first'], messages: [{ role: 'assistant', content: 'answer', status: 'interrupted', sources: [{ paperUrl: 'first', status: 'full', sourceUrl: 'https://arxiv.org/html/2604.22917', chars: 2000, note: 'HTML' }] }] } }, conversationOrder: ['a'], activeConversationId: 'a' });
  assert.deepEqual(workspace.conversations[0].paperUrls, ['second', 'first']);
  assert.equal(workspace.conversations[0].messages[0].sources[0].chars, 2000);
  assert.equal(workspace.conversations[0].messages[0].status, 'interrupted');
  assert.throws(() => normalizeWorkspace({ papers: 'bad' }), /格式不匹配/);
});
