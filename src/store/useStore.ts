import { create } from 'zustand';
import { normalizeWorkspace } from '../utils/workspace';
import type { ReadingSource } from '../utils/paperText';

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
  status?: 'interrupted';
  sources?: ReadingSource[];
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

  // Workspace persistence
  workspaceFileHandle: FileSystemFileHandle | null;
  setWorkspaceFileHandle: (handle: FileSystemFileHandle | null) => void;

  // Data
  dailyData: DailyData | null;
  setDailyData: (data: DailyData) => void;
  hydrateWorkspace: (payload: unknown) => void;
  workspaceRevision: number;
  generationTask: string | null;
  setGenerationTask: (task: string | null) => void;
  renameConversation: (id: string, title: string) => void;
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
  markMessageInterrupted: (conversationId: string, messageId: string) => void;
}

export const useStore = create<AppState>((set) => ({
  // Fixed settings from .env
  apiKey: import.meta.env.VITE_LLM_API_KEY || '',
  baseUrl: import.meta.env.VITE_LLM_BASE_URL || 'https://api.openai.com/v1',
  model: import.meta.env.VITE_LLM_MODEL || 'gpt-3.5-turbo',
  setModel: (model) => set({ model }),

  workspaceFileHandle: null,
  setWorkspaceFileHandle: (handle) => set({ workspaceFileHandle: handle }),

  // Data
  dailyData: null,
  workspaceRevision: 0,
  generationTask: null,
  setGenerationTask: (generationTask) => set({ generationTask }),
  renameConversation: (id, title) => set(state => {
    const conversation = state.conversations[id];
    if (!conversation || !title.trim()) return state;
    return { conversations: { ...state.conversations, [id]: { ...conversation, title: title.trim(), updatedAt: Date.now() } } };
  }),
  setDailyData: (data) => set((state) => ({
    workspaceRevision: state.workspaceRevision + 1,
    dailyData: data,
    selectedPapers: [],
    conversations: {},
    conversationOrder: [],
    activeConversationId: null,
    workspaceFileHandle: null,
  })),
  hydrateWorkspace: (payload) => {
    const workspace = normalizeWorkspace(payload);
    set(state => {
      const conversations = Object.fromEntries(workspace.conversations.map(c => [c.id, c]));
      const active = workspace.activeConversationId;
      const selectedPapers = active ? conversations[active].paperUrls.map(url => workspace.papers.find(p => p.url === url)).filter((p): p is Paper => !!p) : [];
      return { dailyData: workspace, conversations, conversationOrder: workspace.conversationOrder,
        activeConversationId: active, selectedPapers, workspaceFileHandle: null,
        workspaceRevision: state.workspaceRevision + 1 };
    });
  },
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
      const id = `ctx_${now}_${nextIndex}`;
      const title = `${state.selectedPapers.length > 1 ? '比较 · ' : ''}${state.selectedPapers[0].title.slice(0, 48)}`;

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
    const selectedPapers = conv.paperUrls.map(url => state.dailyData?.papers.find(p => p.url === url)).filter((p): p is Paper => !!p);
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
  markMessageInterrupted: (id, messageId) => set(state => {
    const conversation = state.conversations[id];
    if (!conversation) return state;
    return { conversations: { ...state.conversations, [id]: { ...conversation,
      messages: conversation.messages.map(m => m.id === messageId ? { ...m, status: 'interrupted' as const } : m) } } };
  }),
}));
