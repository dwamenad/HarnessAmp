#!/usr/bin/env node
import http from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import authHandler from '../api/auth.js';
import eventsHandler from '../api/events.js';
import jobsHandler from '../api/jobs.js';
import projectsHandler from '../api/projects.js';
import reportsHandler from '../api/reports.js';
import workspacesHandler from '../api/workspaces.js';

const SCRIPT_DIR = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');

const HANDLERS = {
  auth: authHandler,
  events: eventsHandler,
  jobs: jobsHandler,
  projects: projectsHandler,
  reports: reportsHandler,
  workspaces: workspacesHandler,
};

// Mirror the Vercel rewrite behavior so local Vite proxying hits the same handlers.
const ROUTES = [
  {
    name: 'auth',
    pattern: /^\/api\/auth\/github\/start$/u,
    handler: HANDLERS.auth,
    buildQuery: (url) => withQuery(url, { action: 'github-start' }),
  },
  {
    name: 'auth',
    pattern: /^\/api\/auth\/github\/callback$/u,
    handler: HANDLERS.auth,
    buildQuery: (url) => withQuery(url, { action: 'github-callback' }),
  },
  {
    name: 'auth',
    pattern: /^\/api\/session$/u,
    handler: HANDLERS.auth,
    buildQuery: (url) => withQuery(url, { action: 'session' }),
  },
  {
    name: 'auth',
    pattern: /^\/api\/logout$/u,
    handler: HANDLERS.auth,
    buildQuery: (url) => withQuery(url, { action: 'logout' }),
  },
  {
    name: 'reports',
    pattern: /^\/api\/reports\/([^/]+)$/u,
    handler: HANDLERS.reports,
    buildQuery: (url, match) => withQuery(url, { id: decodeURIComponent(match[1]) }),
  },
  {
    name: 'workspaces',
    pattern: /^\/api\/workspaces\/([^/]+)\/projects$/u,
    handler: HANDLERS.workspaces,
    buildQuery: (url, match) => withQuery(url, {
      resource: 'projects',
      workspaceId: decodeURIComponent(match[1]),
    }),
  },
  {
    name: 'projects',
    pattern: /^\/api\/projects\/([^/]+)\/reports$/u,
    handler: HANDLERS.projects,
    buildQuery: (url, match) => withQuery(url, {
      resource: 'reports',
      projectId: decodeURIComponent(match[1]),
    }),
  },
  {
    name: 'projects',
    pattern: /^\/api\/projects\/([^/]+)\/runners$/u,
    handler: HANDLERS.projects,
    buildQuery: (url, match) => withQuery(url, {
      resource: 'runners',
      projectId: decodeURIComponent(match[1]),
    }),
  },
  {
    name: 'projects',
    pattern: /^\/api\/projects\/([^/]+)\/jobs$/u,
    handler: HANDLERS.projects,
    buildQuery: (url, match) => withQuery(url, {
      resource: 'jobs',
      projectId: decodeURIComponent(match[1]),
    }),
  },
  {
    name: 'jobs',
    pattern: /^\/api\/jobs\/([^/]+)\/cancel$/u,
    handler: HANDLERS.jobs,
    buildQuery: (url, match) => withQuery(url, {
      action: 'cancel',
      id: decodeURIComponent(match[1]),
    }),
  },
  {
    name: 'jobs',
    pattern: /^\/api\/jobs\/([^/]+)$/u,
    handler: HANDLERS.jobs,
    buildQuery: (url, match) => withQuery(url, { id: decodeURIComponent(match[1]) }),
  },
  {
    name: 'auth',
    pattern: /^\/api\/auth$/u,
    handler: HANDLERS.auth,
    buildQuery: (url) => withQuery(url),
  },
  {
    name: 'events',
    pattern: /^\/api\/events$/u,
    handler: HANDLERS.events,
    buildQuery: (url) => withQuery(url),
  },
  {
    name: 'jobs',
    pattern: /^\/api\/jobs$/u,
    handler: HANDLERS.jobs,
    buildQuery: (url) => withQuery(url),
  },
  {
    name: 'projects',
    pattern: /^\/api\/projects$/u,
    handler: HANDLERS.projects,
    buildQuery: (url) => withQuery(url),
  },
  {
    name: 'reports',
    pattern: /^\/api\/reports$/u,
    handler: HANDLERS.reports,
    buildQuery: (url) => withQuery(url),
  },
  {
    name: 'workspaces',
    pattern: /^\/api\/workspaces$/u,
    handler: HANDLERS.workspaces,
    buildQuery: (url) => withQuery(url),
  },
];

export function bootstrapDevApiEnvironment({
  rootDir = REPO_ROOT,
  frontendBaseUrl = 'http://127.0.0.1:4173',
  defaultDevAuth = '1',
} = {}) {
  loadLocalEnv(rootDir);

  if (!process.env.APP_BASE_URL) {
    process.env.APP_BASE_URL = frontendBaseUrl;
  }

  if (process.env.HARNESSAMP_DEV_AUTH == null || process.env.HARNESSAMP_DEV_AUTH === '') {
    process.env.HARNESSAMP_DEV_AUTH = defaultDevAuth;
  }
}

export function resolveApiRequest(input) {
  const url = input instanceof URL ? input : new URL(input, 'http://127.0.0.1');

  for (const route of ROUTES) {
    const match = url.pathname.match(route.pattern);
    if (!match) continue;
    return {
      name: route.name,
      handler: route.handler,
      query: route.buildQuery(url, match),
    };
  }

  return null;
}

