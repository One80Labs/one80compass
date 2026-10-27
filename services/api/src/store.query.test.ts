import { describe, expect, it, vi } from "vitest";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { queryAll, queryUpTo } from "./store";

describe("queryAll", () => {
  it("pages until LastEvaluatedKey is absent", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ Items: [{ id: "a" }], LastEvaluatedKey: { sk: "a" } })
      .mockResolvedValueOnce({ Items: [{ id: "b" }] });
    const items = await queryAll(send, {
      TableName: "t",
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": "CUST#1" },
    });
    expect(items.map((row) => row.id)).toEqual(["a", "b"]);
    expect(send).toHaveBeenCalledTimes(2);
    const second = send.mock.calls[1][0] as QueryCommand;
    expect(second.input.ExclusiveStartKey).toEqual({ sk: "a" });
  });

  it("throws when the safety page cap is hit", async () => {
    const send = vi.fn().mockResolvedValue({ Items: [{ id: "x" }], LastEvaluatedKey: { sk: "x" } });
    await expect(
      queryAll(
        send,
        {
          TableName: "t",
          KeyConditionExpression: "pk = :pk",
          ExpressionAttributeValues: { ":pk": "CUST#1" },
        },
        { maxPages: 2 },
      ),
    ).rejects.toThrow(/exceeded 2 pages/);
    expect(send).toHaveBeenCalledTimes(2);
  });
});

describe("queryUpTo", () => {
  it("collects across pages until the requested limit", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ Items: [{ id: "1" }, { id: "2" }], LastEvaluatedKey: { sk: "2" } })
      .mockResolvedValueOnce({ Items: [{ id: "3" }] });
    const items = await queryUpTo(
      send,
      {
        TableName: "t",
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: { ":pk": "CUST#1" },
        ScanIndexForward: false,
      },
      3,
    );
    expect(items.map((row) => row.id)).toEqual(["1", "2", "3"]);
    const first = send.mock.calls[0][0] as QueryCommand;
    const second = send.mock.calls[1][0] as QueryCommand;
    expect(first.input.Limit).toBe(3);
    expect(second.input.Limit).toBe(1);
  });
});
