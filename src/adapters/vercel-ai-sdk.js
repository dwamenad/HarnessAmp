import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { analyzeBundle } from '../core/engine.js';

const ADAPTER_TYPE = 'vercel-ai-sdk';
const SECRET_HEADER_PATTERN = /authorization|cookie|token|secret|key|credential/i;

export function validateVercelAiSdkAdapterConfig(config = {}) {
  const source = config && typeof config === 'object' ? config : {};
  const type = String(source.type ?? source.adapter ?? ADAPTER_TYPE);
  if (type !== ADAPTER_TYPE && type !== 'vercel_ai_sdk') {
    throw new Error(`Unsupported adapter type: ${type}`);
  }

  const target = stringOr(source.target ?? source.targetRoute ?? source.handlerPath, '');
  const handlerExport = stringOr(source.handlerExport, 'POST');
  const timeoutMs = positiveInteger(source.timeoutMs, 30000);
  const maxRetries = nonNegativeInteger(source.maxRetries, 0);
  const mode = ['sample', 'full'].includes(source.mode) ? source.mode : 'sample';
  const streamingMode = ['auto', 'text', 'ui-message', 'data'].includes(source.streamingMode) ? source.streamingMode : 'auto';

  if (!target && typeof source.handler !== 'function') {
    throw new Error('Vercel AI SDK adapter requires target or handler.');
  }

  return {
    type: ADAPTER_TYPE,
    target,
    handlerExport,
    modelLabel: stringOr(source.modelLabel ?? source.model ?? source.providerLabel, 'vercel-ai-sdk'),
    timeoutMs,
    maxRetries,
    mode,
    streamingMode,
    captureToolCalls: source.captureToolCalls !== false,
    structuredOutputSchema: stringOr(source.structuredOutputSchema ?? source.schemaName, ''),
    headers: sanitizeHeaders(source.headers),
    env: sanitizeRecord(source.env),
    rawDebug: Boolean(source.rawDebug),
    handler: typeof source.handler === 'function' ? source.handler : null,
  };
}

export async function executeVercelAiSdkAdapterBenchmark(bundleInput, configInput = {}, options = {}) {
  const config = validateVercelAiSdkAdapterConfig(configInput);
  const analysis = analyzeBundle(bundleInput);
  const variants = selectVariants(analysis.pack.variants, config.mode);
  const observations = [];

  for (const variant of variants) {
    if (await shouldCancel(options)) break;
    const scenario = variant.harness?.scenarios?.[0] ?? analysis.bundle.harness?.scenarios?.[0] ?? {};
    const observation = await executeVercelAiSdkVariant({
      bundle: analysis.bundle,
      variant,
      scenario,
      config,
      environment: options.environment ?? 'worker',
      shouldCancel: options.shouldCancel,
    });
    observations.push(observation);
  }

  return {
    adapter: {
      type: ADAPTER_TYPE,
      target: config.target,
      modelLabel: config.modelLabel,
      mode: config.mode,
      streamingMode: config.streamingMode,
      structuredOutputSchema: config.structuredOutputSchema || null,
    },
    observations,
  };
}

export async function executeVercelAiSdkAgentRun({ bundle, mutation = null, task = null, environment = 'local', config }) {
  const adapterConfig = validateVercelAiSdkAdapterConfig(config);
  const startedAt = Date.now();
  const scenario = task ?? bundle.harness?.scenarios?.[0] ?? {};
  const variant = {
    id: mutation?.mutationId ?? scenario.id ?? 'baseline',
    familyId: mutation?.mutationFamily ?? 'adapter',
    tier: 'visible',
    harness: bundle.harness,
  };
  const observation = await executeVercelAiSdkVariant({
    bundle,
    variant,
    scenario,
    mutation,
    config: adapterConfig,
    environment,
  });

  return {
    runId: `${slugify(bundle.project)}__${slugify(scenario.id ?? 'task')}__${slugify(mutation?.mutationId ?? 'baseline')}`,
    harnessId: slugify(bundle.project),
    harnessVersion: bundle.version ?? 1,
    agentVersion: bundle.wrapper?.agentVersion ?? bundle.harness?.agentVersion ?? 'vercel-ai-sdk',
    modelVersion: adapterConfig.modelLabel,
    mutationPackVersion: mutation?.version ?? null,
    mutationId: mutation?.mutationId ?? null,
    mutationSeed: mutation?.deterministicSeed ?? null,
    runnerVersion: 'vercel-ai-sdk-adapter/0.1.0',
    evaluatorVersion: 'diagnostic-rules/1.0.0',
    timestamp: new Date().toISOString(),
    environment,
    toolMode: 'ai-sdk-route',
    taskId: scenario.id ?? 'task-001',
    inputPrompt: observation.inputPrompt,
    outputText: observation.outputText,
    toolCalls: observation.toolCalls,
    toolOutputs: observation.toolResults,
    errors: observation.error ? [observation.error] : [],
    latencyMs: observation.latencyMs ?? Date.now() - startedAt,
    tokenUsage: observation.tokenUsage ?? { input: null, output: null },
    metadata: {
      passed: observation.passed,
      score: observation.score,
      adapterType: ADAPTER_TYPE,
      target: adapterConfig.target,
      structuredOutput: observation.structuredOutput ? true : false,
      citations: observation.citations,
      sources: observation.sources,
    },
  };
}

