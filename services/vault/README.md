# Staff vault

Aurora PostgreSQL Serverless v2 (engine 16) with pgvector, reached through the RDS Data API. The live customer plan stays in DynamoDB; this database is a rebuildable staff copy. Customers do not log into the vault.

## Construct

`infra/lib/vault-database.ts` creates a dedicated VPC (private isolated subnets, no NAT), the Aurora cluster and Secrets Manager secret (`one80compass-dev-vault`), the `one80compass-dev-vault` Lambda, and a custom resource that applies the schema on deploy.

Wire it from `DevStack` with the portal table and documents bucket. Do not give the API or sync Lambdas the vault secret, rds-data, or Bedrock permissions.

## Lambda events

The deploy custom resource and the portal API invoke `one80compass-dev-vault`:

| Event | Purpose |
|---|---|
| `{"type":"apply-schema"}` | Apply `schema.sql` (idempotent). Used on deploy. |
| `{"type":"read-allowlist"}` | List allowlisted programs. |
| `{"type":"save-allowlist","entry":{...},"enabled":true}` | Add or remove a program. |
| `{"type":"save-rows","result":{...}}` | Persist an ingest result (replaces prior rows for those programs). |
| `{"type":"list-chunks","customerId":"...","programId":"..."}` | Return chunks for a status draft. |

The portal API sets `VAULT_FUNCTION_NAME` and may only `lambda:InvokeFunction`. It does not receive the vault secret, rds-data, or Bedrock.

## Ingest, retrieval, and drafts

Pure modules build the vault rows; `persist.ts` writes them through the Data API:

- `allowlist.ts` — a program is copied only when it is on the allowlist.
- `ingest.ts` — copies the allowlisted program, work items, milestones, and filed files. A file needs a `sourceLabel` of `compass-upload`, `krisp`, `fireflies`, or `other`, plus a stored current version. Unlabeled or foreign-customer files are skipped.
- `retrieve.ts` — filters by `customer_id` and `program_id` before similarity ranking.
- `draft.ts` — builds a cited status draft from work items and chunks. Claims without a filed source are refused.

Every write and query must keep `customer_id` and `program_id`.
