export interface ServerWorkspaceTarget {
  path: string;
  token: string;
  version: string;
}

export async function loadServerWorkspace(path: string, signal: AbortSignal) {
  const response = await fetch(`/api/workspace?path=${encodeURIComponent(path)}`, {
    headers: { 'X-Raven-Workspace': '1' }, cache: 'no-store', signal,
  });
  if (!response.ok) throw new Error('本地工作区写回服务不可用。');
  const result = await response.json();
  if (typeof result.token !== 'string' || typeof result.version !== 'string') throw new Error('无效的工作区写回授权。');
  return { workspace: result.workspace as unknown, target: { path, token: result.token, version: result.version } as ServerWorkspaceTarget };
}

// Browsers without a file writer can still reopen an unchanged project archive.
// Match the complete JSON, not merely its filename, before linking the original.
export async function findServerWorkspace(filename: string, original: unknown) {
  if (!/^RAVEN_[\w-]+\.json$|^papers\.json$/.test(filename)) return null;
  const month = /^RAVEN_(\d{6})\d{2}\.json$/.exec(filename)?.[1];
  const candidates = [...(month ? [`archive/${month}/${filename}`] : []), filename];
  for (const path of candidates) {
    try {
      const result = await loadServerWorkspace(path, AbortSignal.timeout(5000));
      if (JSON.stringify(result.workspace) === JSON.stringify(original)) return result.target;
    } catch { /* An external file must remain an imported copy. */ }
  }
  return null;
}

export async function saveServerWorkspace(target: ServerWorkspaceTarget, snapshot: string) {
  const response = await fetch(`/api/workspace?path=${encodeURIComponent(target.path)}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Raven-Workspace': '1', 'X-Raven-Token': target.token, 'If-Match': target.version },
    body: snapshot,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : '自动写回失败，请重试或导出副本。');
  if (typeof result.version !== 'string') throw new Error('保存结果未得到确认，请导出副本。');
  target.version = result.version;
}
