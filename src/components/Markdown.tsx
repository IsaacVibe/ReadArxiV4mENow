import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

const remarkPlugins = [remarkMath];
const rehypePlugins = [rehypeKatex];
export function Markdown({ children }: { children: string }) {
  const normalized = children.split(/(```[\s\S]*?```)/g).map((part, index) => index % 2 ? part : part
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, value: string) => `\n$$\n${value}\n$$\n`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, value: string) => `$${value}$`)).join('');
  return <div className="markdown"><ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins}
    components={{ a: ({ children, ...props }) => <a {...props} target="_blank" rel="noreferrer">{children}</a> }}
  >{normalized}</ReactMarkdown></div>;
}
