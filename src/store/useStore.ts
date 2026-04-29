import { create } from 'zustand';

export interface Paper {
  title: string;
  authors: string[];
  summary: string;
  categories: string[];
  url: string;
  aiSummary?: string;
}

export interface DailyData {
  date: string;
  total: number;
  subjects_counter: Record<string, number>;
  papers: Paper[];
  dailySummary?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isDailySummary?: boolean;
}

export interface ChatThread {
  id: string;
  title: string;
  paperUrls: string[];
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

interface AppState {
  // Settings - Read directly from .env, completely fixed and read-only at runtime
  apiKey: string;
  baseUrl: string;
  model: string;
  setModel: (model: string) => void;

  // Data
  dailyData: DailyData | null;
  loadRavenData: (data: any) => void;
  updateDailySummary: (summary: string) => void;
  updatePaperAiSummary: (url: string, aiSummary: string) => void;
  selectedPapers: Paper[];
  togglePaperSelection: (paper: Paper) => void;
  selectAllPapers: (papers: Paper[]) => void;
  clearSelectedPapers: () => void;

  // Chat
  threads: Record<string, ChatThread>;
  activeThreadId: string;
  activateThread: (threadId: string) => void;
  addChatMessage: (msg: ChatMessage) => void;
  appendToThreadMessage: (threadId: string, messageId: string, chunk: string) => void;
  clearActiveThread: () => void;
}

const GENERAL_THREAD_ID = 'general';

function normalizePaperUrls(papers: Paper[]) {
  const urls = papers.map((p) => p.url);
  const uniq = Array.from(new Set(urls));
  uniq.sort();
  return uniq;
}

function selectionKey(urls: string[]) {
  return urls.join('|');
}

function buildThreadTitle(papers: Paper[]) {
  if (papers.length === 0) return '自由对话';
  if (papers.length === 1) return papers[0].title;
  return `${papers.length} 篇论文对话`;
}

function ensureThreadForSelection(state: AppState, papers: Paper[]) {
  const urls = normalizePaperUrls(papers);
  if (urls.length === 0) {
    return {
      activeThreadId: GENERAL_THREAD_ID,
    };
  }

  const key = selectionKey(urls);
  const existing = Object.values(state.threads).find((t) => selectionKey(t.paperUrls) === key);
  if (existing) {
    return {
      activeThreadId: existing.id,
    };
  }

  const now = Date.now();
  const id = `thread_${now}`;
  const newThread: ChatThread = {
    id,
    title: buildThreadTitle(papers),
    paperUrls: urls,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };

  return {
    threads: { ...state.threads, [id]: newThread },
    activeThreadId: id,
  };
}

function papersForUrls(dailyData: DailyData | null, urls: string[]) {
  if (!dailyData) return [];
  const map = new Map(dailyData.papers.map((p) => [p.url, p]));
  const out: Paper[] = [];
  urls.forEach((u) => {
    const p = map.get(u);
    if (p) out.push(p);
  });
  return out;
}

export const useStore = create<AppState>((set) => ({
  // Fixed settings from .env
  apiKey: import.meta.env.VITE_LLM_API_KEY || '',
  baseUrl: import.meta.env.VITE_LLM_BASE_URL || 'https://api.openai.com/v1',
  model: import.meta.env.VITE_LLM_MODEL || 'gpt-3.5-turbo',
  setModel: (model) => set({ model }),

  // Data
  dailyData: null,
  loadRavenData: (data) => set((state) => {
    const dailyData: DailyData = data;
    const threadsArr: any[] = Array.isArray(data?.threads) ? data.threads : [];
    const restoredThreads: Record<string, ChatThread> = {};

    threadsArr.forEach((t) => {
      if (!t?.id || !Array.isArray(t?.messages)) return;
      const paperUrls = Array.isArray(t.paperUrls)
        ? Array.from(new Set((t.paperUrls as any[]).map((u) => String(u)))).sort()
        : [];
      restoredThreads[t.id] = {
        id: String(t.id),
        title: String(t.title || '对话'),
        paperUrls,
        createdAt: Number(t.createdAt || Date.now()),
        updatedAt: Number(t.updatedAt || Date.now()),
        messages: t.messages as ChatMessage[],
      };
    });

    if (!restoredThreads[GENERAL_THREAD_ID]) {
      const now = Date.now();
      restoredThreads[GENERAL_THREAD_ID] = {
        id: GENERAL_THREAD_ID,
        title: '自由对话',
        paperUrls: [],
        createdAt: now,
        updatedAt: now,
        messages: [],
      };
    }

    const activeThreadId = restoredThreads[GENERAL_THREAD_ID] ? GENERAL_THREAD_ID : Object.keys(restoredThreads)[0];

    return {
      dailyData,
      selectedPapers: [],
      threads: restoredThreads,
      activeThreadId,
    };
  }),
  updateDailySummary: (summary) => set((state) => ({
    dailyData: state.dailyData ? { ...state.dailyData, dailySummary: summary } : null
  })),
  updatePaperAiSummary: (url, aiSummary) => set((state) => {
    if (!state.dailyData) return state;
    const updatedPapers = state.dailyData.papers.map(p => p.url === url ? { ...p, aiSummary } : p);
    const updatedSelectedPapers = state.selectedPapers.map(p => p.url === url ? { ...p, aiSummary } : p);
    return { 
      dailyData: { ...state.dailyData, papers: updatedPapers },
      selectedPapers: updatedSelectedPapers
    };
  }),
  selectedPapers: [],
  togglePaperSelection: (paper) => set((state) => {
    const isSelected = state.selectedPapers.some(p => p.url === paper.url);
    const nextSelected = isSelected
      ? state.selectedPapers.filter(p => p.url !== paper.url)
      : [...state.selectedPapers, (state.dailyData?.papers.find(p => p.url === paper.url) || paper)];

    const threadUpdate = ensureThreadForSelection(state, nextSelected);
    return { selectedPapers: nextSelected, ...threadUpdate };
  }),
  selectAllPapers: (papers) => set((state) => {
    const newSelection = [...state.selectedPapers];
    papers.forEach(paper => {
      if (!newSelection.some(p => p.url === paper.url)) {
        const latestPaper = state.dailyData?.papers.find(p => p.url === paper.url) || paper;
        newSelection.push(latestPaper);
      }
    });
    const threadUpdate = ensureThreadForSelection(state, newSelection);
    return { selectedPapers: newSelection, ...threadUpdate };
  }),
  clearSelectedPapers: () => set((state) => ({
    selectedPapers: [],
    activeThreadId: GENERAL_THREAD_ID,
  })),

  threads: (() => {
    const now = Date.now();
    return {
      [GENERAL_THREAD_ID]: {
        id: GENERAL_THREAD_ID,
        title: '自由对话',
        paperUrls: [],
        createdAt: now,
        updatedAt: now,
        messages: [],
      },
    };
  })(),
  activeThreadId: GENERAL_THREAD_ID,
  activateThread: (threadId) => set((state) => {
    const thread = state.threads[threadId];
    if (!thread) return state;
    const selectedPapers = papersForUrls(state.dailyData, thread.paperUrls);
    return {
      activeThreadId: threadId,
      selectedPapers,
    };
  }),
  addChatMessage: (msg) => set((state) => {
    const thread = state.threads[state.activeThreadId];
    if (!thread) return state;
    const now = Date.now();
    const updatedThread: ChatThread = {
      ...thread,
      updatedAt: now,
      messages: [...thread.messages, msg],
    };
    return {
      threads: {
        ...state.threads,
        [thread.id]: updatedThread,
      },
    };
  }),
  appendToThreadMessage: (threadId, messageId, chunk) => set((state) => {
    const thread = state.threads[threadId];
    if (!thread) return state;
    const updatedMessages = thread.messages.map((m) => {
      if (m.id !== messageId) return m;
      return { ...m, content: m.content + chunk };
    });
    const now = Date.now();
    return {
      threads: {
        ...state.threads,
        [thread.id]: { ...thread, updatedAt: now, messages: updatedMessages },
      },
    };
  }),
  clearActiveThread: () => set((state) => {
    const thread = state.threads[state.activeThreadId];
    if (!thread) return state;
    const now = Date.now();
    return {
      threads: {
        ...state.threads,
        [thread.id]: { ...thread, updatedAt: now, messages: [] },
      },
    };
  }),
}));
