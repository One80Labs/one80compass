import { ingestAllowlistedProgram, type VaultIngestDeps } from "./vault-ingest";

/** Counts from one EventBridge pass over the vault allowlist. */
export type ScheduledVaultIngestSummary = {
  programs: number;
  ingested: number;
  skipped: number;
  failed: number;
  failures: { programId: string; message: string }[];
};

/**
 * Re-ingest every allowlisted program so plan-only edits reach the vault without a document upload.
 * Duplicate customer+program rows run once. Missing or disallowed programs are skipped.
 * A failure on one program is recorded and the rest of the allowlist still runs. This function does not throw.
 */
export async function runScheduledVaultIngest(options: {
  vault: VaultIngestDeps;
  recordedAt: string;
  correlationId: string;
}): Promise<ScheduledVaultIngestSummary> {
  const summary: ScheduledVaultIngestSummary = {
    programs: 0,
    ingested: 0,
    skipped: 0,
    failed: 0,
    failures: [],
  };

  try {
    const programs = uniqueAllowlist(await options.vault.readAllowlist());
    summary.programs = programs.length;

    for (const entry of programs) {
      try {
        const outcome = await ingestAllowlistedProgram(options.vault, entry.programId, options.recordedAt);
        if (outcome.status === "ok") {
          summary.ingested += 1;
          console.info(
            JSON.stringify({
              correlationId: options.correlationId,
              message: "vault scheduled ingest completed",
              projectId: entry.programId,
              reason: "schedule",
              rowCount: outcome.result.rows.length,
              chunkCount: outcome.result.chunks.length,
            }),
          );
        } else {
          summary.skipped += 1;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "error";
        summary.failed += 1;
        summary.failures.push({ programId: entry.programId, message });
        console.error(
          JSON.stringify({
            correlationId: options.correlationId,
            message: "vault scheduled ingest failed",
            projectId: entry.programId,
            reason: "schedule",
            error: message,
          }),
        );
      }
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        correlationId: options.correlationId,
        message: "vault scheduled ingest failed",
        reason: "schedule",
        error: error instanceof Error ? error.message : "error",
      }),
    );
  }

  return summary;
}

/** First occurrence of each customerId + programId wins. */
function uniqueAllowlist(
  entries: Awaited<ReturnType<VaultIngestDeps["readAllowlist"]>>,
): Awaited<ReturnType<VaultIngestDeps["readAllowlist"]>> {
  const seen = new Set<string>();
  const unique = [];
  for (const entry of entries) {
    const key = `${entry.customerId}\u0000${entry.programId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(entry);
  }
  return unique;
}
