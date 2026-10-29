import type { HttpEvent, HttpResult } from "./router";

/**
 * EventBridge schedule invocations use source `aws.events` and detail-type
 * `Scheduled Event`. HTTP API Gateway and SQS events do not match this shape,
 * so they stay on the HTTP router.
 */
export function isVaultScheduleEvent(event: unknown): boolean {
  if (typeof event !== "object" || event === null) return false;
  const candidate = event as { source?: unknown; "detail-type"?: unknown };
  return candidate.source === "aws.events" && candidate["detail-type"] === "Scheduled Event";
}

/**
 * Route one Lambda invocation. Scheduled vault ingest never enters the HTTP router.
 * Every other payload is treated as an API Gateway HTTP event.
 */
export async function dispatchApiEvent<TSchedule>(
  event: unknown,
  deps: {
    http: (event: HttpEvent) => Promise<HttpResult>;
    runSchedule: () => Promise<TSchedule>;
  },
): Promise<HttpResult | TSchedule> {
  if (isVaultScheduleEvent(event)) return deps.runSchedule();
  return deps.http(event as HttpEvent);
}
