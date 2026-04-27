import { create } from 'zustand';

export interface Paper {
  title: string;
  authors: string[];
  summary: string;
  categories: string[];
  url: string;
}

export interface DailyData {
  date: string;
  total: number;
  subjects_counter: Record<string, number>;
  papers: Paper[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface AppState {
  // Settings - Read directly from .env, completely fixed and read-only at runtime
  apiKey: string;
  baseUrl: string;
  model: string;

  // Data
  dailyData: DailyData | null;
  setDailyData: (data: DailyData) => void;
  selectedPapers: Paper[];
  togglePaperSelection: (paper: Paper) => void;
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

  // Data
  dailyData: null,
  setDailyData: (data) => set({ dailyData: data }),
  selectedPapers: [],
  togglePaperSelection: (paper) => set((state) => {
    const isSelected = state.selectedPapers.some(p => p.url === paper.url);
    if (isSelected) {
      return { selectedPapers: state.selectedPapers.filter(p => p.url !== paper.url) };
    } else {
      return { selectedPapers: [...state.selectedPapers, paper] };
    }
  }),
  clearSelectedPapers: () => set({ selectedPapers: [] }),

  // Chat
  messages: [],
  addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
  clearMessages: () => set({ messages: [] }),
}));
