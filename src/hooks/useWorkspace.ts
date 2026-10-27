import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import { normalizeWorkspace, serializeWorkspace } from '../utils/workspace';
import { findServerWorkspace, loadServerWorkspace, saveServerWorkspace, type ServerWorkspaceTarget } from '../utils/workspacePersistence';

type SaveState = 'local' | 'linked' | 'saving' | 'saved' | 'error';
type PickerWindow = Window & { showOpenFilePicker?: (options: {
  multiple: boolean; mode: 'readwrite'; types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<FileSystemFileHandle[]> };

export function useWorkspace() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [filename, setFilename] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('local');
  const [savedAt, setSavedAt] = useState('');
  const loadController = useRef<AbortController>();
  const fileInput = useRef<HTMLInputElement>(null);
  const writeRef = useRef<() => void>(() => undefined);
  const serverTarget = useRef<ServerWorkspaceTarget | null>(null);
  const importIntent = useRef<'open' | 'copy'>('copy');

  const load = useCallback(async () => {
    loadController.current?.abort();
    const controller = new AbortController(); loadController.current = controller;
    setLoading(true); setLoadError('');
    const get = async (path: string) => {
      const response = await fetch(path, { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error('source unavailable');
      return response.json() as Promise<unknown>;
    };
    try {
      let target: ServerWorkspaceTarget | null = null;
      const getWorkspace = async (path: string) => {
        try {
          const result = await loadServerWorkspace(path.replace(/^\//, ''), controller.signal);
          const data = normalizeWorkspace(result.workspace);
          target = result.target;
          return data;
        } catch { return normalizeWorkspace(await get(path)); }
      };
      let latest: unknown;
      try {
        const index = await get('/latest.json') as { latest_file?: unknown };
        if (typeof index.latest_file === 'string') {
          const url = new URL(index.latest_file, window.location.origin);
          if (url.origin === window.location.origin) latest = await getWorkspace(url.pathname);
        }
      } catch { /* A broken index must not prevent the next source. */ }
      let data = latest;
      for (const fallback of ['/papers.json', '/example-papers.json']) {
        if (data || controller.signal.aborted) break;
        try { data = await getWorkspace(fallback); } catch { /* Try the next source. */ }
      }
      if (controller.signal.aborted) return;
      if (!data) throw new Error('没有找到可用的论文数据。请重试，或打开本地 JSON 工作区。');
      serverTarget.current = target;
      useStore.getState().hydrateWorkspace(data);
      setFilename(target ? (target as ServerWorkspaceTarget).path : ''); setSaveState(target ? 'linked' : 'local'); setSavedAt('');
    } catch (error) {
      if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : '论文加载失败，请重试。');
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }, []);

  useEffect(() => { void load(); return () => loadController.current?.abort(); }, [load]);

  useEffect(() => {
    let timer: number | undefined;
    let deadline: number | undefined;
    let queue = Promise.resolve();
    let disposed = false;
    const schedule = () => {
      window.clearTimeout(timer); window.clearTimeout(deadline); timer = deadline = undefined;
      const state = useStore.getState();
      const handle = state.workspaceFileHandle;
      const target = serverTarget.current;
      if (!handle && !target) return;
      const revision = state.workspaceRevision;
      const snapshot = JSON.stringify(serializeWorkspace(state), null, 2);
      const current = () => !disposed && useStore.getState().workspaceFileHandle === handle && serverTarget.current === target && useStore.getState().workspaceRevision === revision;
      const unchanged = () => current() && JSON.stringify(serializeWorkspace(useStore.getState()), null, 2) === snapshot;
      setSaveState('saving');
      queue = queue.catch(() => undefined).then(async () => {
        if (!current()) return;
        try {
          if (handle) {
            const writable = await handle.createWritable();
            if (!current()) { await writable.abort(); return; }
            await writable.write(snapshot); await writable.close();
          } else if (target) await saveServerWorkspace(target, snapshot);
          if (unchanged()) { setSaveState('saved'); setSavedAt(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })); }
        } catch (error) {
          if (current()) { setSaveState('error'); setNotice(error instanceof Error ? error.message : '自动写回失败，请重试或导出副本。'); }
        }
      });
    };
    writeRef.current = schedule;
    const unsubscribe = useStore.subscribe((state, previous) => {
      if ((!state.workspaceFileHandle && !serverTarget.current) || state.workspaceRevision !== previous.workspaceRevision || state.workspaceFileHandle !== previous.workspaceFileHandle) return;
      // Flush completed generations immediately; checkpoint streams at least every two seconds.
      if (previous.generationTask && !state.generationTask) { schedule(); return; }
      if (state.dailyData === previous.dailyData && state.conversations === previous.conversations && state.activeConversationId === previous.activeConversationId) return;
      window.clearTimeout(timer); setSaveState('saving');
      timer = window.setTimeout(schedule, 500);
      deadline ??= window.setTimeout(schedule, 2000);
    });
    const flush = () => { if (document.visibilityState === 'hidden' && timer !== undefined) schedule(); };
    document.addEventListener('visibilitychange', flush);
    return () => { disposed = true; window.clearTimeout(timer); window.clearTimeout(deadline); unsubscribe(); document.removeEventListener('visibilitychange', flush); };
  }, []);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      const state = useStore.getState();
      const hasNotes = state.conversationOrder.length > 0 || !!state.dailyData?.dailySummary || state.dailyData?.papers.some(p => !!p.aiSummary);
      if ((saveState === 'saving' || saveState === 'error') || (hasNotes && !state.workspaceFileHandle && !serverTarget.current)) {
        event.preventDefault(); event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [saveState]);

  const importFile = async (file: File, handle: FileSystemFileHandle | null = null) => {
    const linkProjectFile = importIntent.current === 'open'; importIntent.current = 'copy';
    try {
      const text = await file.text();
      let json: unknown;
      try { json = JSON.parse(text); } catch { throw new Error('无法解析 JSON。请检查文件格式，当前工作区保持不变。'); }
      const workspace = normalizeWorkspace(json);
      const current = useStore.getState();
      const hasNotes = current.conversationOrder.length > 0 || !!current.dailyData?.dailySummary || current.dailyData?.papers.some(p => !!p.aiSummary);
      if (hasNotes && saveState !== 'saved' && saveState !== 'linked' && !window.confirm('打开其他工作区会替换当前页面内容。尚未保存的研究记录请先导出。仍要继续打开吗？')) return;
      const target = !handle && linkProjectFile ? await findServerWorkspace(file.name, json) : null;
      loadController.current?.abort();
      serverTarget.current = target;
      useStore.getState().hydrateWorkspace(workspace);
      useStore.getState().setWorkspaceFileHandle(handle);
      setFilename(target?.path || file.name); setSaveState(handle || target ? 'linked' : 'local'); setSavedAt(''); setLoading(false); setLoadError('');
      setNotice(handle || target ? '工作区已打开，后续改动将自动写回此文件。' : '已导入副本。此浏览器未开启文件写回，请通过导出保存改动。');
    } catch (error) { setNotice(error instanceof Error ? error.message : '无法打开文件，当前工作区保持不变。'); }
  };
  const open = async () => {
    const picker = (window as PickerWindow).showOpenFilePicker;
    if (!picker) { importIntent.current = 'open'; fileInput.current?.click(); return; }
    try {
      const [handle] = await picker.call(window, { multiple: false, mode: 'readwrite', types: [{ description: 'RAVEN JSON 工作区', accept: { 'application/json': ['.json'] } }] });
      if (handle) await importFile(await handle.getFile(), handle);
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) setNotice('未能获得文件写回权限。你可以导入副本，之后通过导出保存。');
    }
  };
  return { loading, loadError, load, notice, setNotice, filename, saveState, savedAt, open, fileInput, importFile,
    importCopy: () => { importIntent.current = 'copy'; fileInput.current?.click(); }, retrySave: () => writeRef.current() };
}
