import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { displayDate } from "../../../packages/domain/src/schedule";

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

const COMPANION_HOLD = "one80-drawer-companion-hold";
const COMPANION_DISMISS = "one80-drawer-companion-dismiss";

type CompanionHoldDetail = {
  hold: () => void;
  release: () => void;
};

/**
 * A companion drawer sits to the right of the drawer that opened it.
 * Closing the first drawer asks the companion first, so unsaved decision edits are not dropped.
 * No companion is listening: allow the close.
 */
function companionAllowsParentClose(): boolean {
  let heard = false;
  let released = false;
  window.dispatchEvent(
    new CustomEvent<CompanionHoldDetail>(COMPANION_HOLD, {
      detail: {
        hold: () => {
          heard = true;
        },
        release: () => {
          released = true;
        },
      },
    }),
  );
  return !heard || released;
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
  layout = "overlay",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
  saving?: boolean;
  /**
   * Companion opens on the right of a drawer that is already open.
   * That drawer shifts left so both stay visible. Overlay is the single full-height panel.
   */
  layout?: "overlay" | "companion";
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const initialSnapshot = useRef<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useLayoutEffect(() => {
    if (formRef.current) initialSnapshot.current = formSnapshot(formRef.current);
  }, []);

  const requestClose = useCallback(() => {
    const layer = formRef.current?.closest(".drawer-layer");
    if (layer?.classList.contains("has-companion") && !companionAllowsParentClose()) return;
    if (drawerIsDirty(formRef.current, initialSnapshot.current)) {
      setConfirming(true);
      return;
    }
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (layout !== "companion") return;
    function onHold(event: Event) {
      const detail = (event as CustomEvent<CompanionHoldDetail>).detail;
      detail.hold();
      if (confirming || drawerIsDirty(formRef.current, initialSnapshot.current)) {
        setConfirming(true);
        return;
      }
      detail.release();
    }
    function onDismiss() {
      requestClose();
    }
    window.addEventListener(COMPANION_HOLD, onHold);
    window.addEventListener(COMPANION_DISMISS, onDismiss);
    return () => {
      window.removeEventListener(COMPANION_HOLD, onHold);
      window.removeEventListener(COMPANION_DISMISS, onDismiss);
    };
  }, [confirming, layout, requestClose]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      // Capture so Escape closes the decision drawer and leaves the work item drawer open.
      if (layout === "companion") event.stopImmediatePropagation();
      if (confirming) {
        setConfirming(false);
        return;
      }
      requestClose();
    }
    const capture = layout === "companion";
    window.addEventListener("keydown", onKey, capture);
    return () => window.removeEventListener("keydown", onKey, capture);
  }, [confirming, requestClose, layout]);

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
      <div
        className={layout === "companion" ? "drawer-layer drawer-companion" : "drawer-layer"}
        onClick={() => {
          // The dimmed page closes the decision drawer and leaves the work item drawer open.
          if (formRef.current?.closest(".drawer-layer")?.classList.contains("has-companion")) {
            window.dispatchEvent(new CustomEvent(COMPANION_DISMISS));
            return;
          }
          requestClose();
        }}
      >
        <form ref={formRef} className="drawer" role="dialog" aria-modal={layout === "overlay"} aria-label={title} onClick={(event) => event.stopPropagation()} onSubmit={onSubmit}>
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

/** User-visible date, mm-dd-yyyy. Same result as displayDate, including timestamps. */
export function formatWhen(value: string): string {
  return displayDate(value);
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
