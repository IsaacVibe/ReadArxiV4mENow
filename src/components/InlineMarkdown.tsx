import { memo, type PropsWithChildren } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { normalizeMathDelimiters } from '../utils/math';

const remarkPlugins = [remarkMath];
const rehypePlugins = [rehypeKatex];
const text = ({ children }: PropsWithChildren) => <span>{children}</span>;
// Titles live inside buttons: keep content inline and prevent nested links/actions.
const components = { p: text, a: text, h1: text, h2: text, h3: text, h4: text, h5: text, h6: text,
  blockquote: text, pre: text, ul: text, ol: text, li: text, hr: () => null, img: () => null };

export const InlineMarkdown = memo(function InlineMarkdown({ children }: { children: string }) {
  return <span className="inline-markdown"><ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>
    {normalizeMathDelimiters(children, true)}
  </ReactMarkdown></span>;
});
