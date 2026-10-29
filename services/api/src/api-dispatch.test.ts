import { describe, expect, it, vi } from "vitest";
import { dispatchApiEvent, isVaultScheduleEvent } from "./api-dispatch";
import type { HttpResult } from "./router";

const httpResult: HttpResult = { statusCode: 200, headers: {}, body: "{}" };
const scheduleResult = { programs: 1, ingested: 1, skipped: 0, failed: 0, failures: [] as { programId: string; message: string }[] };

describe("isVaultScheduleEvent", () => {
  it("is true only for an EventBridge scheduled event", () => {
    expect(isVaultScheduleEvent({ source: "aws.events", "detail-type": "Scheduled Event" })).toBe(true);
  });

  it("rejects null, a source without detail-type, and a detail-type without source", () => {
    expect(isVaultScheduleEvent(null)).toBe(false);
    expect(isVaultScheduleEvent({ source: "aws.events" })).toBe(false);
    expect(isVaultScheduleEvent({ "detail-type": "Scheduled Event" })).toBe(false);
  });

  it("rejects undefined, HTTP API Gateway events, SQS records, and a different source or detail-type", () => {
    expect(isVaultScheduleEvent(undefined)).toBe(false);
    expect(isVaultScheduleEvent({ rawPath: "/projects/x", requestContext: {} })).toBe(false);
    expect(isVaultScheduleEvent({ Records: [{ body: "{}" }] })).toBe(false);
    expect(isVaultScheduleEvent({ source: "aws.s3", "detail-type": "Scheduled Event" })).toBe(false);
    expect(isVaultScheduleEvent({ source: "aws.events", "detail-type": "AWS API Call via CloudTrail" })).toBe(false);
  });
});

describe("dispatchApiEvent", () => {
  it("calls runSchedule and not http for a scheduled event", async () => {
    const http = vi.fn(async () => httpResult);
    const runSchedule = vi.fn(async () => scheduleResult);
    const event = { source: "aws.events", "detail-type": "Scheduled Event" };

    await expect(dispatchApiEvent(event, { http, runSchedule })).resolves.toEqual(scheduleResult);
    expect(runSchedule).toHaveBeenCalledOnce();
    expect(http).not.toHaveBeenCalled();
  });

  it("calls http and not runSchedule for an HTTP-like event", async () => {
    const http = vi.fn(async () => httpResult);
    const runSchedule = vi.fn(async () => scheduleResult);
    const event = { rawPath: "/projects/x", requestContext: {} };

    await expect(dispatchApiEvent(event, { http, runSchedule })).resolves.toBe(httpResult);
    expect(http).toHaveBeenCalledOnce();
    expect(http).toHaveBeenCalledWith(event);
    expect(runSchedule).not.toHaveBeenCalled();
  });
});
