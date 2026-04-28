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

interface AppState {
  // Settings - Read directly from .env, completely fixed and read-only at runtime
  apiKey: string;
  baseUrl: string;
  model: string;
  setModel: (model: string) => void;

  // Data
  dailyData: DailyData | null;
  setDailyData: (data: DailyData) => void;
  updateDailySummary: (summary: string) => void;
  updatePaperAiSummary: (url: string, aiSummary: string) => void;
  selectedPapers: Paper[];
  togglePaperSelection: (paper: Paper) => void;
  selectAllPapers: (papers: Paper[]) => void;
  clearSelectedPapers: () => void;

  // Chat
  messages: ChatMessage[];
  addMessage: (msg: ChatMessage) => void;
  clearMessages: () => void;
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
    messages: [],
    selectedPapers: []
  })),
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
      return { selectedPapers: state.selectedPapers.filter(p => p.url !== paper.url) };
    } else {
      const latestPaper = state.dailyData?.papers.find(p => p.url === paper.url) || paper;
      return { selectedPapers: [...state.selectedPapers, latestPaper] };
    }
  }),
  selectAllPapers: (papers) => set((state) => {
    // 确保合并时，已经选中的论文不被重复添加，且总是优先获取带有 aiSummary 的最新状态
    const newSelection = [...state.selectedPapers];
    papers.forEach(paper => {
      if (!newSelection.some(p => p.url === paper.url)) {
        const latestPaper = state.dailyData?.papers.find(p => p.url === paper.url) || paper;
        newSelection.push(latestPaper);
      }
    });
    return { selectedPapers: newSelection };
  }),
  clearSelectedPapers: () => set({ selectedPapers: [] }),

  // Chat
  messages: [],
  addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
  clearMessages: () => set({ messages: [] }),
}));
