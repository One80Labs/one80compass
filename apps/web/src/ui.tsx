import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

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

/** Values of the fields in an edit drawer, in document order. */
function formSnapshot(form: HTMLFormElement): string {
  const controls = form.querySelectorAll("input, textarea, select");
  return Array.from(controls)
    .map((control) => {
      if (control instanceof HTMLInputElement && (control.type === "checkbox" || control.type === "radio")) {
        return control.checked ? "1" : "0";
      }
      if (control instanceof HTMLSelectElement && control.multiple) {
        return Array.from(control.selectedOptions)
          .map((option) => option.value)
          .join(",");
      }
      return (control as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
    })
    .join("\u0001");
}

function drawerIsDirty(form: HTMLFormElement | null, initial: string | null): boolean {
  return form != null && initial != null && formSnapshot(form) !== initial;
}

/** X used to dismiss an edit drawer. */
function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12 5.7 16.89a1 1 0 1 0 1.41 1.41L12 13.41l4.89 4.89a1 1 0 0 0 1.41-1.41L13.41 12l4.89-4.89a1 1 0 0 0 0-1.4z"
      />
    </svg>
  );
}

/**
 * Right-hand edit panel. The body scrolls. Save stays on the left of the footer and Cancel on the right,
 * and both stay visible while the body scrolls or the window changes size.
 * The X in the upper right closes the drawer. Closing with the X, Cancel, Escape, or the backdrop
 * asks before discarding edits: save them, or close without saving.
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
  const formRef = useRef<HTMLFormElement>(null);
  const initialSnapshot = useRef<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useLayoutEffect(() => {
    if (formRef.current) initialSnapshot.current = formSnapshot(formRef.current);
  }, []);

  const requestClose = useCallback(() => {
    if (drawerIsDirty(formRef.current, initialSnapshot.current)) {
      setConfirming(true);
      return;
    }
    onClose();
  }, [onClose]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (confirming) {
        setConfirming(false);
        return;
      }
      requestClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirming, requestClose]);

  function saveUnsaved() {
    setConfirming(false);
    formRef.current?.requestSubmit();
  }

  function discard() {
    setConfirming(false);
    onClose();
  }

  return (
    <>
      <div className="drawer-layer" onClick={requestClose}>
        <form ref={formRef} className="drawer" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()} onSubmit={onSubmit}>
          <div className="drawer-head">
            <h2>{title}</h2>
            <button className="icon-button drawer-close" type="button" aria-label="Close" onClick={requestClose}>
              <CloseIcon />
            </button>
          </div>
          <div className="drawer-body">{children}</div>
          <footer className="drawer-footer">
            <button className="btn primary" type="submit" disabled={saving}>
              {saving ? "Saving" : "Save"}
            </button>
            <button className="btn" type="button" onClick={requestClose}>
              Cancel
            </button>
          </footer>
        </form>
      </div>
      {confirming && (
        <div className="dialog-layer drawer-confirm" onClick={() => setConfirming(false)}>
          <section className="dialog" role="alertdialog" aria-modal="true" aria-label="Unsaved changes" onClick={(event) => event.stopPropagation()}>
            <h2>Unsaved changes</h2>
            <p>This drawer has changes that are not saved. Save them, or close without saving.</p>
            <div className="dialog-actions">
              <button className="btn" type="button" onClick={() => setConfirming(false)}>
                Keep editing
              </button>
              <button className="btn" type="button" onClick={discard}>
                Close without saving
              </button>
              <button className="btn primary" type="button" onClick={saveUnsaved} disabled={saving}>
                {saving ? "Saving" : "Save changes"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
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
