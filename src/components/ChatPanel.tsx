import { useState, useRef, useEffect } from 'react';
import { useStore, ChatMessage } from '../store/useStore';
import { Send, Bot, User, Cpu, Loader2, Info, Sparkles, X, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { callLLM } from '../utils/llm';

export function ChatPanel() {
  const { 
    selectedPapers, 
    togglePaperSelection, 
    clearSelectedPapers, 
    apiKey, 
    baseUrl, 
    model, 
    dailyData, 
    updateDailySummary,
    conversations,
    conversationOrder,
    activeConversationId,
    createConversationFromSelection,
    addMessageToConversation,
    appendToAssistantMessage,
  } = useStore();
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [isSummaryOpen, setIsSummaryOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeConversation = activeConversationId ? conversations[activeConversationId] : null;
  const messages = activeConversation ? activeConversation.messages : [];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, isLoading, activeConversationId]);

  const handleDailySummary = async () => {
    if (!dailyData || isGeneratingSummary) return;

    setIsGeneratingSummary(true);
    setIsSummaryOpen(true);
    updateDailySummary('');

    try {
      const papersContext = dailyData.papers.map((p, i) => `[${i+1}] ${p.title} (arXiv: ${p.url})\n分类: ${p.categories.join(', ')}\n摘要: ${p.summary}`).join('\n\n');

      const fixedPrompt = `你是一个专业的天体物理学研究助手。请基于以下今日获取的最新论文数据，完成两项任务：
1. 总结今天各个子领域的研究概况（例如主要集中在哪些方向）。
2. 从中挑选出你认为最具突破性、最有趣或最重要的 3-5 篇亮点文章，并提供简短的推荐理由。
请确保使用中文回答，结构清晰，重点突出。

今日论文总数：${dailyData.total}
领域分布：${JSON.stringify(dailyData.subjects_counter)}

论文列表：
${papersContext}`;

      const apiMessages = [
        { role: 'user', content: fixedPrompt },
      ];

      let currentSummary = '';
      await callLLM(
        apiMessages as any,
        apiKey,
        baseUrl,
        model,
        (chunk) => {
          currentSummary += chunk;
          updateDailySummary(currentSummary);
        }
      );
    } catch (error: any) {
      console.error(error);
      updateDailySummary(`**Error:** ${error.message}`);
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const handleExportSummaries = () => {
    if (!dailyData) return;

    const orderedConversations = conversationOrder.map((id) => conversations[id]).filter(Boolean);
    const exportData = {
      ...dailyData,
      conversations: orderedConversations,
      conversationOrder: orderedConversations.map((c) => c.id),
      activeConversationId,
    };

    // 触发下载
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    // 生成带日期的文件名
    const dateStr = dailyData.date ? dailyData.date.replace(/-/g, '') : new Date().toISOString().split('T')[0].replace(/-/g, '');
    link.download = `RAVEN_Summary_${dateStr}.json`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    if (selectedPapers.length === 0) return;

    const nextConversationId = activeConversationId || createConversationFromSelection();
    if (!nextConversationId) return;

    const userMessage: ChatMessage = { id: Date.now().toString(), role: 'user', content: input };
    addMessageToConversation(nextConversationId, userMessage);
    setInput('');
    setIsLoading(true);

    try {
      let systemPrompt = '你是一个专业的天体物理学研究助手，负责帮助用户解读 arXiv 上的最新论文。';
      if (selectedPapers.length > 0) {
        systemPrompt += `\n当前用户正在阅读以下 ${selectedPapers.length} 篇论文作为上下文：\n`;
        selectedPapers.forEach((paper, index) => {
          systemPrompt += `
[${index + 1}] 标题：${paper.title}
作者：${paper.authors.join(', ')}
arXiv 链接：${paper.url}
PDF 外链：${paper.url.includes('/pdf/') ? paper.url : paper.url.replace('/abs/', '/pdf/')}
摘要：${paper.summary}
`;
        });
        systemPrompt += `\n提示：如果需要更细致的信息，你可以直接尝试读取上述论文对应的 PDF 外链进行深入理解与引用。如果用户提出问题，请优先基于这些被选中的论文信息进行解答、对比或总结。`;
      }

      const convMessages = (conversations[nextConversationId]?.messages || []).map((m) => ({ role: m.role, content: m.content }));
      const apiMessages = [
        { role: 'system', content: systemPrompt },
        ...convMessages,
      ];

      const assistantMessageId = (Date.now() + 1).toString();
      addMessageToConversation(nextConversationId, { id: assistantMessageId, role: 'assistant', content: '' });

      await callLLM(
        apiMessages as any,
        apiKey,
        baseUrl,
        model,
        (chunk) => {
          appendToAssistantMessage(nextConversationId, assistantMessageId, chunk);
        }
      );
    } catch (error: any) {
      console.error(error);
      addMessageToConversation(nextConversationId, { id: Date.now().toString(), role: 'assistant', content: `**Error:** ${error.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 relative overflow-hidden">
      {/* Decorative Background */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Header */}
      <div className="p-5 border-b border-slate-800/80 bg-slate-900/50 backdrop-blur-xl sticky top-0 z-10 flex flex-col gap-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <Bot size={20} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-200 tracking-wide">{activeConversation ? activeConversation.title : 'RAVEN AI 助手'}</h2>
              <p className="text-xs text-slate-500 font-mono flex items-center gap-1 mt-0.5">
                <Cpu size={10} /> {model}
              </p>
            </div>
          </div>
          {dailyData && (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (dailyData.dailySummary && !isGeneratingSummary) {
                    setIsSummaryOpen(!isSummaryOpen);
                  } else {
                    handleDailySummary();
                  }
                }}
                disabled={isGeneratingSummary}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {isGeneratingSummary ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {dailyData.dailySummary ? (isSummaryOpen ? '隐藏今日亮点' : '显示今日亮点') : '总结今日亮点'}
              </button>
              <button
                onClick={handleExportSummaries}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50 text-slate-300 text-xs font-medium rounded-lg transition-colors"
                title="一键导出包含 AI 总结的 JSON 数据文件"
              >
                <Download size={14} />
                <span className="hidden xl:inline">导出总结数据</span>
              </button>
            </div>
          )}
        </div>

        <AnimatePresence mode="popLayout">
          {dailyData?.dailySummary && isSummaryOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mt-3 p-4 bg-emerald-900/20 border border-emerald-500/20 rounded-xl relative overflow-hidden shrink-0"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-emerald-400 flex items-center gap-1.5">
                  {isGeneratingSummary ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  今日亮点总结
                </h3>
                <div className="flex items-center gap-3">
                  <button onClick={handleDailySummary} disabled={isGeneratingSummary} className="text-emerald-500/70 hover:text-emerald-400 transition-colors text-xs font-medium disabled:opacity-50">
                    重新生成
                  </button>
                  <button onClick={() => setIsSummaryOpen(false)} className="text-emerald-500 hover:text-emerald-300 transition-colors">
                    <X size={14} />
                  </button>
                </div>
              </div>
              <div className="text-sm text-slate-300 prose prose-invert prose-p:leading-relaxed prose-sm max-w-none max-h-48 overflow-y-auto custom-scrollbar pr-2">
                <ReactMarkdown>{dailyData.dailySummary}</ReactMarkdown>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="popLayout">
          {selectedPapers.length > 0 ? (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/50 text-xs flex flex-col gap-2 overflow-hidden"
            >
              <div className="flex items-start justify-between gap-2 text-slate-300">
                <div className="flex items-center gap-1.5 font-medium leading-relaxed">
                  <Info size={14} className="text-blue-400 shrink-0" />
                  当前已选中 {selectedPapers.length} 篇论文作为上下文：
                </div>
                <button
                  onClick={clearSelectedPapers}
                  className="text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1"
                >
                  <X size={12} /> 清空
                </button>
              </div>
              <div className="flex flex-col gap-1.5 pl-5 max-h-32 overflow-y-auto pr-2 custom-scrollbar">
                {selectedPapers.map((paper, idx) => (
                  <div key={paper.url} className="flex items-center justify-between gap-2 group">
                    <a href={paper.url} target="_blank" rel="noreferrer" className="truncate text-slate-400 hover:text-blue-400 transition-colors font-mono underline decoration-slate-700 underline-offset-2">
                      [{idx + 1}] {paper.title}
                    </a>
                    <button
                      onClick={() => togglePaperSelection(paper)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-red-400 transition-all rounded-md hover:bg-slate-800/50"
                      title="移除此篇"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xs text-slate-500 italic py-1"
            >
              在左侧点击任意论文即可将其加入对话上下文。支持多选！
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 z-0">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-50">
            <Bot size={48} className="text-slate-400" />
            <div className="space-y-1">
              <p className="text-sm text-slate-300">
                {selectedPapers.length > 0 ? `已选中 ${selectedPapers.length} 篇论文。发送消息将创建一个新的上下文会话。` : '请选择论文开始上下文对话，或从左侧论文条目进入已有会话。'}
              </p>
              <p className="text-xs text-slate-500 font-mono">今日亮点总结与一句话总结可独立生成并导出。</p>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            key={msg.id}
            className={`flex gap-4 max-w-[85%] ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
          >
            <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center shadow-lg ${
              msg.role === 'user' 
                ? 'bg-gradient-to-br from-emerald-400 to-emerald-600 text-white' 
                : 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white'
            }`}>
              {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
            </div>
            
            <div className={`p-4 rounded-2xl text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-slate-800 text-slate-200 rounded-tr-sm border border-slate-700/50'
                : 'bg-slate-950/80 text-slate-300 rounded-tl-sm border border-slate-800/80 shadow-xl prose prose-invert prose-p:leading-relaxed prose-pre:bg-slate-900 prose-pre:border prose-pre:border-slate-800 max-w-none'
            }`}>
              {msg.role === 'user' ? (
                msg.content
              ) : (
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              )}
            </div>
          </motion.div>
        ))}
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-4 max-w-[80%] mr-auto"
          >
            <div className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-lg">
              <Loader2 size={16} className="animate-spin" />
            </div>
            <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800/80 rounded-tl-sm flex items-center">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-slate-800/80 bg-slate-900/80 backdrop-blur-md shrink-0 z-10">
        <form onSubmit={handleSubmit} className="relative flex items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={selectedPapers.length > 0 ? `向 AI 提问关于这 ${selectedPapers.length} 篇论文的问题...` : "请先在左侧选中论文"}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-4 pr-12 py-3.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 transition-all placeholder:text-slate-600 shadow-inner"
            disabled={isLoading || selectedPapers.length === 0}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading || selectedPapers.length === 0}
            className="absolute right-2 p-2 rounded-lg text-blue-500 hover:bg-blue-500/10 disabled:opacity-50 disabled:hover:bg-transparent transition-colors"
          >
            <Send size={18} className={input.trim() && !isLoading ? "translate-x-0.5 -translate-y-0.5" : ""} />
          </button>
        </form>
        <div className="text-center mt-2">
          <span className="text-[10px] text-slate-600 font-mono tracking-widest uppercase">RAVEN</span>
        </div>
      </div>
    </div>
  );
}
