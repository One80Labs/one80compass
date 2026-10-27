# One80Labs Portal — Cursor planning entry point

## Read these project files before planning or coding

1. `product/One80Compass_Unified_Release_Plan.md` — **single release plan** (portal R1–R4 + staff vault/MCP). Use this for sequencing.
2. `product/One80Labs_Portal_Product_Technical_Spec_v7.5.md` — authoritative consolidated **product requirements**, policies, architecture, and source-of-truth boundaries.
3. `product/One80Labs_Portal_Implementation_Plan_v7.5.md` — historical R1–R4 boundaries (superseded for sequencing by the unified plan).
4. `product/One80Labs_Portal_GitHub_Backlog_v7.5.csv` — seed backlog for task decomposition (not a substitute for the specification).
5. `product/One80Labs_Portal_Overview_v7.5.md` — short introduction; **not the complete requirements**.
6. `sop/staff-vault.md` — how staff operate the vault today; `adr/0011` and `adr/0012` for Compass ownership and vault.

The `.docx` versions are human-readable reference copies; read the Markdown versions for Cursor planning. All four of the above files should be physically present inside the **open Cursor workspace**, for example in `docs/`. A file existing in another chat or on the computer outside the workspace does not guarantee that Cursor has received its contents. Explicitly attach/reference each file using Cursor's file-context feature or ask Cursor to read them from workspace paths.

## First planning assignment for Cursor

Read all four project files above in full. Do not infer engineering requirements from the overview alone. Create an MVP-first implementation plan with:

- the R1 MVP scope and explicit deferred requirements (R2–R4), preserving all confirmed behaviors in the backlog;
- proposed folder structure, API contracts, AWS resources and infrastructure-as-code, data entities and tenant-isolation checks;
- GitHub App permissions, webhook handling, bidirectional synchronization, idempotency, retry and reconciliation;
- an ordered Epic → issue breakdown with dependencies and acceptance tests;
- the smallest vertical slice: One80Labs admin creates customer/project, invites user, user signs in and securely launches a permitted AWS Lambda application;
- open **technical** design questions distinguished from already-confirmed **product** decisions.

Do not begin implementing advanced R2–R4 functionality just because it appears in the specification. In each issue cite the corresponding section of the specification and the target release. Do not invent credentials, customer data, AWS resource names or GitHub organization identifiers.

## Important security and data boundaries

- All tenant isolation and authorization checks must be enforced server-side.
- Do not assume that a portal link alone protects an underlying Lambda endpoint; prevent direct bypass at the actual application's access path.
- GitHub stores authoritative live issue and native Project data; AWS stores portal metadata, audit records, published reports, and approved immutable baselines.
- Preserve deleted records and document versions as specified; permanent deletion is administrator-only.
