#!/usr/bin/env node
import { readFileSync, statSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  diffBenchmarkLifecycleInputs,
  editBenchmarkLifecycleDocument,
  exportBenchmarkPack,
  importBenchmarkPack,
  reviewBenchmarkLifecycleDocument,
  summarizeBenchmarkLifecycleDocument,
} from '../src/core/benchmark-cli.js';
import { validateBenchmarkPackCandidate } from '../src/core/benchmark-lifecycle.js';
import { diagnoseHarness } from '../src/core/diagnose.js';
import { analyzeBundle, createDemoBundle, safeJsonParse } from '../src/core/engine.js';
import { runLocalApiWorker } from '../src/core/local-worker.js';
import { generateMutationSuite, getMutationRegistry } from '../src/mutations/registry.js';
import { formatMarkdownReport, formatMarkdownSuiteReport } from '../src/v2/reporters.js';
import { runV2Scenario } from '../src/v2/runner.js';
import { loadScenarioFile } from '../src/v2/scenario-loader.js';
import { runGeneratedV2Suite, runV2Suite } from '../src/v2/suite-runner.js';
import { runLocalTunnelDoctor } from '../src/adapters/local-http-tunnel.js';

const [command = 'diagnose', ...rest] = process.argv.slice(2);
const options = parseArgs(rest);

