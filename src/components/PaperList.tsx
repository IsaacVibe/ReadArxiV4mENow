import { useState, useMemo } from 'react';
import { useStore, Paper } from '../store/useStore';
import { Search, Tag, ExternalLink, Calendar, BookOpen } from 'lucide-react';
import { motion } from 'framer-motion';

export function PaperList() {
  const { dailyData, selectedPapers, togglePaperSelection } = useStore();
  const [searchTerm, setSearchTerm] = useState('');

  const filteredPapers = useMemo(() => {
    if (!dailyData) return [];
    return dailyData.papers.filter((paper) => {
      const searchLower = searchTerm.toLowerCase();
      return (
        paper.title.toLowerCase().includes(searchLower) ||
        paper.summary.toLowerCase().includes(searchLower) ||
        paper.authors.some(a => a.toLowerCase().includes(searchLower))
      );
    });
  }, [dailyData, searchTerm]);

  if (!dailyData) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 space-y-4 p-8">
        <BookOpen size={48} className="opacity-20 animate-pulse" />
        <p className="text-sm font-mono tracking-widest uppercase">加载论文数据中...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-950 border-r border-slate-800">
      <div className="p-5 border-b border-slate-800 bg-slate-900/50 backdrop-blur-xl sticky top-0 z-10 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-300">
            <Calendar size={16} className="text-blue-400" />
            <span className="text-sm font-mono font-medium">{dailyData.date}</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/50 border border-slate-700 text-xs font-mono text-slate-400">
            <span className="text-emerald-400 font-bold">{dailyData.total}</span> 篇论文
          </div>
        </div>

        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="搜索论文标题、摘要、作者 (如: FRB)"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 transition-all placeholder:text-slate-600"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {filteredPapers.map((paper, index) => {
          const isSelected = selectedPapers.some(p => p.url === paper.url);
          return (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(index * 0.05, 0.5) }}
              key={paper.url}
              onClick={() => togglePaperSelection(paper)}
              className={`group cursor-pointer p-4 rounded-xl border transition-all duration-300 ${
                isSelected
                  ? 'bg-slate-900 border-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.1)]'
                  : 'bg-slate-900/40 border-slate-800/60 hover:bg-slate-900 hover:border-slate-700'
              }`}
            >
              <h3 className={`text-sm font-semibold leading-relaxed mb-2 line-clamp-2 ${isSelected ? 'text-blue-100' : 'text-slate-200 group-hover:text-blue-200 transition-colors'}`}>
                {paper.title}
              </h3>
              
              <p className="text-xs text-slate-400 line-clamp-1 mb-3 font-mono">
                {paper.authors.join(', ')}
              </p>
              
              <div className="flex items-center justify-between mt-auto">
                <div className="flex items-center gap-2 overflow-hidden">
                  <Tag size={12} className="text-slate-500 shrink-0" />
                  <div className="flex gap-1 overflow-hidden">
                    {paper.categories.slice(0, 3).map((cat) => (
                      <span key={cat} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-400 whitespace-nowrap">
                        {cat}
                      </span>
                    ))}
                    {paper.categories.length > 3 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-500">
                        +{paper.categories.length - 3}
                      </span>
                    )}
                  </div>
                </div>
                
                <a 
                  href={paper.url} 
                  target="_blank" 
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-slate-500 hover:text-blue-400 transition-colors p-1"
                  title="在 arXiv 中打开"
                >
                  <ExternalLink size={14} />
                </a>
              </div>
            </motion.div>
          );
        })}
        {filteredPapers.length === 0 && (
          <div className="text-center py-12 text-slate-500 text-sm font-mono">
            未找到匹配的论文
          </div>
        )}
      </div>
    </div>
  );
}
