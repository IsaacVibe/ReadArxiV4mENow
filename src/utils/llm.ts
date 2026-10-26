export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
export function isCancelled(error: unknown) { return error instanceof Error && error.name === 'AbortError'; }
export function requestError(error: unknown) {
  if (isCancelled(error)) return '已停止生成，已收到的内容仍会保留。';
  return error instanceof Error && error.message.startsWith('服务') ? error.message : '暂时无法连接模型服务。请检查网络与模型设置后重试。';
}
export async function callLLM(messages: LLMMessage[], apiKey: string, baseUrl: string, model: string, onChunk: (chunk: string) => void, signal?: AbortSignal) {
  const base = baseUrl.replace(/\/+$/, '');
  const response = await fetch(base.endsWith('/chat/completions') ? base : `${base}/chat/completions`, {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
    body: JSON.stringify({ model: model.trim(), messages, stream: true, temperature: 0.3 }),
  });
  if (!response.ok) {
    const reasons: Record<number, string> = { 401: '服务认证未通过，请检查本地密钥配置。', 403: '服务拒绝访问，请检查模型权限。', 404: '服务未找到该模型或接口，请检查模型设置。', 429: '服务请求过于频繁，请稍后重试。' };
    throw new Error(reasons[response.status] || `服务暂时不可用（${response.status}），请稍后重试。`);
  }
  if (!response.body) throw new Error('服务没有返回可读取的内容，请重试。');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = ''; let received = false;
  const consume = (line: string) => {
    if (!line.startsWith('data:')) return false;
    const data = line.slice(5).trim();
    if (data === '[DONE]') return true;
    if (!data) return false;
    let parsed: { choices?: { delta?: { content?: unknown } }[]; message?: { content?: unknown }; error?: unknown };
    try { parsed = JSON.parse(data); } catch { throw new Error('服务返回了无法解析的内容，请重试。'); }
    if (parsed.error) throw new Error('服务在生成过程中中断，请重试。');
    const content = parsed.choices?.[0]?.delta?.content ?? parsed.message?.content;
    if (typeof content === 'string' && content) { received = true; onChunk(content); }
    return false;
  };
  try {
    let finished = false;
    while (!finished) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let end: number;
      while ((end = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, end).replace(/\r$/, ''); buffer = buffer.slice(end + 1);
        if (consume(line)) { finished = true; break; }
      }
      if (done) { if (buffer.trim() && !finished) consume(buffer.replace(/\r$/, '')); break; }
    }
    if (!received) throw new Error('服务返回了空回答，请重试。');
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}