if (command === 'validate') {
  const bundle = loadBundle(options.positional[0]);
  const analysis = analyzeBundle(bundle);
  console.log(JSON.stringify({
    valid: true,
    project: analysis.bundle.project,
    harnessName: analysis.bundle.harness.agentName,
    toolCount: analysis.bundle.harness.tools.length,
    scenarioCount: analysis.bundle.harness.scenarios.length,
  }, null, 2));
} else if (command === 'mutate') {
  const bundle = loadBundle(options.positional[0]);
  const suite = generateMutationSuite(bundle, {
    maxMutations: options.maxMutations,
    generatedTier: options.generatedTier,
    maxGeneratedMutations: options.maxGeneratedScenarios,
    shard: options.shard,
    shardIndex: options.shardIndex,
    shardCount: options.shardCount,
    surfaces: options.surfaces,
    severities: options.severities,
    prioritization: options.prioritization,
    riskProfile: options.riskProfile,
  });
  console.log(JSON.stringify(suite, null, 2));
} else if (command === 'run') {
  if (options.generatedTier && !options.positional[0]) {
    const report = await runGeneratedV2Suite({
      packName: options.packName,
      failOn: options.failOn,
      suiteName: options.suiteName,
      generatedTier: options.generatedTier,
      maxGeneratedScenarios: options.maxGeneratedScenarios,
    });
    const output = options.reportFormat === 'json'
      ? JSON.stringify(report, null, 2)
      : formatMarkdownSuiteReport(report);
    await writeOrPrint(output, options.outPath);
    if (report.gate === 'block') process.exitCode = 2;
    else if (report.gate === 'warn') process.exitCode = 1;
  } else if (isV2SuitePath(options.positional[0])) {
    const report = await runV2Suite(options.positional[0], {
      packName: options.packName,
      failOn: options.failOn,
      suiteName: options.suiteName,
    });
    const output = options.reportFormat === 'json'
      ? JSON.stringify(report, null, 2)
      : formatMarkdownSuiteReport(report);
    await writeOrPrint(output, options.outPath);
    if (report.gate === 'block') process.exitCode = 2;
    else if (report.gate === 'warn') process.exitCode = 1;
  } else if (isScenarioPath(options.positional[0])) {
    const scenario = loadScenarioFile(options.positional[0]);
    const report = await runV2Scenario(scenario, {
      packName: options.packName,
      failOn: options.failOn,
    });
    const output = options.reportFormat === 'json'
      ? JSON.stringify(report, null, 2)
      : formatMarkdownReport(report);
    await writeOrPrint(output, options.outPath);
    if (report.gate === 'block') process.exitCode = 2;
    else if (report.gate === 'warn') process.exitCode = 1;
  } else {
    const bundle = loadBundle(options.positional[0]);
    const diagnosis = await diagnoseHarness(bundle, {
      maxMutations: options.generatedTier ? options.maxMutations : options.maxMutations ?? 5,
      generatedTier: options.generatedTier,
      maxGeneratedMutations: options.maxGeneratedScenarios,
      shard: options.shard,
      shardIndex: options.shardIndex,
      shardCount: options.shardCount,
      surfaces: options.surfaces,
      severities: options.severities,
      prioritization: options.prioritization,
      riskProfile: options.riskProfile,
      runnerKind: options.runnerKind,
      runnerOptions: options.runnerOptions,
      concurrency: options.concurrency,
      maxAttempts: options.maxAttemptsPerRun,
      timeoutMs: options.timeoutMs,
      retryBackoffMs: options.retryBackoffMs,
    });
    printAdapterRunSummary(diagnosis, options);
    console.log(JSON.stringify({
      baselineRuns: diagnosis.baselineRuns,
      mutationRuns: diagnosis.mutationRuns,
    }, null, 2));
    if (hasAdapterFailures(diagnosis)) process.exitCode = 2;
  }
} else if (command === 'report') {
  const bundle = loadBundle(options.positional[0]);
  const diagnosis = await diagnoseHarness(bundle, {
    maxMutations: options.maxMutations,
    generatedTier: options.generatedTier,
    maxGeneratedMutations: options.maxGeneratedScenarios,
    shard: options.shard,
    shardIndex: options.shardIndex,
    shardCount: options.shardCount,
    surfaces: options.surfaces,
    severities: options.severities,
    prioritization: options.prioritization,
    riskProfile: options.riskProfile,
    runnerKind: options.runnerKind,
    runnerOptions: options.runnerOptions,
    concurrency: options.concurrency,
    maxAttempts: options.maxAttemptsPerRun,
    timeoutMs: options.timeoutMs,
    retryBackoffMs: options.retryBackoffMs,
  });
  console.log(diagnosis.reportText);
} else if (command === 'registry') {
  console.log(JSON.stringify(getMutationRegistry(), null, 2));
} else if (command === 'worker') {
  await runWorkerCommand(options);
} else if (command === 'doctor') {
  await runDoctorCommand(options);
} else if (command === 'secrets') {
  await runSecretsCommand(options);
} else if (command === 'benchmark') {
  await runBenchmarkCommand(options);
} else if (command === 'diagnose') {
  const bundle = loadBundle(options.positional[0]);
  const diagnosis = await diagnoseHarness(bundle, {
    maxMutations: options.maxMutations,
    generatedTier: options.generatedTier,
    maxGeneratedMutations: options.maxGeneratedScenarios,
    shard: options.shard,
    shardIndex: options.shardIndex,
    shardCount: options.shardCount,
    surfaces: options.surfaces,
    severities: options.severities,
    prioritization: options.prioritization,
    riskProfile: options.riskProfile,
    runnerKind: options.runnerKind,
    runnerOptions: options.runnerOptions,
    concurrency: options.concurrency,
    maxAttempts: options.maxAttemptsPerRun,
    timeoutMs: options.timeoutMs,
    retryBackoffMs: options.retryBackoffMs,
  });
  if (options.json) {
    printAdapterRunSummary(diagnosis, options);
    console.log(JSON.stringify(diagnosis, null, 2));
  } else {
    console.log(diagnosis.reportText);
    printAdapterRunSummary(diagnosis, options);
  }
  if (hasAdapterFailures(diagnosis)) {
    process.exitCode = 2;
  } else if (diagnosis.summary.verdict === 'block') {
    process.exitCode = 2;
  } else if (diagnosis.summary.verdict === 'warn') {
    process.exitCode = 1;
  }
} else {
  console.error(`Unknown command: ${command}`);
  process.exitCode = 2;
}

