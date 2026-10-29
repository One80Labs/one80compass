import { describe, expect, it } from "vitest";
import {
  blockerEdgeFor,
  blockerEdgesFromStore,
  linkKindEnds,
  normalizeLagDays,
  requiredSuccessorFinish,
  requiredSuccessorStart,
  syncBlockerEdges,
  withBlockerLag,
  withBlockerLinkKind,
} from "./blocker-edge";

describe("requiredSuccessorStart lag / lead", () => {
  const predecessor = { startDate: "2026-10-01", finishDate: "2026-10-10" };

  it("FS with lag 0 starts the day after predecessor finish (v1)", () => {
    expect(
      requiredSuccessorStart({ linkKind: "FS", lagDays: 0, predecessor }),
    ).toBe("2026-10-11");
  });

  it("positive lag 2 pushes required start two days later", () => {
    expect(
      requiredSuccessorStart({ linkKind: "FS", lagDays: 2, predecessor }),
    ).toBe("2026-10-13");
  });

  it("negative lead -1 pulls required start one day earlier", () => {
    expect(
      requiredSuccessorStart({ linkKind: "FS", lagDays: -1, predecessor }),
    ).toBe("2026-10-10");
  });

  it("returns null when the finish anchor is missing", () => {
    expect(
      requiredSuccessorStart({
        linkKind: "FS",
        lagDays: 2,
        predecessor: { startDate: "2026-10-01", finishDate: null },
      }),
    ).toBeNull();
  });
});

describe("blocker edge store helpers", () => {
  it("defaults missing metadata to FS + 0", () => {
    expect(blockerEdgeFor("A", undefined)).toEqual({
      predecessorId: "A",
      linkKind: "FS",
      lagDays: 0,
    });
    expect(blockerEdgeFor("A", [{ predecessorId: "B", linkKind: "FS", lagDays: 3 }])).toEqual({
      predecessorId: "A",
      linkKind: "FS",
      lagDays: 0,
    });
  });

  it("parses and clamps lagDays; drops invalid rows", () => {
    expect(normalizeLagDays(2.9)).toBe(2);
    expect(normalizeLagDays(-1.1)).toBe(-1);
    expect(normalizeLagDays("2")).toBe(0);
    expect(
      blockerEdgesFromStore([
        { predecessorId: " A ", linkKind: "FS", lagDays: 2 },
        { predecessorId: "", lagDays: 1 },
        null,
        { predecessorId: "A", linkKind: "bogus", lagDays: 4 },
      ]),
    ).toEqual([{ predecessorId: "A", linkKind: "FS", lagDays: 4 }]);
  });

  it("syncs orphans and upserts lag while preserving linkKind", () => {
    const edges = [
      { predecessorId: "A", linkKind: "FS" as const, lagDays: 2 },
      { predecessorId: "B", linkKind: "SS" as const, lagDays: 0 },
    ];
    expect(syncBlockerEdges(["A"], edges)).toEqual([
      { predecessorId: "A", linkKind: "FS", lagDays: 2 },
    ]);
    expect(withBlockerLag(edges, ["A", "B"], "B", -1)).toEqual([
      { predecessorId: "A", linkKind: "FS", lagDays: 2 },
      { predecessorId: "B", linkKind: "SS", lagDays: -1 },
    ]);
    // Default FS + 0 is omitted from storage.
    expect(withBlockerLag(edges, ["A"], "A", 0)).toEqual([]);
  });

  it("upserts linkKind while preserving lagDays", () => {
    const edges = [{ predecessorId: "A", linkKind: "FS" as const, lagDays: 3 }];
    expect(withBlockerLinkKind(edges, ["A"], "A", "FF")).toEqual([
      { predecessorId: "A", linkKind: "FF", lagDays: 3 },
    ]);
    expect(withBlockerLinkKind(edges, ["A"], "A", "FS")).toEqual([
      { predecessorId: "A", linkKind: "FS", lagDays: 3 },
    ]);
  });
});

describe("requiredSuccessorStart / Finish link kinds", () => {
  const predecessor = { startDate: "2026-10-01", finishDate: "2026-10-10" };

  it("FS lag 0 matches v1 (day after finish)", () => {
    expect(requiredSuccessorStart({ linkKind: "FS", lagDays: 0, predecessor })).toBe("2026-10-11");
  });

  it("SS allows same-day start when lag 0", () => {
    expect(requiredSuccessorStart({ linkKind: "SS", lagDays: 0, predecessor })).toBe("2026-10-01");
    expect(requiredSuccessorStart({ linkKind: "SS", lagDays: 2, predecessor })).toBe("2026-10-03");
  });

  it("FF / SF constrain finish; start needs successor duration", () => {
    expect(requiredSuccessorFinish({ linkKind: "FF", lagDays: 0, predecessor })).toBe("2026-10-10");
    expect(requiredSuccessorFinish({ linkKind: "SF", lagDays: 0, predecessor })).toBe("2026-10-01");
    expect(requiredSuccessorStart({ linkKind: "FF", lagDays: 0, predecessor })).toBeNull();
    // 3 inclusive days finishing on Oct 10 ⇒ start Oct 8
    expect(
      requiredSuccessorStart({
        linkKind: "FF",
        lagDays: 0,
        predecessor,
        successorInclusiveDays: 3,
      }),
    ).toBe("2026-10-08");
    // SF lag 0: finish ≥ Oct 1; 3-day task ⇒ start Sep 29
    expect(
      requiredSuccessorStart({
        linkKind: "SF",
        lagDays: 0,
        predecessor,
        successorInclusiveDays: 3,
      }),
    ).toBe("2026-09-29");
  });

  it("maps link kinds to Gantt bar ends", () => {
    expect(linkKindEnds("FS")).toEqual({ fromSide: "finish", toSide: "start" });
    expect(linkKindEnds("SS")).toEqual({ fromSide: "start", toSide: "start" });
    expect(linkKindEnds("FF")).toEqual({ fromSide: "finish", toSide: "finish" });
    expect(linkKindEnds("SF")).toEqual({ fromSide: "start", toSide: "finish" });
  });
});
