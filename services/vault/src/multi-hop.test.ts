import { describe, expect, it } from "vitest";
import {
  LIST_RELATIONS_SQL,
  expandRelatedEntityIds,
  relationRowToMultiHop,
  type MultiHopRelation,
} from "./multi-hop";

const SCOPE = { customerId: "cust-a", programId: "prog-a" } as const;

function edge(partial: Partial<MultiHopRelation> & Pick<MultiHopRelation, "fromId" | "toId">): MultiHopRelation {
  return {
    customerId: SCOPE.customerId,
    programId: SCOPE.programId,
    kind: "blocks",
    ...partial,
  };
}

describe("expandRelatedEntityIds", () => {
  it("includes the predecessor when the blocked successor is seeded (blocks hop)", () => {
    const related = expandRelatedEntityIds({
      ...SCOPE,
      seedIds: ["I_successor"],
      relations: [edge({ fromId: "I_predecessor", toId: "I_successor" })],
    });
    expect(related).toEqual(["I_predecessor"]);
  });

  it("includes the successor when the predecessor is seeded", () => {
    const related = expandRelatedEntityIds({
      ...SCOPE,
      seedIds: ["I_predecessor"],
      relations: [edge({ fromId: "I_predecessor", toId: "I_successor" })],
    });
    expect(related).toEqual(["I_successor"]);
  });

  it("never expands a relation from another customer or program", () => {
    const related = expandRelatedEntityIds({
      ...SCOPE,
      seedIds: ["I_successor"],
      relations: [
        edge({
          customerId: "cust-other",
          fromId: "I_secret_pred",
          toId: "I_successor",
        }),
        edge({
          programId: "prog-other",
          fromId: "I_wrong_prog",
          toId: "I_successor",
        }),
      ],
    });
    expect(related).toEqual([]);
  });

  it("no-ops when relations are empty or seeds are empty", () => {
    expect(
      expandRelatedEntityIds({
        ...SCOPE,
        seedIds: ["I_1"],
        relations: [],
      }),
    ).toEqual([]);
    expect(
      expandRelatedEntityIds({
        ...SCOPE,
        seedIds: [],
        relations: [edge({ fromId: "A", toId: "B" })],
      }),
    ).toEqual([]);
  });

  it("does not return seed ids as related", () => {
    const related = expandRelatedEntityIds({
      ...SCOPE,
      seedIds: ["I_predecessor", "I_successor"],
      relations: [edge({ fromId: "I_predecessor", toId: "I_successor" })],
    });
    expect(related).toEqual([]);
  });

  it("maps ingest relation rows onto hop edges", () => {
    expect(
      relationRowToMultiHop({
        customerId: "cust-a",
        programId: "prog-a",
        kind: "blocks",
        fromSourceId: "P",
        toSourceId: "S",
      }),
    ).toEqual({
      customerId: "cust-a",
      programId: "prog-a",
      kind: "blocks",
      fromId: "P",
      toId: "S",
    });
  });
});

describe("LIST_RELATIONS_SQL", () => {
  it("scopes by customer_id and program_id", () => {
    expect(LIST_RELATIONS_SQL).toContain("customer_id = :customer_id");
    expect(LIST_RELATIONS_SQL).toContain("program_id = :program_id");
    expect(LIST_RELATIONS_SQL.indexOf("WHERE")).toBeLessThan(LIST_RELATIONS_SQL.indexOf("customer_id = :customer_id"));
  });
});
