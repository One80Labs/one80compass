import type { AllowlistEntry } from "./allowlist";
import { applySchema } from "./apply-schema";
import type { IngestResult } from "./ingest";
import { listChunks, listDecisions, readAllowlist, saveAllowlist, saveIngestResult } from "./persist";

export type VaultEvent =
  | { type: "apply-schema" }
  | { type: "read-allowlist" }
  | { type: "save-allowlist"; entry: AllowlistEntry; enabled: boolean }
  | { type: "save-rows"; result: IngestResult }
  | { type: "list-chunks"; customerId: string; programId: string }
  | { type: "list-decisions"; customerId: string; programId: string };

/**
 * Staff vault Lambda. The portal API invokes these events; it does not hold the vault secret.
 * apply-schema is also used by the deploy custom resource.
 */
export async function handler(event: unknown): Promise<Record<string, unknown>> {
  const typed = event as VaultEvent | null;
  if (!typed || typeof typed !== "object" || !("type" in typed) || typeof typed.type !== "string") {
    throw new Error("Unknown vault event");
  }

  if (typed.type === "apply-schema") {
    await applySchema();
    return { ok: true };
  }
  if (typed.type === "read-allowlist") {
    return { allowlist: await readAllowlist() };
  }
  if (typed.type === "save-allowlist") {
    if (!typed.entry?.customerId || !typed.entry?.programId || typeof typed.enabled !== "boolean") {
      throw new Error("save-allowlist requires entry.customerId, entry.programId, and enabled");
    }
    await saveAllowlist(typed.entry, typed.enabled);
    return { ok: true };
  }
  if (typed.type === "save-rows") {
    if (!typed.result) throw new Error("save-rows requires result");
    await saveIngestResult(typed.result);
    return { ok: true };
  }
  if (typed.type === "list-chunks") {
    if (!typed.customerId || !typed.programId) {
      throw new Error("list-chunks requires customerId and programId");
    }
    const allowlist = await readAllowlist();
    if (!allowlist.some((entry) => entry.customerId === typed.customerId && entry.programId === typed.programId)) {
      throw new Error("list-chunks program is not allowlisted");
    }
    return { chunks: await listChunks(typed.customerId, typed.programId) };
  }
  if (typed.type === "list-decisions") {
    if (!typed.customerId || !typed.programId) {
      throw new Error("list-decisions requires customerId and programId");
    }
    const allowlist = await readAllowlist();
    if (!allowlist.some((entry) => entry.customerId === typed.customerId && entry.programId === typed.programId)) {
      throw new Error("list-decisions program is not allowlisted");
    }
    return { decisions: await listDecisions(typed.customerId, typed.programId) };
  }

  const unexpected = (typed as { type: string }).type;
  throw new Error(`Unknown vault event type: ${unexpected}`);
}