async function runWorkerCommand(parsedOptions) {
  try {
    const result = await runLocalApiWorker({
      apiUrl: parsedOptions.apiUrl,
      projectId: parsedOptions.projectId,
      workerId: parsedOptions.workerId,
      workerToken: parsedOptions.workerToken,
      once: parsedOptions.once,
      intervalMs: parsedOptions.intervalMs,
      maxJobs: parsedOptions.maxJobs,
      staleAfterMs: parsedOptions.staleAfterMs,
      log: (line) => console.log(line),
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
}

async function runDoctorCommand(parsedOptions) {
  const url = parsedOptions.url ?? parsedOptions.targetUrl ?? parsedOptions.runnerOptions.target ?? parsedOptions.positional[0] ?? '';
  const result = await runLocalTunnelDoctor({
    url,
    timeoutMs: parsedOptions.timeoutMs || 5000,
    maxResponseBytes: parsedOptions.maxResponseBytes,
  });
  const lines = [
    `HarnessAmp adapter doctor: ${result.ok ? 'pass' : 'fail'}`,
    ...result.checks.map((check) => {
      const status = check.ok ? 'pass' : 'fail';
      const failure = check.failureClass ? ` ${check.failureClass}` : '';
      const action = check.action ? `\n  action: ${check.action}` : '';
      return `- ${status} ${check.check}:${failure} ${check.message}${action}`;
    }),
  ];
  console.log(lines.join('\n'));
  if (!result.ok) process.exitCode = 2;
}

async function runBenchmarkCommand(parsedOptions) {
  const [subcommand = 'validate', inputPath, comparePath] = parsedOptions.positional;

  if (subcommand === 'validate') {
    const pack = loadJsonFile(inputPath);
    console.log(JSON.stringify(validateBenchmarkPackCandidate(pack), null, 2));
    return;
  }

  if (subcommand === 'import') {
    const pack = loadJsonFile(inputPath);
    const document = importBenchmarkPack(pack, {
      source: parsedOptions.source ?? 'cli-import',
      userId: parsedOptions.userId,
    });
    await writeBenchmarkOutput(document, parsedOptions.outPath);
    console.log(JSON.stringify(summarizeBenchmarkLifecycleDocument(document), null, 2));
    return;
  }

  if (subcommand === 'export') {
    const document = loadJsonFile(inputPath);
    const pack = exportBenchmarkPack(document, parsedOptions.version ?? 'approved');
    await writeOrPrint(JSON.stringify(pack, null, 2), parsedOptions.outPath);
    return;
  }

  if (subcommand === 'edit') {
    const input = loadJsonFile(inputPath);
    const edits = parsedOptions.editsPath ? loadJsonFile(parsedOptions.editsPath) : {};
    const result = editBenchmarkLifecycleDocument(input, edits, {
      version: parsedOptions.version ?? 'latest',
      source: parsedOptions.source,
      userId: parsedOptions.userId,
    });
    await writeBenchmarkOutput(result.document, parsedOptions.outPath);
    console.log(JSON.stringify({
      summary: summarizeBenchmarkLifecycleDocument(result.document),
      baseVersion: result.baseVersion.versionNumber,
      version: result.version.versionNumber,
      unchanged: result.unchanged,
      diff: result.diff.summary,
    }, null, 2));
    return;
  }

  if (subcommand === 'review') {
    const document = loadJsonFile(inputPath);
    const result = reviewBenchmarkLifecycleDocument(document, {
      version: parsedOptions.version ?? 'latest',
      decision: parsedOptions.decision ?? 'reviewed',
      comments: parsedOptions.comments ?? '',
      userId: parsedOptions.userId,
    });
    await writeBenchmarkOutput(result.document, parsedOptions.outPath);
    console.log(JSON.stringify({
      summary: summarizeBenchmarkLifecycleDocument(result.document),
      review: result.review,
      version: {
        versionNumber: result.version.versionNumber,
        status: result.version.status,
      },
    }, null, 2));
    return;
  }

  if (subcommand === 'diff') {
    const before = loadJsonFile(inputPath);
    const after = loadJsonFile(comparePath);
    const diff = diffBenchmarkLifecycleInputs(before, after, {
      beforeVersion: parsedOptions.beforeVersion ?? parsedOptions.version ?? 'latest',
      afterVersion: parsedOptions.afterVersion ?? parsedOptions.version ?? 'latest',
    });
    console.log(JSON.stringify(diff, null, 2));
    return;
  }

  console.error(`Unknown benchmark command: ${subcommand}`);
  process.exitCode = 2;
}

function parseArgs(args) {
  const parsed = {
    positional: [],
    maxMutations: null,
    json: false,
    riskProfile: null,
    runnerKind: 'mock',
    runnerOptions: {},
    adapter: null,
    targetType: null,
    targetUrl: null,
    runnerId: null,
    concurrency: 4,
    maxAttemptsPerRun: 1,
    timeoutMs: 0,
    retryBackoffMs: 0,
    packName: 'financeguard-core',
    failOn: 'critical',
    reportFormat: 'markdown',
    outPath: null,
    suiteName: null,
    generatedTier: null,
    maxGeneratedScenarios: null,
    shard: null,
    shardIndex: null,
    shardCount: null,
    surfaces: null,
    severities: null,
    prioritization: 'risk',
    editsPath: null,
    decision: null,
    comments: '',
    version: null,
    beforeVersion: null,
    afterVersion: null,
    source: null,
    userId: 'cli',
    apiUrl: 'http://127.0.0.1:3000',
    projectId: null,
    workerId: `harnessamp-worker-${process.pid}`,
    workerToken: process.env.WORKER_SERVICE_TOKEN,
    once: false,
    intervalMs: 2000,
    maxJobs: Infinity,
    staleAfterMs: Number(process.env.HARNESSAMP_WORKER_STALE_AFTER_MS ?? 120000),
    provider: null,
    secretName: null,
    secretRef: null,
    model: null,
    url: null,
    maxResponseBytes: 0,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--max-mutations') {
      parsed.maxMutations = Number(args[index + 1] ?? 0);
      index += 1;
      continue;
    }
    if (arg === '--risk-profile') {
      parsed.riskProfile = JSON.parse(args[index + 1] ?? '{}');
      index += 1;
      continue;
    }
    if (arg === '--runner-kind') {
      parsed.runnerKind = args[index + 1] ?? parsed.runnerKind;
      index += 1;
      continue;
    }
    if (arg === '--target-type') {
      parsed.targetType = args[index + 1] ?? null;
      if (['vercel-ai-sdk', 'vercel_ai_sdk'].includes(parsed.targetType)) {
        parsed.adapter = 'vercel-ai-sdk';
        parsed.runnerKind = 'vercel-ai-sdk';
        parsed.runnerOptions.type = 'vercel-ai-sdk';
      } else if (['hosted-provider', 'hosted_provider'].includes(parsed.targetType)) {
        parsed.runnerKind = 'hosted-provider';
      } else if (['registered-runner', 'registered_runner'].includes(parsed.targetType)) {
        parsed.runnerKind = parsed.runnerOptions.endpoint ? 'custom_http' : parsed.runnerKind;
      }
      index += 1;
      continue;
    }
    if (arg === '--target-url') {
      parsed.targetUrl = args[index + 1] ?? '';
      parsed.runnerOptions.target = parsed.targetUrl;
      index += 1;
      continue;
    }
    if (arg === '--url') {
      parsed.url = args[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg === '--runner-id') {
      parsed.runnerId = args[index + 1] ?? null;
      parsed.runnerOptions.runnerId = parsed.runnerId;
      index += 1;
      continue;
    }
    if (arg === '--provider') {
      parsed.provider = args[index + 1] ?? null;
      parsed.runnerOptions.provider = parsed.provider;
      index += 1;
      continue;
    }
    if (arg === '--model') {
      parsed.model = args[index + 1] ?? null;
      parsed.runnerOptions.model = parsed.model;
      index += 1;
      continue;
    }
    if (arg === '--secret-ref') {
      parsed.secretRef = args[index + 1] ?? null;
      parsed.runnerOptions.secretRef = parsed.secretRef;
      index += 1;
      continue;
    }
    if (arg === '--name') {
      parsed.secretName = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === '--adapter') {
      parsed.adapter = args[index + 1] ?? null;
      parsed.runnerKind = parsed.adapter === 'vercel-ai-sdk' ? 'vercel-ai-sdk' : parsed.runnerKind;
      parsed.runnerOptions.type = parsed.adapter;
      index += 1;
      continue;
    }
    if (arg === '--target') {
      parsed.runnerOptions.target = args[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg === '--mode') {
      parsed.runnerOptions.mode = args[index + 1] ?? 'sample';
      index += 1;
      continue;
    }
    if (arg === '--streaming-mode') {
      parsed.runnerOptions.streamingMode = args[index + 1] ?? 'auto';
      index += 1;
      continue;
    }
    if (arg === '--model-label') {
      parsed.runnerOptions.modelLabel = args[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg === '--structured-output-schema') {
      parsed.runnerOptions.structuredOutputSchema = args[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg === '--benchmark') {
      parsed.benchmark = args[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg === '--runner-endpoint') {
      parsed.runnerOptions.endpoint = args[index + 1] ?? '';
      if (parsed.targetType === 'registered-runner' || parsed.targetType === 'registered_runner') {
        parsed.runnerKind = 'custom_http';
      }
      index += 1;
      continue;
    }
    if (arg === '--runner-token') {
      parsed.runnerOptions.token = args[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg === '--concurrency') {
      parsed.concurrency = Number(args[index + 1] ?? parsed.concurrency);
      index += 1;
      continue;
    }
    if (arg === '--run-attempts') {
      parsed.maxAttemptsPerRun = Number(args[index + 1] ?? parsed.maxAttemptsPerRun);
      index += 1;
      continue;
    }
    if (arg === '--timeout-ms') {
      parsed.timeoutMs = Number(args[index + 1] ?? parsed.timeoutMs);
      parsed.runnerOptions.timeoutMs = parsed.timeoutMs;
      index += 1;
      continue;
    }
    if (arg === '--max-response-bytes') {
      parsed.maxResponseBytes = Number(args[index + 1] ?? parsed.maxResponseBytes);
      index += 1;
      continue;
    }
    if (arg === '--retry-backoff-ms') {
      parsed.retryBackoffMs = Number(args[index + 1] ?? parsed.retryBackoffMs);
      index += 1;
      continue;
    }
    if (arg === '--json') {
      parsed.json = true;
      continue;
    }
    if (arg === '--pack' || arg === '--mutations') {
      parsed.packName = args[index + 1] ?? parsed.packName;
      index += 1;
      continue;
    }
    if (arg === '--fail-on') {
      parsed.failOn = args[index + 1] ?? parsed.failOn;
      index += 1;
      continue;
    }
    if (arg === '--report') {
      parsed.reportFormat = args[index + 1] ?? parsed.reportFormat;
      index += 1;
      continue;
    }
    if (arg === '--out') {
      parsed.outPath = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === '--suite-name') {
      parsed.suiteName = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === '--generated') {
      parsed.generatedTier = args[index + 1] ?? 'core';
      index += 1;
      continue;
    }
    if (arg === '--max-generated') {
      parsed.maxGeneratedScenarios = Number(args[index + 1] ?? 0);
      index += 1;
      continue;
    }
    if (arg === '--shard') {
      parsed.shard = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === '--shard-index') {
      parsed.shardIndex = Number(args[index + 1] ?? 0);
      index += 1;
      continue;
    }
    if (arg === '--shard-count') {
      parsed.shardCount = Number(args[index + 1] ?? 0);
      index += 1;
      continue;
    }
    if (arg === '--surface' || arg === '--changed-surface') {
      parsed.surfaces = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === '--severity') {
      parsed.severities = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === '--prioritization' || arg === '--priority') {
      parsed.prioritization = args[index + 1] ?? parsed.prioritization;
      index += 1;
      continue;
    }
    if (arg === '--edits') {
      parsed.editsPath = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === '--decision') {
      parsed.decision = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === '--comments') {
      parsed.comments = args[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg === '--version') {
      parsed.version = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === '--before-version') {
      parsed.beforeVersion = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === '--after-version') {
      parsed.afterVersion = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === '--source') {
      parsed.source = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === '--user' || arg === '--reviewer') {
      parsed.userId = args[index + 1] ?? parsed.userId;
      index += 1;
      continue;
    }
    if (arg === '--api-url') {
      parsed.apiUrl = args[index + 1] ?? parsed.apiUrl;
      index += 1;
      continue;
    }
    if (arg === '--project-id') {
      parsed.projectId = args[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === '--worker-id') {
      parsed.workerId = args[index + 1] ?? parsed.workerId;
      index += 1;
      continue;
    }
    if (arg === '--worker-token') {
      parsed.workerToken = args[index + 1] ?? parsed.workerToken;
      index += 1;
      continue;
    }
    if (arg === '--once') {
      parsed.once = true;
      continue;
    }
    if (arg === '--interval-ms') {
      parsed.intervalMs = Number(args[index + 1] ?? parsed.intervalMs);
      index += 1;
      continue;
    }
    if (arg === '--max-jobs') {
      parsed.maxJobs = Number(args[index + 1] ?? parsed.maxJobs);
      index += 1;
      continue;
    }
    if (arg === '--stale-after-ms') {
      parsed.staleAfterMs = Number(args[index + 1] ?? parsed.staleAfterMs);
      index += 1;
      continue;
    }
    if (!arg.startsWith('--')) {
      parsed.positional.push(arg);
    }
  }

  return parsed;
}

async function runSecretsCommand(parsedOptions) {
  const [subcommand = 'list'] = parsedOptions.positional;
  if (!parsedOptions.projectId) throw new Error('harnessamp secrets requires --project-id.');
  const base = normalizeApiUrl(parsedOptions.apiUrl);
  if (subcommand === 'create') {
    const key = process.env.HARNESSAMP_PROVIDER_API_KEY;
    if (!key) throw new Error('Set HARNESSAMP_PROVIDER_API_KEY to create a project secret.');
    const response = await fetch(new URL(`/api/projects/${encodeURIComponent(parsedOptions.projectId)}/secrets`, base), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: parsedOptions.provider,
        name: parsedOptions.secretName,
        secretValue: key,
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? `Secret create failed with HTTP ${response.status}`);
    console.log(JSON.stringify(payload.secret, null, 2));
    return;
  }
  if (subcommand === 'list') {
    const response = await fetch(new URL(`/api/projects/${encodeURIComponent(parsedOptions.projectId)}/secrets`, base));
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? `Secret list failed with HTTP ${response.status}`);
    console.log(JSON.stringify(payload.secrets, null, 2));
    return;
  }
  if (subcommand === 'disable') {
    if (!parsedOptions.secretRef) throw new Error('harnessamp secrets disable requires --secret-ref.');
    const response = await fetch(new URL(`/api/projects/${encodeURIComponent(parsedOptions.projectId)}/secrets/${encodeURIComponent(parsedOptions.secretRef)}`, base), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'disable' }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? `Secret disable failed with HTTP ${response.status}`);
    console.log(JSON.stringify(payload.secret, null, 2));
    return;
  }
  if (subcommand === 'delete') {
    if (!parsedOptions.secretRef) throw new Error('harnessamp secrets delete requires --secret-ref.');
    const response = await fetch(new URL(`/api/projects/${encodeURIComponent(parsedOptions.projectId)}/secrets/${encodeURIComponent(parsedOptions.secretRef)}`, base), {
      method: 'DELETE',
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? `Secret delete failed with HTTP ${response.status}`);
    console.log(JSON.stringify(payload.secret, null, 2));
    return;
  }
  throw new Error(`Unknown secrets command: ${subcommand}`);
}

function printAdapterRunSummary(diagnosis, options) {
  const targetType = normalizeCliTargetType(options.targetType ?? options.adapter ?? options.runnerKind);
  if (targetType !== 'vercel_ai_sdk' && targetType !== 'registered_runner') return;
  const runs = [...(diagnosis.baselineRuns ?? []), ...(diagnosis.mutationRuns ?? [])];
  const failures = runs.filter((run) => run.metadata?.failureClass || run.errors?.length);
  const target = options.runnerOptions.target
    ?? options.runnerOptions.endpoint
    ?? options.runnerId
    ?? process.env.HARNESSAMP_VERCEL_AI_SDK_TARGET
    ?? 'not configured';
  const pack = options.packName ?? options.positional?.[0] ?? 'default';
  const benchmark = options.benchmark ?? 'default';
  console.error(`pack=${pack} benchmark=${benchmark} execution_target=${targetType} target=${target} runs=${runs.length} failures=${failures.length}`);
  for (const run of failures.slice(0, 5)) {
    const failureClass = run.metadata?.failureClass ?? run.metadata?.diagnostics?.failureClass ?? 'adapter_unknown_error';
    console.error(`execution failure ${run.taskId ?? run.runId}: ${failureClass} ${run.errors?.[0] ?? ''}`.trim());
  }
}

function hasAdapterFailures(diagnosis) {
  return [...(diagnosis.baselineRuns ?? []), ...(diagnosis.mutationRuns ?? [])]
    .some((run) => run.metadata?.failureClass || (Array.isArray(run.errors) && run.errors.length));
}

function normalizeCliTargetType(value) {
  const text = String(value ?? '').replaceAll('-', '_');
  if (text === 'vercel_ai_sdk') return 'vercel_ai_sdk';
  if (text === 'hosted_provider') return 'hosted_provider';
  if (text === 'registered_runner' || text === 'custom_http') return 'registered_runner';
  return text;
}

function normalizeApiUrl(value) {
  const text = String(value || 'http://127.0.0.1:3000').trim();
  return text.endsWith('/') ? text : `${text}/`;
}

function isScenarioPath(path) {
  return typeof path === 'string' && /\.ya?ml$/i.test(path);
}

function isV2SuitePath(path) {
  if (typeof path !== 'string') return false;
  try {
    return statSync(resolve(path)).isDirectory();
  } catch {
    return false;
  }
}

async function writeOrPrint(output, outPath) {
  if (outPath) {
    await writeFile(resolve(outPath), `${output}\n`);
  } else {
    console.log(output);
  }
}

function loadBundle(path) {
  if (!path) return createDemoBundle();
  const text = readFileSync(resolve(path), 'utf8');
  const parsed = safeJsonParse(text);
  if (!parsed.ok) throw parsed.error;
  return parsed.value;
}

function loadJsonFile(path) {
  if (!path) throw new Error('A JSON file path is required.');
  const text = readFileSync(resolve(path), 'utf8');
  const parsed = safeJsonParse(text);
  if (!parsed.ok) throw parsed.error;
  return parsed.value;
}

async function writeBenchmarkOutput(document, outPath) {
  if (outPath) {
    await writeFile(resolve(outPath), `${JSON.stringify(document, null, 2)}\n`);
  }
}
