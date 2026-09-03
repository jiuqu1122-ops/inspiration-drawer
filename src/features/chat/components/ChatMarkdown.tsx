import { Check, Copy } from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { isValidElement, memo, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';

const getNodeText = (node: ReactNode): string => {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(getNodeText).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return getNodeText(node.props.children);
  return '';
};

function MarkdownCodeBlock({ children }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const code = getNodeText(children).replace(/\n$/, '');
  const child = isValidElement<{ className?: string }>(children) ? children : null;
  const language = child?.props.className?.match(/language-([^\s]+)/)?.[1] || '代码';

  const copy = async () => {
    if (!code) return;
    await navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="chat-markdown__code-block">
      <div className="chat-markdown__code-head">
        <span>{language}</span>
        <button type="button" onClick={() => void copy()} aria-label="复制代码">
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  );
}

const isSafeExternalUrl = (value?: string) => {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

export const ChatMarkdown = memo(function ChatMarkdown({ content }: { content: string }) {
  return (
    <div className="chat-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        skipHtml
        components={{
          a: ({ href, children }) => isSafeExternalUrl(href) ? (
            <a
              href={href}
              rel="noreferrer noopener"
              title={href}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void openUrl(href!);
              }}
            >
              {children}
            </a>
          ) : <span className="chat-markdown__unsafe-link">{children}</span>,
          pre: ({ children }) => <MarkdownCodeBlock>{children}</MarkdownCodeBlock>,
          code: ({ className, children }) => (
            <code className={['chat-markdown__code', className].filter(Boolean).join(' ')}>{children}</code>
          ),
          table: ({ children }) => (
            <div className="chat-markdown__table-wrap">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
