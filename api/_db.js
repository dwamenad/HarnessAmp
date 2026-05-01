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

    create table if not exists runner_jobs (
      id text primary key,
      project_id text not null references projects(id) on delete cascade,
      runner_id text not null references runner_registrations(id) on delete cascade,
      created_by text not null references users(id) on delete cascade,
      report_id text references reports(id) on delete set null,
      status text not null,
      payload jsonb not null,
      result jsonb,
      error text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
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
