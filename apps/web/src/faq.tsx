import { useEffect, useState } from "react";
import vaultMcpBeginnerMd from "../../../docs/sop/vault-mcp-beginner.md?raw";
import { MarkdownDoc } from "./markdown-doc";

type FaqTile = {
  id: string;
  title: string;
  detail: string;
  icon: string;
  source: string;
  viewerTitle: string;
};

const FAQ_TILES: FaqTile[] = [
  {
    id: "install-use-mcp",
    title: "Install & Use MCP",
    detail: "Connect the staff vault MCP to Cursor or Claude Desktop.",
    icon: "⌘",
    source: vaultMcpBeginnerMd,
    viewerTitle: "Install & Use MCP",
  },
];

/** Settings → FAQ: tile grid; each tile opens an SOP markdown guide in a large dialog. */
export function FaqSettings() {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = FAQ_TILES.find((tile) => tile.id === openId) ?? null;

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <section className="panel">
      <h3>FAQ</h3>
      <p className="copy">Guides and answers. Open a tile to read the full document.</p>
      <div className="grid four faq-tiles">
        {FAQ_TILES.map((tile) => (
          <button key={tile.id} type="button" className="tile" onClick={() => setOpenId(tile.id)}>
            <span className="tile-icon" aria-hidden="true">
              {tile.icon}
            </span>
            <strong>{tile.title}</strong>
            <span>{tile.detail}</span>
          </button>
        ))}
      </div>
      {open && (
        <div className="dialog-layer" onClick={() => setOpenId(null)}>
          <div
            className="dialog md-viewer"
            role="dialog"
            aria-modal="true"
            aria-label={open.viewerTitle}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="md-viewer-head">
              <h2>{open.viewerTitle}</h2>
              <button className="btn" type="button" onClick={() => setOpenId(null)}>
                Close
              </button>
            </div>
            <div className="md-viewer-body">
              <MarkdownDoc source={open.source} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
