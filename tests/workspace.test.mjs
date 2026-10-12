import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { build } from 'esbuild';

const compiled = await build({
  entryPoints: ['src/lib/workspace.ts'], bundle: true, write: false, format: 'esm', platform: 'node',
});
const { loadInitialData, parseWorkspace } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`
);
const sample = JSON.parse(await readFile(new URL('../public/example-papers.json', import.meta.url)));

function mockFetch(context, responses) {
  const requests = [];
  context.mock.method(globalThis, 'fetch', async (url) => {
    requests.push(url);
    const response = responses[url];
    if (response instanceof Error) throw response;
    if (typeof response === 'string') return new Response(response);
    return new Response(JSON.stringify(response ?? null), { status: response === undefined ? 404 : 200 });
  });
  return requests;
}

test('new checkout falls back to the public example', async (context) => {
  const requests = mockFetch(context, { '/example-papers.json': sample });
  assert.deepEqual((await loadInitialData()).papers, sample.papers);
  assert.deepEqual(requests, ['/latest.json', '/papers.json', '/example-papers.json']);
});

test('invalid JSON index still permits legacy data', async (context) => {
  const requests = mockFetch(context, { '/latest.json': '<html>not JSON</html>', '/papers.json': sample });
  assert.equal((await loadInitialData()).total, 3);
  assert.deepEqual(requests, ['/latest.json', '/papers.json']);
});

test('invalid indexed data and a failed legacy request still permit the example', async (context) => {
  const requests = mockFetch(context, {
    '/latest.json': { latest_file: 'archive/202604/RAVEN_20260427.json' },
    '/archive/202604/RAVEN_20260427.json': { date: '2026-04-27', papers: [{ title: 'incomplete' }] },
    '/papers.json': new Error('offline'), '/example-papers.json': sample,
  });
  assert.equal((await loadInitialData()).total, 3);
  assert.equal(requests.length, 4);
});

test('valid index takes priority and missing data returns null', async (context) => {
  const requests = mockFetch(context, { '/latest.json': { latest_file: 'daily.json' }, '/daily.json': sample });
  assert.equal((await loadInitialData()).total, 3);
  assert.deepEqual(requests, ['/latest.json', '/daily.json']);
  context.mock.restoreAll();
  mockFetch(context, {});
  assert.equal(await loadInitialData(), null);
});

test('plain daily files and saved conversations round-trip through import', () => {
  const legacy = parseWorkspace(sample);
  assert.deepEqual(legacy.conversations, []);
  assert.equal(legacy.activeConversationId, null);
  const conversation = {
    id: 'context-1', title: 'Example discussion', paperUrls: [sample.papers[0].url],
    messages: [{ id: 'message-1', role: 'assistant', content: 'A formula: $E=mc^2$' }],
    createdAt: 1, updatedAt: 2,
  };
  const workspace = { ...sample, dailySummary: 'Example summary', conversations: [conversation],
    conversationOrder: [conversation.id], activeConversationId: conversation.id };
  assert.deepEqual(parseWorkspace(JSON.parse(JSON.stringify(workspace))), workspace);
  assert.equal(parseWorkspace({ date: 'bad', papers: [{}] }), null);
  assert.equal(parseWorkspace(null), null);
});
