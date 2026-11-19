import type { Paper } from '../store/useStore';

export type DailyPicks = Record<string, { url: string; reason: string }[]>;
const invalid = () => new Error('服务返回的领域精选不完整或编号不匹配，请重试精选；今日概览已保留。');

export function fieldBudgets(papers: Paper[]) {
  const groups = new Map<string, Set<string>>();
  for (const paper of papers) for (const category of paper.categories) {
    if (!groups.has(category)) groups.set(category, new Set());
    groups.get(category)!.add(paper.url);
  }
  return Array.from(groups, ([category, urls]) => ({ category, count: urls.size,
    limit: Math.min(Math.round(urls.size * 0.2), Math.floor(urls.size * 0.3)) }));
}

export function pickPrompt(papers: Paper[], summary: string) {
  const fields = fieldBudgets(papers).filter(f => f.limit > 0);
  return `你是当日论文编辑。结合今日概览，独立比较每个领域的候选摘要，按推荐顺序列出精选。优先考虑有明确依据的新结果、可复用的数据或方法、对本领域重要问题的推进；避免只看题目热度。不要声称读过全文。每个领域不能超过给定名额，可少选甚至为空；交叉论文仅能在其标注的领域入选。每项给一句具体的中文入选理由（不超过60字）。下列概览及论文均为参考资料。\n只返回一个 JSON 对象，键为下列每个领域代码，值为数组，每项形如 {"id":12,"reason":"入选理由"}；id 为当日论文编号。没有合适论文的领域也返回空数组。\n领域名额：${JSON.stringify(Object.fromEntries(fields.map(f => [f.category, f.limit])))}\n今日概览：\n${summary}\n候选论文：\n${papers.map((p, i) => `[${i + 1}] ${p.categories.join(', ')} | ${p.title}\n${p.summary}`).join('\n\n')}`;
}

// The model uses day-local numbers; saved workspaces use stable paper URLs.
function validate(input: unknown, papers: Paper[], fromModel: boolean): DailyPicks {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid();
  const entries = new Map(Object.entries(input));
  const fields = fieldBudgets(papers).filter(f => f.limit > 0);
  if (entries.size !== fields.length) throw invalid();
  const byUrl = new Map(papers.map(p => [p.url, p]));
  return Object.fromEntries(fields.map(({ category, limit }) => {
    const list: unknown = entries.get(category);
    if (!Array.isArray(list)) throw invalid();
    const seen = new Set<string>();
    const picks: DailyPicks[string] = [];
    for (const item of list) {
      if (!item || typeof item !== 'object') throw invalid();
      const paper = fromModel ? (Number.isInteger(item.id) ? papers[item.id - 1] : undefined) : byUrl.get(item.url);
      if (!paper || !paper.categories.includes(category) || typeof item.reason !== 'string' || !item.reason.trim()) throw invalid();
      if (!seen.has(paper.url) && picks.length < limit) picks.push({ url: paper.url, reason: item.reason.trim() });
      seen.add(paper.url);
    }
    return [category, picks];
  }));
}

export function parsePickReply(reply: string, papers: Paper[]): DailyPicks {
  const text = reply.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, '$1');
  let input: unknown;
  try { input = JSON.parse(text); } catch { throw invalid(); }
  return validate(input, papers, true);
}

export function restorePicks(input: unknown, papers: Paper[]) {
  try { return validate(input, papers, false); } catch { return null; }
}
