import { useEffect, useRef, useState } from 'react';
import { useStore } from './store/useStore';
import { PaperList } from './components/PaperList';
import { ChatPanel } from './components/ChatPanel';
import { FileUp } from 'lucide-react';
import { motion } from 'framer-motion';
import { loadInitialData, type FilePickerWindow } from './lib/workspace';

function App() {
  const { setDailyData, hydrateWorkspace, model, setModel } = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [leftWidth, setLeftWidth] = useState(420);

  useEffect(() => {
    let cancelled = false;
    loadInitialData().then((data) => {
      // A slow startup fetch must not replace a workspace the user already opened.
      if (!cancelled && data && !useStore.getState().dailyData) setDailyData(data);
    });
    return () => { cancelled = true; };
  }, [setDailyData]);

  const startResizeLeft = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = leftWidth;

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const next = startWidth + dx;
      const min = 320;
      const max = Math.max(min, window.innerWidth - 360);
      setLeftWidth(Math.min(Math.max(next, min), max));
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  useEffect(() => {
    let timer: number | null = null;
    let writing = false;
    let pending = false;

    const buildWorkspacePayload = () => {
      const state = useStore.getState();
      const orderedConversations = state.conversationOrder.map((id) => state.conversations[id]).filter(Boolean);
      return {
        ...(state.dailyData || {}),
        conversations: orderedConversations,
        conversationOrder: orderedConversations.map((c) => c.id),
        activeConversationId: state.activeConversationId,
      };
    };

    const writeNow = async () => {
      const handle = useStore.getState().workspaceFileHandle;
      if (!handle) return;
      if (typeof handle.createWritable !== 'function') return;
      if (writing) {
        pending = true;
        return;
      }

      const payload = JSON.stringify(buildWorkspacePayload(), null, 2);
      writing = true;
      try {
        const writable = await handle.createWritable();
        await writable.write(payload);
        await writable.close();
      } catch (err) {
        console.error('Failed to write workspace JSON:', err);
      } finally {
        writing = false;
        if (pending) {
          pending = false;
          await writeNow();
        }
      }
    };

    const unsub = useStore.subscribe((state, prevState) => {
      if (state.workspaceFileHandle !== prevState.workspaceFileHandle) {
        if (timer) window.clearTimeout(timer);
        pending = false;
        return;
      }
      if (!state.workspaceFileHandle) return;
      const changed =
        state.dailyData !== prevState.dailyData ||
        state.conversations !== prevState.conversations ||
        state.conversationOrder !== prevState.conversationOrder ||
        state.activeConversationId !== prevState.activeConversationId;
      if (!changed) return;

      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        writeNow();
      }, 800);
    });

    return () => {
      unsub();
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  const handleOpenWritableJson = async () => {
    try {
      const pickerWindow = window as FilePickerWindow;
      const picker = pickerWindow.showOpenFilePicker;
      if (typeof picker !== 'function') {
        fileInputRef.current?.click();
        return;
      }

      const [handle] = await picker.call(pickerWindow, {
        multiple: false,
        mode: 'readwrite',
        types: [
          {
            description: 'JSON',
            accept: { 'application/json': ['.json'] },
          },
        ],
      });
      if (!handle) return;
      const file = await handle.getFile();
      const text = await file.text();
      const json: unknown = JSON.parse(text);
      if (!hydrateWorkspace(json, handle)) {
        alert('JSON 文件格式不匹配，请确保是 fetch_arxiv.py 生成的当日文件或网页导出的当日 JSON 文件。');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json: unknown = JSON.parse(event.target?.result as string);
        if (!hydrateWorkspace(json)) {
          alert('JSON 文件格式不匹配，请确保是 fetch_arxiv.py 生成的当日文件或网页导出的当日 JSON 文件。');
        }
      } catch {
        alert('解析 JSON 文件失败，请确保文件格式正确。');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200 font-sans overflow-hidden">
      {/* Left Sidebar */}
      <motion.div 
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="h-full flex flex-col z-20"
        style={{ width: leftWidth }}
      >
        {/* App Header */}
        <div className="h-16 px-5 flex items-center justify-between bg-slate-950 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <div className="relative w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center overflow-hidden shadow-lg">
              <span className="text-slate-200 font-bold text-sm">R</span>
              <img src="/raven.png" alt="RAVEN" className="absolute inset-0 w-full h-full object-contain" />
            </div>
            <div className="leading-tight">
              <h1 className="font-semibold tracking-wide bg-gradient-to-r from-slate-100 to-slate-400 bg-clip-text text-transparent">
                RAVEN
              </h1>
              <div className="text-[10px] text-slate-500 font-mono tracking-wide">
                Read ArxiV 4 mE Now
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <input type="file" accept=".json" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
            <button
              onClick={handleOpenWritableJson}
              className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-slate-900 rounded-lg transition-colors"
              title="加载本地 JSON 文件（支持实时写回：需浏览器授权）"
            >
              <FileUp size={18} />
            </button>
          </div>
        </div>

        <div className="px-5 py-2 bg-slate-900 border-b border-slate-800 flex items-center gap-3 shrink-0">
          <span className="text-xs text-slate-500 font-mono">Model:</span>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="flex-1 bg-slate-950 border border-slate-800 rounded-md px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 transition-all font-mono"
            placeholder="e.g. deepseek-v4-pro"
            title="自由修改调用的模型名称 (如: deepseek-v4-pro, llama3 等)"
          />
        </div>

        {/* Paper List */}
        <div className="flex-1 overflow-hidden relative z-10">
          <PaperList />
        </div>
      </motion.div>

      <div
        onPointerDown={startResizeLeft}
        className="w-1 shrink-0 bg-slate-800/80 hover:bg-slate-700 cursor-col-resize"
        title="拖动调整左右分栏宽度"
      />

      {/* Right Chat Panel */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="flex-1 h-full z-10"
      >
        <ChatPanel />
      </motion.div>
    </div>
  );
}

export default App;
