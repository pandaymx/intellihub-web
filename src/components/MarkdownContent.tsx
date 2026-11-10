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

/**
 * 解析单行内联 Markdown 语法：
 * - 行内代码 `code`
 * - 行内数学公式 $...$
 * - 知识库引用角标 [#1]
 * - 粗体 **bold**
 * - 斜体 *italic*
 * - 超链接 [text](url)
 */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const tokenRegex =
    /(`[^`]+`|\$\$[^$]+\$\$|\$[^$\n]+\$|\[#\d+\]|\*\*[^*]+\*\*|__[^_]+__|\[[^\]]+\]\([^)]+\)|\*[^*\n]+\*)/g;

  const parts = text.split(tokenRegex);
  return parts.map((part, idx) => {
    const key = `${keyPrefix}-in-${idx}`;
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

    // 4. 粗体 **bold** 或 __bold__
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

    // 5. 链接 [label](url)
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return (
        <a key={key} href={linkMatch[2]} target="_blank" rel="noreferrer" className="md-link">
          {linkMatch[1]}
        </a>
      );
    }

    // 6. 斜体 *italic*
    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      return (
        <em key={key} className="md-em">
          {part.slice(1, -1)}
        </em>
      );
    }

    return part;
  });
}

function CodeBlockCard({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore clipboard error
    }
  };

  return (
    <div className="md-code-card">
      <div className="md-code-header">
        <span className="md-code-lang">{lang || 'text'}</span>
        <button type="button" className="md-code-copy-btn" onClick={() => void handleCopy()}>
          {copied ? '✓ 已复制' : '复制代码'}
        </button>
      </div>
      <pre className="md-code-pre">
        <code>{code}</code>
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
    const paraLines: { lineIdx: number; text: string; isLast?: boolean }[] = [];
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
