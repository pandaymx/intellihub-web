import { type ReactNode, useState } from 'react';

interface MarkdownContentProps {
  content: string;
}

function cleanLatexText(raw: string): string {
  return raw
    .replace(/\\text\{([^}]*)\}/g, '$1')
    .replace(/\\textbf\{([^}]*)\}/g, '$1')
    .replace(/\\mathrm\{([^}]*)\}/g, '$1')
    .replace(/\\le\b/g, '≤')
    .replace(/\\ge\b/g, '≥')
    .replace(/\\neq\b/g, '≠')
    .replace(/\\times\b/g, '×')
    .replace(/\\rightarrow\b/g, '→')
    .replace(/\\leftarrow\b/g, '←')
    .replace(/\\Rightarrow\b/g, '⇒')
    .replace(/\\approx\b/g, '≈')
    .trim();
}

function normalizeHref(rawUrl: string): string {
  const cleaned = rawUrl
    .trim()
    .replace(/\s+["'][^"']*["']$/, '')
    .trim();
  if (
    cleaned.startsWith('http://') ||
    cleaned.startsWith('https://') ||
    cleaned.startsWith('mailto:') ||
    cleaned.startsWith('#') ||
    cleaned.startsWith('/')
  ) {
    return cleaned;
  }
  return `https://${cleaned}`;
}