async function executeVercelAiSdkVariant({ bundle, variant, scenario, mutation = null, config, environment, shouldCancel: shouldCancelFn }) {
  const startedAt = Date.now();
  const inputPrompt = scenario.objective ?? scenario.input ?? scenario.title ?? '';
  const requestPayload = {
    messages: buildMessages(bundle, variant, scenario, mutation),
    prompt: inputPrompt,
    scenario: {
      id: scenario.id ?? variant.id,
      title: scenario.title ?? '',
      objective: inputPrompt,
    },
    mutation: mutation ? sanitizeDebugPayload(mutation, { rawDebug: config.rawDebug }) : null,
    benchmark: {
      project: bundle.project,
      variantId: variant.id,
      familyId: variant.familyId,
      tier: variant.tier,
    },
    metadata: {
      harnessamp: true,
      adapter: ADAPTER_TYPE,
      environment,
    },
  };

  try {
    if (await shouldCancel({ shouldCancel: shouldCancelFn })) {
      throw new Error('Adapter execution canceled before dispatch.');
    }

    const response = await runWithTimeout(
      () => callAiSdkHandler(config, requestPayload),
      config.timeoutMs,
      `Vercel AI SDK adapter timed out after ${config.timeoutMs}ms`,
    );

    if (await shouldCancel({ shouldCancel: shouldCancelFn })) {
      throw new Error('Adapter execution canceled before normalization.');
    }

    const normalized = await normalizeAiSdkResponse(response, config);
    const passed = typeof normalized.passed === 'boolean'
      ? normalized.passed
      : !normalized.error && Boolean(normalized.outputText || normalized.structuredOutput);
    const score = Number.isFinite(Number(normalized.score))
      ? clamp(Number(normalized.score), 0, 100)
      : passed ? 100 : 0;

    return {
      id: `${variant.id}:vercel-ai-sdk`,
      variantId: variant.id,
      familyId: variant.familyId,
      tier: variant.tier,
      scenarioId: scenario.id ?? '',
      mutationId: mutation?.mutationId ?? null,
      inputPrompt,
      outputText: normalized.outputText,
      toolCalls: config.captureToolCalls ? normalized.toolCalls : [],
      toolResults: config.captureToolCalls ? normalized.toolResults : [],
      structuredOutput: normalized.structuredOutput,
      citations: normalized.citations,
      sources: normalized.sources,
      latencyMs: normalized.latencyMs ?? Date.now() - startedAt,
      tokenUsage: normalized.tokenUsage,
      modelMetadata: {
        model: config.modelLabel,
        ...normalized.modelMetadata,
      },
      rawResponse: config.rawDebug ? normalized.rawResponse : null,
      error: normalized.error,
      passed,
      score,
      notes: normalized.error
        ? `Vercel AI SDK adapter error: ${normalized.error}`
        : `Vercel AI SDK adapter captured ${normalized.outputText ? 'text' : 'structured output'} from ${config.target || 'handler'}.`,
      source: 'observed',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      id: `${variant.id}:vercel-ai-sdk:error`,
      variantId: variant.id,
      familyId: variant.familyId,
      tier: variant.tier,
      scenarioId: scenario.id ?? '',
      mutationId: mutation?.mutationId ?? null,
      inputPrompt,
      outputText: '',
      toolCalls: [],
      toolResults: [],
      structuredOutput: null,
      citations: [],
      sources: [],
      latencyMs: Date.now() - startedAt,
      tokenUsage: { input: null, output: null },
      modelMetadata: { model: config.modelLabel },
      rawResponse: null,
      error: message,
      passed: false,
      score: 0,
      notes: `Vercel AI SDK adapter error: ${message}`,
      source: 'observed',
    };
  }
}

async function callAiSdkHandler(config, payload) {
  const handler = config.handler ?? await loadHandler(config);
  const request = new Request('http://harnessamp.local/api/adapter/vercel-ai-sdk', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...config.headers,
    },
    body: JSON.stringify(payload),
  });
  return handler(request);
}

