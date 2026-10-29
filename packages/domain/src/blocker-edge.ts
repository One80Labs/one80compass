import { addDays, isIsoDate } from "./schedule";

/**
 * Post-v1 Hard Blocker edge metadata (ADR 0007 follow-ups).
 * Membership of the graph remains `predecessorIds` (GitHub blockedBy).
 * Optional per-edge extras live here; missing entry ⇒ FS + lagDays 0.
 *
 * Lag / lead: lagDays shifts the constraint date. Positive = wait; negative = lead.
 *
 * Link-kind semantics (inclusive calendar dates):
 * - FS: successor start ≥ day after predecessor finish, then + lagDays (v1 when lag 0).
 * - SS: successor start ≥ predecessor start + lagDays (same day allowed when lag 0).
 * - FF: successor finish ≥ predecessor finish + lagDays; earliest start follows from duration.
 * - SF: successor finish ≥ predecessor start + lagDays; earliest start follows from duration.
 * Soft Dependency relationships never use this metadata.
 */

export type BlockerLinkKind = "FS" | "SS" | "FF" | "SF";

export type BlockerEdge = {
  predecessorId: string;
  /** Finish-to-start when omitted or unknown. */
  linkKind: BlockerLinkKind;
  /** Days after the constraint date before the successor may start/finish. Negative = lead. */
  lagDays: number;
};

/** Which bar ends a Hard Blocker connector attaches to (Gantt drawing). Soft deps stay finish→start. */
export type LinkKindEnds = {
  fromSide: "start" | "finish";
  toSide: "start" | "finish";
};

/** Cap absurd API/UI values; scheduling still uses trunc(lagDays). */
export const MAX_ABS_LAG_DAYS = 3650;

export function normalizeBlockerLinkKind(value: unknown): BlockerLinkKind {
  return value === "SS" || value === "FF" || value === "SF" || value === "FS" ? value : "FS";
}

export function normalizeLagDays(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  const truncated = Math.trunc(value);
  return Math.max(-MAX_ABS_LAG_DAYS, Math.min(MAX_ABS_LAG_DAYS, truncated));
}

export function blockerEdgeFor(
  predecessorId: string,
  edges: BlockerEdge[] | undefined | null,
): BlockerEdge {
  const found = (edges ?? []).find((edge) => edge.predecessorId === predecessorId);
  return {
    predecessorId,
    linkKind: found?.linkKind ?? "FS",
    lagDays: found?.lagDays ?? 0,
  };
}

/** Bar ends for drawing a Hard Blocker of the given kind. */
export function linkKindEnds(linkKind: BlockerLinkKind): LinkKindEnds {
  switch (linkKind) {
    case "SS":
      return { fromSide: "start", toSide: "start" };
    case "FF":
      return { fromSide: "finish", toSide: "finish" };
    case "SF":
      return { fromSide: "start", toSide: "finish" };
    case "FS":
    default:
      return { fromSide: "finish", toSide: "start" };
  }
}

/**
 * Earliest legal successor *finish* for finish-constrained kinds (FF / SF).
 * Returns null for FS / SS (those constrain start) or when the predecessor anchor is missing.
 */
export function requiredSuccessorFinish(args: {
  linkKind: BlockerLinkKind;
  lagDays: number;
  predecessor: { startDate: string | null; finishDate: string | null };
}): string | null {
  const { linkKind, predecessor } = args;
  const lagDays = normalizeLagDays(args.lagDays);
  if (linkKind === "FF") {
    const anchor = predecessor.finishDate;
    if (!anchor || !isIsoDate(anchor)) return null;
    return addDays(anchor, lagDays);
  }
  if (linkKind === "SF") {
    const anchor = predecessor.startDate;
    if (!anchor || !isIsoDate(anchor)) return null;
    return addDays(anchor, lagDays);
  }
  return null;
}

/**
 * Earliest legal successor *start* given one blocker edge.
 * FS (default, lag 0): day after predecessor finish — unchanged from v1.
 * SS: predecessor start + lagDays (same calendar day when lag 0).
 * FF / SF: convert required finish into an earliest start using inclusive successor duration.
 *   When `successorInclusiveDays` is missing, returns null (callers still use requiredSuccessorFinish).
 */
