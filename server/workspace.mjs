import { createHash, randomUUID } from 'node:crypto';
import { readFile, realpath, stat, open, rename, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

const MAX_BYTES = 16 * 1024 * 1024;
const versionOf = text => `"${createHash('sha256').update(text).digest('hex')}"`;
const fail = (status, message) => Object.assign(new Error(message), { status });

// Only existing daily JSON files inside public can become writable targets.
async function resolveWorkspace(publicDir, source) {
  if (typeof source !== 'string' || !/^(?:archive\/\d{6}\/)?RAVEN_[\w-]+\.json$|^papers\.json$/.test(source)) {
    throw fail(400, '不支持写回此文件。');
  }
  const root = await realpath(publicDir);
  const path = resolve(root, source);
  const actual = await realpath(path).catch(() => { throw fail(404, '原始工作区文件不存在。'); });
  const inside = relative(root, actual);
  if (actual !== path || inside.startsWith(`..${sep}`) || isAbsolute(inside)) throw fail(403, '不能写入项目数据目录之外的文件。');
  const info = await stat(actual);
  if (!info.isFile() || info.size > MAX_BYTES) throw fail(400, '工作区文件过大或格式不正确。');
  return actual;
}
function checkWorkspace(value) {
  if (!value || typeof value.date !== 'string' || !Array.isArray(value.papers) || value.papers.some(p => !p || typeof p.title !== 'string' || typeof p.url !== 'string')) {
    throw fail(400, '工作区需要有效的 date 和 papers。');
  }
  return value;
}
async function readBody(req) {
  const chunks = []; let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > MAX_BYTES) throw fail(413, '工作区内容超过保存上限，请导出副本。');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw fail(400, '无法解析工作区 JSON。'); }
}

export function createWorkspaceMiddleware(publicDir) {
  const grants = new Map();
  const queues = new Map();
  return async (req, res, next) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (url.pathname !== '/api/workspace') return next();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      // A cross-site form/image cannot obtain a grant or write a file.
      if (req.headers['x-raven-workspace'] !== '1' || req.headers['sec-fetch-site'] === 'cross-site') throw fail(403, '工作区请求来源不受信任。');
      if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) throw fail(403, '不允许跨站写回。');
      if (!['GET', 'PUT'].includes(req.method)) throw fail(405, '不支持此工作区操作。');
      const path = await resolveWorkspace(publicDir, url.searchParams.get('path'));
      if (req.method === 'GET') {
        const text = await readFile(path, 'utf8');
        const workspace = checkWorkspace(JSON.parse(text));
        const token = randomUUID();
        grants.set(token, { path, expires: Date.now() + 12 * 3600000 });
        while (grants.size > 128) grants.delete(grants.keys().next().value);
        res.end(JSON.stringify({ workspace, token, version: versionOf(text) }));
        return;
      }
      const grant = grants.get(req.headers['x-raven-token']);
      if (!grant || grant.path !== path || grant.expires < Date.now()) throw fail(403, '文件写回授权已失效，请重新打开页面或导出副本。');
      if (!req.headers['content-type']?.startsWith('application/json')) throw fail(415, '保存内容必须是 JSON。');
      const workspace = checkWorkspace(await readBody(req));
      const pending = (queues.get(path) || Promise.resolve()).catch(() => undefined).then(async () => {
        // Re-resolve before every write, then compare versions under a per-file queue.
        await resolveWorkspace(publicDir, url.searchParams.get('path'));
        const original = await readFile(path, 'utf8');
        if (req.headers['if-match'] !== versionOf(original)) throw fail(409, '文件已被其他页面或程序修改。请先导出本页记录，再重新打开文件。');
        const previous = checkWorkspace(JSON.parse(original));
        if (previous.date !== workspace.date || previous.papers.length !== workspace.papers.length || previous.papers.some((p, i) => p.url !== workspace.papers[i].url)) {
          throw fail(409, '论文列表已变化，未覆盖原始文件。请导出本页记录。');
        }
        // Preserve crawler metadata and extension fields that the UI does not use.
        const text = JSON.stringify({ ...previous, ...workspace, papers: workspace.papers.map((p, i) => ({ ...previous.papers[i], ...p })) }, null, 2) + '\n';
        const temporary = join(dirname(path), `.raven-${randomUUID()}.tmp`);
        try {
          const file = await open(temporary, 'wx', (await stat(path)).mode);
          try { await file.writeFile(text, 'utf8'); await file.sync(); } finally { await file.close(); }
          if (versionOf(await readFile(path, 'utf8')) !== req.headers['if-match']) throw fail(409, '文件在保存时发生变化，请导出副本后重新打开。');
          await rename(temporary, path);
        } finally { await rm(temporary, { force: true }); }
        grant.expires = Date.now() + 12 * 3600000;
        return versionOf(text);
      });
      queues.set(path, pending);
      try { res.end(JSON.stringify({ version: await pending })); }
      finally { if (queues.get(path) === pending) queues.delete(path); }
    } catch (error) {
      res.statusCode = error.status || 500;
      res.end(JSON.stringify({ error: error.status ? error.message : '自动写回失败，请检查文件写入权限或导出副本。' }));
    }
  };
}

export function workspacePlugin() {
  let publicDir;
  return {
    name: 'raven-workspace-persistence',
    config(config) {
      const root = resolve(config.root || process.cwd(), config.publicDir || 'public');
      // Writing notes must not trigger Vite's public-file full-page reload.
      return { server: { watch: { ignored: [`${root}/**/*.json`] } } };
    },
    configResolved(config) { publicDir = config.publicDir; },
    configureServer(server) { server.middlewares.use(createWorkspaceMiddleware(publicDir)); },
    configurePreviewServer(server) { server.middlewares.use(createWorkspaceMiddleware(publicDir)); },
  };
}
