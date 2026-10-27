CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS vault_allowlist (
  customer_id text NOT NULL,
  program_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, program_id)
);

CREATE TABLE IF NOT EXISTS program (
  id text PRIMARY KEY,
  customer_id text NOT NULL,
  program_id text NOT NULL,
  source_type text NOT NULL,
  source_id text NOT NULL,
  recorded_at timestamptz NOT NULL,
  title text NOT NULL,
  UNIQUE (customer_id, program_id)
);

CREATE TABLE IF NOT EXISTS work_item (
  id text PRIMARY KEY,
  customer_id text NOT NULL,
  program_id text NOT NULL,
  source_type text NOT NULL,
  source_id text NOT NULL,
  recorded_at timestamptz NOT NULL,
  title text,
  body text,
  status text,
  issue_type text,
  start_on date,
  finish_on date
);

CREATE TABLE IF NOT EXISTS milestone (
  id text PRIMARY KEY,
  customer_id text NOT NULL,
  program_id text NOT NULL,
  source_type text NOT NULL,
  source_id text NOT NULL,
  recorded_at timestamptz NOT NULL,
  title text NOT NULL,
  due_on date
);

CREATE TABLE IF NOT EXISTS risk (
  id text PRIMARY KEY,
  customer_id text NOT NULL,
  program_id text NOT NULL,
  source_type text NOT NULL,
  source_id text NOT NULL,
  recorded_at timestamptz NOT NULL,
  title text,
  body text
);

CREATE TABLE IF NOT EXISTS decision (
  id text PRIMARY KEY,
  customer_id text NOT NULL,
  program_id text NOT NULL,
  source_type text NOT NULL,
  source_id text NOT NULL,
  recorded_at timestamptz NOT NULL,
  title text,
  body text
);

CREATE TABLE IF NOT EXISTS person (
  id text PRIMARY KEY,
  customer_id text NOT NULL,
  program_id text NOT NULL,
  source_type text NOT NULL,
  source_id text NOT NULL,
  recorded_at timestamptz NOT NULL,
  name text NOT NULL,
  email text
);

CREATE TABLE IF NOT EXISTS document (
  id text PRIMARY KEY,
  customer_id text NOT NULL,
  program_id text NOT NULL,
  source_type text NOT NULL,
  source_id text NOT NULL,
  recorded_at timestamptz NOT NULL,
  name text NOT NULL,
  source_label text NOT NULL,
  compass_document_id text NOT NULL,
  version_id text NOT NULL,
  CHECK (source_label IN ('compass-upload', 'krisp', 'fireflies', 'other'))
);

CREATE TABLE IF NOT EXISTS transcript (
  id text PRIMARY KEY,
  customer_id text NOT NULL,
  program_id text NOT NULL,
  source_type text NOT NULL,
  source_id text NOT NULL,
  recorded_at timestamptz NOT NULL,
  name text NOT NULL,
  source_label text NOT NULL,
  compass_document_id text NOT NULL,
  version_id text NOT NULL,
  CHECK (source_label IN ('compass-upload', 'krisp', 'fireflies', 'other'))
);

CREATE TABLE IF NOT EXISTS artifact (
  id text PRIMARY KEY,
  customer_id text NOT NULL,
  program_id text NOT NULL,
  source_type text NOT NULL,
  source_id text NOT NULL,
  recorded_at timestamptz NOT NULL,
  name text NOT NULL,
  source_label text NOT NULL,
  compass_document_id text NOT NULL,
  version_id text NOT NULL,
  CHECK (source_label IN ('compass-upload', 'krisp', 'fireflies', 'other'))
);

CREATE TABLE IF NOT EXISTS status_report (
  id text PRIMARY KEY,
  customer_id text NOT NULL,
  program_id text NOT NULL,
  source_type text NOT NULL,
  source_id text NOT NULL,
  recorded_at timestamptz NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  review_state text NOT NULL
);

CREATE TABLE IF NOT EXISTS relation (
  id text PRIMARY KEY,
  customer_id text NOT NULL,
  program_id text NOT NULL,
  kind text NOT NULL,
  from_type text NOT NULL,
  from_id text NOT NULL,
  to_type text NOT NULL,
  to_id text NOT NULL,
  source_type text NOT NULL,
  source_id text NOT NULL,
  recorded_at timestamptz NOT NULL,
  CHECK (kind IN ('blocks', 'mitigates', 'evidenced_by', 'decided', 'supersedes', 'part_of'))
);

CREATE TABLE IF NOT EXISTS chunk (
  id text PRIMARY KEY,
  customer_id text NOT NULL,
  program_id text NOT NULL,
  source_label text NOT NULL,
  document_id text NOT NULL,
  version_id text NOT NULL,
  source_type text NOT NULL,
  source_id text NOT NULL,
  body text NOT NULL,
  embedding vector(1024),
  recorded_at timestamptz NOT NULL,
  CHECK (source_label IN ('compass-upload', 'krisp', 'fireflies', 'other'))
);

CREATE INDEX IF NOT EXISTS chunk_customer_program_idx ON chunk (customer_id, program_id);