async function loadHandler(config) {
  const modulePath = resolve(config.target);
  const module = await import(pathToFileURL(modulePath).href);
  const handler = module[config.handlerExport] ?? module.default;
  if (typeof handler !== 'function') {
    throw new Error(`Vercel AI SDK adapter target ${config.target} does not export ${config.handlerExport} or default handler.`);
  }
  return handler;
}

async function normalizeAiSdkResponse(response, config) {
  if (response instanceof Response) {
    const contentType = response.headers.get('content-type') ?? '';
    const text = await response.text();
    const parsed = parseResponseText(text, contentType, config);
    const httpError = response.ok ? null : `HTTP ${response.status}`;
    return {
      ...parsed,
      error: parsed.error ?? httpError,
      rawResponse: config.rawDebug ? { status: response.status, contentType, text: truncate(text, 12000) } : null,
    };
  }

  if (response && typeof response === 'object') {
    return normalizePayload(response, config);
  }

  return {
    outputText: String(response ?? ''),
    toolCalls: [],
    toolResults: [],
    structuredOutput: null,
    citations: [],
    sources: [],
    tokenUsage: { input: null, output: null },
    modelMetadata: {},
    rawResponse: config.rawDebug ? response : null,
  };
}

function parseResponseText(text, contentType, config) {
  if (/json/i.test(contentType)) {
    const parsed = tryJson(text);
    if (parsed.ok) return normalizePayload(parsed.value, config);
  }

  if (/event-stream|x-ndjson|stream/i.test(contentType) || looksLikeStream(text)) {
    return normalizeStreamText(text, config);
  }

  return {
    outputText: text,
    toolCalls: [],
    toolResults: [],
    structuredOutput: null,
    citations: [],
    sources: [],
    tokenUsage: { input: null, output: null },
    modelMetadata: {},
  };
}

function normalizePayload(payload, config) {
  const source = payload?.result && typeof payload.result === 'object' ? payload.result : payload ?? {};
  const structuredOutput = source.structuredOutput ?? source.output ?? source.object ?? source.json ?? null;
  const outputText = stringOr(
    source.outputText
      ?? source.text
      ?? source.content
      ?? source.message?.content
      ?? source.choices?.[0]?.message?.content
      ?? (structuredOutput ? JSON.stringify(structuredOutput) : ''),
    '',
  );
  const toolCalls = config.captureToolCalls ? collectToolCalls(source) : [];
  const toolResults = config.captureToolCalls ? collectToolResults(source) : [];

  return {
    outputText,
    toolCalls,
    toolResults,
    structuredOutput,
    citations: normalizeArray(source.citations ?? source.references),
    sources: normalizeArray(source.sources ?? source.sourceDocuments),
    tokenUsage: normalizeTokenUsage(source.usage ?? source.tokenUsage),
    modelMetadata: sanitizeDebugPayload(source.providerMetadata ?? source.modelMetadata ?? source.metadata ?? {}, { rawDebug: config.rawDebug }),
    rawResponse: config.rawDebug ? sanitizeDebugPayload(source, { rawDebug: true }) : null,
    error: normalizeError(source.error),
    passed: typeof source.passed === 'boolean' ? source.passed : undefined,
    score: source.score,
  };
}

function normalizeStreamText(text, config) {
  const chunks = [];
  const payloads = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const data = line.startsWith('data:') ? line.slice(5).trim() : line;
    if (!data || data === '[DONE]') continue;
    const decoded = parseStreamChunk(data);
    if (decoded == null) continue;
    if (typeof decoded === 'string') {
      chunks.push(decoded);
    } else {
      payloads.push(decoded);
      const textPart = decoded.text ?? decoded.delta ?? decoded.content ?? decoded.value;
      if (typeof textPart === 'string') chunks.push(textPart);
    }
  }

  const merged = payloads.reduce((acc, payload) => mergeStreamPayload(acc, payload), {});
  return {
    ...normalizePayload({ ...merged, text: chunks.join('') }, config),
    rawResponse: config.rawDebug ? { chunks: payloads, text: truncate(text, 12000) } : null,
  };
}

function parseStreamChunk(data) {
  const json = tryJson(data);
  if (json.ok) return json.value;
  const aiSdkDataMatch = data.match(/^\d+:(.*)$/u);
  if (aiSdkDataMatch) {
    const value = tryJson(aiSdkDataMatch[1]);
    return value.ok ? value.value : aiSdkDataMatch[1];
  }
  return data;
}

function mergeStreamPayload(acc, payload) {
  const next = { ...acc };
  for (const [key, value] of Object.entries(payload)) {
    if (Array.isArray(value)) {
      next[key] = [...(Array.isArray(next[key]) ? next[key] : []), ...value];
    } else if (value && typeof value === 'object') {
      next[key] = { ...(next[key] && typeof next[key] === 'object' ? next[key] : {}), ...value };
    } else if (next[key] == null) {
      next[key] = value;
    }
  }
  return next;
}

