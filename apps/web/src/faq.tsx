import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import baselinesMd from "../../../docs/sop/baselines.md?raw";
import criticalPathMd from "../../../docs/sop/critical-path.md?raw";
import decisionRegisterMd from "../../../docs/sop/decision-register.md?raw";
import dependenciesBlockersMd from "../../../docs/sop/dependencies-and-blockers.md?raw";
import documentsLabelingMd from "../../../docs/sop/documents-and-labeling.md?raw";
import planHierarchyMd from "../../../docs/sop/plan-hierarchy.md?raw";
import projectPlanErdMd from "../../../docs/sop/project-plan-erd.md?raw";
import riskRegisterMd from "../../../docs/sop/risk-register.md?raw";
import staffVaultUserGuideMd from "../../../docs/sop/staff-vault-user-guide.md?raw";
import timelineGanttMd from "../../../docs/sop/timeline-gantt.md?raw";
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
    id: "timeline-gantt",
    title: "Timeline / Gantt",
    detail: "Bars, drag dates, dependency lines, and hover-reveal.",
    icon: "▤",
    source: timelineGanttMd,
    viewerTitle: "Timeline / Gantt basics",
  },
  {
    id: "dependencies-blockers",
    title: "Dependencies & Blockers",
    detail: "Soft links vs Hard Blockers, lag, kinds, and optional auto-reschedule.",
    icon: "↔",
    source: dependenciesBlockersMd,
    viewerTitle: "Dependencies and Blockers",
  },
  {
    id: "critical-path",
    title: "Critical path",
    detail: "Highlight the longest Hard Blocker chain on the Timeline.",
    icon: "◎",
    source: criticalPathMd,
    viewerTitle: "Critical path",
  },
  {
    id: "baselines",
    title: "Baselines",
    detail: "Snapshot the schedule and compare what changed.",
    icon: "▣",
    source: baselinesMd,
    viewerTitle: "Schedule baselines",
  },
  {
    id: "plan-hierarchy",
    title: "Plan hierarchy",
    detail: "Epic → Feature → Task, add work, and reorder siblings.",
    icon: "☰",
    source: planHierarchyMd,
    viewerTitle: "Plan hierarchy",
  },
  {
    id: "project-plan-erd",
    title: "Project Plan ERD",
    detail: "DynamoDB keys, foreign keys, and plan entity attributes.",
    icon: "⬡",
    source: projectPlanErdMd,
    viewerTitle: "Project Plan data model (ER)",
  },
  {
    id: "risk-register",
    title: "Risk Register",
    detail: "Read blocker conflicts and (as admin) edit risk fields.",
    icon: "⚠",
    source: riskRegisterMd,
    viewerTitle: "Risk Register",
  },
  {
    id: "decision-register",
    title: "Decision Register",
    detail: "Outstanding questions and the decisions they become.",
    icon: "▩",
    source: decisionRegisterMd,
    viewerTitle: "Decision Register",
  },
  {
    id: "documents-labeling",
    title: "Documents & labeling",
    detail: "Upload, versions, recycle bin, and vault source labels.",
    icon: "♧",
    source: documentsLabelingMd,
    viewerTitle: "Documents and labeling",
  },
  {
    id: "staff-vault",
    title: "Staff vault",
    detail: "Allowlist a project, file evidence, ingest, and draft a cited report.",
    icon: "✎",
    source: staffVaultUserGuideMd,
    viewerTitle: "Staff vault",
  },
  {
    id: "install-use-mcp",
    title: "Install & Use MCP",
    detail: "Admin-only: connect the staff vault MCP to Cursor or Claude.",
    icon: "⌘",
    source: vaultMcpBeginnerMd,
    viewerTitle: "Install & Use MCP",
  },
];

/**
 * Sidebar FAQ tile grid for all signed-in roles (View / Contributor / Administrator).
 * Guides are local markdown — no admin API and no write permission required to open them.
 */
export function FaqSettings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const guideParam = searchParams.get("guide");
  const [openId, setOpenId] = useState<string | null>(() =>
    FAQ_TILES.some((tile) => tile.id === guideParam) ? guideParam : null,
  );
  const open = FAQ_TILES.find((tile) => tile.id === openId) ?? null;

  useEffect(() => {
    if (guideParam && FAQ_TILES.some((tile) => tile.id === guideParam) && guideParam !== openId) {
      setOpenId(guideParam);
    }
  }, [guideParam, openId]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeGuide();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function openGuide(tileId: string) {
    if (!FAQ_TILES.some((tile) => tile.id === tileId)) return;
    setOpenId(tileId);
    setSearchParams({ guide: tileId }, { replace: true });
  }

  function closeGuide() {
    setOpenId(null);
    if (searchParams.has("guide")) {
      searchParams.delete("guide");
      setSearchParams(searchParams, { replace: true });
    }
  }

  return (
    <section className="panel">
      <h3>Guides</h3>
      <p className="copy">
        Available to every signed-in role. Open a tile to read the full beginner document. Links inside a guide can open another tile here.
        The Staff vault and MCP tiles are readable by all; allowlist, ingest, draft, and MCP tools still require an administrator account.
      </p>
      <div className="grid four faq-tiles">
        {FAQ_TILES.map((tile) => (
          <button key={tile.id} type="button" className="tile" onClick={() => openGuide(tile.id)}>
            <span className="tile-icon" aria-hidden="true">
              {tile.icon}
            </span>
            <strong>{tile.title}</strong>
            <span>{tile.detail}</span>
          </button>
        ))}
      </div>
      {open && (
        <div className="dialog-layer" onClick={closeGuide}>
          <div
            className="dialog md-viewer"
            role="dialog"
            aria-modal="true"
            aria-label={open.viewerTitle}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="md-viewer-head">
              <h2>{open.viewerTitle}</h2>
              <button className="btn" type="button" onClick={closeGuide}>
                Close
              </button>
            </div>
            <div className="md-viewer-body">
              <MarkdownDoc source={open.source} onFaqLink={openGuide} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