/**
 * 解析单行内联 Markdown 语法：
 * - 行内代码 `code`
 * - 行内数学公式 $$...$$ / $...$
 * - 知识库引用角标 [#1]
 * - Markdown 超链接 [text](url)
 * - 尖括号链接 <https://...> 与裸 URL https://...
 * - 粗体 **bold** / __bold__
 * - 斜体 *italic*
 */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const tokenRegex =
    /(`[^`]+`|\$\$[^$]+\$\$|\$[^$\n]+\$|\[#\d+\]|\[[^\]]+\]\s*\([^)\n]+\)|<https?:\/\/[^\s>]+>|\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|https?:\/\/[^\s<>"')\]，。；！？、]+)/g;

  const parts = text.split(tokenRegex);
  let tokenIdx = 0;

  return parts.map((part) => {
    tokenIdx += 1;
    const key = `${keyPrefix}-in-${tokenIdx}`;
    if (!part) return null;

    // 1. 行内代码 `code`
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code key={key} className="md-inline-code">
          {part.slice(1, -1)}
        </code>
      );
    }

    // 2. 行内或单行包裹的数学公式 $$...$$ 或 $...$
    if (part.startsWith('$$') && part.endsWith('$$') && part.length >= 4) {
      return (
        <span key={key} className="md-inline-math">
          {cleanLatexText(part.slice(2, -2))}
        </span>
      );
    }
    if (part.startsWith('$') && part.endsWith('$') && part.length >= 2) {
      return (
        <span key={key} className="md-inline-math">
          {cleanLatexText(part.slice(1, -1))}
        </span>
      );
    }

    // 3. 引用角标胶囊 [#1]
    if (/^\[#\d+\]$/.test(part)) {
      return (
        <span key={key} className="md-citation-pill">
          {part}
        </span>
      );
    }

    // 4. Markdown 链接 [label](url)
    const linkMatch = part.match(/^\[([^\]]+)\]\s*\(([^)\n]+)\)$/);
    if (linkMatch) {
      const label = linkMatch[1];
      const href = normalizeHref(linkMatch[2]);
      return (
        <a
          key={key}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="md-link"
          onClick={(e) => e.stopPropagation()}
        >
          <span>{renderInline(label, `${key}-lbl`)}</span>
          <span className="md-link-arrow" aria-hidden="true">
            ↗
          </span>
        </a>
      );
    }

    // 5. 尖括号自动链接 <https://...>
    if (part.startsWith('<http') && part.endsWith('>')) {
      const url = part.slice(1, -1);
      return (
        <a
          key={key}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="md-link"
          onClick={(e) => e.stopPropagation()}
        >
          <span>{url}</span>
          <span className="md-link-arrow" aria-hidden="true">
            ↗
          </span>
        </a>
      );
    }

    // 6. 粗体 **bold** 或 __bold__
    if (
      (part.startsWith('**') && part.endsWith('**')) ||
      (part.startsWith('__') && part.endsWith('__'))
    ) {
      return (
        <strong key={key} className="md-strong">
          {renderInline(part.slice(2, -2), `${key}-b`)}
        </strong>
      );
    }

    // 7. 斜体 *italic*
    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      return (
        <em key={key} className="md-em">
          {renderInline(part.slice(1, -1), `${key}-em`)}
        </em>
      );
    }

    // 8. 裸 URL (https://... 或 http://...)
    if (/^https?:\/\//.test(part)) {
      return (
        <a
          key={key}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="md-link"
          onClick={(e) => e.stopPropagation()}
        >
          <span>{part}</span>
          <span className="md-link-arrow" aria-hidden="true">
            ↗
          </span>
        </a>
      );
    }

    return part;
  });
}

const CODE_KEYWORDS = new Set([
  'package',
  'import',
  'public',
  'private',
  'protected',
  'class',
  'interface',
  'enum',
  'record',
  'extends',
  'implements',
  'return',
  'void',
  'static',
  'final',
  'abstract',
  'synchronized',
  'volatile',
  'transient',
  'new',
  'this',
  'super',
  'if',
  'else',
  'for',
  'while',
  'do',
  'switch',
  'case',
  'default',
  'break',
  'continue',
  'try',
  'catch',
  'finally',
  'throw',
  'throws',
  'boolean',
  'byte',
  'short',
  'int',
  'long',
  'float',
  'double',
  'char',
  'var',
  'val',
  'fun',
  'def',
  'from',
  'as',
  'async',
  'await',
  'const',
  'let',
  'function',
  'export',
  'type',
  'true',
  'false',
  'null',
  'undefined',
  'SELECT',
  'FROM',
  'WHERE',
  'INSERT',
  'INTO',
  'VALUES',
  'UPDATE',
  'SET',
  'DELETE',
  'JOIN',
  'LEFT',
  'RIGHT',
  'INNER',
  'ON',
  'GROUP',
  'BY',
  'ORDER',
  'LIMIT',
  'AND',
  'OR',
  'NOT',
  'IN',
  'AS',
]);

/**
 * 轻量级零依赖语法高亮分词器（支持 Java / Kotlin / TS / JS / Python / SQL / YAML / XML / Bash）
 */
function highlightCodeLine(line: string, lineKey: string): ReactNode[] {
  if (!line) return [''];

  // 整行注释快速分支
  const trimmed = line.trim();
  if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('-- ')) {
    return [
      <span key={`${lineKey}-cmt`} className="tok-comment">
        {line}
      </span>,
    ];
  }

  const tokenPattern =
    /(\/\/.*$|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|@[A-Za-z_][A-Za-z0-9_.]*|<\/?[A-Za-z0-9_:-]+|\b[A-Za-z_][A-Za-z0-9_]*\b(?=\s*\()|\b[A-Z][A-Za-z0-9_]*\b|\b[a-z_][A-Za-z0-9_]*\b|\b\d+(?:\.\d+)?\b)/gm;

  const parts = line.split(tokenPattern);
  let idx = 0;

  return parts.map((part) => {
    idx += 1;
    const key = `${lineKey}-t-${idx}`;
    if (!part) return null;

    // 1. 注释
    if (part.startsWith('//') || part.startsWith('/*')) {
      return (
        <span key={key} className="tok-comment">
          {part}
        </span>
      );
    }

    // 2. 字符串字面量
    if (
      (part.startsWith('"') && part.endsWith('"')) ||
      (part.startsWith("'") && part.endsWith("'")) ||
      (part.startsWith('`') && part.endsWith('`'))
    ) {
      return (
        <span key={key} className="tok-string">
          {part}
        </span>
      );
    }

    // 3. 注解 / 装饰器 (@RestController, @GetMapping)
    if (part.startsWith('@') && part.length > 1) {
      return (
        <span key={key} className="tok-annotation">
          {part}
        </span>
      );
    }

    // 4. XML / HTML 标签
    if (part.startsWith('<')) {
      return (
        <span key={key} className="tok-tag">
          {part}
        </span>
      );
    }

    // 5. 语言关键字
    if (CODE_KEYWORDS.has(part)) {
      return (
        <span key={key} className="tok-keyword">
          {part}
        </span>
      );
    }

    // 6. 类型或类名 (大写字母开头，如 String, HelloController)
    if (/^[A-Z][A-Za-z0-9_]*$/.test(part)) {
      return (
        <span key={key} className="tok-type">
          {part}
        </span>
      );
    }

    // 7. 数字字面量
    if (/^\d+(?:\.\d+)?$/.test(part)) {
      return (
        <span key={key} className="tok-number">
          {part}
        </span>
      );
    }

    // 8. 函数/方法名（如果在原行中紧跟左括号）
    if (/^[a-z_][A-Za-z0-9_]*$/.test(part) && line.includes(`${part}(`)) {
      return (
        <span key={key} className="tok-func">
          {part}
        </span>
      );
    }

    return part;
  });
}

const LANG_DISPLAY_MAP: Record<string, string> = {
  java: 'Java',
  kotlin: 'Kotlin',
  kt: 'Kotlin',
  js: 'JavaScript',
  javascript: 'JavaScript',
  ts: 'TypeScript',
  typescript: 'TypeScript',
  tsx: 'TSX',
  jsx: 'JSX',
  py: 'Python',
  python: 'Python',
  sql: 'SQL',
  bash: 'Bash',
  sh: 'Shell',
  shell: 'Shell',
  zsh: 'Shell',
  yml: 'YAML',
  yaml: 'YAML',
  xml: 'XML',
  html: 'HTML',
  css: 'CSS',
  json: 'JSON',
  properties: 'Properties',
  dockerfile: 'Dockerfile',
  go: 'Go',
  rust: 'Rust',
};

function CodeBlockCard({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const normalizedLang = (lang || '').trim().toLowerCase();
  const displayLang = LANG_DISPLAY_MAP[normalizedLang] || lang || 'Code';
  const codeLines = code.split('\n');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard error
    }
  };

  let lineNo = 0;

  return (
    <div className="md-code-card">
      <div className="md-code-header">
        <span className="md-code-lang">{displayLang}</span>
        <button
          type="button"
          className={`md-code-copy-btn ${copied ? 'copied' : ''}`}
          onClick={() => void handleCopy()}
          title="复制代码"
          aria-label="复制代码"
        >
          {copied ? (
            <>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>已复制</span>
            </>
          ) : (
            <>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              <span>复制</span>
            </>
          )}
        </button>
      </div>
      <pre className="md-code-pre">
        <code>
          {codeLines.map((lineText) => {
            lineNo += 1;
            const lineKey = `cl-${lineNo}`;
            return (
              <span key={lineKey} className="md-code-line">
                {highlightCodeLine(lineText, lineKey)}
                {lineNo < codeLines.length ? '\n' : ''}
              </span>
            );
          })}
        </code>
      </pre>
    </div>
  );
}

interface OrderedItemNode {
  num: number;
  text: string;
  lineIdx: number;
  subBullets: { text: string; lineIdx: number }[];
}

export function MarkdownContent({ content }: MarkdownContentProps) {
  if (!content) return null;

  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // 空行跳过
    if (!trimmed) {
      i++;
      continue;
    }

    // 1. 围栏代码块 ```lang ... ```
    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // 跳过闭合 ```
      blocks.push(<CodeBlockCard key={`code-${i}`} lang={lang} code={codeLines.join('\n')} />);
      continue;
    }

    // 2. 独立数学公式块 $$ ... $$
    if (trimmed.startsWith('$$')) {
      if (trimmed.endsWith('$$') && trimmed.length > 4) {
        blocks.push(
          <div key={`math-${i}`} className="md-math-block">
            {cleanLatexText(trimmed.slice(2, -2))}
          </div>,
        );
        i++;
        continue;
      }
      const mathLines: string[] = [trimmed.slice(2)];
      i++;
      while (i < lines.length && !lines[i].trim().endsWith('$$')) {
        mathLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) {
        mathLines.push(lines[i].trim().slice(0, -2));
        i++;
      }
      blocks.push(
        <div key={`math-${i}`} className="md-math-block">
          {cleanLatexText(mathLines.join(' '))}
        </div>,
      );
      continue;
    }

    // 3. Markdown 分隔符 --- 或 ***（不渲染突兀横线，仅保留柔和段落间距）
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push(<div key={`sep-${i}`} className="md-section-gap" />);
      i++;
      continue;
    }

    // 4. 标题 # ~ ####
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      if (level === 1) {
        blocks.push(
          <h1 key={`h1-${i}`} className="md-h1">
            {renderInline(text, `h1-${i}`)}
          </h1>,
        );
      } else if (level === 2) {
        blocks.push(
          <h2 key={`h2-${i}`} className="md-h2">
            {renderInline(text, `h2-${i}`)}
          </h2>,
        );
      } else if (level === 3) {
        blocks.push(
          <h3 key={`h3-${i}`} className="md-h3">
            {renderInline(text, `h3-${i}`)}
          </h3>,
        );
      } else {
        blocks.push(
          <h4 key={`h4-${i}`} className="md-h4">
            {renderInline(text, `h4-${i}`)}
          </h4>,
        );
      }
      i++;
      continue;
    }

    // 5. GFM 表格 | col1 | col2 |
    if (
      trimmed.startsWith('|') &&
      trimmed.endsWith('|') &&
      i + 1 < lines.length &&
      /^\s*\|[\s\-:|]+\|\s*$/.test(lines[i + 1])
    ) {
      const parseRow = (rowStr: string) =>
        rowStr
          .trim()
          .slice(1, -1)
          .split('|')
          .map((c) => c.trim());

      let colCounter = 0;
      const headers = parseRow(trimmed).map((text) => {
        colCounter += 1;
        return { id: `th-${i}-${colCounter}-${text}`, text };
      });
      i += 2; // 跳过表头与分隔行
      const rows: { id: string; cells: { id: string; text: string }[] }[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        const rowLineIdx = i;
        let cellCounter = 0;
        const parsedCells = parseRow(lines[i]).map((cell) => {
          cellCounter += 1;
          return { id: `td-${rowLineIdx}-${cellCounter}-${cell}`, text: cell };
        });
        rows.push({ id: `tr-${rowLineIdx}`, cells: parsedCells });
        i++;
      }
      blocks.push(
        <div key={`tbl-${i}`} className="md-table-wrap">
          <table className="md-table">
            <thead>
              <tr>
                {headers.map((h) => (
                  <th key={h.id}>{renderInline(h.text, h.id)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  {r.cells.map((cell) => (
                    <td key={cell.id}>{renderInline(cell.text, cell.id)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // 6. 引用块 > ...
    if (trimmed.startsWith('>')) {
      const quoteLines: { lineIdx: number; text: string }[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push({
          lineIdx: i,
          text: lines[i].trim().replace(/^>\s?/, ''),
        });
        i++;
      }
      blocks.push(
        <blockquote key={`quote-${i}`} className="md-blockquote">
          {quoteLines.map((ql) => (
            <p key={`qp-${ql.lineIdx}`}>{renderInline(ql.text, `qp-${ql.lineIdx}`)}</p>
          ))}
        </blockquote>,
      );
      continue;
    }

    // 7. 有序列表 (1. / 2. / 3. ...)，支持列表项下方嵌套无序子列表 (* / -)
    const orderedRegex = /^\s*(\d+)\.(?:\s+|(?=[^\d\s]))(.*)$/;
    if (orderedRegex.test(line)) {
      const orderedItems: OrderedItemNode[] = [];

      while (i < lines.length) {
        // 跳过列表项之间的单个空行（如果下一非空行仍是有序项或缩进子列表）
        if (lines[i].trim() === '') {
          let nextNonEmpty = i + 1;
          while (nextNonEmpty < lines.length && lines[nextNonEmpty].trim() === '') {
            nextNonEmpty++;
          }
          if (
            nextNonEmpty < lines.length &&
            (orderedRegex.test(lines[nextNonEmpty]) || /^\s+[-*•]\s+/.test(lines[nextNonEmpty]))
          ) {
            i = nextNonEmpty;
          } else {
            break;
          }
        }

        const m = lines[i].match(orderedRegex);
        if (m) {
          const itemNode: OrderedItemNode = {
            num: Number.parseInt(m[1], 10),
            text: m[2],
            lineIdx: i,
            subBullets: [],
          };
          i++;

          // 收集紧跟在该有序项下方的无序子列表 (* / - / •)
          while (i < lines.length) {
            if (lines[i].trim() === '') {
              if (i + 1 < lines.length && /^\s*[-*•]\s+/.test(lines[i + 1])) {
                i++;
                continue;
              }
              break;
            }
            const subMatch = lines[i].match(/^\s*[-*•]\s+(.*)$/);
            if (subMatch) {
              itemNode.subBullets.push({ text: subMatch[1], lineIdx: i });
              i++;
            } else {
              break;
            }
          }

          orderedItems.push(itemNode);
        } else {
          break;
        }
      }

      const startNum = orderedItems[0]?.num ?? 1;
      blocks.push(
        <ol key={`ol-${i}`} className="md-ol" start={startNum}>
          {orderedItems.map((item) => (
            <li key={`oli-${item.lineIdx}`} className="md-oli" value={item.num}>
              <div className="md-oli-main">{renderInline(item.text, `ol-li-${item.lineIdx}`)}</div>
              {item.subBullets.length > 0 && (
                <ul className="md-sub-ul">
                  {item.subBullets.map((sub) => (
                    <li key={`sub-${sub.lineIdx}`} className="md-sub-li">
                      {renderInline(sub.text, `sub-li-${sub.lineIdx}`)}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    // 8. 无序列表与多级缩进列表 (- / * / •)
    if (/^\s*[-*•]\s+/.test(line)) {
      const items: { indent: number; text: string; lineIdx: number }[] = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) {
        const rawLine = lines[i];
        const indentMatch = rawLine.match(/^(\s*)[-*•]\s+(.*)$/);
        if (indentMatch) {
          items.push({
            indent: indentMatch[1].length,
            text: indentMatch[2],
            lineIdx: i,
          });
        }
        i++;
      }
      blocks.push(
        <ul key={`ul-${i}`} className="md-ul">
          {items.map((item) => (
            <li key={`li-${item.lineIdx}`} className={item.indent >= 2 ? 'md-li-nested' : 'md-li'}>
              {renderInline(item.text, `ul-li-${item.lineIdx}`)}
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    // 9. 普通段落（合并连续的普通文本行）
    const paraLines: { lineIdx: number; text: string }[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trim().startsWith('```') &&
      !lines[i].trim().startsWith('$$') &&
      !lines[i].trim().startsWith('#') &&
      !lines[i].trim().startsWith('>') &&
      !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim()) &&
      !/^\s*[-*•]\s+/.test(lines[i]) &&
      !orderedRegex.test(lines[i])
    ) {
      paraLines.push({ lineIdx: i, text: lines[i] });
      i++;
    }
    const lastLineIdx = paraLines[paraLines.length - 1]?.lineIdx ?? -1;
    blocks.push(
      <p key={`p-${i}`} className="md-p">
        {paraLines.map((pl) => (
          <span key={`pl-${pl.lineIdx}`}>
            {renderInline(pl.text, `pl-${pl.lineIdx}`)}
            {pl.lineIdx !== lastLineIdx && <br />}
          </span>
        ))}
      </p>,
    );
  }

  return <div className="md-body">{blocks}</div>;
}