function collectToolCalls(source) {
  return normalizeArray(source.toolCalls ?? source.tool_calls ?? source.toolsCalled)
    .concat(partsOfType(source.parts, /tool.*call|tool-call|tool_/i))
    .map((item, index) => ({
      id: stringOr(item.id ?? item.toolCallId, `tool-call-${index + 1}`),
      name: stringOr(item.name ?? item.toolName ?? item.tool, 'tool'),
      arguments: sanitizeDebugPayload(item.arguments ?? item.args ?? item.input ?? {}, { rawDebug: true }),
    }));
}

function collectToolResults(source) {
  return normalizeArray(source.toolResults ?? source.tool_outputs ?? source.toolOutputs)
    .concat(partsOfType(source.parts, /tool.*result|tool-result|tool_/i).filter((item) => item.output || item.result))
    .map((item, index) => ({
      id: stringOr(item.id ?? item.toolCallId, `tool-result-${index + 1}`),
      toolName: stringOr(item.toolName ?? item.name ?? item.tool, 'tool'),
      output: sanitizeDebugPayload(item.output ?? item.result ?? {}, { rawDebug: true }),
    }));
}

function partsOfType(parts, pattern) {
  return normalizeArray(parts).filter((part) => pattern.test(String(part.type ?? '')));
}

function buildMessages(bundle, variant, scenario, mutation) {
  return [
    ...[bundle.harness?.systemPrompt].filter(Boolean).map((content) => ({ role: 'system', content })),
    ...[bundle.harness?.developerPrompt].filter(Boolean).map((content) => ({ role: 'system', content })),
    {
      role: 'user',
      content: scenario.objective ?? scenario.input ?? scenario.title ?? '',
      metadata: {
        scenarioId: scenario.id ?? '',
        variantId: variant.id,
        mutationId: mutation?.mutationId ?? null,
      },
    },
  ];
}

function selectVariants(variants, mode) {
  const list = Array.isArray(variants) ? variants : [];
  if (mode === 'full') return list;
  const visible = list.filter((variant) => variant.tier === 'visible');
  return visible.length ? visible : list.slice(0, 2);
}

async function shouldCancel(options) {
  return typeof options.shouldCancel === 'function' ? Boolean(await options.shouldCancel()) : false;
}

async function runWithTimeout(fn, timeoutMs, message) {
  const limit = positiveInteger(timeoutMs, 30000);
  let timeout;
  try {
    return await Promise.race([
      fn(),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), limit);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

function sanitizeHeaders(headers) {
  const clean = {};
  for (const [key, value] of Object.entries(headers && typeof headers === 'object' ? headers : {})) {
    if (SECRET_HEADER_PATTERN.test(key)) continue;
    clean[key] = String(value);
  }
  return clean;
}

function sanitizeRecord(value) {
  const clean = {};
  for (const [key, item] of Object.entries(value && typeof value === 'object' ? value : {})) {
    if (SECRET_HEADER_PATTERN.test(key)) continue;
    clean[key] = String(item);
  }
  return clean;
}

function sanitizeDebugPayload(value, { rawDebug = false } = {}) {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeDebugPayload(item, { rawDebug }));
  const clean = {};
  for (const [key, item] of Object.entries(value)) {
    if (SECRET_HEADER_PATTERN.test(key)) {
      clean[key] = '[redacted]';
    } else if (rawDebug || typeof item !== 'string' || item.length <= 2000) {
      clean[key] = sanitizeDebugPayload(item, { rawDebug });
    } else {
      clean[key] = truncate(item, 2000);
    }
  }
  return clean;
}

function normalizeTokenUsage(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    input: nullableNumber(source.input ?? source.promptTokens ?? source.inputTokens),
    output: nullableNumber(source.output ?? source.completionTokens ?? source.outputTokens),
  };
}

function normalizeError(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message;
  if (typeof value === 'object') return stringOr(value.message ?? value.error, JSON.stringify(value));
  return String(value);
}

function normalizeArray(value) {
  return Array.isArray(value) ? value.filter((item) => item != null) : [];
}

function looksLikeStream(text) {
  return /(^|\n)(data:|\d+:|\{.*"type")/u.test(text);
}

function tryJson(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, value: null };
  }
}

function stringOr(value, fallback) {
  return typeof value === 'string' && value.length ? value : fallback;
}

function nullableNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nonNegativeInteger(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return fallback;
  return Math.floor(number);
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1) return fallback;
  return Math.floor(number);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function truncate(text, maxLength) {
  const value = String(text ?? '');
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}
