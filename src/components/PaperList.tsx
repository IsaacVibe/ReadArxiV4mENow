import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ArrowRight, BookOpen, Check, ExternalLink, Loader2, Search, Square, X } from 'lucide-react';
import { useStore, type Paper } from '../store/useStore';
import { callLLM, isCancelled } from '../utils/llm';
import { arxivId, pdfUrl } from '../utils/workspace';
import { InlineMarkdown } from './InlineMarkdown';

const categoryNames: Record<string, string> = { 'astro-ph.CO': '宇宙学', 'astro-ph.GA': '星系', 'astro-ph.HE': '高能天体', 'astro-ph.IM': '仪器与方法', 'astro-ph.SR': '恒星', 'astro-ph.EP': '行星' };
const PaperRow = memo(function PaperRow({ paper, number, selected, disabled, onRead }: { paper: Paper; number: number; selected: boolean; disabled: boolean; onRead: () => void }) {
  const toggle = useStore(s => s.togglePaperSelection);
  return <article className={`paper-row${selected ? ' is-selected' : ''}`}>
    <label className="paper-check"><input type="checkbox" checked={selected} disabled={disabled} onChange={() => toggle(paper)} aria-label={`选择论文 ${number}：${paper.title}`} /><span aria-hidden="true">{selected ? <Check size={14} /> : null}</span></label>
    <div className="paper-row-content">
      <h3><button className="paper-title" disabled={disabled} onClick={onRead} title={paper.title}><span className="paper-number">{String(number).padStart(2, '0')}</span><InlineMarkdown>{paper.title}</InlineMarkdown></button></h3>
      <p className="paper-authors" title={paper.authors.join(', ')}>{paper.authors.join(', ') || '作者信息未提供'}</p>
      <div className="paper-meta"><span className="arxiv-id">{arxivId(paper.url)}</span><span className="paper-tags">{paper.categories.slice(0, 2).map(c => <span key={c}>{c}</span>)}{paper.categories.length > 2 && <span>+{paper.categories.length - 2}</span>}</span><a href={pdfUrl(paper.url)} target="_blank" rel="noreferrer" aria-label={`打开论文 ${number} 的 PDF`}>PDF <ExternalLink size={12} /></a></div>
      {paper.aiSummary && <p className="paper-summary" title={paper.aiSummary}><span className="paper-summary-label">摘要</span> <InlineMarkdown>{paper.aiSummary}</InlineMarkdown></p>}
    </div>
  </article>;
});

