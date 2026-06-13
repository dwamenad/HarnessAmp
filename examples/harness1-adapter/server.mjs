#!/usr/bin/env node
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DEFAULT_PORT = 8788;
const MAX_BODY_BYTES = 1_000_000;

export function validateHarness1Request(value) {
  if (!isObject(value)) return { valid: false, message: 'request body must be a JSON object' };
  if (value.pack && value.pack !== 'RetrievalGuard') return { valid: false, message: 'pack must be RetrievalGuard when provided' };
  if (!nonEmptyString(value.scenario_id)) return { valid: false, message: 'scenario_id is required' };
  if (!nonEmptyString(value.mutation_id)) return { valid: false, message: 'mutation_id is required' };
  if (!nonEmptyString(requestQuery(value))) return { valid: false, message: 'query or input.user_message is required' };
  return { valid: true };
}

export function buildDemoHarness1Response(request, options = {}) {
  const requiredSource = Array.isArray(request.expected_behavior?.must_cite)
    ? request.expected_behavior.must_cite[0]
    : null;
  const docId = requiredSource || 'harness1-demo-source';
  const retrievalMetrics = {
    recall: 0.72,
    finalAnswerRecall: 0.68,
    precision: 0.64,
  };

  return {
    observations: [
      {
        scenario_id: request.scenario_id,
        mutation_id: request.mutation_id,
        final_answer: 'Harness-1 retrieved and cited the strongest available source. Replace this demo response by setting HARNESS1_EVAL_COMMAND.',
        tool_calls: [
          {
            name: 'harness1_search',
            arguments: {
              query: requestQuery(request),
            },
          },
        ],
        curated_evidence: [
          {
            doc_id: docId,
            title: 'Harness-1 retrieved source',
            url: `file://harness1/${encodeURIComponent(docId)}`,
            claim_ids: ['claim-1'],
          },
        ],
        trajectory_recall: retrievalMetrics.recall,
        final_answer_recall: retrievalMetrics.finalAnswerRecall,
        precision: retrievalMetrics.precision,
        failure_modes: [],
        metadata: {
          adapter: 'harness1',
          mode: options.mode ?? 'contract-smoke',
          retrievalMetrics,
          artifacts: [
            {
              type: 'trajectory',
              uri: `file://runs/harness1/${request.scenario_id}.jsonl`,
            },
          ],
        },
      },
    ],
  };
}

export async function runHarness1Command(command, request, env = process.env) {
  const child = spawn(command, {
    env,
    shell: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const stdout = [];
  const stderr = [];

  child.stdin.end(JSON.stringify(request));
  child.stdout.on('data', (chunk) => stdout.push(chunk));
  child.stderr.on('data', (chunk) => stderr.push(chunk));

  const exitCode = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });

  const stderrText = Buffer.concat(stderr).toString('utf8').trim();
  if (exitCode !== 0) {
    throw new Error(`HARNESS1_EVAL_COMMAND exited ${exitCode}${stderrText ? `: ${stderrText}` : ''}`);
  }

  const output = Buffer.concat(stdout).toString('utf8').trim();
  if (!output) throw new Error('HARNESS1_EVAL_COMMAND produced no JSON output');

  const parsed = JSON.parse(output);
  return normalizeHarness1Response(parsed, request);
}

export function normalizeHarness1Response(value, request) {
  if (!isObject(value)) throw new Error('Harness-1 command output must be a JSON object');
  const observations = Array.isArray(value.observations) ? value.observations : [value];
  return {
    ...value,
    observations: observations.map((observation) => normalizeHarness1Observation(observation, request)),
  };
}

export function normalizeHarness1Observation(value, request) {
  const observation = isObject(value) ? value : {};
  const metrics = isObject(observation.metadata?.retrievalMetrics)
    ? observation.metadata.retrievalMetrics
    : {
        recall: numberOrNull(observation.trajectory_recall),
        finalAnswerRecall: numberOrNull(observation.final_answer_recall),
        precision: numberOrNull(observation.precision),
      };

  return {
    scenario_id: nonEmptyString(observation.scenario_id) ? observation.scenario_id : request.scenario_id,
    mutation_id: nonEmptyString(observation.mutation_id) ? observation.mutation_id : request.mutation_id,
    final_answer: typeof observation.final_answer === 'string' ? observation.final_answer : '',
    tool_calls: Array.isArray(observation.tool_calls) ? observation.tool_calls : [],
    curated_evidence: Array.isArray(observation.curated_evidence) ? observation.curated_evidence : [],
    trajectory_recall: numberOrNull(observation.trajectory_recall),
    final_answer_recall: numberOrNull(observation.final_answer_recall),
    precision: numberOrNull(observation.precision),
    failure_modes: Array.isArray(observation.failure_modes) ? observation.failure_modes : [],
    metadata: {
      ...(isObject(observation.metadata) ? observation.metadata : {}),
      adapter: observation.metadata?.adapter ?? 'harness1',
      retrievalMetrics: metrics,
    },
  };
}

export function createHarness1AdapterServer(options = {}) {
  const token = options.token ?? process.env.HARNESS1_ADAPTER_TOKEN ?? '';
  const evalCommand = options.evalCommand ?? process.env.HARNESS1_EVAL_COMMAND ?? '';

  return createServer(async (request, response) => {
    try {
      if (request.method !== 'POST' || request.url !== '/harnessamp') {
        sendJson(response, 404, { error: 'not found', expected: 'POST /harnessamp' });
        return;
      }

      if (token && request.headers.authorization !== `Bearer ${token}`) {
        sendJson(response, 401, { error: 'unauthorized' });
        return;
      }

      const payload = await readJsonBody(request);
      const validation = validateHarness1Request(payload);
      if (!validation.valid) {
        sendJson(response, 400, { error: validation.message });
        return;
      }

      const result = evalCommand
        ? await runHarness1Command(evalCommand, payload)
        : buildDemoHarness1Response(payload);
      sendJson(response, 200, result);
    } catch (error) {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('request body is too large'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('error', reject);
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(new Error('request body must be valid JSON'));
      }
    });
  });
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body, null, 2));
}

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function numberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function requestQuery(request) {
  if (nonEmptyString(request.query)) return request.query;
  if (nonEmptyString(request.input?.user_message)) return request.input.user_message;
  if (nonEmptyString(request.input?.query)) return request.input.query;
  return '';
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.HARNESS1_ADAPTER_PORT ?? DEFAULT_PORT);
  const server = createHarness1AdapterServer();
  server.listen(port, () => {
    console.log(`Harness-1 adapter listening on http://127.0.0.1:${port}/harnessamp`);
    if (!process.env.HARNESS1_EVAL_COMMAND) {
      console.log('HARNESS1_EVAL_COMMAND is not set; serving deterministic contract-smoke responses.');
    }
  });
}
