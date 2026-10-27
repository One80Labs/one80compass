import { EMBEDDING_DIMENSIONS } from "./types";

/** Produces a fixed-length embedding for vault chunks. */
export type Embedder = (text: string) => number[] | Promise<number[]>;

/**
 * Stable 1024-float embedding from a simple hash so unit tests never call Bedrock.
 * Same text always yields the same vector.
 */
export function deterministicEmbed(text: string): number[] {
  const out = new Array<number>(EMBEDDING_DIMENSIONS);
  let state = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    state ^= text.charCodeAt(i);
    state = Math.imul(state, 16777619);
  }
  for (let i = 0; i < EMBEDDING_DIMENSIONS; i += 1) {
    state ^= state >>> 13;
    state = Math.imul(state, 1274126177);
    state ^= state >>> 16;
    // Map to [-1, 1) without Math.random so the vector is reproducible.
    out[i] = ((state >>> 0) / 0x100000000) * 2 - 1;
  }
  return out;
}

/**
 * Thin Bedrock Titan embed wrapper. Not used in unit tests.
 * Callers supply a client that exposes invokeModel.
 */
export async function bedrockEmbed(
  text: string,
  invoke: (body: Uint8Array) => Promise<{ body?: Uint8Array | { transformToByteArray(): Promise<Uint8Array> } }>,
): Promise<number[]> {
  const payload = new TextEncoder().encode(JSON.stringify({ inputText: text }));
  const response = await invoke(payload);
  const raw =
    response.body && "transformToByteArray" in response.body
      ? await response.body.transformToByteArray()
      : (response.body as Uint8Array | undefined);
  if (!raw) throw new Error("Bedrock embed returned no body.");
  const parsed = JSON.parse(new TextDecoder().decode(raw)) as { embedding?: number[] };
  if (!Array.isArray(parsed.embedding) || parsed.embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error("Bedrock embed returned an unexpected vector.");
  }
  return parsed.embedding;
}
