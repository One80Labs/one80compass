import { useState } from "react";

/**
 * Soft-delete control for a leaf plan row. Hidden when the item still has children.
 * Requires typing DELETE before the confirm action runs.
 */
export function PlanDeleteSection({
  busy,
  onDelete,
}: {
  busy: boolean;
  /** Null when the row still has children — the whole control is hidden. */
  onDelete: (() => Promise<void>) | null;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  if (!onDelete) return null;
  const remove = onDelete;

  async function confirm() {
    if (typed.trim() !== "DELETE") {
      setError("Type DELETE in capital letters to confirm.");
      return;
    }
    setError(null);
    setDeleting(true);
    try {
      await remove();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not remove this item.");
      setDeleting(false);
    }
  }

  return (
    <div className="plan-delete">
      {!open ? (
        <button className="btn plan-delete-open" type="button" disabled={busy || deleting} onClick={() => setOpen(true)}>
          Delete from plan
        </button>
      ) : (
        <>
          <p className="small">
            This removes the item from the project plan. It is not permanently destroyed. Type <strong>DELETE</strong> to confirm.
          </p>
          <label>
            Confirmation
            <input
              className="field"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder="DELETE"
              disabled={deleting}
            />
          </label>
          <div className="row">
            <button className="btn plan-delete-confirm" type="button" disabled={busy || deleting || typed.trim() !== "DELETE"} onClick={() => void confirm()}>
              {deleting ? "Deleting" : "Confirm delete"}
            </button>
            <button
              className="btn"
              type="button"
              disabled={deleting}
              onClick={() => {
                setOpen(false);
                setTyped("");
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
          {error && <p className="error">{error}</p>}
        </>
      )}
    </div>
  );
}
