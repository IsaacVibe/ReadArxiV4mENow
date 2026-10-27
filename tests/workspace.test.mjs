import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createWorkspaceMiddleware } from '../server/workspace.mjs';

const directory = await mkdtemp(join(tmpdir(), 'raven-workspace-tests-'));
after(() => rm(directory, { recursive: true, force: true }));
const fixture = { date: '2099-01-01', crawlerMetadata: { untouched: true }, papers: [{ title: 'Public fixture', url: 'https://arxiv.org/abs/2402.07716', authors: [], categories: [], summary: 'Public abstract', extraField: 'preserved' }] };
async function setup(t) {
  const root = await mkdtemp(join(directory, 'case-'));
  await mkdir(join(root, 'archive/209901'), { recursive: true });
  const source = 'archive/209901/RAVEN_20990101.json';
  const path = join(root, source);
  await writeFile(path, JSON.stringify(fixture));
  const middleware = createWorkspaceMiddleware(root);
  const server = createServer((req, res) => void middleware(req, res, () => { res.statusCode = 404; res.end(); }));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = (options = {}, name = source) => fetch(`${origin}/api/workspace?path=${encodeURIComponent(name)}`, { ...options, headers: { 'X-Raven-Workspace': '1', ...options.headers } });
  const grant = await (await request()).json();
  const save = (workspace, version = grant.version, token = grant.token) => request({ method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Raven-Token': token, 'If-Match': version }, body: JSON.stringify(workspace) });
  return { root, path, origin, request, grant, save };
}
test('daily highlights and per-paper summaries survive save, reopening and subsequent updates without metadata loss', async t => {
  const { path, request, grant, save } = await setup(t);
  const workspace = { ...grant.workspace, dailySummary: '今日亮点：公开测试。', papers: grant.workspace.papers.map(p => ({ title: p.title, url: p.url, aiSummary: '一句话摘要：公开测试。' })), conversations: [] };
  const response = await save(workspace); assert.equal(response.status, 200);
  const next = await response.json(); assert.notEqual(next.version, grant.version);
  const reopened = await (await request()).json();
  assert.equal(reopened.workspace.dailySummary, workspace.dailySummary);
  assert.equal(reopened.workspace.papers[0].aiSummary, workspace.papers[0].aiSummary);
  assert.equal(reopened.workspace.papers[0].extraField, 'preserved');
  assert.equal(reopened.workspace.papers[0].summary, 'Public abstract');
  assert.deepEqual(reopened.workspace.crawlerMetadata, { untouched: true });
  assert.equal((await save({ ...workspace, dailySummary: '更新后的亮点' }, next.version)).status, 200);
  assert.equal(JSON.parse(await readFile(path, 'utf8')).dailySummary, '更新后的亮点');
  assert.ok(!(await readdir(join(path, '..'))).some(name => name.endsWith('.tmp')));
});
test('stale saves and wrong-day snapshots cannot overwrite a changed workspace', async t => {
  const { path, grant, save } = await setup(t);
  assert.equal((await save({ ...grant.workspace, date: '2099-01-02' })).status, 409);
  const results = await Promise.all([save({ ...grant.workspace, dailySummary: 'first' }), save({ ...grant.workspace, dailySummary: 'second' })]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  const text = await readFile(path, 'utf8');
  assert.equal((await save(grant.workspace)).status, 409);
  assert.equal(await readFile(path, 'utf8'), text);
});
test('reject cross-site requests, missing grants, traversal, symlinks, example files and absent targets', async t => {
  const { root, origin, request, grant, save } = await setup(t);
  assert.equal((await fetch(`${origin}/api/workspace?path=papers.json`)).status, 403);
  assert.equal((await request({ headers: { Origin: 'https://untrusted.example' } })).status, 403);
  assert.equal((await save(grant.workspace, grant.version, 'no-grant')).status, 403);
  for (const source of ['../RAVEN_outside.json', '.env', 'latest.json', 'example-papers.json']) assert.equal((await request({}, source)).status, 400);
  assert.equal((await request({}, 'RAVEN_missing.json')).status, 404);
  const outside = join(directory, 'RAVEN_outside.json');
  await writeFile(outside, JSON.stringify(fixture));
  await symlink(outside, join(root, 'RAVEN_symlink.json'));
  assert.equal((await request({}, 'RAVEN_symlink.json')).status, 403);
});
