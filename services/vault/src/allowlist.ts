/** One allowlisted Compass program: customer plus program id. */
export type AllowlistEntry = { customerId: string; programId: string };

/**
 * Empty allowlist rejects everyone. A match requires both customerId and programId.
 */
export function isAllowlisted(allowlist: AllowlistEntry[], customerId: string, programId: string): boolean {
  if (allowlist.length === 0) return false;
  return allowlist.some((entry) => entry.customerId === customerId && entry.programId === programId);
}
