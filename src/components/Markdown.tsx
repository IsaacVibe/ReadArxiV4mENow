import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { normalizeMathDelimiters } from '../utils/math';

const remarkPlugins = [remarkMath];
const rehypePlugins = [rehypeKatex];
export function Markdown({ children }: { children: string }) {
  return <div className="markdown"><ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins}
    components={{ a: ({ children, ...props }) => <a {...props} target="_blank" rel="noreferrer">{children}</a> }}
  >{normalizeMathDelimiters(children)}</ReactMarkdown></div>;
}
