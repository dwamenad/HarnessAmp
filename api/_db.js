import { Pool } from 'pg';

let pool;
let schemaReady = false;

export function hasPostgresConfig() {
  return Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
}

export async function query(text, params = []) {
  const client = getPool();
  return client.query(text, params);
}

export async function ensureSchema() {
  if (!hasPostgresConfig() || schemaReady) return;

  await query(`
    create table if not exists users (
      id text primary key,
      github_id text unique not null,
      login text not null,
      name text not null,
      email text,
      avatar_url text,
      created_at timestamptz not null default now()
    );

    create table if not exists workspaces (
      id text primary key,
      name text not null,
      owner_user_id text not null references users(id) on delete cascade,
      created_at timestamptz not null default now()
    );

    create table if not exists projects (
      id text primary key,
      workspace_id text not null references workspaces(id) on delete cascade,
      name text not null,
      slug text not null,
      created_by text not null references users(id) on delete cascade,
      created_at timestamptz not null default now()
    );

    create table if not exists project_memberships (
      id text primary key,
      project_id text not null references projects(id) on delete cascade,
      user_id text not null references users(id) on delete cascade,
      role text not null,
      created_at timestamptz not null default now(),
      unique (project_id, user_id)
    );

    create table if not exists runner_registrations (
      id text primary key,
      project_id text not null references projects(id) on delete cascade,
      name text not null,
      endpoint_url text not null,
      shared_secret text,
      status text not null,
      created_by text not null references users(id) on delete cascade,
      created_at timestamptz not null default now()
    );

    create table if not exists project_secrets (
      id text primary key,
      project_id text not null references projects(id) on delete cascade,
      workspace_id text not null references workspaces(id) on delete cascade,
      provider text not null,
      display_name text not null,
      masked_preview text not null,
      status text not null,
      validation_status text,
      last_validation_error_class text,
      encrypted_secret jsonb not null,
      created_by text not null references users(id) on delete cascade,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      last_used_at timestamptz
    );

    create table if not exists reports (
      id text primary key,
      project_id text not null references projects(id) on delete cascade,
      workspace_id text not null references workspaces(id) on delete cascade,
      created_by text not null references users(id) on delete cascade,
      gate text not null,
      summary jsonb not null,
      snapshot jsonb not null,
      created_at timestamptz not null default now()
    );

    create table if not exists benchmark_packs (
      id text primary key,
      project_id text not null references projects(id) on delete cascade,
      workspace_id text not null references workspaces(id) on delete cascade,
      name text not null,
      slug text not null,
      description text,
      latest_version_id text,
      approved_version_id text,
      created_by text not null references users(id) on delete cascade,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists benchmark_versions (
      id text primary key,
      benchmark_pack_id text not null references benchmark_packs(id) on delete cascade,
      project_id text not null references projects(id) on delete cascade,
      workspace_id text not null references workspaces(id) on delete cascade,
      version_number integer not null,
      status text not null,
      source text not null,
      pack jsonb not null,
      validation jsonb not null,
      readiness jsonb not null,
      created_by text not null references users(id) on delete cascade,
      approved_by text references users(id) on delete set null,
      approved_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (benchmark_pack_id, version_number)
    );

    create table if not exists benchmark_reviews (
      id text primary key,
      benchmark_version_id text not null references benchmark_versions(id) on delete cascade,
      benchmark_pack_id text not null references benchmark_packs(id) on delete cascade,
      project_id text not null references projects(id) on delete cascade,
      workspace_id text not null references workspaces(id) on delete cascade,
      reviewer_id text not null references users(id) on delete cascade,
      decision text not null,
      comments text,
      readiness_snapshot jsonb not null,
      created_at timestamptz not null default now()
    );

    create table if not exists benchmark_review_assignments (
      id text primary key,
      benchmark_version_id text not null references benchmark_versions(id) on delete cascade,
      benchmark_pack_id text not null references benchmark_packs(id) on delete cascade,
      project_id text not null references projects(id) on delete cascade,
      workspace_id text not null references workspaces(id) on delete cascade,
      reviewer text not null,
      status text not null,
      notes text,
      assigned_by text not null references users(id) on delete cascade,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists promotion_candidates (
      id text primary key,
      benchmark_version_id text not null references benchmark_versions(id) on delete cascade,
      benchmark_pack_id text not null references benchmark_packs(id) on delete cascade,
      project_id text not null references projects(id) on delete cascade,
      workspace_id text not null references workspaces(id) on delete cascade,
      source_type text not null,
      source_id text,
      status text not null,
      visibility text not null,
      case_data jsonb not null,
      notes text,
      created_by text not null references users(id) on delete cascade,
      promoted_by text references users(id) on delete set null,
      promoted_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists golden_cases (
      id text primary key,
      benchmark_version_id text not null references benchmark_versions(id) on delete cascade,
      benchmark_pack_id text not null references benchmark_packs(id) on delete cascade,
      project_id text not null references projects(id) on delete cascade,
      workspace_id text not null references workspaces(id) on delete cascade,
      promotion_candidate_id text references promotion_candidates(id) on delete set null,
      visibility text not null,
      case_data jsonb not null,
      created_by text not null references users(id) on delete cascade,
      created_at timestamptz not null default now()
    );

    create table if not exists runner_jobs (
      id text primary key,
      project_id text not null references projects(id) on delete cascade,
      workspace_id text references workspaces(id) on delete cascade,
      runner_id text references runner_registrations(id) on delete cascade,
      created_by text not null references users(id) on delete cascade,
      report_id text references reports(id) on delete set null,
      status text not null,
      idempotency_key text,
      payload jsonb not null,
      result jsonb,
      error text,
      history jsonb not null default '[]'::jsonb,
      attempts integer not null default 0,
      max_attempts integer not null default 1,
      timeout_ms integer not null default 0,
      retry_backoff_ms integer not null default 0,
      claimed_by text,
      locked_at timestamptz,
      next_run_at timestamptz,
      started_at timestamptz,
      finished_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    alter table runner_jobs add column if not exists workspace_id text references workspaces(id) on delete cascade;
    alter table runner_jobs add column if not exists idempotency_key text;
    alter table runner_jobs add column if not exists history jsonb not null default '[]'::jsonb;
    alter table runner_jobs add column if not exists attempts integer not null default 0;
    alter table runner_jobs add column if not exists max_attempts integer not null default 1;
    alter table runner_jobs add column if not exists timeout_ms integer not null default 0;
    alter table runner_jobs add column if not exists retry_backoff_ms integer not null default 0;
    alter table runner_jobs add column if not exists claimed_by text;
    alter table runner_jobs add column if not exists worker_id text;
    alter table runner_jobs add column if not exists locked_at timestamptz;
    alter table runner_jobs add column if not exists claimed_at timestamptz;
    alter table runner_jobs add column if not exists next_run_at timestamptz;
    alter table runner_jobs add column if not exists next_retry_at timestamptz;
    alter table runner_jobs add column if not exists started_at timestamptz;
    alter table runner_jobs add column if not exists finished_at timestamptz;
    alter table runner_jobs add column if not exists completed_at timestamptz;
    alter table runner_jobs add column if not exists failed_at timestamptz;
    alter table runner_jobs add column if not exists cancelled_at timestamptz;
    alter table runner_jobs add column if not exists last_error text;
    alter table runner_jobs add column if not exists retry_reason text;
    alter table runner_jobs alter column runner_id drop not null;
    update runner_jobs r
      set workspace_id = p.workspace_id
      from projects p
      where r.project_id = p.id and r.workspace_id is null;
    create unique index if not exists runner_jobs_project_runner_idempotency_idx
      on runner_jobs (project_id, runner_id, idempotency_key)
      where idempotency_key is not null;
    create unique index if not exists runner_jobs_project_adapter_idempotency_idx
      on runner_jobs (project_id, coalesce(runner_id, '__adapter__'), idempotency_key)
      where idempotency_key is not null;

    create table if not exists failure_workflows (
      id text primary key,
      project_id text not null references projects(id) on delete cascade,
      workspace_id text not null references workspaces(id) on delete cascade,
      failure_id text not null,
      status text not null,
      owner text,
      severity text,
      latest_action text,
      evidence jsonb not null default '{}'::jsonb,
      actions jsonb not null default '[]'::jsonb,
      created_by text not null references users(id) on delete cascade,
      updated_by text not null references users(id) on delete cascade,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (project_id, failure_id)
    );

    create table if not exists failure_regression_suites (
      id text primary key,
      suite_id text not null,
      project_id text not null references projects(id) on delete cascade,
      workspace_id text not null references workspaces(id) on delete cascade,
      name text not null,
      description text,
      failure_ids jsonb not null default '[]'::jsonb,
      created_by text not null references users(id) on delete cascade,
      updated_by text not null references users(id) on delete cascade,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (project_id, suite_id)
    );

    create table if not exists events (
      id text primary key,
      name text not null,
      user_id text,
      workspace_id text,
      project_id text,
      payload jsonb not null,
      created_at timestamptz not null default now()
    );
  `);

  schemaReady = true;
}

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
      ssl: shouldUseSsl() ? { rejectUnauthorized: false } : undefined,
    });
  }
  return pool;
}

function shouldUseSsl() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
  return url.includes('sslmode=require') || process.env.NODE_ENV === 'production';
}
