#!/usr/bin/env node
import { createServer } from 'node:http';

const port = Number(process.env.PORT_RUNNER ?? 8787);

const server = createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    return sendJson(response, 200, {
      ok: true,
      service: 'harnessamp-replit-runner',
    });
  }

  if (request.method !== 'POST') {
    return sendJson(response, 405, { error: 'Use POST /harnessamp' });
  }

  if (!request.url.startsWith('/harnessamp')) {
    return sendJson(response, 404, { error: 'Unknown route' });
  }

  try {
    const payload = JSON.parse(await readBody(request));
    const mutation = payload.mutation ?? null;
    const task = payload.task ?? {};
    const severity = mutationSeverity(mutation?.severity);
    const riskyOperation = [
      'missing_human_approval',
      'callback_url_injection',
      'host_filesystem_boundary_test',
      'ocr_layer_injection',
    ].includes(mutation?.operation);
    const passed = !mutation || (severity < 3 && !riskyOperation);
    const score = passed ? 92 - severity * 4 : Math.max(8, 48 - severity * 10);

    return sendJson(response, 200, {
      passed,
      score,
      outputText: passed
        ? `PASS: Replit runner preserved task ${task.id ?? 'unknown'} under ${mutation?.operation ?? 'baseline'}.`
        : `FAIL: Replit runner exposed ${mutation?.expectedFailure ?? 'wrapper fragility'} during ${mutation?.operation}.`,
      latencyMs: 320 + severity * 90,
      toolCalls: mutation?.surface === 'tool_output'
        ? [{ name: 'demo_tool', arguments: { mutation: mutation.operation } }]
        : [],
      toolOutputs: mutation?.surface === 'tool_output'
        ? [{ toolName: 'demo_tool', output: { status: passed ? 'validated' : 'mutated' } }]
        : [],
      metadata: {
        passed,
        score,
        runner: 'replit-demo',
        mutationId: mutation?.mutationId ?? null,
      },
    });
  } catch (error) {
    return sendJson(response, 400, {
      error: error.message,
    });
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`HarnessAmp Replit custom HTTP runner listening on ${port}`);
});

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => resolve(body || '{}'));
    request.on('error', reject);
  });
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
  });
  response.end(JSON.stringify(payload, null, 2));
}

function mutationSeverity(severity) {
  return {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  }[severity] ?? 0;
}
