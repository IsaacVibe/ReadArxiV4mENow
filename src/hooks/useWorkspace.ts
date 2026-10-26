import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import { normalizeWorkspace, serializeWorkspace } from '../utils/workspace';

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

  const load = useCallback(async () => {
    loadController.current?.abort();
    const controller = new AbortController(); loadController.current = controller;
    setLoading(true); setLoadError('');
    const get = async (path: string) => {
      const response = await fetch(path, { signal: controller.signal });
      if (!response.ok) throw new Error('source unavailable');
      return response.json() as Promise<unknown>;
    };
    try {
      let latest: unknown;
      try {
        const index = await get('/latest.json') as { latest_file?: unknown };
        if (typeof index.latest_file === 'string') {
          const url = new URL(index.latest_file, window.location.origin);
          if (url.origin === window.location.origin) latest = normalizeWorkspace(await get(url.pathname));
        }
      } catch { /* A broken index must not prevent the next source. */ }
      let data = latest;
      for (const fallback of ['/papers.json', '/example-papers.json']) {
        if (data || controller.signal.aborted) break;
        try { data = normalizeWorkspace(await get(fallback)); } catch { /* Try the next source. */ }
      }
      if (controller.signal.aborted) return;
      if (!data) throw new Error('没有找到可用的论文数据。请重试，或打开本地 JSON 工作区。');
      useStore.getState().hydrateWorkspace(data); setFilename(''); setSaveState('local');
    } catch (error) {
      if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : '论文加载失败，请重试。');
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }, []);

  useEffect(() => { void load(); return () => loadController.current?.abort(); }, [load]);

  useEffect(() => {
    let timer: number | undefined;
    let queue = Promise.resolve();
    let disposed = false;
    const schedule = () => {
      const state = useStore.getState();
      const handle = state.workspaceFileHandle;
      if (!handle) return;
      const revision = state.workspaceRevision;
      const snapshot = JSON.stringify(serializeWorkspace(state), null, 2);
      const current = () => !disposed && useStore.getState().workspaceFileHandle === handle && useStore.getState().workspaceRevision === revision;
      setSaveState('saving');
      queue = queue.catch(() => undefined).then(async () => {
        if (!current()) return;
        try {
          const writable = await handle.createWritable();
          if (!current()) { await writable.abort(); return; }
          await writable.write(snapshot); await writable.close();
          if (current()) { setSaveState('saved'); setSavedAt(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })); }
        } catch {
          if (current()) { setSaveState('error'); setNotice('自动写回失败，内容仍保留在本页。请重试保存或导出副本。'); }
        }
      });
    };
    writeRef.current = schedule;
    const unsubscribe = useStore.subscribe((state, previous) => {
      if (!state.workspaceFileHandle || state.workspaceFileHandle !== previous.workspaceFileHandle) return;
      if (state.dailyData === previous.dailyData && state.conversations === previous.conversations && state.activeConversationId === previous.activeConversationId) return;
      window.clearTimeout(timer); setSaveState('saving');
      timer = window.setTimeout(schedule, 800);
    });
    return () => { disposed = true; window.clearTimeout(timer); unsubscribe(); };
  }, []);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      const state = useStore.getState();
      if ((saveState === 'saving' || saveState === 'error') || (state.conversationOrder.length > 0 && !state.workspaceFileHandle)) {
        event.preventDefault(); event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [saveState]);

  const importFile = async (file: File, handle: FileSystemFileHandle | null = null) => {
    try {
      const text = await file.text();
      let json: unknown;
      try { json = JSON.parse(text); } catch { throw new Error('无法解析 JSON。请检查文件格式，当前工作区保持不变。'); }
      const workspace = normalizeWorkspace(json);
      const current = useStore.getState();
      const hasNotes = current.conversationOrder.length > 0 || !!current.dailyData?.dailySummary || current.dailyData?.papers.some(p => !!p.aiSummary);
      if (hasNotes && saveState !== 'saved' && saveState !== 'linked' && !window.confirm('打开其他工作区会替换当前页面内容。尚未保存的研究记录请先导出。仍要继续打开吗？')) return;
      loadController.current?.abort();
      useStore.getState().hydrateWorkspace(workspace);
      useStore.getState().setWorkspaceFileHandle(handle);
      setFilename(file.name); setSaveState(handle ? 'linked' : 'local'); setLoading(false); setLoadError('');
      setNotice(handle ? '工作区已打开，后续改动将自动写回此文件。' : '已导入副本。此浏览器未开启文件写回，请通过导出保存改动。');
    } catch (error) { setNotice(error instanceof Error ? error.message : '无法打开文件，当前工作区保持不变。'); }
  };
  const open = async () => {
    const picker = (window as PickerWindow).showOpenFilePicker;
    if (!picker) { fileInput.current?.click(); return; }
    try {
      const [handle] = await picker.call(window, { multiple: false, mode: 'readwrite', types: [{ description: 'RAVEN JSON 工作区', accept: { 'application/json': ['.json'] } }] });
      if (handle) await importFile(await handle.getFile(), handle);
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) setNotice('未能获得文件写回权限。你可以导入副本，之后通过导出保存。');
    }
  };
  return { loading, loadError, load, notice, setNotice, filename, saveState, savedAt, open, fileInput, importFile,
    importCopy: () => fileInput.current?.click(), retrySave: () => writeRef.current() };
}
