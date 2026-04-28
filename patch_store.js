const fs = require('fs');
const file = 'src/store/useStore.ts';
let content = fs.readFileSync(file, 'utf8');

// Add aiSummary to Paper
content = content.replace(
  'url: string;',
  'url: string;\n  aiSummary?: string;'
);

// Add updatePaperAiSummary to AppState
content = content.replace(
  'setDailyData: (data: DailyData) => void;',
  'setDailyData: (data: DailyData) => void;\n  updatePaperAiSummary: (url: string, aiSummary: string) => void;'
);

// Add updatePaperAiSummary implementation
content = content.replace(
  'setDailyData: (data) => set({ dailyData: data }),',
  'setDailyData: (data) => set({ dailyData: data }),\n  updatePaperAiSummary: (url, aiSummary) => set((state) => {\n    if (!state.dailyData) return state;\n    const updatedPapers = state.dailyData.papers.map(p => p.url === url ? { ...p, aiSummary } : p);\n    return { dailyData: { ...state.dailyData, papers: updatedPapers } };\n  }),'
);

fs.writeFileSync(file, content);
