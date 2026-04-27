import { useEffect, useRef } from 'react';
import { useStore } from './store/useStore';
import { PaperList } from './components/PaperList';
import { ChatPanel } from './components/ChatPanel';
import { Sparkles, FileUp } from 'lucide-react';
import { motion } from 'framer-motion';

function App() {
  const { setDailyData } = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/papers.json')
      .then((res) => res.json())
      .then((data) => setDailyData(data))
      .catch((err) => console.error('Failed to load papers:', err));
  }, [setDailyData]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (json.papers && json.date) {
          setDailyData(json);
        } else {
          alert('JSON 文件格式不匹配，请确保是 fetch_arxiv.py 生成的文件。');
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
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
              <Sparkles size={16} />
            </div>
            <h1 className="font-semibold tracking-wide bg-gradient-to-r from-slate-100 to-slate-400 bg-clip-text text-transparent">
              arXiv AI
            </h1>
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