export function createDevApiServer() {
  return http.createServer(async (nodeRequest, nodeResponse) => {
    const requestUrl = new URL(nodeRequest.url ?? '/', 'http://127.0.0.1');
    const route = resolveApiRequest(requestUrl);

    if (!route) {
      nodeResponse.statusCode = 404;
      nodeResponse.setHeader('content-type', 'application/json; charset=utf-8');
      nodeResponse.end(JSON.stringify({ error: 'API route not found' }));
      return;
    }

    const request = await createHandlerRequest(nodeRequest, route.query);
    const response = new NodeResponseAdapter(nodeResponse);

    try {
      await route.handler(request, response);
      if (!response.ended) {
        response.end();
      }
    } catch (error) {
      if (!response.ended) {
        response.status(500).json({
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  });
}

export async function startDevApiServer({
  host = process.env.HARNESSAMP_API_HOST || '127.0.0.1',
  port = Number(process.env.HARNESSAMP_API_PORT || 3000),
  frontendBaseUrl = process.env.APP_BASE_URL || 'http://127.0.0.1:4173',
} = {}) {
  bootstrapDevApiEnvironment({ frontendBaseUrl });

  const server = createDevApiServer();
  await new Promise((resolveStart, rejectStart) => {
    server.once('error', rejectStart);
    server.listen(port, host, () => {
      server.off('error', rejectStart);
      resolveStart();
    });
  });

  console.log(`[api] Local API listening on http://${host}:${port}`);
  console.log(
    `[api] Auth mode: ${process.env.HARNESSAMP_DEV_AUTH === '1' ? 'seeded dev session' : 'cookie/GitHub OAuth'}`,
  );

  const shutdown = () => {
    server.close(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  return server;
}

function withQuery(url, additions = {}) {
  return {
    ...Object.fromEntries(url.searchParams.entries()),
    ...additions,
  };
}

async function createHandlerRequest(nodeRequest, query) {
  const body = await readRequestBody(nodeRequest);

  return {
    method: nodeRequest.method ?? 'GET',
    headers: normalizeHeaders(nodeRequest.headers),
    query,
    body: body.length ? body : undefined,
    url: nodeRequest.url ?? '/',
  };
}

async function readRequestBody(nodeRequest) {
  const chunks = [];

  for await (const chunk of nodeRequest) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString('utf8');
}

function normalizeHeaders(headers) {
  return Object.fromEntries(
    Object.entries(headers).flatMap(([name, value]) => {
      if (value == null) return [];
      return [[name, Array.isArray(value) ? value.join('; ') : value]];
    }),
  );
}

function loadLocalEnv(rootDir) {
  const protectedKeys = new Set(Object.keys(process.env));
  loadEnvFile(resolve(rootDir, '.env'), protectedKeys);
  loadEnvFile(resolve(rootDir, '.env.local'), protectedKeys);
}

function loadEnvFile(filePath, protectedKeys) {
  if (!existsSync(filePath)) return;

  const content = readFileSync(filePath, 'utf8');
  for (const [key, value] of parseEnv(content)) {
    if (protectedKeys.has(key)) continue;
    process.env[key] = value;
  }
}

function parseEnv(content) {
  const entries = [];

  for (const line of content.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/u);
    if (!match) continue;

    const [, key, rawValue] = match;
    entries.push([key, normalizeEnvValue(rawValue)]);
  }

  return entries;
}

function normalizeEnvValue(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

class NodeResponseAdapter {
  constructor(nodeResponse) {
    this.nodeResponse = nodeResponse;
    this.headers = new Map();
    this.statusCode = 200;
    this.ended = false;
  }

  status(code) {
    this.statusCode = code;
    return this;
  }

  setHeader(name, value) {
    this.headers.set(String(name).toLowerCase(), value);
  }

  getHeader(name) {
    return this.headers.get(String(name).toLowerCase());
  }

  json(payload) {
    if (!this.getHeader('content-type')) {
      this.setHeader('content-type', 'application/json; charset=utf-8');
    }
    this.end(JSON.stringify(payload));
    return this;
  }

  end(payload = '') {
    if (this.ended) return;
    this.ended = true;

    for (const [name, value] of this.headers.entries()) {
      this.nodeResponse.setHeader(name, value);
    }

    this.nodeResponse.statusCode = this.statusCode;
    this.nodeResponse.end(payload);
  }
}

function isMainModule(moduleUrl) {
  if (!process.argv[1]) return false;
  return moduleUrl === pathToFileURL(resolve(process.argv[1])).href;
}

function parseCliArgs(args) {
  const parsed = {
    host: process.env.HARNESSAMP_API_HOST || '127.0.0.1',
    port: Number(process.env.HARNESSAMP_API_PORT || 3000),
    frontendBaseUrl: process.env.APP_BASE_URL || 'http://127.0.0.1:4173',
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--host') {
      parsed.host = args[index + 1] ?? parsed.host;
      index += 1;
      continue;
    }

    if (arg.startsWith('--host=')) {
      parsed.host = arg.slice('--host='.length);
      continue;
    }

    if (arg === '--port') {
      parsed.port = Number(args[index + 1] ?? parsed.port);
      index += 1;
      continue;
    }

    if (arg.startsWith('--port=')) {
      parsed.port = Number(arg.slice('--port='.length));
      continue;
    }

    if (arg === '--app-base-url') {
      parsed.frontendBaseUrl = args[index + 1] ?? parsed.frontendBaseUrl;
      index += 1;
      continue;
    }

    if (arg.startsWith('--app-base-url=')) {
      parsed.frontendBaseUrl = arg.slice('--app-base-url='.length);
    }
  }

  return parsed;
}

if (isMainModule(import.meta.url)) {
  startDevApiServer(parseCliArgs(process.argv.slice(2))).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
