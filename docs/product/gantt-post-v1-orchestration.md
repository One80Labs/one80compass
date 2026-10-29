# Gantt dependency enhancements (post-v1) — agent orchestration

Shared contract for five parallel workstreams. Source of backlog: `One80Compass_Unified_Release_Plan.md` §5 I and ADR 0007 Follow-ups.

## Shared model

- Graph membership: still `predecessorIds` (GitHub `blockedBy`).
- Per-edge extras: optional `blockerEdges: BlockerEdge[]` on the issue (`packages/domain/src/blocker-edge.ts`).
- Missing edge metadata ⇒ `linkKind: "FS"`, `lagDays: 0`.
- Soft Dependency (`kind: "dependency"`) is unchanged and never uses lag / link kinds / critical path / auto-reschedule.

## Workstreams (exclusive primary ownership)

| # | Feature | Primary ownership | Avoid editing |
| --- | --- | --- | --- |
| 1 | Hover when lines hidden | `apps/web` Gantt hover UX (`plan.tsx` hover state, CSS, small `gantt-drag.ts` helpers) | `packages/domain`, API storage |
| 2 | Lag / lead days | Domain lag in constraint + API persist `blockerEdges.lagDays` + LinkDialog / Dependencies lag control | Critical-path module, hover-only CSS |
| 3 | Other link kinds (SS/FF/SF) | Domain `requiredSuccessorStart` for SS/FF/SF + Gantt anchors/paths + LinkDialog kind picker | Hover feature, auto-reschedule dialog |
| 4 | Critical path | New `packages/domain/src/critical-path.ts` + Gantt highlight (Hard Blocker graph only) | Lag persistence, LinkDialog create flow |
| 5 | Optional auto-reschedule on Blocker create | LinkDialog opt-in → existing `dependencyReview` / review modal; default remains warn-only | Domain lag/kind math |

## Merge rules

- Keep `predecessorIds` as the cycle / GitHub source of truth.
- When adding/removing a blocker, keep `blockerEdges` aligned (drop orphans; default FS/0 for new ids).
- Do not change soft-dependency behavior.
- Add/extend unit tests next to each module; run relevant vitest targets before finishing.
- Document non-obvious behavior in code comments (project rule).
