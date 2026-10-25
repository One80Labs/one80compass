import { createHmac, timingSafeEqual } from "node:crypto";
import type { HandlerDeps, HttpEvent, HttpResult } from "./router";

/** Checks the GitHub signature and queues the raw delivery. Invalid signatures are not queued. */
export async function acceptWebhook(deps: HandlerDeps, event: HttpEvent, correlationId: string): Promise<HttpResult> {
  if (!deps.webhookSecret) {
    return json(503, { code: "NOT_CONFIGURED", message: "The webhook secret is not configured.", correlationId });
  }
  const raw = rawBody(event);
  const signature = header(event, "x-hub-signature-256");
  if (!githubSignatureValid(deps.webhookSecret, raw, signature)) {
    return json(401, { code: "UNAUTHORIZED", message: "The webhook signature is invalid.", correlationId });
  }
  const deliveryId = header(event, "x-github-delivery") || deps.newId();
  const eventName = header(event, "x-github-event") || "unknown";
  let payload: unknown = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    return json(400, { code: "VALIDATION", message: "Webhook body must be JSON.", correlationId });
  }
  await deps.enqueue({ type: "webhook", deliveryId, eventName, payload });
  return json(202, { accepted: true, correlationId });
}

export function githubSignatureValid(secret: string, body: string, signature: string | undefined): boolean {
  if (!signature?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const received = signature.slice("sha256=".length);
  const left = Buffer.from(expected);
  const right = Buffer.from(received);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function rawBody(event: HttpEvent): string {
  if (!event.body) return "";
  return event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
}

function header(event: HttpEvent, name: string): string | undefined {
  const found = Object.entries(event.headers ?? {}).find(([key]) => key.toLowerCase() === name);
  return found?.[1];
}

function json(statusCode: number, payload: unknown): HttpResult {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  };
}
