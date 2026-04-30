import { useState, useMemo } from 'react';
import { useStore, Paper } from '../store/useStore';
import { Search, Tag, ExternalLink, Calendar, BookOpen, Bot, Loader2, CheckSquare } from 'lucide-react';
import { motion } from 'framer-motion';
import { callLLM } from '../utils/llm';

export function PaperList() {
  const toPdfUrl = (url: string) => {
    if (url.includes('/pdf/')) return url;
    return url.replace('/abs/', '/pdf/');
  };

  const { 
    dailyData, 
    selectedPapers, 
    togglePaperSelection, 
    selectAllPapers,
    conversations,
    conversationOrder,
    activeConversationId,
    activateConversation,
    apiKey, 
    baseUrl, 
    model, 
    updatePaperAiSummary 
  } = useStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isConversationOpen, setIsConversationOpen] = useState(false);
  const [conversationSearchTerm, setConversationSearchTerm] = useState('');

  const availableCategories = useMemo(() => {
    if (!dailyData) return [];
    return Object.entries(dailyData.subjects_counter || {})
      .sort((a, b) => b[1] - a[1])
      .map(([category, count]) => ({ category, count }));
  }, [dailyData]);

  const filteredPapers = useMemo(() => {
    if (!dailyData) return [];
    return dailyData.papers.filter((paper) => {
      const searchLower = searchTerm.toLowerCase();
      const matchesCategory =
        selectedCategories.length === 0 ||
        paper.categories.some((cat) => selectedCategories.includes(cat));
      return (
        matchesCategory &&
        (
          paper.title.toLowerCase().includes(searchLower) ||
          paper.summary.toLowerCase().includes(searchLower) ||
          paper.authors.some(a => a.toLowerCase().includes(searchLower))
        )
      );
    });
  }, [dailyData, searchTerm, selectedCategories]);

  const groupedPapers = useMemo(() => {
    const groups: Record<string, Paper[]> = {};
    filteredPapers.forEach(paper => {
      const mainCategory = paper.categories[0] || 'Unknown';
      if (!groups[mainCategory]) {
        groups[mainCategory] = [];
      }
      groups[mainCategory].push(paper);
    });
    
    return Object.keys(groups).sort().map(key => ({
      category: key,
      papers: groups[key]
    }));
  }, [filteredPapers]);

  const toggleCategory = (category: string) => {
    setSelectedCategories((prev) => {
      if (prev.includes(category)) {
        return prev.filter((c) => c !== category);
      }
      return [...prev, category];
    });
  };

  const conversationsList = useMemo(() => {
    return conversationOrder.map((id) => conversations[id]).filter(Boolean);
  }, [conversationOrder, conversations]);

  const filteredConversations = useMemo(() => {
    const q = conversationSearchTerm.trim().toLowerCase();
    if (!q) return conversationsList;
    return conversationsList.filter((c) => {
      if (c.title.toLowerCase().includes(q)) return true;
      return c.paperUrls.some((u) => u.toLowerCase().includes(q));
    });
  }, [conversationSearchTerm, conversationsList]);

  const paperConversationIds = useMemo(() => {
    const map: Record<string, string[]> = {};
    conversationsList.forEach((c) => {
      c.paperUrls.forEach((u) => {
        if (!map[u]) map[u] = [];
        map[u].push(c.id);
      });
    });
    return map;
  }, [conversationsList]);

  const handleGenerateSummaries = async () => {
    if (isGenerating || selectedPapers.length === 0) return;
    setIsGenerating(true);
    
    
    try {
      for (const paper of selectedPapers) {
        if (paper.aiSummary) continue; // Skip if already generated
        
        let currentSummary = '';
        const prompt = `请用一句简短的中文（或一个短语）总结这篇论文的核心内容。不要有多余的寒暄或解释。\n\n标题：${paper.title}\n摘要：${paper.summary}`;
        
        try {
          await callLLM(
            [{ role: 'user', content: prompt }],
            apiKey,
            baseUrl,
            model,
            (chunk) => {
              currentSummary += chunk;
              updatePaperAiSummary(paper.url, currentSummary);
            }
          );
        } catch (err) {
          console.error('Failed to summarize paper', paper.title, err);
          updatePaperAiSummary(paper.url, currentSummary + ' (总结生成失败)');
        }
      }
    } finally {
      setIsGenerating(false);
    }
  };

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

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="搜索论文 (如: FRB)"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 transition-all placeholder:text-slate-600"
            />
          </div>
          {searchTerm.trim() !== '' && filteredPapers.length > 0 && (
            <button
              onClick={() => selectAllPapers(filteredPapers)}
              className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap shrink-0 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
              title={`一键选取当前搜索到的 ${filteredPapers.length} 篇论文`}
            >
              <CheckSquare size={16} />
              <span className="hidden xl:inline">全选搜索结果</span>
            </button>
          )}
          <button
            onClick={handleGenerateSummaries}
            disabled={isGenerating || selectedPapers.length === 0}
            className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap shrink-0 ${
              isGenerating || selectedPapers.length === 0
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20'
            }`}
            title={selectedPapers.length === 0 ? "请先选中论文" : "使用 AI 为已选中的论文生成一句话总结"}
          >
            {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Bot size={16} />}
            <span>{isGenerating ? '生成中...' : `总结已选 (${selectedPapers.length})`}</span>
          </button>
        </div>

        <div className="flex flex-wrap gap-2 max-h-20 overflow-y-auto custom-scrollbar pr-1">
          <button
            onClick={() => setSelectedCategories([])}
            className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors font-mono ${
              selectedCategories.length === 0
                ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
            }`}
            title="清空分类筛选"
          >
            全部
          </button>
          {availableCategories.map(({ category, count }) => {
            const isActive = selectedCategories.includes(category);
            return (
              <button
                key={category}
                onClick={() => toggleCategory(category)}
                className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors font-mono flex items-center gap-1 ${
                  isActive
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
                title={`筛选分类：${category}`}
              >
                <span>{category}</span>
                <span className="text-[10px] opacity-70">({count})</span>
              </button>
            );
          })}
        </div>

        {conversationsList.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setIsConversationOpen(!isConversationOpen)}
                className="text-xs font-mono text-slate-400 hover:text-slate-200 transition-colors"
              >
                {isConversationOpen ? '隐藏会话' : `会话 (${conversationsList.length})`}
              </button>
              {isConversationOpen && (
                <input
                  type="text"
                  value={conversationSearchTerm}
                  onChange={(e) => setConversationSearchTerm(e.target.value)}
                  placeholder="查找会话"
                  className="w-36 bg-slate-950 border border-slate-800 rounded-md px-2 py-1 text-[11px] text-slate-300 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 transition-all font-mono placeholder:text-slate-600"
                />
              )}
            </div>
            {isConversationOpen && (
              <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto custom-scrollbar pr-1">
                {filteredConversations.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => activateConversation(c.id)}
                    className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors font-mono ${
                      c.id === activeConversationId
                        ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                    }`}
                    title={`进入会话：${c.title}`}
                  >
                    {c.title} <span className="opacity-70">({c.paperUrls.length})</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {groupedPapers.map((group, groupIndex) => (
          <div key={group.category} className="space-y-3">
            <div className="sticky top-0 z-10 flex items-center gap-2 bg-slate-950/90 backdrop-blur py-2 border-b border-slate-800/50">
              <Tag size={14} className="text-blue-400" />
              <h2 className="text-sm font-mono font-semibold text-slate-300">
                {group.category} <span className="text-slate-500 text-xs font-normal">({group.papers.length})</span>
              </h2>
            </div>
            
            <div className="space-y-3">
              {group.papers.map((paper, index) => {
                const isSelected = selectedPapers.some(p => p.url === paper.url);
                const convIds = paperConversationIds[paper.url] || [];
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

                    {convIds.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {convIds.map((cid) => {
                          const c = conversations[cid];
                          if (!c) return null;
                          const isActive = cid === activeConversationId;
                          return (
                            <button
                              key={cid}
                              onClick={(e) => {
                                e.stopPropagation();
                                activateConversation(cid);
                              }}
                              className={`text-[10px] px-2 py-0.5 rounded border transition-colors font-mono ${
                                isActive
                                  ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
                                  : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-200 hover:border-slate-700'
                              }`}
                              title={`切换到会话：${c.title}`}
                            >
                              {c.title}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {paper.aiSummary && (
                      <div className="mb-3 text-xs text-emerald-400 bg-emerald-400/10 p-2.5 rounded-lg border border-emerald-400/20 leading-relaxed font-medium">
                        <span className="font-bold mr-1 opacity-80">AI 总结:</span>
                        {paper.aiSummary}
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between mt-auto">
                      <div className="flex items-center gap-2 overflow-hidden">
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
                        href={toPdfUrl(paper.url)} 
                        target="_blank" 
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-slate-500 hover:text-blue-400 transition-colors p-1"
                        title="打开 PDF"
                      >
                        <ExternalLink size={14} />
                      </a>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        ))}
        {filteredPapers.length === 0 && (
          <div className="text-center py-12 text-slate-500 text-sm font-mono">
            未找到匹配的论文
          </div>
        )}
      </div>
    </div>
  );
}
