import type { ReactNode } from "react";

/** Page title row used by the HTML reference. */
export function PageHead({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <h1 className="page-title">{title}</h1>
        <p className="subtitle">{subtitle}</p>
      </div>
      {action}
    </header>
  );
}

/** Underline tabs. The selected tab is local view state. */
export function Tabs({ label, tabs, value, onChange }: { label: string; tabs: string[]; value: string; onChange: (tab: string) => void }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button key={tab} className={tab === value ? "tab active" : "tab"} type="button" role="tab" aria-selected={tab === value} onClick={() => onChange(tab)}>
          {tab}
        </button>
      ))}
    </div>
  );
}

export function Pill({ children, tone = "" }: { children: ReactNode; tone?: "" | "good" | "orange" | "blue" }) {
  return <span className={tone ? `pill ${tone}` : "pill"}>{children}</span>;
}

/** Explains an action the current release does not perform. */
export function Notice({ title, body, onClose }: { title: string; body: string; onClose: () => void }) {
  return (
    <div className="dialog-layer" onClick={onClose}>
      <section className="dialog" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <h2>{title}</h2>
        <p>{body}</p>
        <div className="dialog-actions">
          <button className="btn" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </section>
    </div>
  );
}

export function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function fileKind(name: string | null): string {
  const extension = name?.split(".").pop()?.toLowerCase() ?? "";
  if (extension === "docx" || extension === "pdf" || extension === "xlsx") return extension.toUpperCase();
  if (!extension || extension === name?.toLowerCase()) return "File";
  return extension.toUpperCase();
}
