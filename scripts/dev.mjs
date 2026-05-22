#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const forwardedArgs = process.argv.slice(2);
const frontendHost = readFlag(forwardedArgs, '--host') ?? '0.0.0.0';
const frontendPort = readFlag(forwardedArgs, '--port') ?? '4173';
const appBaseUrl = process.env.APP_BASE_URL || `http://${normalizeBrowserHost(frontendHost)}:${frontendPort}`;

const processes = [
  {
    name: 'api',
    command: process.execPath,
    args: ['scripts/dev-api.mjs', '--app-base-url', appBaseUrl],
    env: {
      ...process.env,
      APP_BASE_URL: appBaseUrl,
    },
  },
  {
    name: 'web',
    command: npmCommand(),
    args: ['run', 'dev:web', ...(forwardedArgs.length ? ['--', ...forwardedArgs] : [])],
    env: process.env,
  },
];

const children = [];
let shuttingDown = false;
let shutdownTimer = null;

for (const processSpec of processes) {
  const child = spawn(processSpec.command, processSpec.args, {
    cwd: REPO_ROOT,
    env: processSpec.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => writeLog(processSpec.name, chunk));
  child.stderr.on('data', (chunk) => writeLog(processSpec.name, chunk));
  child.on('exit', (code, signal) => handleChildExit(processSpec.name, code, signal));

  children.push(child);
}

console.log(`[harnessamp] app: ${appBaseUrl}`);
console.log('[harnessamp] local API proxy target: http://127.0.0.1:3000');

process.once('SIGINT', () => shutdown(0));
process.once('SIGTERM', () => shutdown(0));

function handleChildExit(name, code, signal) {
  const detail = signal ? `signal ${signal}` : `code ${code ?? 0}`;
  console.log(`[${name}] exited with ${detail}`);

  if (shuttingDown) return;
  shutdown(code ?? 0);
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  process.exitCode = exitCode;

  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }

  shutdownTimer = setTimeout(() => {
    for (const child of children) {
      if (!child.killed) {
        child.kill('SIGKILL');
      }
    }
  }, 1500);

  const waitForChildren = () => {
    const activeChildren = children.filter((child) => child.exitCode == null && child.signalCode == null);
    if (activeChildren.length) {
      setTimeout(waitForChildren, 100);
      return;
    }

    if (shutdownTimer) clearTimeout(shutdownTimer);
    process.exit();
  };

  waitForChildren();
}

function writeLog(name, chunk) {
  String(chunk)
    .split('\n')
    .filter(Boolean)
    .forEach((line) => console.log(`[${name}] ${line}`));
}

function readFlag(args, flag) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === flag) {
      return args[index + 1] ?? null;
    }
    if (arg.startsWith(`${flag}=`)) {
      return arg.slice(flag.length + 1);
    }
  }
  return null;
}

function normalizeBrowserHost(host) {
  if (!host || host === '0.0.0.0' || host === '::') {
    return '127.0.0.1';
  }
  return host;
}

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}
