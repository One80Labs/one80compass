import { useEffect, useState } from "react";
import { api, ApiError } from "./api";
import type { Session } from "./auth";

type AllowlistState = {
  customerId: string;
  programId: string;
  enabled: boolean;
};

type IngestResult = {
  rowCount: number;
  relationCount: number;
  chunkCount: number;
};

/**
 * Staff-only vault allowlist + ingest for one project.
 * Loads state via GET; treat 404/405 as "off" so a missing route still allows PUT configuration.
 */
export function VaultStaffControls({
  session,
  projectId,
}: {
  session: Session;
  projectId: string;
}) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"allowlist" | "ingest" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ingestSummary, setIngestSummary] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setIngestSummary(null);
    api<AllowlistState>(`/projects/${projectId}/vault-allowlist`, session.idToken)
      .then((state) => {
        if (!cancelled) setEnabled(Boolean(state.enabled));
      })
      .catch((caught) => {
        if (cancelled) return;
        // Missing project/route — start from off; PUT still configures allowlist when the project exists.
        if (caught instanceof ApiError && (caught.status === 404 || caught.status === 405)) {
          setEnabled(false);
          return;
        }
        setError(message(caught));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, session.idToken]);

  async function setAllowlist(next: boolean) {
    setBusy("allowlist");
    setError(null);
    setIngestSummary(null);
    try {
      const result = await api<AllowlistState>(`/projects/${projectId}/vault-allowlist`, session.idToken, {
        method: "PUT",
        body: { enabled: next },
      });
      setEnabled(Boolean(result.enabled));
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(null);
    }
  }

  async function runIngest() {
    setBusy("ingest");
    setError(null);
    setIngestSummary(null);
    try {
      const result = await api<IngestResult>(`/projects/${projectId}/vault-ingest`, session.idToken, {
        method: "POST",
        body: {},
      });
      setIngestSummary(
        `Ingest finished: ${result.rowCount} rows, ${result.relationCount} relations, ${result.chunkCount} chunks.`,
      );
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="panel" aria-label="Staff vault">
      <h3>Staff vault</h3>
      <p className="copy">
        The vault is a staff-only copy of this program. Customers never see it. Label evidence files in the table below
        (vault source label), allowlist this project, then run ingest. Ingest replaces prior vault rows for this program.
        After ingest, use Reports → Draft from vault. Step-by-step: FAQ → Staff vault.
      </p>
      {loading ? (
        <p className="copy muted">Checking allowlist…</p>
      ) : (
        <div className="row">
          <label className="check">
            <input
              type="checkbox"
              checked={enabled}
              disabled={busy !== null}
              onChange={(event) => {
                setAllowlist(event.target.checked).catch(() => undefined);
              }}
            />
            Allowlist this project for vault ingest
          </label>
          <button
            className="btn"
            type="button"
            disabled={busy !== null || !enabled}
            title={enabled ? "Copy plan and labeled documents into the vault" : "Allowlist the project before ingest"}
            onClick={() => {
              runIngest().catch(() => undefined);
            }}
          >
            {busy === "ingest" ? "Ingesting…" : "Run vault ingest"}
          </button>
        </div>
      )}
      {busy === "allowlist" && <p className="copy muted">Saving allowlist…</p>}
      {ingestSummary && <p className="copy">{ingestSummary}</p>}
      {error && <p className="error">{error}</p>}
    </section>
  );
}

function message(caught: unknown): string {
  if (caught instanceof ApiError) return caught.message;
  if (caught instanceof Error) return caught.message;
  return "Request failed.";
}
