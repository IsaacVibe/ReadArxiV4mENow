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

export interface WorkspaceData extends DailyData {
  conversations: Conversation[];
  conversationOrder: string[];
  activeConversationId: string | null;
}

export type FilePickerWindow = Window & {
  showOpenFilePicker?: (options: {
    multiple: boolean;
    mode: 'readwrite';
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<FileSystemFileHandle[]>;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isPaper(value: unknown): value is Paper {
  return isRecord(value) && typeof value.title === 'string' &&
    typeof value.summary === 'string' && typeof value.url === 'string' &&
    isStringArray(value.authors) && isStringArray(value.categories) &&
    (value.aiSummary === undefined || typeof value.aiSummary === 'string');
}

function isChatMessage(value: unknown): value is ChatMessage {
  return isRecord(value) && typeof value.id === 'string' &&
    (value.role === 'user' || value.role === 'assistant') &&
    typeof value.content === 'string' &&
    (value.isDailySummary === undefined || typeof value.isDailySummary === 'boolean');
}

export function parseDailyData(payload: unknown): DailyData | null {
  if (!isRecord(payload) || typeof payload.date !== 'string' || !payload.date ||
      !Array.isArray(payload.papers) || !payload.papers.every(isPaper)) return null;

  const subjects = isRecord(payload.subjects_counter) ? payload.subjects_counter : {};
  return {
    date: payload.date,
    total: typeof payload.total === 'number' ? payload.total : payload.papers.length,
    subjects_counter: Object.fromEntries(Object.entries(subjects).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number',
    )),
    papers: payload.papers,
    dailySummary: typeof payload.dailySummary === 'string' ? payload.dailySummary : undefined,
  };
}

export function parseWorkspace(payload: unknown): WorkspaceData | null {
  const dailyData = parseDailyData(payload);
  if (!dailyData || !isRecord(payload)) return null;

  const conversations: Conversation[] = [];
  const items: unknown[] = Array.isArray(payload.conversations) ? payload.conversations : [];
  for (const item of items) {
    if (!isRecord(item) || typeof item.id !== 'string' || !isStringArray(item.paperUrls) ||
        !Array.isArray(item.messages) || !item.messages.every(isChatMessage)) continue;
    conversations.push({
      id: item.id,
      title: typeof item.title === 'string' ? item.title : item.id,
      paperUrls: item.paperUrls,
      messages: item.messages,
      createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
      updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
    });
  }
  const ids = new Set(conversations.map((conversation) => conversation.id));
  const order = isStringArray(payload.conversationOrder) ? payload.conversationOrder : [];
  const conversationOrder = [...new Set([...order.filter((id) => ids.has(id)), ...ids])];
  const activeConversationId = typeof payload.activeConversationId === 'string' && ids.has(payload.activeConversationId)
    ? payload.activeConversationId : null;
  return { ...dailyData, conversations, conversationOrder, activeConversationId };
}

export async function loadInitialData(): Promise<DailyData | null> {
  const readJson = async (path: string): Promise<unknown> => {
    try {
      const response = await fetch(path);
      return response.ok ? await response.json() : null;
    } catch {
      return null;
    }
  };

  const index = await readJson('/latest.json');
  const paths = ['/papers.json', '/example-papers.json'];
  if (isRecord(index) && typeof index.latest_file === 'string' && index.latest_file) {
    paths.unshift(`/${index.latest_file.replace(/^\/+/, '')}`);
  }
  for (const path of paths) {
    const data = parseDailyData(await readJson(path));
    if (data) return data;
  }
  return null;
}
