export async function callLLM(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  apiKey: string,
  baseUrl: string,
  model: string,
  onChunk: (chunk: string) => void
) {
  // 移除 baseUrl 末尾的斜杠，统一格式
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  
  // 判断是否已经是完整的 URL，如果不是则补全
  const endpoint = normalizedBaseUrl.endsWith('/chat/completions') 
    ? normalizedBaseUrl 
    : `${normalizedBaseUrl}/chat/completions`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // 只有当 apiKey 存在时才添加 Authorization 头，兼容某些不需要 Key 的本地模型
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API Error ${response.status}: ${errText}`);
  }

  if (!response.body) {
    throw new Error('No response body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let done = false;

  while (!done) {
    const { value, done: doneReading } = await reader.read();
    done = doneReading;
    const chunkValue = decoder.decode(value, { stream: true });
    
    // Server-Sent Events (SSE) format parsing
    const lines = chunkValue.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ') && line !== 'data: [DONE]') {
        try {
          const parsed = JSON.parse(line.slice(6));
          // 兼容不同大模型可能存在的结构差异 (例如有些模型把内容放在 delta.content，有些可能略有不同)
          const content = parsed.choices?.[0]?.delta?.content || parsed.message?.content || '';
          if (content) {
            onChunk(content);
          }
        } catch (e) {
          // ignore parsing error for partial chunks
        }
      }
    }
  }
}
