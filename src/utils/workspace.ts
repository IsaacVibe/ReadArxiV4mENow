import type { Conversation, DailyData, Paper } from '../store/useStore';
import type { ReadingSource } from './paperText';

export interface Workspace extends DailyData {
  conversations: Conversation[];
  conversationOrder: string[];
  activeConversationId: string | null;
}
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [];

export function normalizeWorkspace(input: unknown): Workspace {
  const payload = record(input);
  if (typeof payload.date !== 'string' || !payload.date.trim() || !Array.isArray(payload.papers)) {
    throw new Error('文件格式不匹配：需要 date 和 papers。请打开 RAVEN 导出文件或抓取生成的当日 JSON。');
  }
  const papers: Paper[] = payload.papers.map(value => {
    const p = record(value);
    if (typeof p.title !== 'string' || typeof p.url !== 'string' || !/^https?:\/\//i.test(p.url)) {
      throw new Error('论文数据不完整：每篇需要标题与有效的 HTTP 链接，当前工作区未被替换。');
    }
    return {
      title: p.title, url: p.url,
      authors: typeof p.authors === 'string' ? [p.authors] : strings(p.authors),
      summary: typeof p.summary === 'string' ? p.summary : '', categories: strings(p.categories),
      ...(typeof p.aiSummary === 'string' ? { aiSummary: p.aiSummary } : {}),
    };
  });
  const subjects: Record<string, number> = {};
  papers.forEach(p => p.categories.forEach(c => { subjects[c] = (subjects[c] || 0) + 1; }));
  const raw = Array.isArray(payload.conversations) ? payload.conversations : Object.values(record(payload.conversations));
  const conversations: Conversation[] = [];
  const ids = new Set<string>();
  raw.forEach(value => {
    const c = record(value);
    if (typeof c.id !== 'string' || ids.has(c.id) || !Array.isArray(c.messages)) return;
    ids.add(c.id);
    const messages: Conversation['messages'] = [];
    c.messages.forEach((value, index) => {
      const m = record(value);
      if ((m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string') {
        const sources: ReadingSource[] = [];
        if (Array.isArray(m.sources)) m.sources.forEach(value => {
          const source = record(value);
          if (typeof source.paperUrl !== 'string' || !['full', 'partial', 'abstract'].includes(String(source.status))) return;
          let sourceUrl: string | undefined;
          if (typeof source.sourceUrl === 'string') {
            try { const url = new URL(source.sourceUrl); if (url.protocol === 'https:' && ['arxiv.org', 'ar5iv.labs.arxiv.org'].includes(url.hostname)) sourceUrl = url.href; } catch { /* Ignore invalid source links. */ }
          }
          sources.push({ paperUrl: source.paperUrl, status: source.status as ReadingSource['status'], sourceUrl,
            retrievedAt: typeof source.retrievedAt === 'string' ? source.retrievedAt : undefined,
            chars: typeof source.chars === 'number' && Number.isFinite(source.chars) ? Math.max(0, source.chars) : 0,
            note: typeof source.note === 'string' ? source.note : '导入的历史资料记录。' });
        });
        messages.push({ id: typeof m.id === 'string' ? m.id : `${c.id}-${index}`, role: m.role, content: m.content,
          ...(m.status === 'interrupted' ? { status: 'interrupted' as const } : {}),
          ...(sources.length ? { sources } : {}) });
      }
    });
    conversations.push({ id: c.id, title: typeof c.title === 'string' ? c.title : '未命名会话',
      paperUrls: [...new Set(strings(c.paperUrls))], messages,
      createdAt: typeof c.createdAt === 'number' ? c.createdAt : Date.now(),
      updatedAt: typeof c.updatedAt === 'number' ? c.updatedAt : Date.now() });
  });
  const order = [...new Set([...strings(payload.conversationOrder), ...conversations.map(c => c.id)])].filter(id => ids.has(id));
  return {
    date: payload.date, papers, total: papers.length, subjects_counter: subjects,
    ...(typeof payload.dailySummary === 'string' ? { dailySummary: payload.dailySummary } : {}),
    conversations, conversationOrder: order,
    activeConversationId: typeof payload.activeConversationId === 'string' && ids.has(payload.activeConversationId) ? payload.activeConversationId : null,
  };
}

export function serializeWorkspace(state: { dailyData: DailyData | null; conversations: Record<string, Conversation>; conversationOrder: string[]; activeConversationId: string | null }) {
  return { ...state.dailyData, conversations: state.conversationOrder.map(id => state.conversations[id]).filter(Boolean),
    conversationOrder: state.conversationOrder, activeConversationId: state.activeConversationId };
}

export function exportWorkspace(state: Parameters<typeof serializeWorkspace>[0]) {
  if (!state.dailyData) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(serializeWorkspace(state), null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url;
  link.download = `RAVEN_${state.dailyData.date.replace(/-/g, '')}.json`;
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function pdfUrl(url: string) { return url.replace('/abs/', '/pdf/'); }
export function arxivId(url: string) { return url.match(/\d{4}\.\d{4,5}(?:v\d+)?/)?.[0] || ''; }
