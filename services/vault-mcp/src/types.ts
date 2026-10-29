/** Shared MCP ↔ portal client shapes. Keep tenant keys explicit on every call. */

export type VaultAllowlistState = {
  customerId: string;
  programId: string;
  enabled: boolean;
};

export type VaultIngestSummary = {
  rowCount: number;
  relationCount: number;
  chunkCount: number;
};

export type VaultChunkSummary = {
  id: string;
  customerId: string;
  programId: string;
  sourceLabel: string;
  documentId: string;
  versionId: string;
  body: string;
};

export type VaultDraftResult = {
  report: {
    reportId: string;
    projectId: string;
    customerId: string;
    title: string;
    body: string;
    status: string;
  };
  citations: unknown[];
};

/** Portal HTTP surface used by tool handlers. Implemented in portal-client.ts. */
export type PortalClient = {
  getAllowlist(programId: string): Promise<VaultAllowlistState>;
  setAllowlist(programId: string, enabled: boolean): Promise<VaultAllowlistState>;
  ingest(programId: string): Promise<VaultIngestSummary>;
  listChunks(programId: string): Promise<VaultChunkSummary[]>;
  draftFromVault(programId: string, question: string): Promise<VaultDraftResult>;
};
