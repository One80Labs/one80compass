import { useEffect, type FormEvent, type ReactNode } from "react";

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

/** Pencil used by row edit controls. */
export function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
      />
    </svg>
  );
}

/** Edit control for the last cell of a table row. */
export function EditRowButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="icon-button" type="button" aria-label={label} onClick={onClick}>
      <EditIcon />
    </button>
  );
}

/**
 * Right-hand edit panel. The body scrolls. Save stays on the left of the footer and Cancel on the right,
 * and both stay visible while the body scrolls or the window changes size.
 */
export function EditDrawer({
  title,
  children,
  onClose,
  onSubmit,
  saving = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
  saving?: boolean;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="drawer-layer" onClick={onClose}>
      <form className="drawer" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()} onSubmit={onSubmit}>
        <div className="drawer-body">
          <h2>{title}</h2>
          {children}
        </div>
        <footer className="drawer-footer">
          <button className="btn primary" type="submit" disabled={saving}>
            {saving ? "Saving" : "Save"}
          </button>
          <button className="btn" type="button" onClick={onClose}>
            Cancel
          </button>
        </footer>
      </form>
    </div>
  );
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
