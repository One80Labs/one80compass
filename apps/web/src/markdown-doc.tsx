import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export type MarkdownDocProps = {
  source: string;
  /** When set, markdown links of the form `faq:tile-id` switch FAQ tiles in-app instead of opening a new tab. */
  onFaqLink?: (tileId: string) => void;
};

/**
 * Lightweight Markdown → React for FAQ SOP viewers.
 * Covers headings, paragraphs, emphasis, code, lists, tables, rules, links, and mermaid fences.
 */
export function MarkdownDoc({ source, onFaqLink }: MarkdownDocProps) {
  return <div className="md-doc">{renderBlocks(source.replace(/\r\n/g, "\n").trim(), onFaqLink)}</div>;
}

/**
 * Renders a ```mermaid fence as SVG. Falls back to the source text if render fails.
 * Loaded on demand so ordinary FAQ tiles do not pay the mermaid bundle cost up front.
 */
function MermaidBlock({ chart }: { chart: string }) {
  const reactId = useId().replace(/:/g, "");
  const hostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;

    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "neutral",
          er: { useMaxWidth: true },
        });
        const renderId = `md-mermaid-${reactId}-${Math.random().toString(36).slice(2, 9)}`;
        const { svg } = await mermaid.render(renderId, chart);
        if (cancelled) return;
        host.innerHTML = svg;
        setError(null);
      } catch (caught) {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : "Could not render diagram.");
        host.innerHTML = "";
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chart, reactId]);

  if (error) {
    return (
      <pre className="md-code" role="note">
        <code>{chart}</code>
      </pre>
    );
  }

  return <div ref={hostRef} className="md-mermaid" role="img" aria-label="Entity relationship diagram" />;
}

function renderBlocks(source: string, onFaqLink?: (tileId: string) => void): ReactNode[] {
  const lines = source.split("\n");
  const nodes: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (line.trim() === "---") {
      nodes.push(<hr key={key++} />);
      i += 1;
      continue;
    }

    if (line.startsWith("```")) {
      const language = line.slice(3).trim().toLowerCase();
      const fence: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith("```")) {
        fence.push(lines[i]);
        i += 1;
      }
      i += 1;
      const body = fence.join("\n");
      if (language === "mermaid") {
        nodes.push(<MermaidBlock key={key++} chart={body} />);
      } else {
        nodes.push(
          <pre key={key++} className="md-code">
            <code>{body}</code>
          </pre>,
        );
      }
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const text = inline(heading[2], onFaqLink);
      if (level === 1) nodes.push(<h1 key={key++}>{text}</h1>);
      else if (level === 2) nodes.push(<h2 key={key++}>{text}</h2>);
      else nodes.push(<h3 key={key++}>{text}</h3>);
      i += 1;
      continue;
    }

    if (line.trim().startsWith("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const raw = lines[i].trim();
        if (!isTableSeparator(raw)) {
          rows.push(
            raw
              .replace(/^\|/, "")
              .replace(/\|$/, "")
              .split("|")
              .map((cell) => cell.trim()),
          );
        }
        i += 1;
      }
      if (rows.length > 0) {
        const [head, ...body] = rows;
        nodes.push(
          <div key={key++} className="md-table-wrap">
            <table>
              <thead>
                <tr>
                  {head.map((cell, index) => (
                    <th key={index}>{inline(cell, onFaqLink)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex}>{inline(cell, onFaqLink)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        );
      }
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i += 1;
      }
      nodes.push(
        <ul key={key++}>
          {items.map((item, index) => (
            <li key={index}>{inline(item, onFaqLink)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i += 1;
      }
      nodes.push(
        <ol key={key++}>
          {items.map((item, index) => (
            <li key={index}>{inline(item, onFaqLink)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    const para: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].startsWith("#") &&
      !lines[i].startsWith("```") &&
      lines[i].trim() !== "---" &&
      !lines[i].trim().startsWith("|") &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      para.push(lines[i]);
      i += 1;
    }
    nodes.push(<p key={key++}>{inline(para.join(" "), onFaqLink)}</p>);
  }

  return nodes;
}

function isTableSeparator(line: string): boolean {
  const cells = line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function faqTileId(href: string): string | null {
  if (!href.startsWith("faq:")) return null;
  const id = href.slice(4).trim();
  return id || null;
}

function inline(text: string, onFaqLink?: (tileId: string) => void): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      nodes.push(<code key={key++}>{token.slice(1, -1)}</code>);
    } else {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (link) {
        const tileId = faqTileId(link[2]);
        if (tileId && onFaqLink) {
          nodes.push(
            <button
              key={key++}
              type="button"
              className="md-faq-link"
              onClick={() => onFaqLink(tileId)}
            >
              {link[1]}
            </button>,
          );
        } else if (tileId) {
          // Viewer without a handler: keep readable text, avoid a broken new-tab URL.
          nodes.push(<span key={key++}>{link[1]}</span>);
        } else {
          nodes.push(
            <a key={key++} href={link[2]} target="_blank" rel="noreferrer">
              {link[1]}
            </a>,
          );
        }
      }
    }
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}
