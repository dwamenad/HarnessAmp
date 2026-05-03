#!/usr/bin/env node
import { spawn } from 'node:child_process';

const processes = [
  {
    name: 'runner',
    command: process.execPath,
    args: ['examples/replit/custom-http-runner.mjs'],
  },
  {
    name: 'web',
    command: 'npm',
    args: ['run', 'dev', '--', '--host', '0.0.0.0', '--port', '4173'],
  },
];

processes.forEach((item) => {
  const child = spawn(item.command, item.args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });

  child.stdout.on('data', (chunk) => writeLog(item.name, chunk));
  child.stderr.on('data', (chunk) => writeLog(item.name, chunk));
  child.on('exit', (code) => {
    console.log(`[${item.name}] exited with code ${code}`);
  });
});

console.log('[harnessamp] Replit demo started');
console.log('[harnessamp] Web console: port 4173');
console.log('[harnessamp] Custom HTTP runner: port 8787');

function writeLog(name, chunk) {
  String(chunk)
    .split('\n')
    .filter(Boolean)
    .forEach((line) => console.log(`[${name}] ${line}`));
}
