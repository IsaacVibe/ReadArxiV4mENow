import { useEffect, useRef } from 'react';
import { useStore } from './store/useStore';
import { PaperList } from './components/PaperList';
import { ChatPanel } from './components/ChatPanel';
import { FileUp } from 'lucide-react';
import { motion } from 'framer-motion';

function App() {
  const { loadRavenData, model, setModel } = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Load the latest papers automatically when the app starts
    const loadLatestPapers = async () => {
      try {
        const indexResponse = await fetch('/latest.json');
        if (indexResponse.ok) {
          const indexData = await indexResponse.json();
          if (indexData.latest_file) {
            const dataResponse = await fetch(`/${indexData.latest_file}`);
            if (dataResponse.ok) {
              const data = await dataResponse.json();
              loadRavenData(data);
              return;
            }
          }
        }
        
        // Fallback to papers.json if latest.json doesn't exist
        const fallbackResponse = await fetch('/papers.json');
        if (fallbackResponse.ok) {
          const data = await fallbackResponse.json();
          loadRavenData(data);
        }
      } catch (err) {
        console.error('Failed to load papers:', err);
      }
    };
    
    loadLatestPapers();
  }, [loadRavenData]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (json.papers && json.date) {
          loadRavenData(json);
        } else {
          alert('JSON 文件格式不匹配，请确保是 fetch_arxiv.py 生成的文件或 RAVEN 导出的总结文件。');
        }
      } catch (err) {
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
        className="w-1/3 min-w-[320px] max-w-[480px] h-full flex flex-col z-20"
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
              onClick={() => fileInputRef.current?.click()}
              className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-slate-900 rounded-lg transition-colors"
              title="加载本地 JSON 文件"
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