export function PaperList({ onRead, loading, error, onRetry, onOpen }: { onRead: () => void; loading: boolean; error: string; onRetry: () => void; onOpen: () => void }) {
  const { papers, date, subjects, selected, busy } = useStore(useShallow(s => ({ papers: s.dailyData?.papers, date: s.dailyData?.date, subjects: s.dailyData?.subjects_counter, selected: s.selectedPapers, busy: s.generationTask })));
  const [search, setSearch] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [layout, setLayout] = useState('index');
  const [batch, setBatch] = useState<{ done: number; total: number } | null>(null);
  const [batchError, setBatchError] = useState('');
  const controller = useRef<AbortController>();
  const revision = useStore(s => s.workspaceRevision);
  useEffect(() => { setSearch(''); setCategories([]); setBatchError(''); }, [revision]);
  useEffect(() => () => controller.current?.abort(), []);
  const selectedUrls = useMemo(() => new Set(selected.map(p => p.url)), [selected]);
  const indexes = useMemo(() => new Map(papers?.map((p, i) => [p.url, i + 1])), [papers]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (papers || []).filter(p => (!categories.length || p.categories.some(c => categories.includes(c))) && (!q || [p.title, p.summary, ...p.authors, arxivId(p.url)].some(value => value.toLowerCase().includes(q))));
  }, [papers, categories, search]);
  const groups = useMemo(() => {
    if (layout === 'index') return [{ name: '', papers: filtered }];
    const groups = new Map<string, Paper[]>();
    filtered.forEach(p => { const key = p.categories[0] || '其他'; groups.set(key, [...(groups.get(key) || []), p]); });
    return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([name, papers]) => ({ name, papers }));
  }, [filtered, layout]);
  const reset = () => { setSearch(''); setCategories([]); };
  const generate = async () => {
    const state = useStore.getState();
    if (state.generationTask || !state.model.trim()) return;
    const pending = state.selectedPapers.filter(p => !p.aiSummary || p.aiSummary.includes('总结生成失败'));
    if (!pending.length) { setBatchError('所选论文已有一句话摘要，无需重复生成。'); return; }
    controller.current = new AbortController();
    state.setGenerationTask('正在生成一句话摘要'); setBatchError(''); setBatch({ done: 0, total: pending.length });
    let failures = 0;
    try {
      for (const [index, paper] of pending.entries()) {
        if (controller.current.signal.aborted) break;
        let summary = '';
        try {
          await callLLM([{ role: 'user', content: `请用一句简短的中文总结这篇论文的核心内容，不要寒暄。数学符号和公式必须使用 $...$ 包裹，不要裸写 LaTeX 命令，也不要使用代码块。\n标题：${paper.title}\n摘要：${paper.summary}` }], state.apiKey, state.baseUrl, state.model, chunk => { summary += chunk; }, controller.current.signal);
          state.updatePaperAiSummary(paper.url, summary);
        } catch (error) { if (isCancelled(error)) break; failures++; }
        setBatch({ done: index + 1, total: pending.length });
      }
      if (failures) setBatchError(`${failures} 篇未完成。再次点击生成可重试失败项，已有摘要会保留。`);
      else if (controller.current.signal.aborted) setBatchError('已停止。完成的摘要已保留，可继续生成剩余论文。');
    } finally { setBatch(null); state.setGenerationTask(null); }
  };

  return <section className="paper-library" aria-label="论文库">
    <div className="library-heading"><div><h1>论文库</h1>{date && <time>{date}</time>}</div><span className="count-label">{papers?.length || 0} 篇</span></div>
    <div className="library-tools">
      <div className="search-field"><Search size={17} /><input id="paper-search" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索标题、作者、摘要或 arXiv ID" aria-label="搜索论文" />{search && <button className="icon-button" onClick={() => setSearch('')} aria-label="清除搜索"><X size={15} /></button>}</div>
      {!!papers?.length && <>
        <div className="category-filters" aria-label="按论文包含的领域筛选"><button className={`filter-chip${!categories.length ? ' active' : ''}`} aria-pressed={!categories.length} onClick={() => setCategories([])}>全部领域</button>{Object.entries(subjects || {}).sort(([a], [b]) => a.localeCompare(b)).map(([category, count]) => <button key={category} className={`filter-chip${categories.includes(category) ? ' active' : ''}`} title={`${category} · 含此领域 ${count} 篇`} aria-pressed={categories.includes(category)} onClick={() => setCategories(previous => previous.includes(category) ? previous.filter(c => c !== category) : [...previous, category])}>{categoryNames[category] || category}<span>{count}</span></button>)}</div>
        <div className="list-toolbar"><p role="status">{(search.trim() || categories.length > 0) && `${filtered.length} / ${papers.length} 篇`}</p><div><button className="text-button" disabled={!filtered.length || !!busy} onClick={() => useStore.getState().selectAllPapers(filtered)}><Square size={13} />全选结果</button><label className="sr-only" htmlFor="list-layout">列表分组</label><select id="list-layout" value={layout} onChange={e => setLayout(e.target.value)}><option value="index">按序号</option><option value="subject">按主要领域</option></select></div></div>
      </>}
    </div>
    {selected.length > 0 && <div className="selection-toolbar"><span><Check size={15} />已选 <strong>{selected.length}</strong> 篇</span><button className="text-button" disabled={!!busy} onClick={() => useStore.getState().clearSelectedPapers()}>清空</button><div className="selection-actions">{batch ? <button className="button button-subtle" onClick={() => controller.current?.abort()}><Loader2 size={14} className="spin" />{batch.done}/{batch.total} · 停止</button> : <button className="button button-subtle" disabled={!!busy || !useStore.getState().model.trim()} onClick={() => void generate()}>一句话摘要</button>}<button className="button button-primary" onClick={onRead}>进入精读<ArrowRight size={14} /></button></div></div>}
    {batchError && <div className="inline-notice" role="status">{batchError}<button className="icon-button" aria-label="关闭摘要提示" onClick={() => setBatchError('')}><X size={14} /></button></div>}
    <div className="paper-scroll" id="paper-results" tabIndex={0} aria-label="论文列表">
      {loading && <div className="empty-state" role="status"><Loader2 size={26} className="spin" /><h2>正在载入论文</h2></div>}
      {!loading && error && <div className="empty-state" role="alert"><BookOpen size={30} /><h2>暂时无法加载论文</h2><p>{error}</p><div><button className="button button-primary" onClick={onRetry}>重新加载</button><button className="button" onClick={onOpen}>打开本地文件</button></div></div>}
      {!loading && !error && !papers?.length && <div className="empty-state"><BookOpen size={30} /><h2>这一天还没有论文</h2><button className="button" onClick={onOpen}>打开工作区</button></div>}
      {!loading && !error && !!papers?.length && !filtered.length && <div className="empty-state"><Search size={30} /><h2>没有匹配的论文</h2><button className="button" onClick={reset}>清除搜索与筛选</button></div>}
      {!loading && !error && groups.map(group => <div key={group.name}>{group.name && <h2 className="subject-heading">{categoryNames[group.name] || group.name}<span>{group.papers.length} 篇</span></h2>}{group.papers.map(paper => <PaperRow key={paper.url} paper={paper} number={indexes.get(paper.url) || 0} selected={selectedUrls.has(paper.url)} disabled={!!busy} onRead={() => { if (!selectedUrls.has(paper.url)) useStore.getState().togglePaperSelection(paper); onRead(); }} />)}</div>)}
    </div>
  </section>;
}