export function requiredSuccessorStart(args: {
  linkKind: BlockerLinkKind;
  lagDays: number;
  predecessor: { startDate: string | null; finishDate: string | null };
  /** Inclusive day count of the successor (finish − start + 1). Needed for FF / SF. */
  successorInclusiveDays?: number | null;
}): string | null {
  const { linkKind, predecessor, successorInclusiveDays } = args;
  const lagDays = normalizeLagDays(args.lagDays);
  if (linkKind === "FS") {
    const finish = predecessor.finishDate;
    if (!finish || !isIsoDate(finish)) return null;
    return addDays(addDays(finish, 1), lagDays);
  }
  if (linkKind === "SS") {
    const start = predecessor.startDate;
    if (!start || !isIsoDate(start)) return null;
    return addDays(start, lagDays);
  }
  const requiredFinish = requiredSuccessorFinish({ linkKind, lagDays, predecessor });
  if (!requiredFinish) return null;
  const days = successorInclusiveDays;
  if (days == null || !Number.isFinite(days) || days < 1) return null;
  return addDays(requiredFinish, -(Math.trunc(days) - 1));
}

/** Parse stored blockerEdges; drop invalid rows. Dedupes by predecessorId (last wins). */
export function blockerEdgesFromStore(value: unknown): BlockerEdge[] {
  if (!Array.isArray(value)) return [];
  const byPredecessor = new Map<string, BlockerEdge>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as { predecessorId?: unknown; linkKind?: unknown; lagDays?: unknown };
    if (typeof row.predecessorId !== "string" || !row.predecessorId.trim()) continue;
    const predecessorId = row.predecessorId.trim();
    byPredecessor.set(predecessorId, {
      predecessorId,
      linkKind: normalizeBlockerLinkKind(row.linkKind),
      lagDays: normalizeLagDays(row.lagDays),
    });
  }
  return [...byPredecessor.values()];
}

/**
 * Keep edge metadata aligned with graph membership.
 * Drop orphans whose predecessorId is not in predecessorIds.
 * Default FS + lag 0 stays represented by omission (no row required).
 */
export function syncBlockerEdges(
  predecessorIds: string[],
  edges: BlockerEdge[] | undefined | null,
): BlockerEdge[] {
  const allowed = new Set(predecessorIds);
  return blockerEdgesFromStore(edges).filter((edge) => allowed.has(edge.predecessorId));
}

/**
 * Upsert lag (and optional linkKind) for one predecessor; drops orphans.
 * Preserves existing linkKind when only lagDays is supplied.
 * Omits a row that would be the default FS + 0 so storage stays sparse.
 */
export function withBlockerLag(
  edges: BlockerEdge[] | undefined | null,
  predecessorIds: string[],
  predecessorId: string,
  lagDays: number,
  linkKind?: BlockerLinkKind,
): BlockerEdge[] {
  if (!predecessorIds.includes(predecessorId)) {
    return syncBlockerEdges(predecessorIds, edges);
  }
  const prior = blockerEdgeFor(predecessorId, edges);
  const next: BlockerEdge = {
    predecessorId,
    linkKind: linkKind !== undefined ? normalizeBlockerLinkKind(linkKind) : prior.linkKind,
    lagDays: normalizeLagDays(lagDays),
  };
  const without = (edges ?? []).filter((edge) => edge.predecessorId !== predecessorId);
  if (next.linkKind === "FS" && next.lagDays === 0) {
    return syncBlockerEdges(predecessorIds, without);
  }
  return syncBlockerEdges(predecessorIds, [...without, next]);
}

/**
 * Upsert linkKind for one predecessor while preserving lagDays (Agent 2 coexistence).
 * Omits a row that would be the default FS + 0.
 */
export function withBlockerLinkKind(
  edges: BlockerEdge[] | undefined | null,
  predecessorIds: string[],
  predecessorId: string,
  linkKind: BlockerLinkKind,
): BlockerEdge[] {
  const prior = blockerEdgeFor(predecessorId, edges);
  return withBlockerLag(edges, predecessorIds, predecessorId, prior.lagDays, linkKind);
}
