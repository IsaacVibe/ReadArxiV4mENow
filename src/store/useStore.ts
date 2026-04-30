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

export interface Conversation {
  id: string;
  title: string;
  paperUrls: string[];
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

interface AppState {
  // Settings - Read directly from .env, completely fixed and read-only at runtime
  apiKey: string;
  baseUrl: string;
  model: string;
  setModel: (model: string) => void;

  // Data
  dailyData: DailyData | null;
  setDailyData: (data: DailyData) => void;
  hydrateWorkspace: (payload: any) => void;
  updateDailySummary: (summary: string) => void;
  updatePaperAiSummary: (url: string, aiSummary: string) => void;
  selectedPapers: Paper[];
  togglePaperSelection: (paper: Paper) => void;
  selectAllPapers: (papers: Paper[]) => void;
  clearSelectedPapers: () => void;

  // Conversations
  conversations: Record<string, Conversation>;
  conversationOrder: string[];
  activeConversationId: string | null;
  createConversationFromSelection: () => string | null;
  activateConversation: (conversationId: string) => void;
  addMessageToConversation: (conversationId: string, msg: ChatMessage) => void;
  appendToAssistantMessage: (conversationId: string, messageId: string, chunk: string) => void;
  clearConversationMessages: (conversationId: string) => void;
}

export const useStore = create<AppState>((set) => ({
  // Fixed settings from .env
  apiKey: import.meta.env.VITE_LLM_API_KEY || '',
  baseUrl: import.meta.env.VITE_LLM_BASE_URL || 'https://api.openai.com/v1',
  model: import.meta.env.VITE_LLM_MODEL || 'gpt-3.5-turbo',
  setModel: (model) => set({ model }),

  // Data
  dailyData: null,
  setDailyData: (data) => set(() => ({
    dailyData: data,
    selectedPapers: [],
    conversations: {},
    conversationOrder: [],
    activeConversationId: null,
  })),
  hydrateWorkspace: (payload) => set(() => {
    if (!payload || !payload.papers || !payload.date) {
      return {};
    }

    const dailyData: DailyData = {
      date: payload.date,
      total: payload.total ?? (Array.isArray(payload.papers) ? payload.papers.length : 0),
      subjects_counter: payload.subjects_counter ?? {},
      papers: payload.papers,
      dailySummary: payload.dailySummary,
    };

    const conversationsArray: any[] = Array.isArray(payload.conversations) ? payload.conversations : [];
    const conversations: Record<string, Conversation> = {};
    const conversationOrderFromPayload: any[] = Array.isArray(payload.conversationOrder) ? payload.conversationOrder : [];
    const conversationOrder: string[] = [];

    conversationsArray.forEach((c) => {
      if (!c || typeof c.id !== 'string' || !Array.isArray(c.paperUrls) || !Array.isArray(c.messages)) return;
      const conv: Conversation = {
        id: c.id,
        title: typeof c.title === 'string' ? c.title : c.id,
        paperUrls: c.paperUrls,
        messages: c.messages,
        createdAt: typeof c.createdAt === 'number' ? c.createdAt : Date.now(),
        updatedAt: typeof c.updatedAt === 'number' ? c.updatedAt : Date.now(),
      };
      conversations[conv.id] = conv;
    });

    conversationOrderFromPayload.forEach((id) => {
      if (typeof id !== 'string') return;
      if (conversations[id]) conversationOrder.push(id);
    });
    if (conversationOrder.length === 0) {
      Object.keys(conversations).forEach((id) => conversationOrder.push(id));
    }

    const activeConversationId = typeof payload.activeConversationId === 'string' ? payload.activeConversationId : null;
    const selectedPapers =
      activeConversationId && conversations[activeConversationId]
        ? dailyData.papers.filter((p) => conversations[activeConversationId].paperUrls.includes(p.url))
        : [];

    return {
      dailyData,
      selectedPapers,
      conversations,
      conversationOrder,
      activeConversationId,
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
    if (isSelected) {
      const nextSelectedPapers = state.selectedPapers.filter(p => p.url !== paper.url);
      return { selectedPapers: nextSelectedPapers, activeConversationId: null };
    } else {
      const latestPaper = state.dailyData?.papers.find(p => p.url === paper.url) || paper;
      return { selectedPapers: [...state.selectedPapers, latestPaper], activeConversationId: null };
    }
  }),
  selectAllPapers: (papers) => set((state) => {
    const newSelection = [...state.selectedPapers];
    papers.forEach(paper => {
      if (!newSelection.some(p => p.url === paper.url)) {
        const latestPaper = state.dailyData?.papers.find(p => p.url === paper.url) || paper;
        newSelection.push(latestPaper);
      }
    });
    return { selectedPapers: newSelection, activeConversationId: null };
  }),
  clearSelectedPapers: () => set({ selectedPapers: [], activeConversationId: null }),

  conversations: {},
  conversationOrder: [],
  activeConversationId: null,
  createConversationFromSelection: () => {
    const now = Date.now();
    let createdId: string | null = null;

    set((state) => {
      const paperUrls = state.selectedPapers.map(p => p.url);
      if (paperUrls.length === 0) {
        return state;
      }

      const nextIndex = state.conversationOrder.length + 1;
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const suffix = nextIndex <= alphabet.length ? alphabet[nextIndex - 1] : `${nextIndex}`;
      const id = `ctx_${now}_${nextIndex}`;
      const title = `上下文 ${suffix}`;

      const conv: Conversation = {
        id,
        title,
        paperUrls,
        messages: [],
        createdAt: now,
        updatedAt: now,
      };

      createdId = id;
      return {
        conversations: { ...state.conversations, [id]: conv },
        conversationOrder: [...state.conversationOrder, id],
        activeConversationId: id,
      };
    });

    return createdId;
  },
  activateConversation: (conversationId) => set((state) => {
    const conv = state.conversations[conversationId];
    if (!conv || !state.dailyData) return state;
    const selectedPapers = state.dailyData.papers.filter(p => conv.paperUrls.includes(p.url));
    return { activeConversationId: conversationId, selectedPapers };
  }),
  addMessageToConversation: (conversationId, msg) => set((state) => {
    const conv = state.conversations[conversationId];
    if (!conv) return state;
    const updated: Conversation = { ...conv, messages: [...conv.messages, msg], updatedAt: Date.now() };
    return { conversations: { ...state.conversations, [conversationId]: updated } };
  }),
  appendToAssistantMessage: (conversationId, messageId, chunk) => set((state) => {
    const conv = state.conversations[conversationId];
    if (!conv) return state;
    const messages = conv.messages.map((m) => (m.id === messageId ? { ...m, content: m.content + chunk } : m));
    const updated: Conversation = { ...conv, messages, updatedAt: Date.now() };
    return { conversations: { ...state.conversations, [conversationId]: updated } };
  }),
  clearConversationMessages: (conversationId) => set((state) => {
    const conv = state.conversations[conversationId];
    if (!conv) return state;
    const updated: Conversation = { ...conv, messages: [], updatedAt: Date.now() };
    return { conversations: { ...state.conversations, [conversationId]: updated } };
  }),
}));
