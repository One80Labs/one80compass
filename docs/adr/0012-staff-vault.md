# ADR 0012 — Staff vault

Compass DynamoDB (`one80compass-dev`) remains the live plan for customer work. This Aurora PostgreSQL database is a rebuildable staff vault: a copy of allowlisted programs and the files filed on them for staff analysis, retrieval, and status drafts. Customers do not log into the vault.

The vault uses Aurora PostgreSQL Serverless v2 with the Data API and pgvector. Every vault row keeps `customer_id` and `program_id` (`program_id` is the Compass project id). Ingest, retrieval, and draft modules must filter by those keys.

IAM separates the vault from the portal writers. The vault Lambda may read the portal table and the documents bucket, and may call Bedrock embeddings and the RDS Data API. It must not write the portal DynamoDB table. The API Lambda may only invoke the vault Lambda (`VAULT_FUNCTION_NAME`); the API and sync Lambdas do not receive the vault secret, rds-data permissions, or Bedrock permissions. The model must not change the live plan.
